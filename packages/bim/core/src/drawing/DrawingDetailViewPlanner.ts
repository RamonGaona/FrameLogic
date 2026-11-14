/**
 * Circular projected detail geometry. All coordinates are in source-view
 * model millimetres, not screen pixels. This clips the linework already
 * classified by OCCT/HLR, preserving visible/hidden/cut attributes.
 * The circle is a 2D projection window, never a 3D Boolean cut.
 */
export interface DetailPoint { readonly x: number; readonly y: number }
export interface DetailCircle extends DetailPoint { readonly radius: number }
export interface DetailPaperTransform {
  readonly originX: number;
  readonly originY: number;
  readonly drawnHeight: number;
  readonly scale: number;
}
export interface ProjectedDetailLine {
  readonly x1: number; readonly y1: number;
  readonly x2: number; readonly y2: number;
  readonly hidden?: boolean;
  readonly cut?: boolean;
}
export interface CircularDetailGeometry<T extends ProjectedDetailLine> {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly segments: readonly T[];
}

const EPS = 1e-9;

export function paperCircleToProjection(
  center: DetailPoint, radius: number, transform: DetailPaperTransform,
): DetailCircle | null {
  if (![center.x, center.y, radius, transform.originX, transform.originY,
    transform.drawnHeight, transform.scale].every(Number.isFinite)
    || radius <= 0 || transform.scale <= 0) return null;
  return {
    x: (center.x - transform.originX) / transform.scale,
    y: (transform.originY + transform.drawnHeight - center.y) / transform.scale,
    radius: radius / transform.scale,
  };
}

export function projectionCircleToPaper(
  circle: DetailCircle, transform: DetailPaperTransform,
): DetailCircle {
  return {
    x: transform.originX + circle.x * transform.scale,
    y: transform.originY + transform.drawnHeight - circle.y * transform.scale,
    radius: circle.radius * transform.scale,
  };
}

/** Solve the intersections of an arbitrary segment with the circle.
 * Tangent contacts, which have zero projected length, are discarded.
 */
export function clipProjectedLineToCircle<T extends ProjectedDetailLine>(
  segment: T, circle: DetailCircle,
): T | null {
  if (![segment.x1, segment.y1, segment.x2, segment.y2,
    circle.x, circle.y, circle.radius].every(Number.isFinite)
    || circle.radius <= EPS) return null;
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const a = dx * dx + dy * dy;
  if (a <= EPS * EPS) return null;
  const fx = segment.x1 - circle.x;
  const fy = segment.y1 - circle.y;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - circle.radius * circle.radius;
  const d = b * b - 4 * a * c;
  const times = [0, 1];
  if (d >= 0) {
    const root = Math.sqrt(d);
    for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
      if (t > 0 && t < 1) times.push(t);
    }
  }
  times.sort((first, second) => first - second);
  let start: number | null = null;
  let end: number | null = null;
  for (let index = 1; index < times.length; index++) {
    const t0 = times[index - 1]!;
    const t1 = times[index]!;
    if (t1 - t0 <= EPS) continue;
    const mid = (t0 + t1) / 2;
    const mx = fx + dx * mid;
    const my = fy + dy * mid;
    if (mx * mx + my * my <= circle.radius * circle.radius + EPS) {
      start = start === null ? t0 : Math.min(start, t0);
      end = end === null ? t1 : Math.max(end, t1);
    }
  }
  if (start === null || end === null || end - start <= EPS) return null;
  return {
    ...segment,
    x1: segment.x1 + dx * start,
    y1: segment.y1 + dy * start,
    x2: segment.x1 + dx * end,
    y2: segment.y1 + dy * end,
  };
}

export function cropProjectedDetail<T extends ProjectedDetailLine>(
  segments: readonly T[], circle: DetailCircle,
): CircularDetailGeometry<T> | null {
  if (![circle.x, circle.y, circle.radius].every(Number.isFinite)
    || circle.radius <= EPS) return null;
  const offsetX = circle.x - circle.radius;
  const offsetY = circle.y - circle.radius;
  const result: T[] = [];
  for (const segment of segments) {
    const clipped = clipProjectedLineToCircle(segment, circle);
    if (!clipped) continue;
    result.push({
      ...clipped,
      x1: clipped.x1 - offsetX, y1: clipped.y1 - offsetY,
      x2: clipped.x2 - offsetX, y2: clipped.y2 - offsetY,
    });
  }
  if (!result.length) return null;
  return {
    width: 2 * circle.radius, height: 2 * circle.radius,
    offsetX, offsetY, segments: result,
  };
}

export function detailLetter(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error("Invalid detail index");
  let value = index + 1;
  let output = "";
  while (value > 0) {
    value--;
    output = String.fromCharCode(65 + value % 26) + output;
    value = Math.floor(value / 26);
  }
  return output;
}

export function nextCircularDetailLetter(labels: readonly string[]): string {
  const used = new Set(labels.map((label) => label.trim().toUpperCase()));
  for (let index = 0; index < 10000; index++) {
    const label = detailLetter(index);
    if (!used.has(label)) return label;
  }
  throw new Error("Circular detail identifier capacity exceeded");
}

/** A saved/corrupted source graph must not create reference loops. */
export function validDetailAncestry(
  sourceId: string, proposedChildId: string,
  views: readonly { readonly id: string; readonly sourceViewId?: string }[],
): boolean {
  const byId = new Map(views.map((view) => [view.id, view.sourceViewId]));
  if (!sourceId || !proposedChildId || sourceId === proposedChildId) return false;
  const seen = new Set<string>();
  let current: string | undefined = sourceId;
  while (current) {
    if (current === proposedChildId || seen.has(current)) return false;
    seen.add(current);
    current = byId.get(current);
  }
  return byId.has(sourceId);
}
