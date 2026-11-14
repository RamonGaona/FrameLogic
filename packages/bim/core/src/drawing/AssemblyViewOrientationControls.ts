/**
 * Drawing VIEW orientation presets. They change only the 2D projection basis
 * and never alter the model's world matrix or any fabrication dimension.
 */
import { inferAssemblyLongitudinalFrame, type OrientationPoint3 } from "./AssemblyOrientationPlanner";

export type AssemblyViewOrientationMode =
  | "CURRENT"
  | "LONGITUDINAL"
  | "LOCAL_TOP"
  | "LOCAL_END"
  | "LOCAL_ISO"
  | "WORLD_FRONT"
  | "WORLD_TOP"
  | "WORLD_RIGHT"
  | "WORLD_ISO";

export interface AssemblyViewBasis {
  readonly xAxis: OrientationPoint3;
  readonly yAxis: OrientationPoint3;
  readonly normal: OrientationPoint3;
}

export const ASSEMBLY_VIEW_ORIENTATION_OPTIONS: readonly (readonly [
  AssemblyViewOrientationMode, string,
])[] = [
  ["CURRENT", "Actual / WorkPlane original"],
  ["LONGITUDINAL", "Alzado · eje propio"],
  ["LOCAL_TOP", "Planta · eje propio"],
  ["LOCAL_END", "Extremo · eje propio"],
  ["LOCAL_ISO", "Isométrica · eje propio"],
  ["WORLD_FRONT", "Alzado · ejes globales"],
  ["WORLD_TOP", "Planta · ejes globales"],
  ["WORLD_RIGHT", "Lateral · ejes globales"],
  ["WORLD_ISO", "Isométrica · ejes globales"],
];

const v = (x: number, y: number, z: number): OrientationPoint3 => ({ x, y, z });
const multiply = (p: OrientationPoint3, k: number): OrientationPoint3 =>
  v(p.x * k, p.y * k, p.z * k);
const add = (a: OrientationPoint3, b: OrientationPoint3): OrientationPoint3 =>
  v(a.x + b.x, a.y + b.y, a.z + b.z);
const dot = (a: OrientationPoint3, b: OrientationPoint3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: OrientationPoint3, b: OrientationPoint3): OrientationPoint3 =>
  v(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const normalize = (p: OrientationPoint3): OrientationPoint3 =>
  multiply(p, 1 / Math.hypot(p.x, p.y, p.z));

const WORLD: Readonly<Record<"WORLD_FRONT" | "WORLD_TOP" | "WORLD_RIGHT" | "WORLD_ISO", AssemblyViewBasis>> = {
  WORLD_FRONT: { xAxis: v(1, 0, 0), yAxis: v(0, 0, 1), normal: v(0, -1, 0) },
  WORLD_TOP: { xAxis: v(1, 0, 0), yAxis: v(0, 1, 0), normal: v(0, 0, 1) },
  WORLD_RIGHT: { xAxis: v(0, 1, 0), yAxis: v(0, 0, 1), normal: v(1, 0, 0) },
  WORLD_ISO: {
    xAxis: v(Math.SQRT1_2, Math.SQRT1_2, 0),
    yAxis: v(-1 / Math.sqrt(6), 1 / Math.sqrt(6), 2 / Math.sqrt(6)),
    normal: v(1 / Math.sqrt(3), -1 / Math.sqrt(3), 1 / Math.sqrt(3)),
  },
};

/**
 * A nearly X/Y/Z-aligned beam must be exactly horizontal on paper.
 * Small projected skew from plates or unequal mesh sampling must not rotate
 * an otherwise world-axis-aligned long member. Rotated assemblies keep their
 * genuine own-axis PCA basis instead.
 */
export function resolveAssemblyViewBasis(
  mode: AssemblyViewOrientationMode,
  points: readonly OrientationPoint3[],
): AssemblyViewBasis | null {
  if (mode === "CURRENT") return null;
  if (mode in WORLD) return WORLD[mode as keyof typeof WORLD];
  const estimated = inferAssemblyLongitudinalFrame(points);
  if (!estimated) return null;
  let x = estimated.xAxis;
  const snapThreshold = Math.cos(8 * Math.PI / 180);
  for (const axis of [v(1, 0, 0), v(0, 1, 0), v(0, 0, 1)]) {
    if (Math.abs(dot(x, axis)) >= snapThreshold) {
      x = multiply(axis, dot(x, axis) < 0 ? -1 : 1);
      break;
    }
  }
  const preferredUp = Math.abs(x.z) < 0.95 ? v(0, 0, 1) : v(0, 1, 0);
  const y = normalize(add(preferredUp, multiply(x, -dot(preferredUp, x))));
  const normal = normalize(cross(x, y));

  if (mode === "LONGITUDINAL") return { xAxis: x, yAxis: y, normal };
  if (mode === "LOCAL_TOP")
    return { xAxis: x, yAxis: multiply(normal, -1), normal: y };
  if (mode === "LOCAL_END")
    return { xAxis: multiply(normal, -1), yAxis: y, normal: x };

  const isoX = normalize(add(x, multiply(normal, -1)));
  const isoN = normalize(add(add(x, y), normal));
  return { xAxis: isoX, yAxis: normalize(cross(isoN, isoX)), normal: isoN };
}
