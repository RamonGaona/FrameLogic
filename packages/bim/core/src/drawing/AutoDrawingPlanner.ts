import { inferAssemblyLongitudinalFrame, type AssemblyLongitudinalFrame } from "./AssemblyOrientationPlanner";

/**
 * Automatic drawing planning for FrameLogic.
 *
 * The projected-view arrangement and dimension planning approach is adapted
 * from Cota (Copyright 2026 Christian Orengia), Apache-2.0.
 * https://github.com/mxchristian17/cota
 *
 * This module creates geometric instructions only: STEP B-Rep remains the
 * source of truth, and the existing drawing renderer owns all annotations.
 */
export interface DrawingPoint3 { readonly x: number; readonly y: number; readonly z: number }
export interface DrawingBounds3 { readonly min: DrawingPoint3; readonly max: DrawingPoint3 }
export type AutomaticViewCode = "FRONT" | "TOP" | "RIGHT" | "ISO";

export interface AutomaticDrawingView {
  readonly code: AutomaticViewCode;
  readonly name: string;
  readonly origin: DrawingPoint3;
  readonly xAxis: DrawingPoint3;
  readonly yAxis: DrawingPoint3;
  readonly normal: DrawingPoint3;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

const dot = (a: DrawingPoint3, b: DrawingPoint3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const sum = (a: DrawingPoint3, b: DrawingPoint3): DrawingPoint3 =>
  ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a: DrawingPoint3, n: number): DrawingPoint3 =>
  ({ x: a.x * n, y: a.y * n, z: a.z * n });
const v = (x: number, y: number, z: number): DrawingPoint3 => ({ x, y, z });

/** Four spatially registered views in a right-handed basis, with margin. */
export function planAutomaticViews(bounds: DrawingBounds3): AutomaticDrawingView[] {
  const { min, max } = bounds;
  const values = [min.x, min.y, min.z, max.x, max.y, max.z];
  if (values.some((n) => !Number.isFinite(n))
    || min.x > max.x || min.y > max.y || min.z > max.z) return [];

  const d = Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z);
  if (d < 1e-9) return [];
  // Geometry and units come from the model; padding is only a view framing aid.
  const margin = Math.max(d * 0.025, 1e-5);
  const s2 = Math.sqrt(1 / 2);
  const s3 = Math.sqrt(1 / 3);
  const s6 = Math.sqrt(1 / 6);
  const bases: Array<Pick<AutomaticDrawingView, "code" | "name" | "xAxis" | "yAxis" | "normal">> = [
    { code: "FRONT", name: "AUTO · Alzado", xAxis: v(1, 0, 0), yAxis: v(0, 0, 1), normal: v(0, -1, 0) },
    { code: "TOP", name: "AUTO · Planta", xAxis: v(1, 0, 0), yAxis: v(0, 1, 0), normal: v(0, 0, 1) },
    { code: "RIGHT", name: "AUTO · Lateral", xAxis: v(0, 1, 0), yAxis: v(0, 0, 1), normal: v(1, 0, 0) },
    { code: "ISO", name: "AUTO · Isométrica", xAxis: v(s2, s2, 0), yAxis: v(-s6, s6, 2 * s6), normal: v(s3, -s3, s3) },
  ];
  const corners: DrawingPoint3[] = [];
  for (const x of [min.x, max.x]) for (const y of [min.y, max.y])
    for (const z of [min.z, max.z]) corners.push(v(x, y, z));

  return bases.map((basis) => {
    const xx = corners.map((p) => dot(p, basis.xAxis));
    const yy = corners.map((p) => dot(p, basis.yAxis));
    const zz = corners.map((p) => dot(p, basis.normal));
    const loX = Math.min(...xx) - margin;
    const loY = Math.min(...yy) - margin;
    const loZ = Math.min(...zz) - margin;
    return {
      ...basis,
      origin: sum(sum(mul(basis.xAxis, loX), mul(basis.yAxis, loY)), mul(basis.normal, loZ)),
      width: Math.max(...xx) - Math.min(...xx) + margin * 2,
      height: Math.max(...yy) - Math.min(...yy) + margin * 2,
      depth: Math.max(...zz) - Math.min(...zz) + margin * 2,
    };
  });
}


/**
 * Candidate projections registered in a geometry-derived longitudinal frame.
 * The sampled corners establish VIEW extents only; STEP B-Rep remains the
 * measurement source. The sheet keeps the existing FRONT/TOP/RIGHT/ISO slots.
 */
function planLongitudinalViews(
  points: readonly DrawingPoint3[],
  frame: AssemblyLongitudinalFrame,
): AutomaticDrawingView[] {
  const add = (a: DrawingPoint3, b: DrawingPoint3): DrawingPoint3 =>
    ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  const neg = (a: DrawingPoint3): DrawingPoint3 => mul(a, -1);
  const normalize = (a: DrawingPoint3): DrawingPoint3 => mul(a, 1 / Math.hypot(a.x, a.y, a.z));
  const cross = (a: DrawingPoint3, b: DrawingPoint3): DrawingPoint3 =>
    v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const x = frame.xAxis, y = frame.yAxis, n = frame.normal;
  const isoX = normalize(add(x, neg(n)));
  const isoN = normalize(add(add(x, n), y));
  const isoY = normalize(cross(isoN, isoX));
  const bases: Array<Pick<AutomaticDrawingView, "code" | "name" | "xAxis" | "yAxis" | "normal">> = [
    { code: "FRONT", name: "AUTO · Alzado longitudinal", xAxis: x, yAxis: y, normal: n },
    { code: "TOP", name: "AUTO · Planta longitudinal", xAxis: x, yAxis: neg(n), normal: y },
    { code: "RIGHT", name: "AUTO · Extremo", xAxis: neg(n), yAxis: y, normal: x },
    { code: "ISO", name: "AUTO · Isométrica", xAxis: isoX, yAxis: isoY, normal: isoN },
  ];
  return bases.map((basis) => {
    const px = points.map((p) => dot(p, basis.xAxis));
    const py = points.map((p) => dot(p, basis.yAxis));
    const pz = points.map((p) => dot(p, basis.normal));
    const minX = Math.min(...px), minY = Math.min(...py), minZ = Math.min(...pz);
    const maxX = Math.max(...px), maxY = Math.max(...py), maxZ = Math.max(...pz);
    const diagonal = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
    const margin = Math.max(diagonal * 0.025, 1e-5);
    return {
      ...basis,
      origin: sum(sum(mul(basis.xAxis, minX - margin), mul(basis.yAxis, minY - margin)),
        mul(basis.normal, minZ - margin)),
      width: maxX - minX + margin * 2,
      height: maxY - minY + margin * 2,
      depth: maxZ - minZ + margin * 2,
    };
  });
}

/**
 * Select only views that add useful independent information to an assembly.
 * Uses a geometry-derived longitudinal reference only when strongly defined.
 * Otherwise preserves the original world-axis view selection. Neither render
 * envelopes nor projected mesh edges are exact manufacturing dimensions.
 */
export function planSmartAssemblyViews(
  bounds: DrawingBounds3,
  pieceCount = 1,
  geometryPoints?: readonly DrawingPoint3[],
): AutomaticDrawingView[] {
  const frame = geometryPoints ? inferAssemblyLongitudinalFrame(geometryPoints) : null;
  if (frame && geometryPoints) {
    const oriented = planLongitudinalViews(geometryPoints, frame);
    const longitudinal = oriented.find((view) => view.code === "FRONT")!;
    const end = oriented.find((view) => view.code === "RIGHT")!;
    // A high-confidence long axis is slender by construction; only introduce
    // a third orthographic direction if it describes substantial depth.
    const volumetric = Math.min(longitudinal.height, end.width)
      / Math.max(longitudinal.width, 1e-12) >= 0.45;
    const codes: AutomaticViewCode[] = ["FRONT", "RIGHT"];
    if (pieceCount >= 3 && volumetric) codes.push("TOP");
    if (pieceCount >= 2) codes.push("ISO");
    return codes.map((code) => oriented.find((view) => view.code === code)!);
  }
  const candidates = planAutomaticViews(bounds);
  if (!candidates.length) return [];
  const spans = [
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  ];
  const dominant = spans.indexOf(Math.max(...spans));
  let primary: AutomaticViewCode;
  let end: AutomaticViewCode;
  let optional: AutomaticViewCode;
  if (dominant === 0) {
    primary = spans[2]! >= spans[1]! ? "FRONT" : "TOP";
    end = "RIGHT";
    optional = primary === "FRONT" ? "TOP" : "FRONT";
  } else if (dominant === 1) {
    primary = spans[2]! >= spans[0]! ? "RIGHT" : "TOP";
    end = "FRONT";
    optional = primary === "RIGHT" ? "TOP" : "RIGHT";
  } else {
    primary = spans[0]! >= spans[1]! ? "FRONT" : "RIGHT";
    end = "TOP";
    optional = primary === "FRONT" ? "RIGHT" : "FRONT";
  }
  const extent = Math.max(...spans);
  const volumetric = Math.min(...spans) / extent >= 0.45;
  const codes: AutomaticViewCode[] = [primary, end];
  // Complex, non-slender assemblies need the third principal projection.
  if (pieceCount >= 3 && volumetric) codes.push(optional);
  // An isometric view aids interpretation, but is not a dimensioning source.
  if (pieceCount >= 2) codes.push("ISO");
  return codes.map((code) => candidates.find((v) => v.code === code)!);
}

export interface AutomaticDimensionPoint {
  readonly instanceId: string;
  readonly topologyId: string;
  readonly x: number;
  readonly y: number;
  readonly kind: "VERTEX" | "CIRCLE";
  readonly radius?: number;
}

export interface AutomaticDimensionInstruction {
  readonly mode: "HORIZONTAL" | "VERTICAL" | "DIAMETER";
  readonly a: AutomaticDimensionPoint;
  readonly b: AutomaticDimensionPoint;
  /** Offset in paper pixels, not model units. */
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * Preview dimensions from exact B-Rep features visible in the section volume.
 * Extents are based on exact vertices, NOT a tessellated mesh; curved outermost
 * boundaries may extend beyond those vertices and require manual review.
 */
export function planAutomaticDimensions(
  features: readonly AutomaticDimensionPoint[],
  maxHoleCenters = 4,
): AutomaticDimensionInstruction[] {
  const valid = features.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const vertices = valid.filter((p) => p.kind === "VERTEX");
  const out: AutomaticDimensionInstruction[] = [];
  if (!vertices.length) return out;
  const extent = (axis: "x" | "y"): [AutomaticDimensionPoint, AutomaticDimensionPoint] => {
    const sorted = [...vertices].sort((a, b) => a[axis] - b[axis]);
    return [sorted[0]!, sorted[sorted.length - 1]!];
  };
  const [minX, maxX] = extent("x");
  const [minY, maxY] = extent("y");
  const tol = 1e-8;
  if (maxX.x - minX.x > tol) out.push({ mode: "HORIZONTAL", a: minX, b: maxX, offsetX: 0, offsetY: -58 });
  if (maxY.y - minY.y > tol) out.push({ mode: "VERTICAL", a: minY, b: maxY, offsetX: 62, offsetY: 0 });
  const seen = new Set<string>();
  const holes = valid.filter((p) => p.kind === "CIRCLE" && p.radius && p.radius > tol)
    .filter((p) => {
      const key = [p.instanceId, Math.round(p.x / tol), Math.round(p.y / tol), Math.round((p.radius ?? 0) / tol)].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, Math.max(0, Math.min(20, Math.trunc(maxHoleCenters))));
  holes.forEach((hole, i) => {
    out.push({ mode: "DIAMETER", a: hole, b: hole, offsetX: 10 + i * 14, offsetY: i * 18 });
    if (hole.x > minX.x + tol && hole.x < maxX.x - tol)
      out.push({ mode: "HORIZONTAL", a: minX, b: hole, offsetX: 0, offsetY: -30 - i * 15 });
    if (hole.y > minY.y + tol && hole.y < maxY.y - tol)
      out.push({ mode: "VERTICAL", a: minY, b: hole, offsetX: 31 + i * 16, offsetY: 0 });
  });
  return out;
}
