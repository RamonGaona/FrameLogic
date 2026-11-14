import { describe, expect, it } from "vitest";
import {
  buildSheetAssemblyBom, chooseSheetBomPlacement, planSheetBomPages,
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
    expect(result.rows.map((row) => row.itemNumber)).toEqual([
      "1", "1.1", "1.2", "1.2.1", "1.2.2", "1.2.2.1",
    ]);
    expect(new Set(result.rows.map((row) => row.itemNumber)).size).toBe(result.rows.length);
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
    expect(rows.map((row) => row.itemNumber)).toEqual(["1", "2"]);
    expect(rows[0]?.totalMassKg).toBe(6);
    expect(rows[1]?.totalMassKg).toBeUndefined();
  });
  it("keeps a root with two distinct direct parts numbered 1, 1.1 and 1.2", () => {
    const result = buildSheetAssemblyBom("root",
      [{ id: "root", name: "E1", pieceInstanceIds: ["a1", "b1"] }],
      parts, { PL: "P10", BEAM: "P20" });
    expect(result.rows.map((row) => [row.itemNumber, row.mark])).toEqual([
      ["1", "E1"], ["1.1", "P10"], ["1.2", "P20"],
    ]);
    expect(result.totalPieces).toBe(2);
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
  it("paginates every row once in complete BOM PDFs, including large assemblies", () => {
    for (const total of [1, 40, 41, 85, 121]) {
      const pages = planSheetBomPages(total);
      expect(pages.reduce((sum, page) => sum + page.count, 0)).toBe(total);
      const visited = pages.flatMap((page) =>
        Array.from({ length: page.count }, (_, i) => page.start + i));
      expect(visited).toEqual(Array.from({ length: total }, (_, i) => i));
      expect(pages.every((page) => page.totalPages === pages.length)).toBe(true);
    }
    expect(planSheetBomPages(0)).toEqual([]);
    expect(planSheetBomPages(-1)).toEqual([]);
  });

  it("persists BOM configuration independently for different PDF sheets", () => {
    const sheets = [
      { ownerSectionId: "A", bomTable: { rootAssemblyId: "root", sourceViewId: "v1",
        mode: "HIERARCHY" as const, x: 55, y: 624, width: 648, height: 142 } },
      { ownerSectionId: "B", bomTable: { rootAssemblyId: "child", sourceViewId: "v2",
        mode: "FLAT" as const, x: 55, y: 624, width: 648, height: 142 } },
    ];
    const persisted = JSON.parse(JSON.stringify(sheets)) as typeof sheets;
    delete (persisted[0] as { bomTable?: typeof sheets[number]["bomTable"] }).bomTable;
    expect(persisted[1]?.bomTable?.rootAssemblyId).toBe("child");
    expect(sheets[0]?.bomTable?.rootAssemblyId).toBe("root");
  });

  it("finds a blank sheet slot, preserving the frame and title block", () => {
    const title = { x: 728, y: 670, width: 360, height: 92 };
    const placement = chooseSheetBomPlacement([title], 5);
    expect(placement).toEqual({ x: 55, y: 624, width: 648, height: 142 });
    expect(sheetBomOverlaps(placement!, title)).toBe(false);
    const expanded = chooseSheetBomPlacement([title], 19);
    expect(expanded?.height).toBe(49 + 19 * 13);
    expect(expanded?.y).toBe(365);
    expect(chooseSheetBomPlacement([{ x: 0, y: 0, width: 1120, height: 792 }], 8)).toBeNull();
    expect(sheetBomOverlaps({x: 1,y: 1,width: 10,height: 10},
      {x: 30,y:30,width: 10,height: 10})).toBe(false);
  });
});
