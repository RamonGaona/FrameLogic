import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Insertar demo: STEP examples without JSON or FLPIECE", () => {
  const toolbar = read("../apps/web/src/features/bim/BimViewport.tsx");
  const tool = read("../apps/web/src/features/bim/LineFillDemoTool.tsx");
  const repository = read("../apps/web/src/features/bim/repositoryStepDemo.ts");
  const placer = read("../apps/web/src/features/bim/linePositionInsertDemo.ts");

  it("keeps the same toolbar and CAD-line selection but no JSON or local files", () => {
    expect(toolbar).toContain(
      "<LineFillDemoTool coreRef={bimCoreRef} onInstancesChanged={refreshPieces}/>",
    );
    expect(tool).toContain("Insertar (demo)");
    expect(tool).toContain("core.cadLineSelection.subscribe");
    expect(tool).toContain("core.cancelActiveCadCommand()");
    expect(tool).toContain("core.cadLineSelection.clearSelection()");
    expect(tool).toContain("planRepositoryStepDemoFill(line, loaded.lengths)");
    expect(tool).toContain("ensureRepositoryStepDemoDefinitions(core, setStatus)");
    expect(tool).toContain("insertLinePositionDemo(core, plan, line.end");
    expect(tool).toContain("requireRealGeometry: true");
    expect(tool).toContain("window.confirm(info)");
    expect(tool).toContain("Selecciona una línea CAD");
    for (const forbidden of [
      "parseDemoCatalogs", "tryRememberedCatalogs", "restoreCatalogFileHandle",
      "POSITIONS_HANDLE_KEY", "planLinePositionFill(", "parseFrameLogicCatalog(",
      "ensureLineFLPieceDefinitions(", "showDirectoryPicker", 'type="file"',
    ]) expect(tool).not.toContain(forbidden);
  });

  it("loads STEP from app public assets and registers native .flproject definitions", () => {
    expect(repository).toContain('url: "/examples/step/REC1500.stp"');
    expect(repository).toContain('url: "/examples/step/REC3000.stp"');
    expect(repository).toContain('url: "/examples/step/REC6000.stp"');
    expect(repository).toContain("await fetch(asset.url)");
    expect(repository).toContain("await adapter.load(bytes");
    expect(repository).toContain("core.importStepPiece(document");
    expect(repository).toContain("detectPieceLongAxis(");
    expect(repository).toContain("axis.physicalLengthMm");
    expect(repository).not.toContain("JSON.parse(");
    expect(placer).toContain("core.cadHistory.recordOperation(");
    expect(placer).toContain("core.designModel.registerPieceInstance(");
  });
});
