/**
 * First- and third-angle projection sheet layout.
 * Inspired by the orthographic view placement used in Cota (Apache-2.0),
 * https://github.com/mxchristian17/cota; original FrameLogic implementation.
 *
 * This is a pure layout planner: it never modifies manual viewport positions.
 * Sheet coordinates are SVG units (1120 × 792); the footer/title block area
 * is reserved to prevent frames from covering the drawing information.
 */
export type ProjectionStandard = "ISO_E" | "ISO_A";
export type ProjectedViewCode = "FRONT" | "TOP" | "RIGHT" | "ISO";
export interface ProjectedSheetView {
  readonly id: string;
  readonly code: ProjectedViewCode;
  readonly width: number;
  readonly height: number;
}
export interface PlannedSheetViewport {
  readonly id: string;
  readonly code: ProjectedViewCode;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly modelScale: number;
}
const LEFT = 52;
const TOP = 46;
const RIGHT = 1068;
const BOTTOM = 614; // title block and revisions begin below this
const GAP = 18;
const FRAME_PAD_X = 90; // space for automatic marks and ordinate dimensions
const FRAME_PAD_Y = 100; // space for top and bottom dimension leaders
const MIN_FRAME_SIZE = 80;
const SLOTS: Record<ProjectionStandard, Record<ProjectedViewCode, readonly [number, number]>> = {
  // ISO first-angle: right view to the LEFT; plan BELOW the front view.
  ISO_E: { RIGHT: [0, 0], FRONT: [1, 0], ISO: [0, 1], TOP: [1, 1] },
  // ISO third-angle: right view to the RIGHT; plan ABOVE the front view.
  ISO_A: { TOP: [0, 0], ISO: [1, 0], FRONT: [0, 1], RIGHT: [1, 1] },
};

/**
 * Arrange a selected subset without changing the legacy four-view planner.
 * Uses the same first-/third-angle slots and reserved title-block area.
 * The shared modelScale is pixels per model unit; it is NOT a scale denominator.
 */
export function planSelectedSheetLayout(
  views: readonly ProjectedSheetView[],
  standard: ProjectionStandard,
): PlannedSheetViewport[] {
  if (views.length < 1 || views.length > 4
    || new Set(views.map((view) => view.code)).size !== views.length
    || !views.every((view) => Number.isFinite(view.width) && Number.isFinite(view.height)
      && view.width > 0 && view.height > 0)) return [];
  if (views.length === 4) return planAutomaticSheetLayout(views, standard);
  if (views.length === 1) {
    const view = views[0]!;
    const availableWidth = RIGHT - LEFT;
    const availableHeight = BOTTOM - TOP;
    const scale = Math.min(
      (availableWidth - FRAME_PAD_X) / view.width,
      (availableHeight - FRAME_PAD_Y) / view.height,
    );
    if (!Number.isFinite(scale) || scale <= 0) return [];
    return [{
      id: view.id, code: view.code,
      x: LEFT, y: TOP, width: availableWidth, height: availableHeight,
      modelScale: scale,
    }];
  }
  const cellW = (RIGHT - LEFT - GAP) / 2;
  const cellH = (BOTTOM - TOP - GAP) / 2;
  const scale = Math.min(...views.map((view) => Math.min(
    (cellW - FRAME_PAD_X) / view.width,
    (cellH - FRAME_PAD_Y) / view.height,
  )));
  if (!Number.isFinite(scale) || scale <= 0) return [];
  return views.map((view) => {
    const [column, row] = SLOTS[standard][view.code];
    const width = Math.min(cellW, Math.max(MIN_FRAME_SIZE, view.width * scale + FRAME_PAD_X));
    const height = Math.min(cellH, Math.max(MIN_FRAME_SIZE, view.height * scale + FRAME_PAD_Y));
    return {
      id: view.id, code: view.code,
      x: LEFT + column * (cellW + GAP) + (cellW - width) / 2,
      y: TOP + row * (cellH + GAP) + (cellH - height) / 2,
      width, height, modelScale: scale,
    };
  });
}

/** Choose an ISO-preferred 1:n scale that fits the A3 layout without cropping. */
export function selectAssemblyScaleDenominator(modelScale: number): number | null {
  if (!Number.isFinite(modelScale) || modelScale <= 0) return null;
  // The 1120×792 SVG is exported to the full 420×297 mm A3 page.
  const pxPerMm = Math.min(1120 / 420, 792 / 297);
  // modelScale is pixels per MODEL millimetre (millimetre-native CAD).
  const required = pxPerMm / modelScale;
  return [1, 2, 2.5, 5, 10, 20, 25, 50, 75, 100, 150, 200, 250, 500, 1000, 2000, 5000]
    .find((denominator) => denominator + 1e-9 >= required) ?? null;
}

export function planAutomaticSheetLayout(
  views: readonly ProjectedSheetView[],
  standard: ProjectionStandard,
): PlannedSheetViewport[] {
  const required: readonly ProjectedViewCode[] = ["FRONT", "TOP", "RIGHT", "ISO"];
  if (views.length !== required.length || new Set(views.map((v) => v.code)).size !== 4
    || !required.every((code) => views.some((view) => view.code === code))
    || views.some((v) => !Number.isFinite(v.width) || !Number.isFinite(v.height)
      || v.width <= 0 || v.height <= 0)) return [];
  const cellW = (RIGHT - LEFT - GAP) / 2;
  const cellH = (BOTTOM - TOP - GAP) / 2;
  // A common geometric scale ensures corresponding model sizes have consistent
  // representation, even if the view aspect ratios differ.
  const scale = Math.min(...views.map((v) => Math.min(
    (cellW - FRAME_PAD_X) / v.width,
    (cellH - FRAME_PAD_Y) / v.height,
  )));
  if (!Number.isFinite(scale) || scale <= 0) return [];
  return views.map((view) => {
    const [column, row] = SLOTS[standard][view.code];
    const width = Math.min(cellW, Math.max(MIN_FRAME_SIZE, view.width * scale + FRAME_PAD_X));
    const height = Math.min(cellH, Math.max(MIN_FRAME_SIZE, view.height * scale + FRAME_PAD_Y));
    return {
      id: view.id,
      code: view.code,
      x: LEFT + column * (cellW + GAP) + (cellW - width) / 2,
      y: TOP + row * (cellH + GAP) + (cellH - height) / 2,
      width, height, modelScale: scale,
    };
  });
}
