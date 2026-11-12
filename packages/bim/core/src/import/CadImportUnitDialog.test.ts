import { describe, expect, it } from "vitest";
import {
  explicitCadImportUnits,
  cadImportUnitPreview,
  rawCadExtent,
} from "./CadImportUnitDialog";

const largeDwg = {
  // The converted DXF header declares metres even though the original
  // CUNAS_MEDIR coordinates represent millimetres.
  insUnits: 6,
  segments: [{
    layer: "0", color: "#fff",
    start: { x: 0, y: 0, z: 0 }, end: { x: 461564.80125, y: 10, z: 0 },
  }],
  points: [{ layer: "0", color: "#fff", point: { x: 12, y: 0, z: 0 } }],
};

describe("explicit CAD import units (regression for CUNAS_MEDIR 1.dwg)", () => {
  it("mm always means ×1 even if INSUNITS 6 suggests metres", () => {
    const result = cadImportUnitPreview(largeDwg, "mm");
    expect(result.unit).toBe("mm");
    expect(result.factor).toBe(1);
    expect(result.rawExtent).toBeCloseTo(461564.80125, 5);
    expect(result.extentMm).toBeCloseTo(461564.80125, 5);
    // A 3-m tube represented as 3,000 raw drawing units stays 3,000 mm.
    expect(3000 * result.factor).toBe(3000);
  });

  it("only an explicit metre choice multiplies by 1,000", () => {
    const result = cadImportUnitPreview(largeDwg, "m");
    expect(result.factor).toBe(1000);
    expect(result.extentMm).toBeCloseTo(461564801.25, 1);
  });

  it("provides all supported units and no automatic selection", () => {
    expect(explicitCadImportUnits("cm")).toEqual({ unit: "cm", factor: 10 });
    expect(explicitCadImportUnits("in")).toEqual({ unit: "in", factor: 25.4 });
    expect(explicitCadImportUnits("ft")).toEqual({ unit: "ft", factor: 304.8 });
    expect(() => explicitCadImportUnits("auto")).toThrow("inválida");
    expect(() => explicitCadImportUnits("")).toThrow("inválida");
  });

  it("computes raw extents before conversion and handles empty geometry", () => {
    expect(rawCadExtent({ segments: [], points: [] })).toBe(0);
    expect(rawCadExtent(largeDwg)).toBeCloseTo(461564.80125);
  });


});
