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

  it("explores every nested JSON field dynamically, editing only when unlocked", () => {
    const view = read("../apps/web/src/features/bim/settings/FrameLogicCatalogSettings.tsx");
    const explorer = read("../apps/web/src/features/bim/settings/FrameLogicUniversalCatalogGrid.tsx");
    const style = read("../apps/web/src/features/bim/settings/frameLogicCatalogSettings.css");
    expect(view).toContain("FrameLogicUniversalCatalogGrid");
    expect(view).toContain('data-framelogic-catalog-base-path="true"');
    expect(view).toContain('value={catalog.ruta_base ?? ""}');
    expect(view).toContain('disabled={!unlocked}');
    expect(view).not.toContain('rutaBase={catalog.ruta_base}');
    expect(explorer).not.toContain('displayCatalogPath');

    expect(view).toContain("updateCatalogField");
    expect(view).toContain("makeCatalogRecordWithAllSubdivisions(catalog.registros)");
    expect(view).toContain('data-framelogic-catalog-new-code="true"');
    expect(view).toContain("+ Nueva pieza / código");
    expect(view).toContain("if (!unlocked || !catalog || busy) return;");
    expect(view).toContain("setFilter(\"\")");
    expect(view).toContain("serializeFrameLogicCatalog(updated)");
    expect(view).toContain("if (!unlocked) return;");
    expect(view).toContain("serializeFrameLogicCatalog(normalizeFrameLogicCatalog(catalog))");
    expect(view).toContain("window.confirm(");
    expect(explorer).toContain('catalogFieldRows(record)');
    expect(explorer).toContain('Editar estructura JSON');
    expect(explorer).toContain('parseCatalogRecordEditor(jsonEditor.text)');
    expect(explorer).toContain("onCellEdit(selectedRow!, path, next)");
    expect(explorer).toContain('className="fl-catalog-type-select"');
    expect(explorer).toContain('aria-label={"Tipo de " + label}');
    expect(explorer).toContain('value={selectedType}');
    expect(explorer).toContain('parseCatalogNumericInput(text)');
    expect(explorer).toContain('inputMode="decimal"');
    expect(explorer).toContain("El texto actual no es un número válido");
    expect(explorer).toContain('!isCode &&');

    expect(style).toContain(".fl-universal-field-table");
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
    expect(view).toContain("restoreCatalogFileHandle(route)");
    expect(view).toContain("queryCatalogReadPermission(handle)");
    expect(view).toContain("requestCatalogReadPermission(handle)");
    expect(view).toContain("storeCatalogFileHandle(localRoute, handle)");
    expect(view).toContain('data-framelogic-catalog-authorize="true"');
    expect(view).toContain("rememberedHandle &&");
    expect(view).toContain("loadLocal(file, handle, false)");
    expect(view).toContain("requestCatalogWritePermission(handle)");
    const store = read("../apps/web/src/features/bim/settings/catalogFileHandleStore.ts");
    expect(store).toContain("indexedDB.open(CATALOG_FILE_HANDLE_DB, 1)");
    expect(store).toContain("saved.route !== route");
    expect(store).toContain('queryPermission({ mode: "read" })');
    expect(store).toContain('requestPermission({ mode: "read" })');
  });

  it("still ships a valid starter file for optional URL-based catalogs", () => {
    const catalog = JSON.parse(read("../apps/web/public/data/framelogic-catalog.json"));
    expect(catalog).toEqual({ version: 1, ruta_base: "", registros: [] });
  });
});
