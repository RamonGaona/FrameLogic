import { describe, it, expect } from "vitest";
import { buildAssemblyBom, renderAssemblyBomRow } from "./AssemblyBomPlanner";

describe("assembly BOM from real engineering metadata", () => {
  it("groups occurrences without inflating quantities and uses verified per-piece mass", () => {
    const result = buildAssemblyBom([
      { definitionId: "A", label: "Placa base" },
      { definitionId: "A", label: "Placa base" },
      { definitionId: "B", label: "Perfil" },
    ], { A: "P1", B: "P2" }, {
      A: { material: "Acero", grade: "S355", unitMassKg: 7.5 },
      B: { material: "Acero", grade: "S275" },
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      mark: "P1", quantity: 2, material: "Acero", grade: "S355",
      unitMassKg: 7.5, totalMassKg: 15,
    });
    expect(result[1]?.totalMassKg).toBeUndefined();
    expect(renderAssemblyBomRow(result[1]!)).toContain("Masa sin dato");
  });
  it("does not invent a steel grade or mass for missing or invalid engineering properties", () => {
    const result = buildAssemblyBom([{ definitionId: "A", label: "Tubo" }],
      { A: "P3" }, { A: { unitMassKg: -100 } });
    expect(result[0]?.material).toBeUndefined();
    expect(result[0]?.totalMassKg).toBeUndefined();
    expect(renderAssemblyBomRow(result[0]!)).toContain("Material sin dato");
  });
  it("preserves first definition label and ignores empty definition IDs", () => {
    const result = buildAssemblyBom([
      { definitionId: "A", label: "Primera" },
      { definitionId: "", label: "Inválida" },
      { definitionId: "A", label: "Segunda" },
    ], {});
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: "Primera", quantity: 2, mark: "—" });
  });
});