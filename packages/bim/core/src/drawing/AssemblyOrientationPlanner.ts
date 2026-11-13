/**
 * Deterministic orientation proposal for AUTOMATIC drawing VIEW selection.
 *
 * Samples come from the render geometry envelopes, not STEP manufacturing
 * datums. PCA is used only when one direction is distinctly dominant.
 * A dimension or machining feature must NEVER be inferred from this frame.
 */
export interface OrientationPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AssemblyLongitudinalFrame {
  readonly xAxis: OrientationPoint3;
  readonly yAxis: OrientationPoint3;
  readonly normal: OrientationPoint3;
  /** Principal variance / sum of remaining variances (not an accuracy claim). */
  readonly dominance: number;
}

const dot = (a: OrientationPoint3, b: OrientationPoint3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const multiply = (a: OrientationPoint3, scale: number): OrientationPoint3 =>
  ({ x: a.x * scale, y: a.y * scale, z: a.z * scale });
const subtract = (a: OrientationPoint3, b: OrientationPoint3): OrientationPoint3 =>
  ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const cross = (a: OrientationPoint3, b: OrientationPoint3): OrientationPoint3 =>
  ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x });
const normalize = (p: OrientationPoint3): OrientationPoint3 | null => {
  const size = Math.hypot(p.x, p.y, p.z);
  return size > 1e-12 ? multiply(p, 1 / size) : null;
};

/**
 * Finds a candidate longitudinal axis from sampled world-space geometry.
 *
 * Does not use the axis-aligned world bounding box: doing so loses the
 * orientation of a beam rotated relative to X/Y/Z.
 * Rejects nearly isotropic / ambiguous geometry and invalid samples.
 */
export function inferAssemblyLongitudinalFrame(
  points: readonly OrientationPoint3[],
  minDominance = 2.25,
): AssemblyLongitudinalFrame | null {
  if (points.length < 8 || !Number.isFinite(minDominance) || minDominance <= 0
    || points.some((p) => ![p.x, p.y, p.z].every(Number.isFinite))) return null;
  let cx = 0, cy = 0, cz = 0;
  for (const p of points) { cx += p.x; cy += p.y; cz += p.z; }
  cx /= points.length;
  cy /= points.length;
  cz /= points.length;

  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of points) {
    const x = p.x - cx, y = p.y - cy, z = p.z - cz;
    xx += x * x; xy += x * y; xz += x * z;
    yy += y * y; yz += y * z; zz += z * z;
  }
  const trace = xx + yy + zz;
  if (!Number.isFinite(trace) || trace <= 1e-18) return null;
  const apply = (p: OrientationPoint3): OrientationPoint3 => ({
    x: xx * p.x + xy * p.y + xz * p.z,
    y: xy * p.x + yy * p.y + yz * p.z,
    z: xz * p.x + yz * p.y + zz * p.z,
  });
  // Starting from a non-axis vector also handles axes rotated 45 degrees.
  let axis: OrientationPoint3 = { x: 1 / Math.sqrt(3), y: 1 / Math.sqrt(3), z: 1 / Math.sqrt(3) };
  for (let i = 0; i < 48; i++) {
    const next = normalize(apply(axis));
    if (!next) return null;
    axis = next;
  }
  const lambda = dot(axis, apply(axis));
  const remainder = Math.max(0, trace - lambda);
  const dominance = remainder <= trace * 1e-12 ? Number.POSITIVE_INFINITY : lambda / remainder;
  if (!(dominance >= minDominance)) return null;

  // Canonical sign avoids a different view direction on repeated generation.
  const dominantCoordinate = [Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z)]
    .indexOf(Math.max(Math.abs(axis.x), Math.abs(axis.y), Math.abs(axis.z)));
  const component = dominantCoordinate === 0 ? axis.x : dominantCoordinate === 1 ? axis.y : axis.z;
  if (component < 0) axis = multiply(axis, -1);

  const preferredUp = Math.abs(axis.z) < 0.95
    ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const yAxis = normalize(subtract(preferredUp, multiply(axis, dot(preferredUp, axis))));
  if (!yAxis) return null;
  const normal = normalize(cross(axis, yAxis));
  return normal ? { xAxis: axis, yAxis, normal, dominance } : null;
}
