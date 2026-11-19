import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Native Three.js editing uses the primary Model Space, not an isolated STEP viewer", () => {
  const main = read("../apps/web/src/features/bim/BimViewport.tsx");
  const native = read("../apps/web/src/features/bim/native/NativePrimaryProjectEditor.ts");
  const actualRenderer = read("../packages/bim/core/src/viewport/ThatOpenViewportAdapter.ts");
  const drawing = read("../packages/bim/core/src/engine/createFrameLogicBimCoreDrawing.ts");
  const packageProject = read("../packages/bim/core/src/project/FrameLogicProjectPackageController.ts");

  it("binds the native gizmo to the one live CAD WebGL scene, active camera and viewport canvas", () => {
    expect(main).toContain('data-native-primary-mode="true"');
    expect(main).toContain("mountNativePrimaryProjectEditor({");
    expect(main).toContain("host: container,");
    expect(main).toContain("scene: instance.viewport.scene");
    expect(main).toContain("getCamera: () => instance.viewport.camera");
    expect(main).toContain("canvas: instance.viewport.canvas");
    expect(native).toContain("scene.add(transform.getHelper())");
    expect(native).toContain("scene.add(rings.group)");
    expect(native).toContain("new TransformControls(currentCamera, input)");
    expect(native).not.toContain("new THREE.WebGLRenderer");
    expect(native).not.toContain("renderer.render(");
    expect(actualRenderer).toContain("getRenderer: () => {");
    expect(actualRenderer).toContain("return world.renderer.three");
  });

  it("persists direct move and rotate in authoritative CAD model, with single history", () => {
    expect(main).toContain("instance.cadHistory.capture(ids)");
    expect(main).toContain("instance.updateDesignPieceInstanceTransform(id, transform)");
    expect(main).toContain("instance.cadHistory.recordTransform(label, before, ids)");
    expect(native).toContain('editor.begin("translate")');
    expect(native).toContain('editor.begin("rotate")');
    expect(native).toContain("editor.preview(pivot.position, pivot.quaternion)");
    expect(native).toContain("editor.preview(drag.worldPosition, quaternion)");
    expect(native).toContain("editor.finish(true)");
    expect(native).toContain("editor.finish(false)");
    expect(native).toContain("options.undo()");
    expect(native).toContain("options.redo()");
    expect(packageProject).toContain("this.options.designModel.pieceInstances.getAll()");
    expect(packageProject).toContain('readonly schema: "FRAMELOGIC_PROJECT"');
  });

  it("preserves existing DWG/DXF reference geometry, drawings and paper space pipeline", () => {
    expect(drawing).toContain("new CadReferenceImportController({");
    expect(drawing).toContain("new CadReferenceTextSceneController(");
    expect(drawing).toContain("new FrameLogicProjectPackageController({");
    expect(drawing).toContain("new DrawingWorkspaceController({");
    expect(drawing).toContain("new DrawingProductionController({");
    expect(drawing).toContain("new DrawingProfessionalController({");
    expect(main).toContain("disposeNativePrimary?.()");
    expect(native).toContain("options.setNavigationEnabled(options.navigationWasEnabled)");
    expect(native).toContain("Volver a CAD");
    expect(native).toContain('mode: "select" | "translate" | "rotate"');
    expect(native).not.toContain("loadIfc");
    expect(native).not.toContain("loadDwg");
    expect(native).not.toContain("parseProjectPackage");
  });

  it("isolates native pointer events without touching original CAD canvas listeners", () => {
    expect(native).toContain("input.dataset.nativePrimaryInput");
    expect(native).toContain("pointer-events:auto");
    expect(native).toContain('input.addEventListener("pointerdown", onPointerDown, true)');
    expect(native).toContain('input.addEventListener("pointerup", onPointerUp)');
    expect(native).toContain('input.removeEventListener("pointerdown", onPointerDown, true)');
    expect(native).toContain('window.addEventListener("keydown", onKeyDown, true)');
    expect(native).toContain('window.removeEventListener("keydown", onKeyDown, true)');
    expect(native).toContain("transform.getHelper().removeFromParent()");
    expect(native).toContain("pivot.removeFromParent()");
    expect(native).toContain("rings.dispose()");
    expect(native).toContain("options.setNavigationEnabled(false)");
  });

  it("does not enable Move automatically and provides independent rotation rings and exact angles", () => {
    expect(native).toContain('let mode: "select" | "translate" | "rotate" = "select"');
    expect(native).toContain('setMode("select")');
    expect(native).toContain('mode === "translate" && !transform.object');
    expect(native).toContain("pickNativeProjectRotationRing(");
    expect(native).toContain("nativeProjectRotationDragAngle(");
    expect(native).toContain("nativeProjectRotationFromStart(");
    expect(native).toContain('for (const axis of ["X", "Y", "Z"] as const)');
    expect(native).toContain("Math.PI / 2");
    expect(native).toContain("finishRotation(false)");
  });
});
