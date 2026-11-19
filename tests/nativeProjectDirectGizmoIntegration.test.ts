import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Native Three.js shared-project gizmo direct edit regression", () => {
  const preview = read("../packages/bim/core/src/viewport/ExperimentalNativeThreePreview.ts");
  const web = read("../apps/web/src/features/bim/BimViewport.tsx");
  const bridge = read("../apps/web/src/features/bim/native/NativeProjectCadEditBridge.ts");
  const project = read("../packages/bim/core/src/project/FrameLogicProjectPackageController.ts");

  it("creates interactive Three.js TransformControls bound to the inspector canvas, not the main canvas", () => {
    expect(preview).toContain("new TransformControls(camera, renderer.domElement)");
    expect(preview).toContain("gizmoScene.add(gizmo.getHelper())");
    expect(preview).toContain("gizmo.setMode(nativeMode)");
    expect(preview).toContain("renderer.clearDepth()");
    expect(preview).toContain("renderer.render(gizmoScene, camera)");
    expect(preview).toContain("nativeEdit.begin(nativeMode)");
    expect(preview).toContain("nativeEdit.preview(gizmoPivot.position, gizmoPivot.quaternion)");
    expect(preview).toContain("nativeEdit.finish(true)");
    expect(preview).toContain("selectionGesture = null");
    expect(preview).toContain("gizmoPointerGesture = true");
    expect(preview).toContain("gizmo?.dispose()");
  });

  it("commits to real CAD model and CAD history instead of a temporary THREE.Group", () => {
    expect(web).toContain("nativeEdit: nativeCadEdit");
    expect(web).toContain("instance.designModel.pieceInstances.get(id)");
    expect(web).toContain("instance.designModel.isPieceLocked?.(id) !== true");
    expect(web).toContain("instance.designScene.getInstanceObject(id)");
    expect(web).toContain("instance.cadHistory.capture(ids)");
    expect(web).toContain("instance.updateDesignPieceInstanceTransform(id, transform)");
    expect(web).toContain("instance.cadHistory.recordTransform(label, before, ids)");
    expect(web).toContain("instance.cancelActiveCadCommand()");
    expect(bridge).toContain('active.mode === "translate" ? "MOVE" : "ROTATE"');
    expect(bridge).toContain("this.dependencies.apply(active.id, initial)");
    expect(project).toContain("this.options.designModel.pieceInstances.getAll()");
    expect(preview).not.toContain("nativeStepInstanceId");
  });

  it("rolls back edits on Escape, window blur or disposal without changing .flproject schema", () => {
    expect(preview).toContain('event.key !== "Escape"');
    expect(preview).toContain('window.addEventListener("keydown", handleNativeEscape, true)');
    expect(preview).toContain('window.addEventListener("blur", handleNativeBlur)');
    expect(preview).toContain("cancelNativeDrag()");
    expect(web).toContain("nativeCadEdit.finish(false)");
    expect(bridge).toContain("if (!commit)");
    expect(project).toContain('readonly schema: "FRAMELOGIC_PROJECT"');
    expect(project).toContain("readonly pieceInstances: readonly PieceInstance[]");
  });

  it("preserves diagnostic read-only mode and defers IFC", () => {
    expect(preview).toContain("const nativeEdit = canSelect ? options.nativeEdit : undefined");
    expect(preview).toContain('pointer-events:none');
    expect(web).toContain("Vista Three.js del proyecto");
    expect(preview).not.toContain("loadIfc");
    expect(bridge).not.toContain("Ifc");
    expect(preview).toContain("options.onClose?.()");
  });
});
