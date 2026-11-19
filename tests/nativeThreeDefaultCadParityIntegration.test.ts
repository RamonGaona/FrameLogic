import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Three.js default Model Space preserves the complete FrameLogic CAD workflow", () => {
  const web = read("../apps/web/src/features/bim/BimViewport.tsx");
  const native = read("../apps/web/src/features/bim/native/NativePrimaryProjectEditor.ts");
  const adapter = read("../packages/bim/core/src/viewport/ThatOpenViewportAdapter.ts");
  const project = read("../packages/bim/core/src/project/FrameLogicProjectPackageController.ts");
  const drawing = read("../packages/bim/core/src/engine/createFrameLogicBimCoreDrawing.ts");

  it("enables native Three.js tools at the authoritative main viewport by default, without a second renderer", () => {
    expect(web).toContain('data-framelogic-main-renderer="three"');
    expect(web).toContain('viewportFlags.get("cadLegacy") !== "1"');
    expect(web).toContain("toggleNativePrimaryEditor()");
    expect(web).toContain("mountNativePrimaryProjectEditor({");
    expect(web).toContain("scene: instance.viewport.scene");
    expect(web).toContain("getCamera: () => instance.viewport.camera");
    expect(web).toContain("canvas: instance.viewport.canvas");
    expect(native).toContain("scene.add(transform.getHelper())");
    expect(native).not.toContain("new THREE.WebGLRenderer");
    expect(native).not.toContain("renderer.render(");
    expect(adapter).toContain("return world.renderer.three");
  });

  it("does not cover the CAD canvas or disable navigation when Model Space first opens", () => {
    expect(native).toContain("host.append(toolbar)");
    expect(native).not.toContain("host.append(input, toolbar)");
    expect(native).toContain('let mode: "select" | "translate" | "rotate" = "select"');
    expect(native).toContain('if (mode === "select" && next !== "select")');
    expect(native).toContain("host.append(input)");
    expect(native).toContain("input.remove()");
    expect(native).toContain("options.getNavigationEnabled()");
    expect(native).toContain("options.setNavigationEnabled(navigationBeforeNativeDrag");
    expect(native).toContain("document.addEventListener(\"pointerdown\", onOutsidePointerDown, true)");
    expect(native).toContain("document.removeEventListener(\"pointerdown\", onOutsidePointerDown, true)");
    expect(native).toContain("setMode(\"select\")");
    expect(native).not.toContain("options.navigationWasEnabled");
  });

  it("preserves DWG/DXF import, CAD text, project restore and Paper Space without cloning or conversion", () => {
    expect(drawing).toContain("new CadReferenceImportController({");
    expect(drawing).toContain("new CadReferenceTextSceneController(");
    expect(drawing).toContain("new FrameLogicProjectPackageController({");
    expect(drawing).toContain("new DrawingWorkspaceController({");
    expect(drawing).toContain("new DrawingProfessionalController({");
    expect(drawing).toContain("new DrawingProductionController({");
    expect(project).toContain('readonly schema: "FRAMELOGIC_PROJECT"');
    expect(project).toContain("readonly assemblies: readonly Assembly[]");
    expect(project).toContain("readonly professionalDrawing: DrawingProfessionalSnapshot");
    expect(native).not.toContain("loadIfc");
    expect(native).not.toContain("parseProjectPackage");
    expect(web).toContain("instance.designModel.pieceInstances.get(id)");
  });

  it("applies real numeric moves/rotations with shared CAD history and reversible fallback", () => {
    expect(web).toContain("instance.updateDesignPieceInstanceTransform(id, transform)");
    expect(web).toContain("instance.cadHistory.capture(ids)");
    expect(web).toContain("instance.cadHistory.recordTransform(label, before, ids)");
    expect(web).toContain("beforeNativeEdit: () => {");
    expect(web).toContain("instance.designTransform.deactivate()");
    expect(web).toContain("instance.designRotate.deactivate()");
    expect(native).toContain('distanceInput.type = "number"');
    expect(native).toContain('editor.begin("rotate")');
    expect(native).toContain('editor.begin("translate")');
    expect(native).toContain("editor.finish(false)");
    expect(native).toContain("options.undo()");
    expect(native).toContain("options.redo()");
    expect(native).toContain("options.onClose()");
  });

  it("retains a diagnostic preview only through an explicit URL and keeps IFC integration deferred", () => {
    expect(web).toContain('viewportFlags.get("threePreview") === "1"');
    expect(web).toContain("toggleNativeProjectPreview()");
    expect(web).toContain("Visor STEP Three.js");
    expect(web).toContain("disposeNativePrimary?.()");
    expect(native).not.toContain("IfcLoader");
  });
});
