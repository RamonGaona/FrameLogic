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
  it("reuses the DB folder and safe local file permissions without reading DBFrameLogic.json",()=>{
    const core=read("../apps/web/src/features/bim/settings/positionsFlatCatalog.ts");
    const ui=read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(core).toContain("POSITIONS_LOCAL_PATH");
    expect(ui).toContain("restoreCatalogFileHandle(POSITIONS_LOCAL_PATH,POSITIONS_HANDLE_KEY)");
    expect(ui).toContain("writeAuthorizedPositionsFile(destination,json");
    expect(ui).not.toContain("fetch(DBFrameLogic");
  });
  it("requires an explicit backup before legacy schema conversion",()=>{
    const ui=read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(ui).toContain("migrateLegacyPositions(legacy.file)");
    expect(ui).toContain('POSITIONS_respaldo_v1.json');
    expect(ui).toContain("El esquema anterior contiene prioridades");
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
