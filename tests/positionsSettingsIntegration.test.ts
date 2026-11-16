import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("FrameLogic Configuración → Posiciones", () => {
  it("mounts the tab under the existing single editor lock", () => {
    const tabs = read("../apps/web/src/features/bim/settings/frameLogicPreferences.ts");
    const window = read("../apps/web/src/features/bim/settings/FrameLogicSettingsWindow.tsx");
    const component = read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(tabs).toContain('{ id: "POSITIONS", title: "Posiciones"');
    expect(window).toContain('<FrameLogicPositionsSettings unlocked={unlocked}');
    expect(window).toContain("positionsDirtyRef.current");
    expect(window).toContain("catalogDirtyRef.current || positionsDirtyRef.current");
    expect(component).not.toContain("mayUnlockSettings");
  });
  it("uses only the DB folder, its own remembered file handle, and no other JSON writes", () => {
    const model = read("../apps/web/src/features/bim/settings/positionsCatalog.ts");
    const component = read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(model).toContain("D:\\Documents\\FrameLogic\\DB\\POSITIONS.json");
    expect(component).toContain("POSITIONS_HANDLE_KEY");
    expect(component).toContain("restoreCatalogFileHandle(POSITIONS_LOCAL_PATH, POSITIONS_HANDLE_KEY)");
    expect(component).toContain("storeCatalogFileHandle(POSITIONS_LOCAL_PATH");
    expect(component).toContain("writeAuthorizedPositionsFile(destination, json");
    expect(component).not.toContain("writeAuthorizedCatalogFile");
    expect(component).not.toContain("DECISIONS.json,");
  });
  it("previews global changes, supports Undo/Redo and keeps local writes explicit", () => {
    const source = read("../apps/web/src/features/bim/settings/FrameLogicPositionsSettings.tsx");
    expect(source).toContain("previewPositionOperation(file, after)");
    expect(source).toContain("movePositionRange(file, current.from, current.to, destination)");
    expect(source).toContain("insertPositionSlot(file, family, slot, inheritRange)");
    expect(source).toContain("setUndo(");
    expect(source).toContain("setRedo(");
    expect(source).toContain("markPositionsModified(normalizePositionsFile(file))");
  });
});
