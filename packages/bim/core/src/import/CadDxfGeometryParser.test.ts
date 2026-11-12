import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import { CadLineSceneController } from "../design/CadLineSceneController";
import { parseCadDxf } from "./CadDxfGeometryParser";
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
  10, 500, 20, 700, 30, 0,
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
