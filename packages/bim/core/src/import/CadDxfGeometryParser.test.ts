import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import { CadLineSceneController } from "../design/CadLineSceneController";
import { parseCadDxf, MAX_RENDERED_SEGMENTS } from "./CadDxfGeometryParser";
import { insUnitsToMillimeters } from "./CadReferenceImportController";

function dxf(...records: Array<string | number>): string {
  if (records.length % 2 !== 0) throw new Error("Invalid DXF fixture");
  const result: string[] = [];
  for (let i = 0; i < records.length; i += 2) {
    result.push(String(records[i]), String(records[i + 1]));
  }
  return result.join("\n") + "\n";
}
const HEADER = [
  0, "SECTION", 2, "HEADER", 9, "$INSUNITS", 70, 4, 0, "ENDSEC",
] as const;
const LAYERS = [
  0, "SECTION", 2, "TABLES",
  0, "TABLE", 2, "LAYER", 70, 3,
  0, "LAYER", 2, "GREEN", 70, 0, 62, 3,
  0, "LAYER", 2, "YELLOW", 70, 0, 62, 2,
  0, "LAYER", 2, "HIDDEN", 70, 1, 62, -1,
  0, "ENDTAB", 0, "ENDSEC",
] as const;

const BLOCKS = [
  0, "SECTION", 2, "BLOCKS",
  0, "BLOCK", 2, "INNER", 10, 10, 20, 0, 30, 0,
  // "0" on BYBLOCK = inherit the INSERT effective colour.
  0, "LINE", 8, "0", 62, 0, 10, 10, 20, 0, 11, 20, 21, 0,
  // Named source layer on BYLAYER = yellow, not inherited green.
  0, "LINE", 8, "YELLOW", 62, 256, 10, 10, 20, 5, 11, 20, 21, 5,
  0, "ENDBLK",
  0, "BLOCK", 2, "OUTER", 10, 0, 20, 0,
  0, "INSERT", 2, "INNER", 8, "0", 10, 0, 20, 0,
  0, "ENDBLK",
  // AutoCAD DIMENSION geometry is an anonymous reference block.
  0, "BLOCK", 2, "*D12", 10, 0, 20, 0,
  0, "LINE", 8, "0", 10, 0, 20, 0, 11, 30, 21, 0,
  0, "ENDBLK",
  0, "ENDSEC",
] as const;
const INSERTS = [
  0, "SECTION", 2, "ENTITIES",
  // The OUTER block should resolve its nested INNER's base point exactly,
  // apply nonuniform scales, then rotate 90 deg about insertion point.
  0, "INSERT", 2, "OUTER", 8, "GREEN",
  10, 100, 20, 200, 30, 0, 41, 2, 42, 3, 43, 1, 50, 90,
  0, "DIMENSION", 2, "*D12", 8, "YELLOW",
  10, 500, 20, 700, 30, 0, 12, 500, 22, 700, 32, 0,
  0, "LINE", 8, "GREEN", 420, 16711680,
  10, 0, 20, 0, 11, 0, 21, 10,
  0, "ENDSEC",
  0, "EOF",
] as const;

describe("DWG/DXF nested INSERT and original AutoCAD colour import", () => {
  it("expands nested blocks with base point, scale and rotation, preserves ByLayer/ByBlock/truecolor", () => {
    const parsed = parseCadDxf(dxf(...HEADER, ...LAYERS, ...BLOCKS, ...INSERTS));
    expect(parsed.insUnits).toBe(4);
    expect(parsed.expandedBlocks).toBe(3); // OUTER, INNER, anonymous DIMENSION block
    expect(parsed.skippedEntities).toBe(0);
    expect(parsed.segments).toHaveLength(4);
    const byblock = parsed.segments[0]!;
    expect(byblock.layer).toBe("GREEN");
    expect(byblock.color).toBe("#00ff00");
    expect(byblock.start.x).toBeCloseTo(100, 6);
    expect(byblock.start.y).toBeCloseTo(200, 6);
    expect(byblock.end.x).toBeCloseTo(100, 6);
    expect(byblock.end.y).toBeCloseTo(220, 6);
    const bylayer = parsed.segments[1]!;
    expect(bylayer.layer).toBe("YELLOW");
    expect(bylayer.color).toBe("#ffff00");
    expect(bylayer.start.x).toBeCloseTo(85, 6);
    expect(bylayer.start.y).toBeCloseTo(200, 6);
    const dim = parsed.segments[2]!;
    expect(dim.start).toEqual({ x: 500, y: 700, z: 0 });
    expect(dim.end).toEqual({ x: 530, y: 700, z: 0 });
    const truecolor = parsed.segments[3]!;
    expect(truecolor.color).toBe("#ff0000");
  });

  it("renders nested CAD segment colours from layer, instead of forcing white", () => {
    const parsed = parseCadDxf(dxf(...HEADER, ...LAYERS, ...BLOCKS, ...INSERTS));
    const design = new DesignModel();
    const layerByColor = new Map<string, string>();
    for (const segment of parsed.segments) {
      let id = layerByColor.get(segment.color);
      if (!id) {
        id = design.layers.create({ name: `Test ${segment.color}`,
          visible: true, locked: false, color: segment.color }).id;
        layerByColor.set(segment.color, id);
      }
      design.registerCadLine({ layerId: id, start: segment.start, end: segment.end });
    }
    const scene = new THREE.Scene();
    const render = new CadLineSceneController(scene, design);
    render.sync();
    const materials = render.getLineObjects().map(
      obj => (obj.material as THREE.LineBasicMaterial).color.getHexString(),
    );
    expect(materials).toEqual(["00ff00", "ffff00", "ffff00", "ff0000"]);
    render.dispose();
  });

  it("expands MINSERT arrays with row and column spacing", () => {
    const source = dxf(...HEADER, ...LAYERS, ...BLOCKS,
      0, "SECTION", 2, "ENTITIES",
      0, "INSERT", 2, "*D12", 8, "YELLOW",
      10, 50, 20, 100, 70, 2, 71, 2, 44, 100, 45, 200,
      0, "ENDSEC", 0, "EOF");
    const parsed = parseCadDxf(source);
    expect(parsed.segments).toHaveLength(4);
    expect(parsed.segments.map(s => [s.start.x, s.start.y])).toEqual([
      [50, 100], [150, 100], [50, 300], [150, 300],
    ]);
  });

  it("does not infinitely recurse on circular block references", () => {
    const source = dxf(
      0, "SECTION", 2, "BLOCKS",
      0, "BLOCK", 2, "A", 10, 0, 20, 0,
      0, "LINE", 8, "0", 10, 0, 20, 0, 11, 100, 21, 0,
      0, "INSERT", 2, "A", 10, 200, 20, 0,
      0, "ENDBLK", 0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      0, "INSERT", 2, "A", 10, 0, 20, 0,
      0, "ENDSEC", 0, "EOF",
    );
    const parsed = parseCadDxf(source);
    expect(parsed.segments).toHaveLength(1);
    expect(parsed.skippedTypes.get("INSERT")).toBe(1);
  });

  it("supports LWPOLYLINE bulge arcs (instead of discarding all curves) and hatch boundary", () => {
    const source = dxf(
      0, "SECTION", 2, "ENTITIES",
      0, "LWPOLYLINE", 8, "0", 70, 0,
      10, 0, 20, 0, 42, 1,
      10, 100, 20, 0,
      0, "HATCH", 8, "0", 91, 1,
      92, 2, 72, 0, 73, 1, 93, 3,
      10, 0, 20, 0, 10, 10, 20, 0, 10, 0, 20, 10,
      97, 0, 0, "ENDSEC", 0, "EOF",
    );
    const parsed = parseCadDxf(source);
    expect(parsed.segments.length).toBeGreaterThan(8);
    expect(parsed.segments.some(s => s.start.y < 0 || s.end.y < 0)).toBe(true);
    expect(parsed.skippedTypes.get("HATCH")).toBeUndefined();
  });

  it("uses MILLIMETRES in FrameLogic, never silently rescales a 226000 mm drawing to 226 m", () => {
    expect(insUnitsToMillimeters(4)).toBe(1);
    expect(insUnitsToMillimeters(6)).toBe(1000);
    expect(insUnitsToMillimeters(1)).toBe(25.4);
    expect(insUnitsToMillimeters(21)).toBeCloseTo(304.8006096);
    const source = dxf(...HEADER, 0, "SECTION", 2, "ENTITIES",
      0, "LINE", 8, "0", 10, 0, 20, 0, 11, 226000, 21, 0,
      0, "ENDSEC", 0, "EOF");
    const parsed = parseCadDxf(source);
    const s = insUnitsToMillimeters(parsed.insUnits)!;
    expect(parsed.segments[0]!.end.x * s).toBe(226000);
  });
});


describe("safe bounds for deeply repeated imported DWG blocks", () => {
  it("stops expanding at its protective limit, reports a partial drawing and never explodes arrays", () => {
    const dxf = [
      0, "SECTION", 2, "BLOCKS",
      0, "BLOCK", 2, "TRUSS", 10, 0, 20, 0,
      ...Array.from({ length: 12 }, (_, i) => [
        0, "LINE", 8, "0", 10, i, 20, 0, 11, i + 1, 21, 1,
      ]).flat(),
      0, "ENDBLK", 0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      0, "INSERT", 2, "TRUSS", 10, 0, 20, 0,
      70, 128, 71, 128, 44, 100, 45, 100,
      0, "ENDSEC", 0, "EOF",
    ];
    const text = dxf.map(String).join("\n") + "\n";
    const start = Date.now();
    const cap = 512;
    const parsed = parseCadDxf(text, { maxSegments: cap });
    expect(MAX_RENDERED_SEGMENTS).toBeGreaterThan(80_000);
    expect(parsed.segments).toHaveLength(cap);
    expect(parsed.truncated).toBe(true);
    expect(parsed.skippedTypes.get("LIMITE_SEGMENTOS")).toBe(1);
    // A bounded test budget stops expansion rather than materializing all
    // 196608 segments. Production allows a larger, fair source-wide budget.
    expect(Date.now() - start).toBeLessThan(20_000);
  });
});


describe("large DXF block completeness and missing external references", () => {
  it("keeps later structural blocks when an early repeated INSERT exceeds the budget", () => {
    const data = dxf(
      0, "SECTION", 2, "BLOCKS",
      0, "BLOCK", 2, "TRUSS", 10, 0, 20, 0,
      0, "LINE", 8, "0", 10, 0, 20, 0, 11, 10, 21, 1,
      0, "ENDBLK",
      0, "BLOCK", 2, "END_FRAME", 10, 0, 20, 0,
      0, "LINE", 8, "0", 10, 0, 20, 0, 11, 150, 21, 0,
      0, "ENDBLK", 0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      // This single early MINSERT could previously remove ALL later blocks.
      0, "INSERT", 2, "TRUSS", 8, "0", 10, 0, 20, 0,
      70, 100, 71, 100, 44, 10, 45, 10,
      0, "INSERT", 2, "END_FRAME", 8, "0", 10, 226000, 20, 0,
      0, "LINE", 8, "0", 10, -500, 20, 0, 11, -400, 21, 0,
      0, "ENDSEC", 0, "EOF",
    );
    const parsed = parseCadDxf(data, { maxSegments: 256 });
    expect(parsed.segments).toHaveLength(256);
    expect(parsed.truncated).toBe(true);
    expect(parsed.incompleteRootEntities).toBeGreaterThan(0);
    // Every main entity gets at least its first segment; block position is
    // correct, not truncated away because the earlier TRUSS expanded first.
    expect(parsed.segments.some(x =>
      Math.abs(x.start.x - 226000) < 1e-5 &&
      Math.abs(x.end.x - 226150) < 1e-5)).toBe(true);
    expect(parsed.segments.some(x => x.start.x === -500)).toBe(true);
  });

  it("uses DIMENSION group 12 for anonymous block translation, never group 10 definition point", () => {
    const prefix = [
      0, "SECTION", 2, "BLOCKS",
      0, "BLOCK", 2, "*D10", 10, 0, 20, 0,
      0, "LINE", 8, "0", 10, 10, 20, 10, 11, 110, 21, 10,
      0, "ENDBLK", 0, "ENDSEC",
    ];
    const noInsert = parseCadDxf(dxf(...prefix,
      0, "SECTION", 2, "ENTITIES",
      0, "DIMENSION", 2, "*D10", 10, 90000, 20, 80000,
      0, "ENDSEC", 0, "EOF",
    ));
    expect(noInsert.segments[0]?.start).toEqual({ x: 10, y: 10, z: 0 });
    const actualInsert = parseCadDxf(dxf(...prefix,
      0, "SECTION", 2, "ENTITIES",
      0, "DIMENSION", 2, "*D10", 10, 90000, 20, 80000,
      12, 200, 22, 300, 32, 0,
      0, "ENDSEC", 0, "EOF",
    ));
    expect(actualInsert.segments[0]?.start).toEqual({ x: 210, y: 310, z: 0 });
  });

  it("reports missing XREF paths and absent BLOCK definitions without inventing geometry", () => {
    const parsed = parseCadDxf(dxf(
      0, "SECTION", 2, "BLOCKS",
      0, "BLOCK", 2, "EXTERNAL_TRUSS", 70, 4, 1, "./support/truss.dwg",
      10, 0, 20, 0,
      0, "ENDBLK", 0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      0, "INSERT", 2, "EXTERNAL_TRUSS", 10, 10, 20, 10,
      0, "INSERT", 2, "UNKNOWN_PART", 10, 100, 20, 200,
      0, "ENDSEC", 0, "EOF",
    ));
    expect(parsed.segments).toHaveLength(0);
    expect(parsed.unresolvedExternalReferences).toEqual(["./support/truss.dwg"]);
    expect(parsed.unresolvedBlocks).toContain("UNKNOWN_PART");
    expect(parsed.skippedTypes.get("XREF")).toBe(1);
  });
});

describe("AutoCAD TEXT / MTEXT / ATTRIB inside structural truss blocks", () => {
  it("recovers 4S 3000 and P6 3000 at the original block rotation and scale", () => {
    const source = dxf(
      ...HEADER, ...LAYERS,
      0, "SECTION", 2, "BLOCKS",
      0, "BLOCK", 2, "TUBE", 10, 0, 20, 0,
      0, "LINE", 8, "0", 10, 0, 20, 0, 11, 3000, 21, 0,
      0, "TEXT", 8, "0", 1, "4S 3000", 40, 120,
      10, 1000, 20, 80, 50, 0,
      0, "MTEXT", 8, "0", 1, "P6 3000", 40, 110,
      10, 1700, 20, 80, 71, 5,
      0, "ATTDEF", 8, "0", 1, "PLACEHOLDER", 40, 100,
      10, 2200, 20, 80, 70, 0,
      0, "ENDBLK", 0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      0, "INSERT", 2, "TUBE", 8, "YELLOW",
      10, 5000, 20, 2000, 41, 2, 42, 2, 50, 90,
      0, "ATTRIB", 8, "YELLOW", 1, "4S 6000", 40, 150,
      10, 4500, 20, 4000, 50, 90, 70, 0,
      0, "SEQEND",
      0, "ENDSEC", 0, "EOF",
    );
    const parsed = parseCadDxf(source);
    expect(parsed.segments).toHaveLength(1);
    expect(parsed.texts.map(x => x.text)).toEqual(["4S 3000", "P6 3000", "4S 6000"]);
    const first = parsed.texts[0]!;
    expect(first.position.x).toBeCloseTo(4840);
    expect(first.position.y).toBeCloseTo(4000);
    expect(first.axisX.x).toBeCloseTo(4840);
    expect(first.axisX.y).toBeCloseTo(4240);
    expect(first.layer).toBe("YELLOW");
    expect(first.color).toBe("#ffff00");
    const mtext = parsed.texts[1]!;
    expect(mtext.horizontalAlign).toBe("center");
    expect(mtext.verticalAlign).toBe("middle");
    const attrib = parsed.texts[2]!;
    expect(attrib.kind).toBe("ATTRIB");
    expect(attrib.position.x).toBe(4500);
    expect(parsed.skippedTypes.get("TEXT")).toBeUndefined();
    expect(parsed.skippedTypes.get("MTEXT")).toBeUndefined();
    expect(parsed.skippedTypes.get("ATTRIB")).toBeUndefined();
  });

  it("preserves texts even when a massive earlier block exhausts line budget", () => {
    const source = dxf(
      0, "SECTION", 2, "BLOCKS",
      0, "BLOCK", 2, "FRAME", 10, 0, 20, 0,
      0, "LINE", 8, "0", 10, 0, 20, 0, 11, 100, 21, 10,
      0, "TEXT", 8, "0", 1, "4S 3000", 10, 50, 20, 0, 40, 20,
      0, "ENDBLK", 0, "ENDSEC",
      0, "SECTION", 2, "ENTITIES",
      0, "INSERT", 2, "FRAME", 10, 0, 20, 0, 70, 128, 71, 128, 44, 100, 45, 100,
      0, "TEXT", 1, "P6 3000", 40, 100, 10, 226000, 20, 0,
      0, "ENDSEC", 0, "EOF",
    );
    const parsed = parseCadDxf(source, { maxSegments: 96 });
    expect(parsed.segments).toHaveLength(96);
    expect(parsed.truncated).toBe(true);
    expect(parsed.texts.some(x => x.text === "P6 3000")).toBe(true);
    expect(parsed.texts.some(x => x.text === "4S 3000")).toBe(true);
  });

  it("decodes multiline MTEXT, unicode escape and degree signs without changing label contents", () => {
    const source = dxf(0, "SECTION", 2, "ENTITIES",
      0, "MTEXT", 40, 50, 10, 0, 20, 0,
      1, String.raw`4S 3000\PÁngulo \U+00B0 %%d`,
      0, "TEXT", 1, "P6 3000", 40, 30, 10, 500, 20, 0,
      0, "ENDSEC", 0, "EOF");
    const parsed = parseCadDxf(source);
    expect(parsed.texts[0]?.text).toContain("4S 3000\nÁngulo");
    expect(parsed.texts[0]?.text).toContain("°");
    expect(parsed.texts[1]?.text).toBe("P6 3000");
  });
});
