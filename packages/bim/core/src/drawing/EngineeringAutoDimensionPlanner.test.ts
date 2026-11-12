import { describe, expect, it } from "vitest";
import { planEngineeringAutomaticDimensions, type EngineeringAutodimOptions } from "./EngineeringAutoDimensionPlanner";
import type { AutomaticDimensionPoint } from "./AutoDrawingPlanner";
const v = (instanceId: string, id: string, x: number, y: number): AutomaticDimensionPoint =>
  ({ instanceId, topologyId: id, x, y, kind: "VERTEX" });
const c = (instanceId: string, id: string, x: number, y: number, radius: number): AutomaticDimensionPoint =>
  ({ instanceId, topologyId: id, x, y, radius, kind: "CIRCLE" });
const options: EngineeringAutodimOptions = { scope: "ASSEMBLY", arrangement: "BASELINE", detail: "ALL" };
const example = [
  v("pieceA", "a", 0, 0), v("pieceA", "b", 100, 50),
  v("pieceA", "step", 35, 25), c("pieceA", "h1", 20, 20, 5),
  c("pieceA", "h2", 70, 20, 5), c("pieceA", "same", 20, 20, 5),
];
describe("engineering automatic dimensions", () => {
  it("creates baseline stations from exact vertices and centers", () => {
    const result = planEngineeringAutomaticDimensions(example, options);
    expect(result.filter((d) => d.mode === "HORIZONTAL").length).toBeGreaterThan(1);
    expect(result.filter((d) => d.mode === "VERTICAL").length).toBeGreaterThan(1);
    expect(result.every((d) => d.a.topologyId && d.b.topologyId)).toBeTruthy();
  });
  it("uses chain spans plus the overall dimension", () => {
    const result = planEngineeringAutomaticDimensions(example, { ...options, arrangement: "CHAIN" });
    const horizontal = result.filter((d) => d.mode === "HORIZONTAL");
    expect(horizontal.length).toBeGreaterThan(2);
    expect(horizontal.at(-1)?.a.x).toBe(0);
    expect(horizontal.at(-1)?.b.x).toBe(100);
    expect(horizontal.some((d) => d.a.x === 35 && d.b.x === 70)).toBe(true);
  });
  it("groups equal-diameter holes by distinct centers, not duplicated B-Rep edges", () => {
    const result = planEngineeringAutomaticDimensions(example, options);
    const diameters = result.filter((d) => d.mode === "DIAMETER");
    expect(diameters).toHaveLength(1);
    expect(diameters[0]?.quantity).toBe(2);
    expect(diameters[0]?.a.radius).toBe(5);
  });
  it("supports individual pieces instead of dimensioning only full assembly bounds", () => {
    const two = [...example, v("pieceB", "c", 200, 0), v("pieceB", "d", 250, 50)];
    const result = planEngineeringAutomaticDimensions(two, { ...options, scope: "PIECES", detail: "OVERALL" });
    expect(result).toHaveLength(4);
    expect(result.some((d) => d.a.instanceId === "pieceB" && d.b.instanceId === "pieceB")).toBe(true);
    expect(result.every((d) => d.a.instanceId === d.b.instanceId)).toBe(true);
  });
  it("rejects no/invalid B-Rep vertex geometry", () => {
    expect(planEngineeringAutomaticDimensions([c("i", "h", 4, 5, 1)], options)).toEqual([]);
    expect(planEngineeringAutomaticDimensions([v("i", "a", NaN, 0), v("i", "b", 1, 1)], options)).toEqual([]);
  });
  it("limits huge assembly dimension count", () => {
    const many = Array.from({ length: 300 }, (_, n) => v("i", "v" + n, n, n * 2));
    expect(planEngineeringAutomaticDimensions(many, options).length).toBeLessThanOrEqual(180);
  });
});
