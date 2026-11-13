/**
 * Manufacturing-oriented feature dimension selection for exact STEP B-Rep.
 *
 * A circle here means a detected circular edge viewed on-axis, not a verified
 * drilled/tapped hole. We must not label it as a hole type, cut, weld, or
 * guarantee a plate edge without confirmed semantic manufacturing metadata.
 */
import type { AutomaticDimensionPoint } from "./AutoDrawingPlanner";
import type { EngineeringDimensionInstruction } from "./EngineeringAutoDimensionPlanner";

type Axis = "x" | "y";
const isFinitePoint = (point: AutomaticDimensionPoint): boolean =>
  Number.isFinite(point.x) && Number.isFinite(point.y)
  && (point.radius === undefined || Number.isFinite(point.radius));
function coordinateDimension(
  a: AutomaticDimensionPoint,
  b: AutomaticDimensionPoint,
  axis: Axis,
): EngineeringDimensionInstruction {
  return {
    mode: axis === "x" ? "HORIZONTAL" : "VERTICAL", a, b,
    offsetX: axis === "x" ? 0 : 40, offsetY: axis === "x" ? -40 : 0,
  };
}

/**
 * Priorities: overall exact vertex stations; grouped Ø; circular center
 * locations from the first exact vertex station; genuine collinear circular
 * pitch; finally distinct intermediate STEP vertex stations.
 *
 * All references are stable (instanceId/topologyId), calculations are exact
 * projections, and large assemblies are capped without inventing features.
 */
export function planWorkshopFeatureDimensions(
  input: readonly AutomaticDimensionPoint[],
  requestedLimit = 32,
): EngineeringDimensionInstruction[] {
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(0, Math.min(32, Math.trunc(requestedLimit))) : 0;
  if (!limit) return [];
  const vertices = input.filter(p => p.kind === "VERTEX" && isFinitePoint(p));
  if (vertices.length < 2) return [];
  const minX = vertices.reduce((a, b) => b.x < a.x ? b : a);
  const maxX = vertices.reduce((a, b) => b.x > a.x ? b : a);
  const minY = vertices.reduce((a, b) => b.y < a.y ? b : a);
  const maxY = vertices.reduce((a, b) => b.y > a.y ? b : a);
  const width = maxX.x - minX.x;
  const height = maxY.y - minY.y;
  const tol = Math.max(1e-7, Math.hypot(width, height) * 1e-8);

  const result: EngineeringDimensionInstruction[] = [];
  const seen = new Set<string>();
  const add = (d: EngineeringDimensionInstruction): void => {
    if (result.length >= limit) return;
    if (d.mode === "DIAMETER") {
      const key = `D|${Math.round((d.a.radius ?? 0) / tol)}`;
      if (seen.has(key)) return;
      seen.add(key);
    } else {
      const axis = d.mode === "HORIZONTAL" ? "x" : "y";
      const lo = Math.min(d.a[axis], d.b[axis]);
      const hi = Math.max(d.a[axis], d.b[axis]);
      if (hi - lo <= tol) return;
      const key = `${d.mode}|${Math.round(lo / tol)}|${Math.round(hi / tol)}`;
      if (seen.has(key)) return;
      seen.add(key);
    }
    result.push(d);
  };
  if (width > tol) add(coordinateDimension(minX, maxX, "x"));
  if (height > tol) add(coordinateDimension(minY, maxY, "y"));

  const centers: AutomaticDimensionPoint[] = [];
  for (const point of input) {
    if (point.kind !== "CIRCLE" || !isFinitePoint(point)
      || !point.radius || point.radius <= tol) continue;
    // A STEP circle normally has two coincident edge records for the two
    // faces; count a projected center only once per occurrence and radius.
    if (centers.some((c) => c.instanceId === point.instanceId
      && Math.abs(c.x - point.x) <= tol && Math.abs(c.y - point.y) <= tol
      && Math.abs((c.radius ?? 0) - point.radius!) <= tol)) continue;
    centers.push(point);
  }
  const diameters: Array<{ point: AutomaticDimensionPoint; count: number }> = [];
  for (const point of centers) {
    const existing = diameters.find((entry) =>
      Math.abs((entry.point.radius ?? 0) - (point.radius ?? 0)) <= tol);
    if (existing) existing.count++;
    else diameters.push({ point, count: 1 });
  }
  diameters.sort((a, b) => b.count - a.count || (a.point.radius ?? 0) - (b.point.radius ?? 0));
  for (const item of diameters.slice(0, 6)) {
    add({
      mode: "DIAMETER", a: item.point, b: item.point,
      quantity: item.count, offsetX: 14, offsetY: -24,
    });
  }

  for (const axis of ["x", "y"] as const) {
    const origin = axis === "x" ? minX : minY;
    const end = axis === "x" ? maxX : maxY;
    // Suppress repeated center stations at the same coordinate.
    const sorted = [...centers].filter((p) => p[axis] > origin[axis] + tol
      && p[axis] < end[axis] - tol).sort((a, b) => a[axis] - b[axis]);
    const stations: AutomaticDimensionPoint[] = [];
    for (const p of sorted) {
      if (stations.some((q) => Math.abs(q[axis] - p[axis]) <= tol)) continue;
      stations.push(p);
    }
    for (const p of stations.slice(0, 6)) add(coordinateDimension(origin, p, axis));
  }

  // Genuine collinear centers: pitch between adjacent positions on a row
  // or column. Never infer a hole-to-hole pitch from skewed centers.
  for (const axis of ["x", "y"] as const) {
    const other = axis === "x" ? "y" : "x";
    const groups: AutomaticDimensionPoint[][] = [];
    for (const point of centers) {
      const group = groups.find((g) => Math.abs(g[0]![other] - point[other]) <= tol);
      if (group) group.push(point); else groups.push([point]);
    }
    for (const group of groups) {
      const sorted = [...group].sort((a, b) => a[axis] - b[axis]);
      const stations: AutomaticDimensionPoint[] = [];
      for (const p of sorted) {
        if (!stations.some((q) => Math.abs(q[axis] - p[axis]) <= tol)) stations.push(p);
      }
      for (let i = 1; i < Math.min(stations.length, 7); i++)
        add(coordinateDimension(stations[i - 1]!, stations[i]!, axis));
    }
  }

  // Interior vertex stations can represent STEP bends/notches, but these are
  // not classified as fabrication cuts until their semantic type is known.
  for (const axis of ["x", "y"] as const) {
    const first = axis === "x" ? minX : minY;
    const last = axis === "x" ? maxX : maxY;
    const sorted = [...vertices].sort((a, b) => a[axis] - b[axis]);
    let emitted = 0;
    for (const point of sorted) {
      if (emitted >= 3) break;
      if (point[axis] <= first[axis] + tol || point[axis] >= last[axis] - tol) continue;
      const prior = result.length;
      add(coordinateDimension(first, point, axis));
      if (result.length > prior) emitted++;
    }
  }

  return result;
}
