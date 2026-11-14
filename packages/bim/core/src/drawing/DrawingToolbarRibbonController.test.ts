import { describe, expect, it } from "vitest";
import {
  DRAWING_RIBBON_TABS,
  classifyDrawingRibbonControl,
} from "./DrawingToolbarRibbonController";

describe("Paper Space ribbon", () => {
  it("has one ordered tab row with no duplicated groups", () => {
    expect(DRAWING_RIBBON_TABS).toEqual([
      ["INICIO", "Inicio"],
      ["VISTAS", "Vistas"],
      ["COTAS", "Cotas"],
      ["ANOTAR", "Anotar"],
      ["HOJA", "Hoja y PDF"],
      ["REVISION", "Revisiones"],
    ]);
    expect(new Set(DRAWING_RIBBON_TABS.map(([tab]) => tab)).size)
      .toBe(DRAWING_RIBBON_TABS.length);
  });

  it.each([
    ["← Model Space", "", "INICIO"],
    ["Seleccionar", "", "INICIO"],
    ["Actualizar", "", "INICIO"],
    ["−", "", "INICIO"],
    ["+ Vista", "", "VISTAS"],
    ["Vistas auto", "", "VISTAS"],
    ["Proyectar View", "", "VISTAS"],
    ["Organizar auto", "", "VISTAS"],
    ["Secciones", "", "VISTAS"],
    ["Detalle", "", "VISTAS"],
    ["Cota", "", "COTAS"],
    ["Cotas auto", "", "COTAS"],
    ["Cotas · detalles", "", "COTAS"],
    ["Cotas · desde base", "", "COTAS"],
    ["Cota alineada", "Tipo de cota", "COTAS"],
    ["SNAP Auto", "", "COTAS"],
    ["mm", "", "COTAS"],
    ["DIMSTYLE", "", "COTAS"],
    ["Texto", "", "ANOTAR"],
    ["Label", "", "ANOTAR"],
    ["Borrar", "", "ANOTAR"],
    ["Ocultas", "", "ANOTAR"],
    ["A3", "Tamaño de hoja", "HOJA"],
    ["Horizontal", "Orientación de hoja", "HOJA"],
    ["Escala AUTO", "", "HOJA"],
    ["Hatch", "", "HOJA"],
    ["Cajetín", "", "HOJA"],
    ["Guardar PDF actual", "", "HOJA"],
    ["SVG", "", "HOJA"],
    ["DXF", "", "HOJA"],
    ["Revisión", "", "REVISION"],
    ["Congelar rev", "", "REVISION"],
    ["Nube rev", "", "REVISION"],
  ] as const)("places %s in %s ribbon group", (label, title, expected) => {
    expect(classifyDrawingRibbonControl(label, title)).toBe(expected);
  });

  it("uses stable data attributes for selected View and sheet controls", () => {
    expect(classifyDrawingRibbonControl("View 1", "", ["framelogicViewSelect"]))
      .toBe("VISTAS");
    expect(classifyDrawingRibbonControl("AUTO", "", ["framelogicPaperSizeSelect"]))
      .toBe("HOJA");
    expect(classifyDrawingRibbonControl("Planta", "", ["framelogicViewOrientation"]))
      .toBe("VISTAS");
  });

  it("never hides unknown controls by misclassifying them outside the ribbon", () => {
    expect(classifyDrawingRibbonControl("Herramienta futura")).toBe("INICIO");
  });
});
