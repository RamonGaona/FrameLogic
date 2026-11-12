/**
 * Exact-reference 2D technical dimension planner for parts and assemblies.
 * Baseline/chain arrangements and repeated-diameter notation follow the
 * drafting concepts used by Cota (Apache-2.0), adapted for FrameLogic's
 * persistent B-Rep topology references, not tessellated preview meshes.
 * https://github.com/mxchristian17/cota
 */
import type { AutomaticDimensionInstruction, AutomaticDimensionPoint } from "./AutoDrawingPlanner";

export type AutodimScope = "ASSEMBLY" | "PIECES";
export type AutodimArrangement = "BASELINE" | "CHAIN";
export type AutodimDetail = "ALL" | "OVERALL";
export type EngineeringDimensionInstruction = AutomaticDimensionInstruction & { readonly quantity?: number };
export interface EngineeringAutodimOptions {
  readonly scope: AutodimScope;
  readonly arrangement: AutodimArrangement;
  readonly detail: AutodimDetail;
  readonly maxFeaturesPerAxis?: number;
  readonly maxDiameterGroups?: number;
}
const finite = (p: AutomaticDimensionPoint): boolean =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && (!p.radius || Number.isFinite(p.radius));

function planGroup(
  features: readonly AutomaticDimensionPoint[],
  options: EngineeringAutodimOptions,
  stack: number,
): EngineeringDimensionInstruction[] {
  const vertices = features.filter((p) => p.kind === "VERTEX" && finite(p));
  if (vertices.length < 2) return [];
  const minX = Math.min(...vertices.map((p) => p.x));
  const maxX = Math.max(...vertices.map((p) => p.x));
  const minY = Math.min(...vertices.map((p) => p.y));
  const maxY = Math.max(...vertices.map((p) => p.y));
  const tol = Math.max(1e-6, Math.hypot(maxX - minX, maxY - minY) * 1e-9);
  const circles = features.filter((p) =>
    p.kind === "CIRCLE" && finite(p) && (p.radius ?? 0) > tol);
  const out: EngineeringDimensionInstruction[] = [];
  const choose = (candidates: AutomaticDimensionPoint[], axis: "x" | "y"): AutomaticDimensionPoint[] => {
    const sorted = [...candidates].sort((a, b) =>
      a[axis] - b[axis] || (axis === "x" ? a.y - b.y : a.x - b.x));
    const unique: AutomaticDimensionPoint[] = [];
    for (const p of sorted) {
      const previous = unique.at(-1);
      if (previous && Math.abs(previous[axis] - p[axis]) <= tol) continue;
      unique.push(p);
    }
    // The bounds are always included; limit interior stations to protect huge assemblies.
    const maxStations = Math.max(2, Math.min(32, Math.trunc(options.maxFeaturesPerAxis ?? 12)));
    if (unique.length > maxStations) {
      const interior = unique.slice(1, -1);
      const picked = Array.from({ length: maxStations - 2 }, (_, i) =>
        interior[Math.floor(i * interior.length / Math.max(1, maxStations - 2))]!);
      return [unique[0]!, ...picked, unique.at(-1)!];
    }
    return unique;
  };

  const createAxis = (axis: "x" | "y"): void => {
    const total = axis === "x" ? maxX - minX : maxY - minY;
    if (total <= tol) return;
    const candidates = options.detail === "ALL" ? [...vertices, ...circles] : vertices;
    const stations = choose(candidates, axis);
    const first = choose(vertices, axis)[0]!;
    const last = choose(vertices, axis).at(-1)!;
    const mode = axis === "x" ? "HORIZONTAL" : "VERTICAL";
    const offset = (index: number, overall: boolean) => axis === "x"
      ? { offsetX: 0, offsetY: -42 - stack * 26 - (overall ? 20 : index * 15) }
      : { offsetX: 46 + stack * 26 + (overall ? 20 : index * 15), offsetY: 0 };
    // Overall dimensions are never omitted even with repeated projections.
    if (options.detail === "OVERALL" || stations.length <= 2) {
      out.push({ mode, a: first, b: last, ...offset(0, true) });
      return;
    }
    if (options.arrangement === "BASELINE") {
      for (const [index, p] of stations.slice(1).entries()) {
        if (Math.abs(p[axis] - first[axis]) <= tol) continue;
        out.push({ mode, a: first, b: p, ...offset(index, p === stations.at(-1)) });
      }
    } else {
      for (let i = 1; i < stations.length; i++) {
        out.push({ mode, a: stations[i - 1]!, b: stations[i]!, ...offset(0, false) });
      }
      out.push({ mode, a: first, b: last, ...offset(0, true) });
    }
  };
  createAxis("x");
  createAxis("y");
  if (options.detail === "OVERALL") return out;

  // One leader per diameter, grouped by actual distinct hole centers. The
  // count is informational; each leader keeps a real topology-based anchor.
  const uniqueCenters: AutomaticDimensionPoint[] = [];
  for (const p of circles) {
    if (uniqueCenters.some((item) => item.instanceId === p.instanceId
      && Math.abs(item.x - p.x) <= tol && Math.abs(item.y - p.y) <= tol
      && Math.abs((item.radius ?? 0) - (p.radius ?? 0)) <= tol)) continue;
    uniqueCenters.push(p);
  }
  const diameterGroups: Array<{ representative: AutomaticDimensionPoint; count: number }> = [];
  for (const circle of uniqueCenters) {
    const existing = diameterGroups.find((g) => Math.abs((g.representative.radius ?? 0) - (circle.radius ?? 0)) <= tol);
    if (existing) existing.count++;
    else diameterGroups.push({ representative: circle, count: 1 });
  }
  const maxDiameters = Math.max(0, Math.min(24, Math.trunc(options.maxDiameterGroups ?? 10)));
  diameterGroups.slice(0, maxDiameters).forEach(({ representative, count }, i) => out.push({
    mode: "DIAMETER", a: representative, b: representative,
    offsetX: 14 + stack * 18 + i * 19, offsetY: -24 - i * 13,
    quantity: count,
  }));
  return out;
}

/** Generates associative dimensions without modifying or approximating source geometry. */
export function planEngineeringAutomaticDimensions(
  features: readonly AutomaticDimensionPoint[],
  options: EngineeringAutodimOptions,
): EngineeringDimensionInstruction[] {
  const groups = new Map<string, AutomaticDimensionPoint[]>();
  for (const p of features) {
    if (!finite(p)) continue;
    const key = options.scope === "ASSEMBLY" ? "assembly" : p.instanceId;
    const group = groups.get(key) ?? [];
    group.push(p);
    groups.set(key, group);
  }
  const plans: EngineeringDimensionInstruction[] = [];
  for (const [index, group] of [...groups.values()].entries()) {
    if (plans.length >= 180) break;
    plans.push(...planGroup(group, options, index).slice(0, 180 - plans.length));
  }
  return plans;
}
