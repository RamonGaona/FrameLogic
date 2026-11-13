import { describe, it, expect } from "vitest";
import type { AutomaticDimensionPoint } from "./AutoDrawingPlanner";
import { planExactAssemblyDimensions } from "./AssemblyProjectionEngine";

const v = (id: string, x: number, y: number): AutomaticDimensionPoint =>
  ({ instanceId: "p1", topologyId: id, kind: "VERTEX", x, y });
const c = (id: string, x: number, y: number, radius: number): AutomaticDimensionPoint =>
  ({ instanceId: "p1", topologyId: id, kind: "CIRCLE", x, y, radius });

describe("assembly workshop dimensions", () => {
  it("uses STEP topology endpoints and centers, never synthetic mesh measurements", () => {
    const planned = planExactAssemblyDimensions([
      v("v0", 0, 0), v("v1", 3, 0), v("v2", 3, 0.5),
      c("hole:1", 0.6, 0.2, 0.04),
    ]);
    expect(planned.some((d) => d.mode === "HORIZONTAL"
      && d.a.topologyId === "v0" && d.b.topologyId === "v1")).toBe(true);
    expect(planned.some((d) => d.mode === "VERTICAL")).toBe(true);
    expect(planned.some((d) => d.mode === "DIAMETER"
      && d.a.topologyId === "hole:1"
      && d.a.radius === 0.04)).toBe(true);
  });
  it("produces no dimension when B-Rep vertices are absent", () => {
    expect(planExactAssemblyDimensions([])).toEqual([]);
    expect(planExactAssemblyDimensions([c("hole", 0, 0, 0.1)])).toEqual([]);
  });
  it("deduplicates coincident circles and respects annotation budget", () => {
    const features = [v("a", 0, 0), v("b", 4, 2),
      c("c0", 1, 1, 0.125), c("c1", 1, 1, 0.125)];
    const planned = planExactAssemblyDimensions(features);
    expect(planned.filter((d) => d.mode === "DIAMETER")).toHaveLength(1);
    expect(planExactAssemblyDimensions(features, 2)).toHaveLength(2);
    expect(planExactAssemblyDimensions(features, -1)).toEqual([]);
  });
  it("caps dense feature output and preserves real topology IDs", () => {
    const features = Array.from({ length: 100 }, (_, i) =>
      v("v" + i, i * 0.1, (i % 4) * 0.05));
    const planned = planExactAssemblyDimensions(features, 10000);
    expect(planned.length).toBeLessThanOrEqual(32);
    expect(planned.every((d) =>
      d.a.topologyId.startsWith("v") && d.b.topologyId.startsWith("v"))).toBe(true);
  });
});
