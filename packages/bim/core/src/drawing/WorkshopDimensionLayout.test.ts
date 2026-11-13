import { describe, expect, it } from "vitest";
import type { EngineeringDimensionInstruction } from "./EngineeringAutoDimensionPlanner";
import type { AutomaticDimensionPoint } from "./AutoDrawingPlanner";
import {
  layoutWorkshopDimensions, workshopDimensionKey, workshopMillimetres,
} from "./WorkshopDimensionLayout";

const p = (id: string, x: number, y: number): AutomaticDimensionPoint => ({
  instanceId: "i1", topologyId: id, kind: "VERTEX", x, y,
});
const c = (id: string, x: number, y: number, radius: number): AutomaticDimensionPoint => ({
  instanceId: "i1", topologyId: id, kind: "CIRCLE", x, y, radius,
});
const frame = {
  x: 100, y: 100, width: 480, height: 300,
  originX: 130, originY: 175, drawnWidth: 320, drawnHeight: 175,
  scale: 100,
};
const dimensions: EngineeringDimensionInstruction[] = [
  { mode: "HORIZONTAL", a: p("a", 0, 0), b: p("b", 3, 0), offsetX: 0, offsetY: 0 },
  { mode: "VERTICAL", a: p("a", 0, 0), b: p("c", 0, 1.5), offsetX: 0, offsetY: 0 },
  { mode: "DIAMETER", a: c("hole1", 1, 0.75, 0.06), b: c("hole1", 1, 0.75, 0.06),
    offsetX: 0, offsetY: 0, quantity: 4 },
];
describe("workshop dimension paper placement", () => {
  it("places horizontal, vertical, and diameter texts in separate paper gutters", () => {
    const result = layoutWorkshopDimensions(dimensions, frame);
    expect(result.omitted).toBe(0);
    expect(result.placed.map((p) => p.mode)).toEqual(["HORIZONTAL", "VERTICAL", "DIAMETER"]);
    expect(result.placed[0]!.label).toBe("3000");
    expect(result.placed[2]!.label).toBe("4× Ø120");
    expect(result.placed[0]!.labelY).toBeLessThan(frame.originY);
    expect(result.placed[1]!.labelX).toBeGreaterThan(frame.originX + frame.drawnWidth);
    expect(result.placed[2]!.labelY).toBeGreaterThan(frame.originY + frame.drawnHeight);
    expect(result.placed.every((p) => p.lines.length >= 1)).toBe(true);
  });
  it("keeps manually moved labels and hides explicitly disabled ones", () => {
    const base = layoutWorkshopDimensions(dimensions, frame);
    const key = workshopDimensionKey(dimensions[0]!);
    const other = workshopDimensionKey(dimensions[1]!);
    const changed = layoutWorkshopDimensions(dimensions, frame, {
      [key]: { dx: 11, dy: 5 },
      [other]: { hidden: true },
    });
    expect(changed.placed.find((p) => p.key === key)!.labelX).toBeCloseTo(
      base.placed.find((p) => p.key === key)!.labelX + 11,
    );
    expect(changed.placed.some((p) => p.key === other)).toBe(false);
    expect(changed.placed.find((p) => p.key === key)!.lines).toHaveLength(4);
  });
  it("omits crowded labels rather than overlapping text in the same gutter", () => {
    const many: EngineeringDimensionInstruction[] = Array.from({ length: 9 }, (_, i) => ({
      mode: "HORIZONTAL" as const,
      a: p("a"+i, 0, 0),
      b: p("b"+i, 3, 0), offsetX: 0, offsetY: 0,
    }));
    const result = layoutWorkshopDimensions(many, frame);
    expect(result.placed.length).toBeGreaterThan(0);
    expect(result.omitted).toBeGreaterThan(0);
    expect(new Set(result.placed.map((p) => p.labelY)).size).toBe(result.placed.length);
    expect(layoutWorkshopDimensions(many, { ...frame, width: -1 }).placed).toEqual([]);
  });
  it("retains readable metric precision", () => {
    expect(workshopMillimetres(0.00375)).toBe("3.75");
    expect(workshopMillimetres(-1.23456)).toBe("1234.6");
  });
});