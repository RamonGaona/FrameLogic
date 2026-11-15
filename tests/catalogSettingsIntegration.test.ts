import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("global settings lock and local JSON spreadsheet", () => {
  it("uses one lock outside all tabs and no catalog-specific login panel", () => {
    const windowSource = read("../apps/web/src/features/bim/settings/FrameLogicSettingsWindow.tsx");
    const catalogSource = read("../apps/web/src/features/bim/settings/FrameLogicCatalogSettings.tsx");
    expect(windowSource).toContain('data-framelogic-settings-global-lock="true"');
    expect(windowSource).toContain("mayUnlockSettings(username, password)");
    expect(windowSource).toContain('setUnlocked(false)');
    expect(windowSource).toContain('type="password" value={password}');
    expect(windowSource).toContain('type="text" value={username}');
    expect(windowSource).toContain('<FrameLogicCatalogSettings unlocked={unlocked}');
    expect(windowSource).toContain('disabled={!unlocked}');
    expect(catalogSource).not.toContain("createCatalogPasswordVerifier");
    expect(catalogSource).not.toContain("Ingresar como administrador");
    expect(catalogSource).not.toContain("verifyCatalogPassword");
  });

  it("shows and edits all seven JSON fields in a full-width Excel-style table", () => {
    const view = read("../apps/web/src/features/bim/settings/FrameLogicCatalogSettings.tsx");
    const style = read("../apps/web/src/features/bim/settings/frameLogicCatalogSettings.css");
    for (const key of ["codigo", "nombre", "familia", "ruta", "peso", "longitud", "tarifa"]) {
      expect(view).toContain('"' + key + '"');
    }
    expect(view).toContain('className="fl-catalog-table fl-catalog-excel"');
    expect(view).toContain("onChange={(event) => editCell(");
    expect(view).toContain("if (!unlocked) return;");
    expect(view).toContain("serializeFrameLogicCatalog(normalizeFrameLogicCatalog(catalog))");
    expect(view).toContain("window.confirm(");
    expect(style).toContain(".fl-catalog-excel .fl-catalog-cell-input");
  });

  it("keeps the local DBFrameLogic path through refresh, but uses file picker permissions", () => {
    const view = read("../apps/web/src/features/bim/settings/FrameLogicCatalogSettings.tsx");
    const catalog = read("../apps/web/src/features/bim/settings/frameLogicCatalog.ts");
    expect(catalog).toContain("CATALOG_LOCAL_FILE_NAME = \"DBFrameLogic.json\"");
    expect(catalog).toContain("D:\\Documents\\FrameLogic\\DB\\DBFrameLogic.json");
    expect(view).toContain("CATALOG_SOURCE_STORAGE_KEY");
    expect(view).toContain("localStorage.setItem(CATALOG_SOURCE_STORAGE_KEY, value)");
    expect(view).toContain("showOpenFilePicker");
    expect(view).toContain("showSaveFilePicker");
    expect(view).toContain("createWritable()");
    expect(view).toContain("El JSON cambió fuera de FrameLogic.");
  });

  it("still ships a valid starter file for optional URL-based catalogs", () => {
    const catalog = JSON.parse(read("../apps/web/public/data/framelogic-catalog.json"));
    expect(catalog).toEqual({ version: 1, registros: [] });
  });
});
