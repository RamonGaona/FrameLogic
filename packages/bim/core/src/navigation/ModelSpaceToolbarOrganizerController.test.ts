import { describe, expect, it } from "vitest";
import { classifyModelRibbonControl } from "./ModelSpaceToolbarOrganizerController";

describe("Model Space ribbon category classification", () => {
  it.each([
    ["Importar pieza", "", "FILE"],
    ["POINT", "", "DRAW"],
    ["LINE", "LINE · ORTHO sobre WorkPlane", "DRAW"],
    ["CÍRCULO", "", "DRAW"],
    ["RECTÁNGULO", "", "DRAW"],
    ["TRIM", "", "EDIT"],
    ["PARALELA", "", "EDIT"],
    ["COPIAR", "", "EDIT"],
    ["UNIR", "", "EDIT"],
    ["STRETCH", "", "EDIT"],
    ["PEDIT", "", "EDIT"],
    ["COTA", "", "ANNOTATE"],
    ["WorkPlane: XY", "", "WORKPLANE"],
    ["WP origen", "", "WORKPLANE"],
    ["WP 3 SNAP", "", "WORKPLANE"],
    ["Preparar pieza", "", "PIECE"],
    ["Origen ← SNAP", "Definir origen local sobre la geometría y WorkPlane", "PIECE"],
    ["Punto → SNAP", "", "PIECE"],
    ["Insertar otra instancia", "", "PIECE"],
  ] as const)("places %s in %s", (label, title, expected) => {
    expect(classifyModelRibbonControl(label, title)).toBe(expected);
  });

  it("keeps real workplane status together, but sends preparation status to Piezas", () => {
    expect(classifyModelRibbonControl("Elegir punto", "", ["workplane-edit-status"]))
      .toBe("WORKPLANE");
    expect(classifyModelRibbonControl("Prep: A · 4 SNAP", "", ["workplane-edit-status"]))
      .toBe("PIECE");
  });
});
