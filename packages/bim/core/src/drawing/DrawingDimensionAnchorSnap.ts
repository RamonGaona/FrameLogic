/**
 * A manual override must be attached to a genuine projected edge endpoint,
 * not to an arbitrary screen coordinate. No source STEP/model geometry is
 * modified when a dimension reference is retargeted.
 */
export interface ProjectedDimensionEndpoint {
  readonly x: number;
  readonly y: number;
}
export interface ProjectedDimensionSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export function snapDimensionAnchorToView(
  pointer: ProjectedDimensionEndpoint,
  segments: readonly ProjectedDimensionSegment[],
  frame: {
    readonly originX: number;
    readonly originY: number;
    readonly drawnHeight: number;
    readonly scale: number;
  },
  tolerancePx = 13,
): ProjectedDimensionEndpoint | null {
  if (!Number.isFinite(frame.scale) || frame.scale <= 0
    || !Number.isFinite(pointer.x + pointer.y)
    || !Number.isFinite(tolerancePx) || tolerancePx <= 0) return null;
  const candidates = new Map<string, ProjectedDimensionEndpoint>();
  for (const segment of segments) {
    for (const p of [
      { x: segment.x1, y: segment.y1 },
      { x: segment.x2, y: segment.y2 },
    ]) {
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
        candidates.set(`${p.x}:${p.y}`, p);
      }
    }
  }
  let best: ProjectedDimensionEndpoint | null = null;
  let bestDistance = tolerancePx * tolerancePx;
  for (const point of candidates.values()) {
    const x = frame.originX + point.x * frame.scale;
    const y = frame.originY + frame.drawnHeight - point.y * frame.scale;
    const distance = (pointer.x - x) ** 2 + (pointer.y - y) ** 2;
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
}
