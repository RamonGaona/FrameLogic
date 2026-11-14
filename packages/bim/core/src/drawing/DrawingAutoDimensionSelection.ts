/**
 * Paper-space hit testing for STEP dimensions. The visible SVG lines have
 * standard print widths; we use a geometric tolerance for selection without
 * adding large transparent strokes that would pollute the exported PDF.
 */
export interface AutoDimensionStroke {
  readonly viewId: string;
  readonly key: string;
  readonly x1: number; readonly y1: number;
  readonly x2: number; readonly y2: number;
}
export interface AutoDimensionIdentity {
  readonly viewId: string;
  readonly key: string;
}

export function pickAutomaticDimensionStroke(
  point: { readonly x: number; readonly y: number },
  strokes: readonly AutoDimensionStroke[],
  tolerance = 6,
): AutoDimensionIdentity | null {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
    || !Number.isFinite(tolerance) || tolerance < 0) return null;
  let match: AutoDimensionIdentity | null = null;
  let closest = tolerance * tolerance;
  for (const stroke of strokes) {
    if (!stroke.viewId || !stroke.key || ![
      stroke.x1, stroke.y1, stroke.x2, stroke.y2,
    ].every(Number.isFinite)) continue;
    const dx = stroke.x2 - stroke.x1;
    const dy = stroke.y2 - stroke.y1;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared > 1e-12
      ? Math.max(0, Math.min(1,
        ((point.x - stroke.x1) * dx + (point.y - stroke.y1) * dy) / lengthSquared))
      : 0;
    const deltaX = point.x - (stroke.x1 + fraction * dx);
    const deltaY = point.y - (stroke.y1 + fraction * dy);
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (distanceSquared <= closest) {
      closest = distanceSquared;
      match = { viewId: stroke.viewId, key: stroke.key };
    }
  }
  return match;
}
