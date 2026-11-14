import { describe, expect, it } from "vitest";
import {
  DRAWING_VIEW_SCALE_PRESETS,
  clipDrawingSegmentToView,
  drawingViewScaleSelection,
  formatDrawingViewScale,
  modelToPaperScale,
  parseDrawingViewScale,
} from "./DrawingViewScale";
import { cloneProfessionalState, createDefaultProfessionalState } from "./DrawingProfessionalModel";

describe("per-View drawing scales", () => {
  it("supports AUTO, standard denominators and arbitrary custom denominators", () => {
    expect(parseDrawingViewScale(" AUTO ")).toBeNull();
    for (const value of DRAWING_VIEW_SCALE_PRESETS) {
      expect(parseDrawingViewScale(String(value))).toBe(value);
      expect(parseDrawingViewScale("1:" + value)).toBe(value);
      expect(drawingViewScaleSelection(value)).toBe(String(value));
    }
    expect(parseDrawingViewScale(" 1:17,5 ")).toBe(17.5);
    expect(formatDrawingViewScale(17.5)).toBe("1:17.5");
    expect(drawingViewScaleSelection(17.5)).toBe("CUSTOM");
    expect(formatDrawingViewScale(null)).toBe("AUTO");
    expect(drawingViewScaleSelection(null)).toBe("AUTO");
  });

  it("does not silently accept zero, fractions larger than 1:1, Infinity or malformed input", () => {
    for (const value of ["", "1:0", "1:0.5", "0", "-10", "1:-5", "1:2:3", "1e99",
      "Infinity", "NaN", "1:1000001", "1:", "17mm", "20/1"]) {
      expect(parseDrawingViewScale(value)).toBeUndefined();
    }
  });

  it("respects physical millimetre units: 3000 mm at 1:20 occupies 150 mm on paper", () => {
    const modelLength = 3000;
    const mmToCanvasPixels = 2.4;
    const scale = modelToPaperScale(20, mmToCanvasPixels)!;
    expect(modelLength * scale / mmToCanvasPixels).toBeCloseTo(150, 10);
    expect(modelToPaperScale(1, mmToCanvasPixels)).toBeCloseTo(2.4, 10);
    expect(modelToPaperScale(50, mmToCanvasPixels)).toBeCloseTo(0.048, 10);
    expect(modelToPaperScale(0, mmToCanvasPixels)).toBeNull();
  });

  it("clips enlarged geometry to its own View without distorting the scale", () => {
    const frame = { x: 100, y: 100, width: 120, height: 80 };
    expect(clipDrawingSegmentToView(
      { x1: 60, y1: 140, x2: 300, y2: 140 }, frame,
    )).toEqual({ x1: 100, y1: 140, x2: 220, y2: 140 });
    expect(clipDrawingSegmentToView(
      { x1: 160, y1: 50, x2: 160, y2: 240 }, frame,
    )).toEqual({ x1: 160, y1: 100, x2: 160, y2: 180 });
    expect(clipDrawingSegmentToView(
      { x1: 0, y1: 0, x2: 80, y2: 80 }, frame,
    )).toBeNull();
    expect(clipDrawingSegmentToView(
      { x1: 110, y1: 120, x2: 200, y2: 170 }, frame,
    )).toEqual({ x1: 110, y1: 120, x2: 200, y2: 170 });
    expect(clipDrawingSegmentToView(
      { x1: NaN, y1: 0, x2: 1, y2: 1 }, frame,
    )).toBeNull();
  });

  it("serializes scales for different Views independently, including AUTO and custom scales", () => {
    const state = createDefaultProfessionalState();
    state.viewLayouts.push(
      { id: "original", sectionId: "o", kind: "SECTION", x: 1, y: 2, width: 200,
        height: 100, scaleDenominator: 20, showHidden: false, locked: false },
      { id: "projected", sectionId: "p", kind: "SECTION", x: 250, y: 2, width: 100,
        height: 100, scaleDenominator: 17.5, showHidden: false, locked: false },
      { id: "detail", sectionId: "d", kind: "DETAIL", x: 1, y: 220, width: 100,
        height: 100, scaleDenominator: null, showHidden: false, locked: false },
    );
    const saved = JSON.stringify(state);
    const restored = cloneProfessionalState(JSON.parse(saved));
    expect(restored.viewLayouts.map((v) => v.scaleDenominator)).toEqual([20, 17.5, null]);
    restored.viewLayouts[1]!.scaleDenominator = 5;
    expect(restored.viewLayouts[0]!.scaleDenominator).toBe(20);
    expect(restored.viewLayouts[2]!.scaleDenominator).toBeNull();
  });
});
