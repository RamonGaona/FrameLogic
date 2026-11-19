import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Native project viewer to authoritative CAD command integration", () => {
  const web = read("../apps/web/src/features/bim/BimViewport.tsx");
  const preview = read("../packages/bim/core/src/viewport/ExperimentalNativeThreePreview.ts");
  const picker = read("../packages/bim/core/src/viewport/NativeProjectPiecePicker.ts");
  const core = read("../packages/bim/core/src/engine/createBimCore.ts");
  const project = read("../packages/bim/core/src/project/FrameLogicProjectPackageController.ts");

  it("gets real editable PieceInstance roots from DesignScene and selects via DesignSelection", () => {
    expect(web).toContain("getInstanceTargets: () => instance.designScene.getInstanceEntries()");
    expect(web).toContain("instance.designSelection.selectSingle(id)");
    expect(web).toContain("instance.designSelection.isSelected(id)");
    expect(web).toContain("getSelectedInstanceIds: () => instance.designSelection.getSelectedIds()");
    expect(preview).toContain("pickNativeProjectPieceInstance(");
    expect(picker).toContain("ray.intersectObjects(Array.from(roots.keys()), true)");
    expect(picker).toContain("isVisibleThrough(hit.object, current)");
    expect(picker).not.toContain("userData.nativeStepInstanceId");
  });

  it("dispatches move/rotate/undo/redo through real CAD commands, not visual Three.js transforms", () => {
    expect(web).toContain("onStartMove: () => instance.startMoveCommand()");
    expect(web).toContain("onStartRotate: () => instance.startRotateCommand()");
    expect(web).toContain("onUndo: () => instance.undoCadAction()");
    expect(web).toContain("onRedo: () => instance.redoCadAction()");
    expect(core).toContain("return cadHistory.undo()");
    expect(core).toContain("return cadHistory.redo()");
    expect(core).toContain("cadCommandManager.start(moveCommand)");
    expect(core).toContain("hasCadEntities ? rotateCadEntityCommand : rotateCommand");
    expect(preview).not.toContain(".position.add(");
    expect(preview).not.toContain(".quaternion.multiply(");
    expect(preview).not.toContain("nativeStepInstanceId");
  });

  it("retains existing .flproject and assembly serialization without a new format or IFC dependency", () => {
    expect(project).toContain('readonly schema: "FRAMELOGIC_PROJECT"');
    expect(project).toContain("readonly pieceInstances: readonly PieceInstance[]");
    expect(project).toContain("readonly assemblies: readonly Assembly[]");
    expect(project).toContain("readonly geometrySources: readonly ProjectGeometrySource[]");
    expect(project).toContain("readonly professionalDrawing: DrawingProfessionalSnapshot");
    expect(web).toContain("viewport: instance.viewport");
    expect(preview).toContain("renderer.render(options.viewport.scene, camera)");
    expect(preview).not.toContain("loadIfc");
    expect(preview).not.toContain("IFCLoader");
    expect(preview).not.toContain("importStep");
  });

  it("does not start pointer selection for the previous diagnostic Three.js preview", () => {
    expect(preview).toContain("const canSelect = Boolean(options.getInstanceTargets && options.onSelectInstance)");
    expect(preview).toContain("renderer.domElement.addEventListener(\"pointerdown\", onPointerDown)");
    expect(preview).toContain("renderer.domElement.removeEventListener(\"pointerup\", onPointerUp)");
    expect(preview).toContain('pointer-events:none');
    expect(preview).toContain("if (frame !== null) window.cancelAnimationFrame(frame)");
    expect(preview).toContain("renderer.forceContextLoss()");
  });

  it("does not modify IFC, CAD references or Paper Space commands while selecting pieces", () => {
    expect(picker).not.toContain("CadReference");
    expect(picker).not.toContain("Ifc");
    expect(web).toContain("<FrameLogicSettingsWindow />");
    expect(core).toContain("OBC.FragmentsManager");
    expect(core).toContain("OBC.IfcLoader");
  });
});
