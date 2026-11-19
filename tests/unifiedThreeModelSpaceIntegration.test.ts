import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("FrameLogic has one user-facing Three.js Model Space", () => {
  const main = read("../apps/web/src/features/bim/BimViewport.tsx");
  const tools = read("../apps/web/src/features/bim/native/NativePrimaryProjectEditor.ts");
  const app = read("../apps/web/src/App.tsx");
  const viewport = read("../packages/bim/core/src/viewport/ThatOpenViewportAdapter.ts");
  const drawing = read("../packages/bim/core/src/engine/createFrameLogicBimCoreDrawing.ts");
  const project = read("../packages/bim/core/src/project/FrameLogicProjectPackageController.ts");

  it("renders the authoritative THREE scene and does not show alternate viewer or mode buttons", () => {
    expect(main).toContain('data-framelogic-main-renderer="three"');
    expect(main).toContain('className="bim-viewport"');
    expect(main).toContain("mountNativePrimaryProjectEditor({");
    expect(main).toContain("scene: instance.viewport.scene");
    expect(main).toContain("getCamera: () => instance.viewport.camera");
    expect(main).toContain("canvas: instance.viewport.canvas");
    expect(main).not.toContain('data-native-step-workspace-launch="true"');
    expect(main).not.toContain('data-native-primary-mode="true"');
    expect(main).not.toContain("Three.js principal · controles activos");
    expect(main).not.toContain("Activar controles Three.js");
    expect(main).not.toContain("STEP · visor de pruebas");
    expect(viewport).toContain("return world.renderer.three");
    expect(tools).not.toContain("new THREE.WebGLRenderer");
  });

  it("starts native tools automatically and keeps the complete CAD input system accessible", () => {
    expect(main).toContain('viewportFlags.get("cadLegacy") !== "1"');
    expect(main).toContain("toggleNativePrimaryEditor()");
    expect(tools).toContain("host.append(toolbar)");
    expect(tools).not.toContain("host.append(input, toolbar)");
    expect(tools).toContain('let mode: "select" | "translate" | "rotate" = "select"');
    expect(tools).toContain("host.append(input)");
    expect(tools).toContain("input.remove()");
    expect(tools).toContain("options.getNavigationEnabled()");
    expect(tools).toContain("options.setNavigationEnabled(navigationBeforeNativeDrag");
    expect(tools).toContain('addButton("Cerrar herramientas"');
    expect(tools).toContain('setMode("select")');
    expect(tools).not.toContain('addButton("Volver a CAD"');
    expect(tools).toContain("toolbar.open = false");
  });

  it("preserves STEP imports, DWG/DXF, hierarchic assemblies, .flproject and Paper Space", () => {
    expect(main).toContain("createBimCore(");
    expect(main).toContain("handleImportPiece");
    expect(main).toContain("handleStartPoint");
    expect(main).toContain("handleStartLine");
    expect(drawing).toContain("new CadReferenceImportController({");
    expect(drawing).toContain("new CadReferenceTextSceneController(");
    expect(drawing).toContain("new FrameLogicProjectPackageController({");
    expect(drawing).toContain("new DrawingWorkspaceController({");
    expect(drawing).toContain("new DrawingProductionController(");
    expect(drawing).toContain("new DrawingProfessionalController({");
    expect(project).toContain('readonly schema: "FRAMELOGIC_PROJECT"');
    expect(project).toContain("readonly assemblies: readonly Assembly[]");
    expect(project).toContain("readonly professionalDrawing: DrawingProfessionalSnapshot");
    expect(tools).not.toContain("parseProjectPackage");
  });

  it("edits the real CAD pieces with the same Undo/Redo and .flproject transforms", () => {
    expect(main).toContain("instance.cadHistory.capture(ids)");
    expect(main).toContain("instance.cadHistory.recordTransform(label, before, ids)");
    expect(main).toContain("instance.updateDesignPieceInstanceTransform(id, transform)");
    expect(tools).toContain('editor.begin("translate")');
    expect(tools).toContain('editor.begin("rotate")');
    expect(tools).toContain("editor.finish(true)");
    expect(tools).toContain("editor.finish(false)");
    expect(tools).toContain("options.undo()");
    expect(tools).toContain("options.redo()");
    expect(tools).toContain("cancelGesture()");
  });

  it("retains developer-only diagnostic deep links and an emergency legacy interaction fallback", () => {
    expect(app).toContain('get("threeNative") === "1"');
    expect(main).toContain('viewportFlags.get("threePreview") === "1"');
    expect(main).toContain('viewportFlags.get("cadLegacy") !== "1"');
    expect(main).toContain("mountExperimentalNativeThreePreview({");
    expect(main).not.toContain("openNativeStepWorkspace(");
    expect(main).not.toContain("lastImportedStepFileRef");
    expect(main).toContain("disposeNativePrimary?.()");
    expect(main).toContain("disposeNativePreview?.()");
    expect(drawing).toContain("projectPackage,");
  });
});
