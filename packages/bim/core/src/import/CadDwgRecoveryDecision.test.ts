import { describe, expect, it } from "vitest";
import { CadDocument, ACadVersion, DwgWriter, Line, XYZ, BlockRecord, Insert } from "@node-projects/acad-ts";
import { convertWithAlternateCadReader } from "./CadAlternateDwgReader";
import { parseCadDxf } from "./CadDxfGeometryParser";
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
  it("warns about differing INSUNITS but permits geometrically compatible recovery", () => {
    const result = decideDwgImport(parsed(10), parsed(15, 2, 6));
    expect(result.source).toBe("alternativo");
    expect(result.explanation).toContain("INSUNITS distintos");
  });
  it("does not trade structural geometry for labels", () => {
    expect(decideDwgImport(parsed(50, 1), parsed(15, 10)).source).toBe("principal");
  });
  it("does not prefer a truncated drawing", () => {
    expect(decideDwgImport(parsed(10), { ...parsed(15), truncated: true }).source).toBe("principal");
  });
});


describe("real binary DWG recovery reader", () => {
  it("reads DWG bytes and expands a nested line block into FrameLogic geometry", async () => {
    const doc = new CadDocument(ACadVersion.AC1032);
    const tube = new BlockRecord("TUBE_STAGE1");
    tube.entities.add(new Line(new XYZ(0, 0, 0), new XYZ(3000, 0, 0)));
    doc.blockRecords!.add(tube);
    const insert = new Insert(tube);
    insert.insertPoint = new XYZ(120, 340, 0);
    doc.entities!.add(insert);

    // Real binary DWG, not a text mock: exercise CAD writer, alternate reader,
    // DXF serialization and FrameLogic's recursive INSERT geometry parser.
    const raw = DwgWriter.writeToBuffer(doc);
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const dxf = await convertWithAlternateCadReader(buffer);
    const parsed = parseCadDxf(dxf, {
      omitOptionalGeometry: true, recoverDimensionGraphics: true,
    });
    expect(parsed.segments.length).toBeGreaterThan(0);
    expect(parsed.expandedBlocks).toBeGreaterThan(0);
    expect(parsed.segments.some((s) =>
      Math.abs(s.end.x - s.start.x) >= 2999)).toBe(true);
  });
});
