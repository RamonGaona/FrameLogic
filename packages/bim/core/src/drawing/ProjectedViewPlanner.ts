/**
 * Relative projected views for a piece or an assembly already placed on a PDF sheet.
 * The parent WorkPlane (including its arbitrary local rotation) is authoritative.
 * No PCA/world-axis re-orientation is performed.
 */
import type { AssemblyViewBasis } from "./AssemblyViewOrientationControls";

export type ProjectionStandard = "ISO_E" | "ISO_A";
export type ProjectedViewDirection =
  | "RIGHT" | "LEFT" | "UP" | "DOWN"
  | "ISO_NE" | "ISO_NW" | "ISO_SE" | "ISO_SW";

export interface DrawingViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface DrawingSheetPoint {
  readonly x: number;
  readonly y: number;
}
type V = { readonly x: number; readonly y: number; readonly z: number };
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const multiply = (a: V, factor: number): V =>
  ({ x: a.x * factor, y: a.y * factor, z: a.z * factor });
const dot = (a: V, b: V): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: V, b: V): V =>
  ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x });
const norm = (a: V): number => Math.hypot(a.x, a.y, a.z);
const normal = (a: V): V => multiply(a, 1 / norm(a));
const iso = (side: ProjectedViewDirection): boolean => side.startsWith("ISO_");
const SAFE_MARGIN = 8;

/** Choose the projected view by dragging away from its parent View's center. */
export function projectionDirectionFromPointer(
  source: DrawingViewportRect,
  point: DrawingSheetPoint,
): ProjectedViewDirection | null {
  const dx = point.x - (source.x + source.width / 2);
  const dy = point.y - (source.y + source.height / 2);
  const xDistance = Math.abs(dx) - source.width / 2;
  const yDistance = Math.abs(dy) - source.height / 2;
  if (xDistance < 10 && yDistance < 10) return null;
  if (xDistance >= 16 && yDistance >= 16
    && Math.min(Math.abs(dx), Math.abs(dy)) / Math.max(Math.abs(dx), Math.abs(dy)) >= 0.37) {
    return dy < 0
      ? (dx > 0 ? "ISO_NE" : "ISO_NW")
      : (dx > 0 ? "ISO_SE" : "ISO_SW");
  }
  return xDistance >= yDistance
    ? (dx > 0 ? "RIGHT" : "LEFT")
    : (dy > 0 ? "DOWN" : "UP");
}

/**
 * ISO_A (third-angle) puts the right/top camera on the right/above the parent.
 * ISO_E (first-angle) reverses the camera, not the location on paper.
 */
export function resolveProjectedViewBasis(
  source: AssemblyViewBasis,
  side: ProjectedViewDirection,
  standard: ProjectionStandard,
): AssemblyViewBasis | null {
  const x = normal(source.xAxis), y = normal(source.yAxis), n = normal(source.normal);
  if (![...Object.values(x), ...Object.values(y), ...Object.values(n)].every(Number.isFinite)
    || Math.abs(dot(x, y)) > 1e-5 || Math.abs(dot(x, n)) > 1e-5
    || Math.abs(dot(y, n)) > 1e-5 || dot(cross(x, y), n) < 0.999) return null;
  const invert = standard === "ISO_E" ? -1 : 1;
  if (side === "RIGHT" || side === "LEFT") {
    const sign = (side === "RIGHT" ? 1 : -1) * invert;
    return { xAxis: multiply(n, -sign), yAxis: y, normal: multiply(x, sign) };
  }
  if (side === "UP" || side === "DOWN") {
    const sign = (side === "UP" ? 1 : -1) * invert;
    return { xAxis: x, yAxis: multiply(n, -sign), normal: multiply(y, sign) };
  }
  if (!iso(side)) return null;
  const signX = side.includes("E") ? 1 : -1;
  const signY = side.includes("N") ? 1 : -1;
  const viewNormal = normal(add(n,
    add(multiply(x, invert * signX), multiply(y, invert * signY))));
  const viewX = normal(cross(y, viewNormal));
  const viewY = normal(cross(viewNormal, viewX));
  return { xAxis: viewX, yAxis: viewY, normal: viewNormal };
}

export function projectedViewLabel(
  side: ProjectedViewDirection,
  standard: ProjectionStandard,
): string {
  if (iso(side)) return "Isométrica proyectada";
  const first = standard === "ISO_E";
  switch (side) {
    case "RIGHT": return first ? "Vista lateral izquierda" : "Vista lateral derecha";
    case "LEFT": return first ? "Vista lateral derecha" : "Vista lateral izquierda";
    case "UP": return first ? "Vista inferior" : "Vista superior";
    case "DOWN": return first ? "Vista superior" : "Vista inferior";
  }
}

/** A projected view inherits the parent drawing scale, including an AUTO scale.
 * Returned denomination may be non-standard: preserving the same scale is
 * more important than silently rescaling the child.
 */
export function projectedViewportSize(
  sourceViewport: DrawingViewportRect,
  sourceGeometry: { readonly width: number; readonly height: number },
  targetGeometry: { readonly width: number; readonly height: number },
  parentScale: number,
): { width: number; height: number } | null {
  if (!(parentScale > 0) || !Number.isFinite(parentScale)
    || !(targetGeometry.width > 0) || !(targetGeometry.height > 0)
    || !(sourceGeometry.width > 0) || !(sourceGeometry.height > 0)
    || !(sourceViewport.width > 0) || !(sourceViewport.height > 0)) return null;
  return {
    width: Math.max(100, targetGeometry.width * parentScale + 20),
    height: Math.max(95, targetGeometry.height * parentScale + 34),
  };
}

/** Orthographic projections stay aligned with their parent along the common
 * drawing axis. Diagonal isometrics are free-positioned at the pointer.
 */
export function placeProjectedViewport(
  source: DrawingViewportRect,
  size: { readonly width: number; readonly height: number },
  side: ProjectedViewDirection,
  point: DrawingSheetPoint,
  sheet: { readonly width: number; readonly height: number },
): DrawingViewportRect | null {
  if (![source.x, source.y, source.width, source.height, size.width, size.height,
    point.x, point.y].every(Number.isFinite)
    || size.width <= 0 || size.height <= 0 || size.width > sheet.width - 16
    || size.height > sheet.height - 16) return null;
  const cx = source.x + source.width / 2, cy = source.y + source.height / 2;
  const minGap = 12;
  let x = point.x - size.width / 2, y = point.y - size.height / 2;
  if (side === "RIGHT") {
    x = Math.max(source.x + source.width + minGap, point.x);
    y = cy - size.height / 2;
  } else if (side === "LEFT") {
    x = Math.min(source.x - size.width - minGap, point.x - size.width);
    y = cy - size.height / 2;
  } else if (side === "UP") {
    x = cx - size.width / 2;
    y = Math.min(source.y - size.height - minGap, point.y - size.height);
  } else if (side === "DOWN") {
    x = cx - size.width / 2;
    y = Math.max(source.y + source.height + minGap, point.y);
  }
  // A projection that cannot fit must not be placed over another View
  // by silently clamping its orthogonal alignment or switching directions.
  if (x < SAFE_MARGIN || y < SAFE_MARGIN ||
    x + size.width > sheet.width - SAFE_MARGIN ||
    y + size.height > sheet.height - SAFE_MARGIN) return null;
  return { x, y, width: size.width, height: size.height };
}

export function projectedViewportOverlaps(
  candidate: DrawingViewportRect,
  layouts: readonly DrawingViewportRect[],
): boolean {
  return layouts.some((other) =>
    candidate.x < other.x + other.width && candidate.x + candidate.width > other.x
    && candidate.y < other.y + other.height && candidate.y + candidate.height > other.y);
}
