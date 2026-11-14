import { describe, expect, it } from "vitest";
import { snapDimensionAnchorToView } from "./DrawingDimensionAnchorSnap";
const frame = { originX: 50, originY: 20, drawnHeight: 300, scale: 0.5 };
const geometry = [
  { x1: 0, y1: 0, x2: 1000, y2: 0 },
  { x1: 0, y1: 200, x2: 1000, y2: 200 },
];
describe("STEP dimension anchor reattachment", () => {
  it("picks the nearest projected vertex in local millimetres", () => {
    const v = snapDimensionAnchorToView({ x: 549, y: 321 }, geometry, frame);
    expect(v).toEqual({ x: 1000, y: 0 });
    const other = snapDimensionAnchorToView({ x: 51, y: 218 }, geometry, frame);
    expect(other).toEqual({ x: 0, y: 200 });
  });
  it("does not invent a measurement reference outside snap tolerance", () => {
    expect(snapDimensionAnchorToView({ x: 200, y: 200 }, geometry, frame)).toBeNull();
  });
  it("does not change the source segment data", () => {
    const saved = JSON.stringify(geometry);
    snapDimensionAnchorToView({ x: 50, y: 320 }, geometry, frame);
    expect(JSON.stringify(geometry)).toBe(saved);
  });
});
