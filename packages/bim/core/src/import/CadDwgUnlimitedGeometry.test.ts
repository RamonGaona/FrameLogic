import { describe, it, expect } from "vitest";
import { parseCadDxf, MAX_RENDERED_SEGMENTS } from "./CadDxfGeometryParser";

const dxf = (data: readonly (number | string)[]): string =>
  data.map(String).join("\n") + "\n";

describe("DWG import without the old 240,000 segment truncation", () => {
  it("expands every nested array plus a later tube after 245,760 segments", () => {
    // 15 * (128 × 128) = 245,760 actual structural segments. Previously
    // 5,760+ segments were discarded and the trailing beam was incomplete.
    const repeated = Array.from({ length: 15 }, (_, index) => [
      0, "INSERT", 2, "TUBE",
      10, index * 100000, 20, 0,
      70, 128, 71, 128,
      44, 4, 45, 4,
    ]).flat();
    const file = dxf([
      0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, 4, 0, "ENDSEC",
      0, "SECTION", 2, "BLOCKS",
      0, "BLOCK", 2, "TUBE", 10, 0, 20, 0,
      0, "LINE", 10, 0, 20, 0, 11, 3000, 21, 0,
      0, "ENDBLK", 0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      ...repeated,
      0, "LINE", 10, 1999000, 20, 20, 11, 2002000, 21, 20,
      0, "TEXT", 1, "P6 3000", 10, 1999200, 20, 50, 40, 40,
      0, "ENDSEC", 0, "EOF",
    ]);
    const result = parseCadDxf(file, {
      unlimitedSegments: true,
      omitOptionalGeometry: true,
      recoverDimensionGraphics: true,
    });
    expect(result.segments.length).toBe(MAX_RENDERED_SEGMENTS + 5761);
    expect(result.truncated).toBe(false);
    expect(result.incompleteRootEntities).toBe(0);
    expect(result.skippedTypes.has("LIMITE_SEGMENTOS")).toBe(false);
    expect(result.segments.some((line) =>
      line.start.x === 1_999_000 && line.end.x === 2_002_000,
    )).toBe(true);
    expect(result.texts.some((label) => label.text === "P6 3000")).toBe(true);
    expect(result.insUnits).toBe(4);
  }, 120_000);

  it("keeps the bounded 240k behavior for DXF callers unless DWG opts in", () => {
    const file = dxf([
      0, "SECTION", 2, "ENTITIES",
      ...Array.from({ length: 25 }, (_, i) => [
        0, "LINE", 10, i, 20, 0, 11, i + 1, 21, 0,
      ]).flat(),
      0, "ENDSEC", 0, "EOF",
    ]);
    const bounded = parseCadDxf(file, { maxSegments: 16 });
    expect(bounded.truncated).toBe(true);
    expect(bounded.segments).toHaveLength(16);
    const unlimited = parseCadDxf(file, { unlimitedSegments: true, maxSegments: 16 });
    expect(unlimited.truncated).toBe(false);
    expect(unlimited.segments).toHaveLength(25);
  });
});
