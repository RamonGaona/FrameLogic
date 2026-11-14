import { describe, expect, it } from "vitest";
import { circularDetailRadiusGrips, circularDetailRadiusFromPointer } from "./DrawingCircularDetailGrips";

describe("four controls for circular-detail reference radius", () => {
  it("places one draggable grip at each cardinal point of the same circle", () => {
    const grips = circularDetailRadiusGrips(120, 80, 30);
    expect(grips).toEqual([
      { direction: "E", x: 150, y: 80, cursor: "ew-resize" },
      { direction: "W", x: 90, y: 80, cursor: "ew-resize" },
      { direction: "N", x: 120, y: 50, cursor: "ns-resize" },
      { direction: "S", x: 120, y: 110, cursor: "ns-resize" },
    ]);
    expect(new Set(grips.map((grip) => grip.direction)).size).toBe(4);
    for (const grip of grips)
      expect(circularDetailRadiusFromPointer(120, 80, grip.x, grip.y)).toBe(30);
  });

  it("resizes from any side with a fixed center and a single radial distance", () => {
    for (const [px, py] of [
      [170, 80], [70, 80], [120, 30], [120, 130],
    ] as const) {
      const radius = circularDetailRadiusFromPointer(120, 80, px, py);
      expect(radius).toBe(50);
      expect(circularDetailRadiusGrips(120, 80, radius)).toHaveLength(4);
    }
  });

  it("rejects nonfinite or nonpositive circle dimensions without creating grips", () => {
    expect(circularDetailRadiusGrips(1, 2, 0)).toEqual([]);
    expect(circularDetailRadiusGrips(1, 2, Number.NaN)).toEqual([]);
    expect(circularDetailRadiusGrips(Number.POSITIVE_INFINITY, 2, 4)).toEqual([]);
  });

});
