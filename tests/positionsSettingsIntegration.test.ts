import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");
describe("Configuración → Posiciones universales",()=>{
  it("mounts the Excel grid under the global lock and shares dirty-close protection",()=>{
    const tabs=read("../apps/web/src/features/bim/settings/frameLogicPreferences.ts");
    const settings=read("../apps/web/src/features/bim/settings/FrameLogicSettingsWindow.tsx");
    const ui=read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(tabs).toContain('{ id: "POSITIONS", title: "Posiciones"');
    expect(settings).toContain("<FrameLogicPositionsSettings unlocked={unlocked}");
    expect(settings).toContain("catalogDirtyRef.current || positionsDirtyRef.current");
    expect(ui).toContain("fl-positions-excel");
    expect(ui).toContain("Código del ítem");
    expect(ui).toContain("Familias del ítem (texto libre)");
    expect(ui).toContain('commitCell(index,"familias"');
    expect(ui).not.toContain("datalist");
    expect(ui).not.toContain("selectedFamilies");
  });
  it("reuses the DB folder and safely reads DBFrameLogic.json without writing it",()=>{
    const core=read("../apps/web/src/features/bim/settings/positionsFlatCatalog.ts");
    const ui=read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(core).toContain("POSITIONS_LOCAL_PATH");
    expect(ui).toContain("restoreCatalogFileHandle(POSITIONS_LOCAL_PATH,POSITIONS_HANDLE_KEY)");
    expect(ui).toContain("writeAuthorizedPositionsFile(destination,json");
    expect(ui).not.toContain("fetch(DBFrameLogic");
  });
  it("renders name as an independent noneditable column resolved from DBFrameLogic.json",()=>{
    const ui=read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    const index=read("../apps/web/src/features/bim/settings/positionsCatalogNames.ts");
    expect(ui).toContain('<th>Nombre</th>');
    expect(ui).toContain("indexCatalogNames(parseFrameLogicCatalog(text))");
    expect(ui).toContain("resolveCatalogName(dbNames,row.codigo)");
    expect(ui).toContain("Seleccionar DBFrameLogic.json");
    expect(ui).toContain("Actualizar nombres");
    expect(ui).toContain("Autorizar DB");
    expect(ui).toContain("restoreCatalogFileHandle(dbRoute())");
    expect(ui).toContain("no se guardan en POSITIONS.json.");
    expect(index).toContain("normalizedCatalogCode");
    expect(ui).not.toContain('commitCell(index,"nombre"');
    expect(ui).toContain('Estado «Única» significa sin solapamientos numéricos');
  });
  it("requires an explicit backup before legacy schema conversion",()=>{
    const ui=read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(ui).toContain("migrateLegacyPositions(legacy.file)");
    expect(ui).toContain('POSITIONS_respaldo_v1.json');
    expect(ui).toContain("El esquema anterior contiene prioridades");
  });
  it("does not require a schemaVersion field in the POSITIONS JSON",()=>{
    const model=read("../apps/web/src/features/bim/settings/positionsFlatCatalog.ts");
    const ui=read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(model).not.toContain("schemaVersion: 2;");
    expect(model).not.toContain('Se requiere schemaVersion: 2');
    expect(ui).toContain('hasObsoleteSchema');
    expect(ui).not.toContain('>Esquema 2</span>');
  });
  it("shows JSON version, modification date, and blank user independently from item columns",()=>{
    const ui=read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(ui).toContain('data-framelogic-positions-version="true"');
    expect(ui).toContain('data-framelogic-positions-modified-at="true"');
    expect(ui).toContain('data-framelogic-positions-modified-by="true"');
    expect(ui).toContain('Modificado por: {file.usuario_modificacion || "(vacío)"}');
    expect(ui).toContain("Completar metadatos");
    expect(ui).toContain('version: file.version ?? "1.0.0"');
  });
  it("supports free-text families, global moves and Undo/Redo",()=>{
    const ui=read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(ui).toContain("freeFamilies(raw)");
    expect(ui).toContain("insertGlobalSlotFlat(file,slot,item)");
    expect(ui).toContain("moveGlobalRangeFlat(file,from,to,target)");
    expect(ui).toContain("setUndo(");
    expect(ui).toContain("setRedo(");
    expect(ui).toContain("markFlatPositionsModified(validateFlatPositionsFile(file))");
  });
});
