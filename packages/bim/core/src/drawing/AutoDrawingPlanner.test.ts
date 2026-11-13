import { describe, expect, it } from "vitest";
import { planAutomaticDimensions, planAutomaticViews, planSmartAssemblyViews, type AutomaticDimensionPoint } from "./AutoDrawingPlanner";

describe("automatic technical views", () => {
  it("generates four nondegenerate sections containing all eight world bounds corners", () => {
    const min = { x: -2, y: 3, z: -1 };
    const max = { x: 5, y: 9, z: 4 };
    const views = planAutomaticViews({ min, max });
    expect(views.map((v) => v.code)).toEqual(["FRONT", "TOP", "RIGHT", "ISO"]);
    for (const view of views) {
      expect(view.width).toBeGreaterThan(0);
      expect(view.height).toBeGreaterThan(0);
      expect(view.depth).toBeGreaterThan(0);
      const x = view.xAxis, y = view.yAxis, z = view.normal;
      const cross = {
        x: x.y * y.z - x.z * y.y,
        y: x.z * y.x - x.x * y.z,
        z: x.x * y.y - x.y * y.x,
      };
      expect(cross.x).toBeCloseTo(z.x, 8);
      expect(cross.y).toBeCloseTo(z.y, 8);
      expect(cross.z).toBeCloseTo(z.z, 8);
      for (const px of [min.x, max.x]) for (const py of [min.y, max.y])
        for (const pz of [min.z, max.z]) {
          const d = { x: px - view.origin.x, y: py - view.origin.y, z: pz - view.origin.z };
          const coord = (a: typeof x) => d.x * a.x + d.y * a.y + d.z * a.z;
          expect(coord(x)).toBeGreaterThanOrEqual(-1e-9);
          expect(coord(x)).toBeLessThanOrEqual(view.width + 1e-9);
          expect(coord(y)).toBeGreaterThanOrEqual(-1e-9);
          expect(coord(y)).toBeLessThanOrEqual(view.height + 1e-9);
          expect(coord(z)).toBeGreaterThanOrEqual(-1e-9);
          expect(coord(z)).toBeLessThanOrEqual(view.depth + 1e-9);
        }
    }
  });
  it("rejects missing and non-finite geometry without creating views", () => {
    expect(planAutomaticViews({ min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } })).toEqual([]);
    expect(planAutomaticViews({ min: { x: NaN, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } })).toEqual([]);
  });
});

const vertex = (topologyId: string, x: number, y: number): AutomaticDimensionPoint => ({
  instanceId: "i1", topologyId, x, y, kind: "VERTEX",
});
const circle = (topologyId: string, x: number, y: number, radius: number): AutomaticDimensionPoint => ({
  instanceId: "i1", topologyId, x, y, kind: "CIRCLE", radius,
});

describe("automatic dimensions from exact references", () => {
  it("generates overall X/Y, diameter and coordinates for a hole", () => {
    const features = [vertex("a", 0, 0), vertex("b", 4, 3), circle("c", 1, 1.5, 0.25)];
    const dimensions = planAutomaticDimensions(features);
    expect(dimensions.map((d) => d.mode)).toEqual(["HORIZONTAL", "VERTICAL", "DIAMETER", "HORIZONTAL", "VERTICAL"]);
    expect(dimensions[2]?.a.topologyId).toBe("c");
    expect(dimensions[2]?.a.radius).toBeCloseTo(0.25);
  });
  it("does not create duplicates for repeated circles and is safe for blank views", () => {
    expect(planAutomaticDimensions([])).toEqual([]);
    const dims = planAutomaticDimensions([vertex("a", 0, 0), vertex("b", 2, 2), circle("c1", 1, 1, 0.2), circle("c2", 1, 1, 0.2)]);
    expect(dims.filter((d) => d.mode === "DIAMETER")).toHaveLength(1);
  });
  it("only derives overall extents from exact vertices, not circle centers", () => {
    const dims = planAutomaticDimensions([vertex("a", 0, 0), vertex("b", 2, 1), circle("c", 99, 99, 1)]);
    expect(dims.find((d) => d.mode === "HORIZONTAL")?.b.x).toBe(2);
  });
});

describe("intelligent assembly view selection", () => {
  it("uses the long axis and an independent end view for a tubular assembly", () => {
    const views = planSmartAssemblyViews({
      min: { x: 0, y: -0.2, z: -0.4 },
      max: { x: 5, y: 0.2, z: 0.4 },
    }, 3);
    expect(views.map((item) => item.code)).toEqual(["FRONT", "RIGHT", "ISO"]);
  });
  it("reduces a single flat plate to its face and thickness views", () => {
    const codes = planSmartAssemblyViews({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 2, y: 2, z: 0.02 },
    }).map((view) => view.code);
    expect(codes).toEqual(["TOP", "RIGHT"]);
  });
  it("retains three orthographic views for a complex non-slender assembly", () => {
    const codes = planSmartAssemblyViews({
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    }, 8).map((view) => view.code);
    expect(codes).toEqual(["FRONT", "RIGHT", "TOP", "ISO"]);
  });
  it("rejects invalid, empty assemblies", () => {
    expect(planSmartAssemblyViews({
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    }, 2)).toEqual([]);
  });
});
