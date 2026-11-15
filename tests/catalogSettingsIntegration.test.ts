import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("settings JSON database integration", () => {
  it("adds the catalog to the existing dialog, not a second modal", () => {
    const window = read("../apps/web/src/features/bim/settings/FrameLogicSettingsWindow.tsx");
    const prefs = read("../apps/web/src/features/bim/settings/frameLogicPreferences.ts");
    expect(prefs).toContain('id: "DATABASE"');
    expect(window).toContain('activeSection === "DATABASE"');
    expect(window).toContain("<FrameLogicCatalogSettings />");
    expect(window.match(/role="dialog"/g)).toHaveLength(1);
  });
  it("provides a route, JSON picker, all seven fields, search and admin-only edit", () => {
    const view = read("../apps/web/src/features/bim/settings/FrameLogicCatalogSettings.tsx");
    for (const field of ["codigo", "nombre", "familia", "ruta", "peso", "longitud", "tarifa"]) {
      expect(view).toContain('"' + field + '"');
    }
    expect(view).toContain('id="fl-catalog-json-route"');
    expect(view).toContain("showOpenFilePicker");
    expect(view).toContain("showSaveFilePicker");
    expect(view).toContain("verifyCatalogPassword");
    expect(view).toContain("admin &&");
    expect(view).toContain("disabled={!admin}");
    expect(view).toContain("normalizeFrameLogicCatalog");
    expect(view).toContain("El archivo cambió fuera de FrameLogic");
    expect(view).toContain("NO modifica el JSON de la URL pública");
  });
  it("ships a valid empty catalog without credentials", () => {
    const catalog = JSON.parse(read("../apps/web/public/data/framelogic-catalog.json"));
    expect(catalog).toEqual({ version: 1, registros: [] });
  });
});
