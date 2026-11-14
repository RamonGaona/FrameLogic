import { describe, expect, it } from "vitest";
import {
  buildSheetAssemblyBom, chooseSheetBomPlacement,
  sheetBomOverlaps, type SheetBomAssembly, type SheetBomPiece,
} from "./SheetAssemblyBom";

const assemblies: SheetBomAssembly[] = [
  { id: "root", name: "Pórtico", pieceInstanceIds: ["a1", "a2"] },
  { id: "child", name: "Nudo soldado", parentAssemblyId: "root", pieceInstanceIds: ["b1"] },
  { id: "grandchild", name: "Pletinas", parentAssemblyId: "child", pieceInstanceIds: ["a3"] },
  { id: "other", name: "Otro pórtico", pieceInstanceIds: ["outside"] },
];
const parts: Record<string, SheetBomPiece> = {
  a1: { id: "a1", definitionId: "PL", label: "Placa", material: "Acero", grade: "S355", unitMassKg: 2 },
  a2: { id: "a2", definitionId: "PL", label: "Placa", material: "Acero", grade: "S355", unitMassKg: 2 },
  a3: { id: "a3", definitionId: "PL", label: "Placa", material: "Acero", grade: "S355", unitMassKg: 2 },
  b1: { id: "b1", definitionId: "BEAM", label: "Viga", material: "Acero" },
  outside: { id: "outside", definitionId: "OUT", label: "Ajenas", unitMassKg: 99 },
};

describe("BOM de ensamble por PDF", () => {
  it("counts direct pieces once, nested subassemblies and their direct pieces without adding unrelated models", () => {
    const result = buildSheetAssemblyBom("root", assemblies, parts, { PL: "P10", BEAM: "P20" }, "HIERARCHY");
    expect(result.rootFound).toBe(true);
    expect(result.totalPieces).toBe(4);
    expect(result.rows.map((row) => [row.kind, row.label, row.quantity, row.depth])).toEqual([
      ["ASSEMBLY", "Pórtico", 1, 0],
      ["PIECE", "Placa", 2, 1],
      ["ASSEMBLY", "Nudo soldado", 1, 1],
      ["PIECE", "Viga", 1, 2],
      ["ASSEMBLY", "Pletinas", 1, 2],
      ["PIECE", "Placa", 1, 3],
    ]);
    expect(result.rows[1]?.totalMassKg).toBe(4);
    expect(result.rows[3]?.totalMassKg).toBeUndefined();
    expect(result.rows.every((r) => r.label !== "Ajenas")).toBe(true);
  });
  it("produces a flat, fully grouped pieces BOM for a deep assembly", () => {
    const rows = buildSheetAssemblyBom("root", assemblies, parts, {}, "FLAT").rows;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.kind, r.label, r.quantity])).toEqual([
      ["PIECE", "Placa", 3], ["PIECE", "Viga", 1],
    ]);
    expect(rows[0]?.totalMassKg).toBe(6);
    expect(rows[1]?.totalMassKg).toBeUndefined();
  });
  it("reports deleted parts instead of inventing occurrences or weights", () => {
    const result = buildSheetAssemblyBom("root", assemblies,
      { ...parts, b1: undefined } as unknown as Record<string, SheetBomPiece>, {}, "FLAT");
    expect(result.missingPieces).toContain("b1");
    expect(result.totalPieces).toBe(3);
  });
  it("refuses missing assembly IDs and cycles", () => {
    expect(buildSheetAssemblyBom("missing", assemblies, parts).rootFound).toBe(false);
    expect(() => buildSheetAssemblyBom("root", [
      { ...assemblies[0]!, parentAssemblyId: "child" },
      assemblies[1]!,
    ], parts)).toThrow();
  });
  it("deduplicates repeated instance IDs in corrupted older assemblies", () => {
    const rows = buildSheetAssemblyBom("root",
      [{ id: "root", name: "Todo", pieceInstanceIds: ["a1", "a1", "a2"] },
        { id: "child", name: "Hijo", parentAssemblyId: "root", pieceInstanceIds: ["a2", "a3"] }],
      parts, {}, "FLAT").rows;
    expect(rows[0]?.quantity).toBe(3);
  });
  it("finds a blank sheet slot, preserving the frame and title block", () => {
    const title = { x: 728, y: 670, width: 360, height: 92 };
    const placement = chooseSheetBomPlacement([title], 5);
    expect(placement).toEqual({ x: 55, y: 624, width: 648, height: 142 });
    expect(sheetBomOverlaps(placement!, title)).toBe(false);
    expect(chooseSheetBomPlacement([{ x: 0, y: 0, width: 1120, height: 792 }], 8)).toBeNull();
    expect(sheetBomOverlaps({x: 1,y: 1,width: 10,height: 10},
      {x: 30,y:30,width: 10,height: 10})).toBe(false);
  });
});
