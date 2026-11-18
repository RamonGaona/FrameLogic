import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source=(p:string)=>readFileSync(new URL(p,import.meta.url),"utf8");

describe("Insertar (demo) in Model Space",()=>{
  it("mounts toolbar action and separate scope and file input controls",()=>{
    const toolbar=source("../apps/web/src/features/bim/BimViewport.tsx");
    const tool=source("../apps/web/src/features/bim/LineFillDemoTool.tsx");
    expect(toolbar).toContain('<LineFillDemoTool coreRef={bimCoreRef} onInstancesChanged={refreshPieces}/>');
    expect(tool).toContain('Insertar (demo)');
    expect(tool).toContain("core.cadLineSelection.subscribe");
    expect(tool).toContain("core.cancelActiveCadCommand()");
    expect(tool).toContain("planLinePositionFill(line, catalogs.positions, catalogs.db, scope)");
    expect(tool).toContain("insertLinePositionDemo(core,plan,line.end,{");
    expect(tool).toContain("requireRealGeometry:true");
    expect(tool).toContain("ensureLineFLPieceDefinitions(core,plan,");
    expect(tool).toContain("window.confirm(info)");
    expect(tool).toContain("Selecciona una línea CAD");
    expect(tool).toContain('type="file" multiple');
    for(const scope of ["activo_general","activo_proyecto","activo_puntal"])
      expect(tool).toContain(scope);
  });
  it("supports previously granted local JSON read permissions and no silent writes",()=>{
    const tool=source("../apps/web/src/features/bim/LineFillDemoTool.tsx");
    expect(tool).toContain("restoreCatalogFileHandle(POSITIONS_LOCAL_PATH, POSITIONS_HANDLE_KEY)");
    expect(tool).toContain("restoreCatalogFileHandle(catalogDbRoute())");
    expect(tool).toContain('positionsPermission !== "granted"');
    expect(tool).toContain("parseFrameLogicCatalog(dbText)");
    expect(tool).not.toContain("requestCatalogWritePermission");
  });
  it("reads only browser-authorized FLPIECE directory and offers multi-file fallback",()=>{
    const tool=source("../apps/web/src/features/bim/LineFillDemoTool.tsx");
    const folder=source("../apps/web/src/features/bim/flpieceDirectoryHandleStore.ts");
    const importer=source("../apps/web/src/features/bim/lineFLPieceAutoLoader.ts");
    expect(tool).toContain('showDirectoryPicker');
    expect(tool).toContain('rememberFLPieceDirectory(selected)');
    expect(tool).toContain('restoreFLPieceDirectory()');
    expect(tool).toContain('authorizeFLPieceDirectory(folder)');
    expect(tool).toContain('indexChosenFLPieceFiles(files)');
    expect(tool).toContain('Carpeta FLPIECE');
    expect(tool).toContain('Elegir .flpiece');
    expect(tool).toContain('0 referencias temporales');
    expect(folder).toContain('getFile(): Promise<File>');
    expect(importer).toContain('parseFrameLogicPiecePackage(await source.file.text())');
    expect(importer).toContain('restorePieceMetadata(core,definition.id,piece)');
    expect(importer).toContain('core.importStepPiece(document,identity)');
  });
  it("suggests POINT on P, not the shadowing PEDIT prefix",()=>{
    const input=source("../packages/bim/core/src/interaction/CadCommandInputController.ts");
    const point=input.indexOf('if (normalized === "P" || normalized === "PU" || normalized === "PUN"');
    const edit=input.indexOf('if (normalized === "E" || normalized.startsWith("PE")',point);
    expect(point).toBeGreaterThan(0);
    expect(edit).toBeGreaterThan(point);
    expect(input).toContain('P / PUNTO · Enter para ejecutar');
  });
});
