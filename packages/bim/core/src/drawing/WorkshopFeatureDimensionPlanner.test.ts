import { describe, expect, it } from "vitest";
import type { AutomaticDimensionPoint } from "./AutoDrawingPlanner";
import { planWorkshopFeatureDimensions } from "./WorkshopFeatureDimensionPlanner";

const vertex = (id: string, x: number, y: number): AutomaticDimensionPoint =>
  ({ instanceId: "plate", topologyId: id, kind: "VERTEX", x, y });
const circle = (id: string, x: number, y: number, radius = 0.05): AutomaticDimensionPoint =>
  ({ instanceId: "plate", topologyId: id, kind: "CIRCLE", x, y, radius });

describe("workshop dimension planning from STEP features", () => {
  const base = [vertex("v0", 0, 0), vertex("v1", 4, 0), vertex("v2", 4, 0.8),
    vertex("v3", 0, 0.8)];
  it("prioritizes true overall X/Y spans and groups face-on repeated circles", () => {
    const features = [...base,
      circle("c1", 0.5, 0.25), circle("c1-back", 0.5, 0.25),
      circle("c2", 1.5, 0.25), circle("c3", 2.5, 0.25),
      circle("c4", 3.5, 0.25)];
    const result = planWorkshopFeatureDimensions(features);
    expect(result[0]?.mode).toBe("HORIZONTAL");
    expect(result[0]?.a.topologyId).toBe("v0");
    expect(result[0]?.b.topologyId).toBe("v1");
    expect(result[1]?.mode).toBe("VERTICAL");
    expect(result[2]?.mode).toBe("DIAMETER");
    expect(result[2]?.quantity).toBe(4);
    // Center-to-center pitch = 1000 mm, with real B-Rep anchors.
    expect(result.some((d) => d.mode === "HORIZONTAL"
      && d.a.kind === "CIRCLE" && d.b.kind === "CIRCLE"
      && Math.abs(d.b.x - d.a.x - 1) < 1e-8)).toBe(true);
    expect(result.some((d) => d.mode === "HORIZONTAL"
      && d.b.kind === "CIRCLE" && d.a.topologyId === "v0")).toBe(true);
  });
  it("does not classify skew circles as a common row or column", () => {
    const result = planWorkshopFeatureDimensions([...base,
      circle("a", 0.5, 0.15), circle("b", 1.5, 0.38)]);
    expect(result.some((d) => d.a.kind === "CIRCLE"
      && d.b.kind === "CIRCLE" && d.a.topologyId !== d.b.topologyId)).toBe(false);
  });
  it("rejects nonfinite points and features without exact vertices", () => {
    expect(planWorkshopFeatureDimensions([circle("a", 0, 0)])).toEqual([]);
    expect(planWorkshopFeatureDimensions([vertex("a", NaN, 0), vertex("b", 3, 1)])).toEqual([]);
  });
  it("caps annotation density and deduplicates equal projected stations", () => {
    const many = [...base, ...Array.from({ length: 100 }, (_, i) =>
      circle("c" + i, 0.2 + i * 0.035, 0.25, 0.04))];
    const result = planWorkshopFeatureDimensions(many);
    expect(result.length).toBeLessThanOrEqual(32);
    expect(planWorkshopFeatureDimensions(many, 3)).toHaveLength(3);
    expect(planWorkshopFeatureDimensions(many, 0)).toEqual([]);
  });
});