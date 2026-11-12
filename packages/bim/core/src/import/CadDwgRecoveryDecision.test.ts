import { describe, expect, it } from "vitest";
import { decideDwgImport } from "./CadDwgRecoveryDecision";
import type { ParsedCadReference } from "./CadDxfGeometryParser";
const segment = (n: number, scale = 1) => ({
  layer: "0", color: "#fff",
  start: { x: n * scale, y: 0, z: 0 },
  end: { x: (n + 1) * scale, y: 0, z: 0 },
});
function parsed(count: number, texts = 0, units = 4, scale = 1): ParsedCadReference {
  return {
    segments: Array.from({ length: count }, (_, n) => segment(n, scale)),
    points: [],
    texts: Array.from({ length: texts }, (_, n) => ({
      layer: "0", color: "#fff", kind: "TEXT" as const, text: "P6 " + n,
      position: { x: n, y: 0, z: 0 },
      axisX: { x: 1, y: 0, z: 0 }, axisY: { x: 0, y: 1, z: 0 },
      horizontalAlign: "left" as const, verticalAlign: "baseline" as const,
    })),
    insUnits: units, skippedEntities: 0, skippedTypes: new Map(),
    expandedBlocks: 1, truncated: false, sourceLayers: new Map(),
    unresolvedExternalReferences: [], unresolvedBlocks: [],
    incompleteRootEntities: 0, recoveredDimensionSegments: 0,
  };
}
describe("alternate DWG reader comparison", () => {
  it("falls back when the primary reader fails", () => {
    expect(decideDwgImport(null, parsed(4)).source).toBe("alternativo");
  });
  it("retains the original when equivalent", () => {
    expect(decideDwgImport(parsed(5, 1), parsed(5, 1)).source).toBe("principal");
  });
  it("recovers missing graphical components", () => {
    expect(decideDwgImport(parsed(10, 1), parsed(15, 1)).source).toBe("alternativo");
  });
  it("recovers tube labels without replacing structural pieces", () => {
    expect(decideDwgImport(parsed(10, 1), parsed(10, 3)).source).toBe("alternativo");
  });
  it("rejects x1000 scale mismatch", () => {
    const decision = decideDwgImport(parsed(10), parsed(15, 2, 4, 1000));
    expect(decision.source).toBe("principal");
    expect(decision.explanation).toContain("Escala");
  });
  it("rejects differing INSUNITS", () => {
    expect(decideDwgImport(parsed(10), parsed(15, 2, 6)).source).toBe("principal");
  });
  it("does not trade structural geometry for labels", () => {
    expect(decideDwgImport(parsed(50, 1), parsed(15, 10)).source).toBe("principal");
  });
  it("does not prefer a truncated drawing", () => {
    expect(decideDwgImport(parsed(10), { ...parsed(15), truncated: true }).source).toBe("principal");
  });
});
