import { describe, expect, it } from "vitest";
import { pickAutomaticDimensionStroke } from "./DrawingAutoDimensionSelection";

const strokes = [
  { viewId: "view-1", key: "step-one", x1: 100, y1: 200, x2: 400, y2: 200 },
  { viewId: "view-1", key: "step-two", x1: 100, y1: 300, x2: 400, y2: 300 },
  { viewId: "view-2", key: "step-three", x1: 500, y1: 200, x2: 500, y2: 300 },
];

describe("Paper Space STEP dimension selection", () => {
  it("selects a dimension by its line even when the text is missed", () => {
    expect(pickAutomaticDimensionStroke({ x: 250, y: 204 }, strokes))
      .toEqual({ viewId: "view-1", key: "step-one" });
    expect(pickAutomaticDimensionStroke({ x: 300, y: 299 }, strokes))
      .toEqual({ viewId: "view-1", key: "step-two" });
  });
  it("does not select unrelated View geometry or a distant dimension", () => {
    expect(pickAutomaticDimensionStroke({ x: 15, y: 15 }, strokes)).toBeNull();
    expect(pickAutomaticDimensionStroke({ x: 550, y: 250 }, strokes)).toBeNull();
    expect(pickAutomaticDimensionStroke({ x: 501, y: 251 }, strokes))
      .toEqual({ viewId: "view-2", key: "step-three" });
  });
  it("ignores invalid segments and rejects negative tolerances", () => {
    expect(pickAutomaticDimensionStroke({ x: 100, y: 200 },
      [{ viewId: "x", key: "bad", x1: NaN, y1: 200, x2: 500, y2: 200 }, ...strokes]))
      .toEqual({ viewId: "view-1", key: "step-one" });
    expect(pickAutomaticDimensionStroke({ x: 100, y: 200 }, strokes, -1)).toBeNull();
  });
});
