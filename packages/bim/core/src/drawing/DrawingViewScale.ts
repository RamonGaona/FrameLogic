/**
 * Scale settings for an individual Paper Space View.
 *
 * Model Space uses millimetres. A scale 1:N means N model millimetres
 * occupy one paper millimetre; the View must not inherit its neighbours' scale.
 */
export const DRAWING_VIEW_SCALE_PRESETS = [
  1, 2, 2.5, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500, 1000,
] as const;
export const DRAWING_VIEW_CUSTOM_SCALE = "CUSTOM";
export const DRAWING_VIEW_AUTO_SCALE = "AUTO";
export const DRAWING_VIEW_MAX_DENOMINATOR = 1_000_000;

/** Parses a denominator, `1:20`, or AUTO. undefined means invalid. */
export function parseDrawingViewScale(
  text: string,
): number | null | undefined {
  const normalized = text.trim().replace(",", ".");
  if (normalized.toUpperCase() === "AUTO") return null;
  const match = /^(?:1\s*:\s*)?(?:\d+(?:\.\d*)?|\.\d+)$/.exec(normalized);
  if (!match) return undefined;
  const denominator = Number(normalized.replace(/^1\s*:\s*/, ""));
  return Number.isFinite(denominator)
    && denominator >= 1
    && denominator <= DRAWING_VIEW_MAX_DENOMINATOR
    ? denominator
    : undefined;
}

export function formatDrawingViewScale(denominator: number | null): string {
  if (denominator === null) return "AUTO";
  if (!Number.isFinite(denominator) || denominator < 1) return "AUTO";
  return "1:" + String(Number(denominator.toFixed(6)));
}

/** Selects a preset or the custom-input mode without rounding the saved value. */
export function drawingViewScaleSelection(
  denominator: number | null,
): string {
  if (denominator === null) return DRAWING_VIEW_AUTO_SCALE;
  return DRAWING_VIEW_SCALE_PRESETS.some((preset) => preset === denominator)
    ? String(denominator)
    : DRAWING_VIEW_CUSTOM_SCALE;
}

/** Model and paper coordinates are both measured in mm. */
export function modelToPaperScale(
  denominator: number,
  pixelsPerPaperMillimeter: number,
): number | null {
  if (!Number.isFinite(denominator) || denominator < 1
    || !Number.isFinite(pixelsPerPaperMillimeter)
    || pixelsPerPaperMillimeter <= 0) return null;
  return pixelsPerPaperMillimeter / denominator;
}

export interface PaperDrawingSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}
export interface PaperDrawingFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Clip projected geometry to its own View frame in paper coordinates.
 * Preserves the exact requested 1:N scale and prevents enlarged geometry from
 * crossing into neighbouring Views/the title block. Pure Liang-Barsky clip.
 */
export function clipDrawingSegmentToView(
  segment: PaperDrawingSegment, frame: PaperDrawingFrame,
): PaperDrawingSegment | null {
  if (![segment.x1, segment.y1, segment.x2, segment.y2, frame.x, frame.y,
    frame.width, frame.height].every(Number.isFinite)
    || frame.width <= 0 || frame.height <= 0) return null;
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  let start = 0;
  let end = 1;
  for (const [p, q] of [
    [-dx, segment.x1 - frame.x],
    [dx, frame.x + frame.width - segment.x1],
    [-dy, segment.y1 - frame.y],
    [dy, frame.y + frame.height - segment.y1],
  ] as const) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const ratio = q / p;
    if (p < 0) {
      if (ratio > end) return null;
      start = Math.max(start, ratio);
    } else {
      if (ratio < start) return null;
      end = Math.min(end, ratio);
    }
  }
  if (end < start) return null;
  return {
    x1: segment.x1 + start * dx,
    y1: segment.y1 + start * dy,
    x2: segment.x1 + end * dx,
    y2: segment.y1 + end * dy,
  };
}
