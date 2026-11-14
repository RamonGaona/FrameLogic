import { describe, expect, it } from "vitest";
import { planAutomaticSheetLayout, planSelectedSheetLayout, selectAssemblyScaleDenominator, type ProjectedSheetView } from "./AutoSheetLayoutPlanner";
const source: ProjectedSheetView[] = [
  { id: "f", code: "FRONT", width: 3000, height: 500 },
  { id: "t", code: "TOP", width: 3000, height: 700 },
  { id: "r", code: "RIGHT", width: 700, height: 500 },
  { id: "i", code: "ISO", width: 3500, height: 1250 },
];
describe("automatic sheet arrangement", () => {
  it.each(["ISO_E", "ISO_A"] as const)("%s keeps all projections on paper above the title block", (standard) => {
    const layout = planAutomaticSheetLayout(source, standard);
    expect(layout).toHaveLength(4);
    expect(new Set(layout.map((v) => v.id)).size).toBe(4);
    for (const v of layout) {
      expect(v.x).toBeGreaterThan(0);
      expect(v.y).toBeGreaterThan(0);
      expect(v.x + v.width).toBeLessThan(1070);
      expect(v.y + v.height).toBeLessThanOrEqual(614);
      expect(v.width).toBeGreaterThanOrEqual(80);
      expect(v.height).toBeGreaterThanOrEqual(80);
    }
    expect(new Set(layout.map((v) => v.modelScale)).size).toBe(1);
    for (const [i, a] of layout.entries()) for (const b of layout.slice(i + 1)) {
      const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
      const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
      expect(overlapX * overlapY).toBe(0);
    }
  });
  it("first-angle places right on left and plan below front", () => {
    const v = Object.fromEntries(planAutomaticSheetLayout(source, "ISO_E").map((x) => [x.code, x]));
    expect(v.RIGHT.x).toBeLessThan(v.FRONT.x);
    expect(v.TOP.y).toBeGreaterThan(v.FRONT.y);
  });
  it("third-angle places right to right and plan above front", () => {
    const v = Object.fromEntries(planAutomaticSheetLayout(source, "ISO_A").map((x) => [x.code, x]));
    expect(v.RIGHT.x).toBeGreaterThan(v.FRONT.x);
    expect(v.TOP.y).toBeLessThan(v.FRONT.y);
  });
  it("rejects partial/invalid views instead of generating a false drawing", () => {
    expect(planAutomaticSheetLayout(source.slice(0, 3), "ISO_E")).toEqual([]);
    expect(planAutomaticSheetLayout([{ ...source[0], width: NaN }, ...source.slice(1)], "ISO_A")).toEqual([]);
  });
});

describe("selected assembly view sheet layout", () => {
  it.each(["ISO_E", "ISO_A"] as const)("fits two and three selected views with shared scale (%s)", (standard) => {
    for (const count of [2, 3]) {
      const subset = source.slice(0, count);
      const result = planSelectedSheetLayout(subset, standard);
      expect(result).toHaveLength(count);
      expect(new Set(result.map((view) => view.modelScale)).size).toBe(1);
      for (const [i, a] of result.entries()) {
        expect(a.x).toBeGreaterThanOrEqual(52);
        expect(a.y).toBeGreaterThanOrEqual(46);
        expect(a.x + a.width).toBeLessThanOrEqual(1068);
        expect(a.y + a.height).toBeLessThanOrEqual(614);
        for (const b of result.slice(i + 1)) {
          const horizontal = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
          const vertical = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
          expect(horizontal * vertical).toBe(0);
        }
      }
    }
  });
  it("keeps the projection convention for the selected front/top views", () => {
    for (const standard of ["ISO_E", "ISO_A"] as const) {
      const planned = planSelectedSheetLayout(source.slice(0, 2), standard);
      const byCode = Object.fromEntries(planned.map((view) => [view.code, view]));
      expect(standard === "ISO_E" ? byCode.FRONT.y < byCode.TOP.y : byCode.FRONT.y > byCode.TOP.y).toBe(true);
    }
  });
  it("selects a standard denominator, or reports it cannot fit", () => {
    expect(selectAssemblyScaleDenominator(0.15)).toBe(20);
    expect(selectAssemblyScaleDenominator(150)).toBe(1);
    expect(selectAssemblyScaleDenominator(Number.NaN)).toBeNull();
    expect(selectAssemblyScaleDenominator(0.000001)).toBeNull();
    expect(planSelectedSheetLayout([source[0]!, source[0]!], "ISO_E")).toEqual([]);
  });
});
