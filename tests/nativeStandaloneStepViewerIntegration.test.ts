import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("Standalone native Three.js test route", () => {
  it("does not mount That Open CAD simultaneously with native WebGL", () => {
    const app = read("../apps/web/src/App.tsx");
    expect(app).toContain('get("threeNative") === "1"');
    expect(app).toContain("nativeViewer ? <NativeStepViewer /> : <BimViewport />");
    expect(app).toContain('import("./features/bim/native/NativeStepViewer")');
    expect(app).toContain('import("./features/bim/BimViewport")');
    expect(app).toContain("if (nativeViewer) return;");
  });

  it("can return to stable CAD and warns before leaving unsaved projects", () => {
    const cad = read("../apps/web/src/features/bim/BimViewport.tsx");
    const native = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    expect(cad).toContain('window.location.assign(`${window.location.pathname}?threeNative=1`)');
    expect(cad).toContain("Guarda primero tu proyecto .flproject");
    expect(native).toContain("Volver al visor actual");
    expect(native).toContain("window.location.assign(window.location.pathname)");
  });

  it("loads STEP with the existing OCCT adapter but owns one native renderer", () => {
    const native = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    expect(native).toContain("new THREE.WebGLRenderer({ antialias: true })");
    expect(native).toContain("new OcctStepGeometryAdapter()");
    expect(native).toContain('targetUnit: "millimeter"');
    expect(native).toContain("includeExactFeatures: false");
    expect(native).toContain("renderer.forceContextLoss()");
    expect(native).not.toContain("createBimCore(");
    expect(native).not.toContain("OrthoPerspectiveCamera");
    expect(native).not.toContain("mountExperimentalNativeThreePreview");
  });

  it("selects STEP meshes by a click without entering edit or CAD navigation mode", () => {
    const native = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    const picker = read("../apps/web/src/features/bim/native/NativeStepSelectionController.ts");
    expect(native).toContain("pickNativeStepMesh(");
    expect(native).toContain("setSelection(selectionRef.current.setSelected(");
    expect(native).toContain('e.type === "pointerup" && pointer.button === 0');
    expect(native).toContain('!pointer.pan && !pointer.moved');
    expect(native).toContain("selectionRef.current.clear()");
    expect(native).toContain('buildNativeStepMeshGroup(document, file.name)');
    expect(native).toContain('data-native-step-selection="true"');
    expect(picker).toContain("raycaster.intersectObject(root, true)");
    expect(picker).toContain("typed.material.emissive.setHex(");
    expect(native).not.toContain("createBimCore(");
  });

  it("releases the active imported model, not merely the original empty group", () => {
    const native = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    expect(native).toContain("disposeNativeStepMeshGroup(runtime.modelRoot)");
    expect(native).toContain("selectionRef.current.dispose()");
    expect(native).toContain("window.removeEventListener(\"keydown\", escapeSelection)");
    expect(native).toContain("selectionRef.current.clear();\n      clearArmedPivot();\n      clearArmedUntil();\n      snapPlacementRef.current = null;\n      setSnapBase(null);\n      moveRef.current.reset();");
    expect(native).toContain("moveGizmoRef.current?.dispose()");
    expect(native).toContain("disposeNativeStepMeshGroup(previous)");
  });

  it("indexes only OpenCascade B-Rep exact snaps for the selected STEP document", () => {
    const native = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    const source = read("../apps/web/src/features/bim/native/NativeStepExactSnapController.ts");
    const model = read("../apps/web/src/features/bim/native/NativeStepViewportModel.ts");
    expect(native).toContain("getOpenCascadeBrepKernel()");
    expect(native).toContain("indexNativeBrepSnapPoints(snapshot)");
    expect(native).toContain("snapIndexRef.current.get(id) ?? []");
    expect(native).toContain("findNativeExactSnap(");
    expect(native).toContain("data-native-brep-snap-marker");
    expect(native).toContain("data-native-brep-snap-status");
    expect(source).toContain("document.modelScale");
    expect(source).toContain("camera.updateMatrixWorld(true)");
    expect(source).toContain("candidate.brepDocumentId !== selectedDocumentId");
    expect(source).not.toContain("geometry.getAttribute");
    expect(source).not.toContain("DERIVED_MESH");
    expect(model).toContain('object.userData["stepProductId"]');
    expect(model).toContain('object.userData["brepDocumentId"]');
    expect(native).toContain("snapIndexRef.current.clear()");
    expect(native).toContain("snapIndexRef.current = stagedSnapIndex");
  });

  it("filters STEP snaps spatially and by visible surface, never claiming exact subshape ownership", () => {
    const native = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    const scope = read("../apps/web/src/features/bim/native/NativeStepPartScope.ts");
    const model = read("../apps/web/src/features/bim/native/NativeStepViewportModel.ts");
    expect(native).toContain("resolveNativeStepPartScope(runtime.modelRoot, mesh)");
    expect(native).toContain("isSnapWithinNativePartScope(candidate.point, partScope)");
    expect(native).toContain("isNativeSnapVisible(candidate.point, camera, runtime.modelRoot)");
    expect(native).toContain("prepareNativeStepTransformTarget(partScope)");
    expect(native).toContain('data-native-transform-target="true"');
    expect(scope).toContain("editable: false");
    expect(scope).not.toContain("@thatopen/components");
    expect(model).toContain('object.userData["stepProductAmbiguous"] = true;');
  });

  it("only enables session-local visual movement for isolated STEP files", () => {
    const viewer = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    const mover = read("../apps/web/src/features/bim/native/NativeStepMoveController.ts");
    const gizmo = read("../apps/web/src/features/bim/native/NativeStepMoveGizmo.ts");
    expect(viewer).toContain("resolveNativeIsolatedStepTarget(scope)");
    expect(viewer).toContain('data-native-move-controls="true"');
    expect(viewer).toContain("moveRef.current.moveBy(target, moveAxis, amount)");
    expect(viewer).toContain("pickNativeMoveAxis(");
    expect(viewer).toContain("nativeMoveAxisDistanceFromPixels(");
    expect(viewer).toContain("moveRef.current.undo()");
    expect(viewer).toContain("moveRef.current.redo()");
    expect(viewer).toContain("getNativeStepBrepWorldTransform(moveTargetRef.current)");
    expect(viewer).toContain("no se modifican ni guardan los STEP originales");
    expect(mover).toContain('parent.userData["nativeStepDocument"] !== true');
    expect(mover).toContain('parent.children.length !== scope.meshes.length');
    expect(gizmo).toContain("new THREE.CylinderGeometry(");
    expect(viewer).not.toContain("createBimCore(");
  });

  it("keeps Ctrl-copies independent and reversible, including Ctrl pressed mid-drag", () => {
    const viewer = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    const mover = read("../apps/web/src/features/bim/native/NativeStepMoveController.ts");
    const model = read("../apps/web/src/features/bim/native/NativeStepViewportModel.ts");
    const scope = read("../apps/web/src/features/bim/native/NativeStepPartScope.ts");
    expect(viewer).toContain("beginDrag(moveTargetRef.current, axis, e.ctrlKey)");
    expect(viewer).toContain("previewDrag(distance, e.ctrlKey)");
    expect(viewer).toContain("moveRef.current.enableCopyDuringDrag()");
    expect(viewer).toContain('outcome?.kind === "COPY"');
    expect(viewer).toContain("focusNativeTarget(outcome.target)");
    expect(viewer).toContain("moveRef.current.copyBy(target, moveAxis, amount)");
    expect(viewer).toContain('onClick={() => moveNumeric(true)}>Copiar');
    expect(mover).toContain("drag.source.group.position.copy(drag.before)");
    expect(mover).toContain('kind: "COPY_UNDONE"');
    expect(mover).toContain("cloneIsolatedStepTarget(");
    expect(scope).toContain('child.userData["nativeStepInstanceId"]');
    expect(model).toContain('group.userData["nativeStepInstanceId"] = group.uuid');
    expect(viewer).not.toContain("createBimCore(");
  });

  it("places native visual copies using exact B-Rep source/destination points", () => {
    const viewer = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    const placement = read("../apps/web/src/features/bim/native/NativeStepSnapPlacement.ts");
    const core = read("../apps/web/src/features/bim/native/NativeStepMoveController.ts");
    expect(viewer).toContain("findNativeCopySnapDestination(");
    expect(viewer).toContain("nativeCopySnapOffset(base, source, destination)");
    expect(viewer).toContain("moveRef.current.copyTo(source, offset)");
    expect(viewer).toContain("Fijar base SNAP para copiar");
    expect(viewer).toContain('data-native-copybase-active="true"');
    expect(placement).toContain("findNativeExactSnap(");
    expect(placement).toContain("sourceBase.sourcePointMm");
    expect(core).toContain("copyTo(target: NativeIsolatedStepTarget, offsetMm: THREE.Vector3)");
    expect(viewer).toContain("Copia por SNAP B-Rep colocada en destino exacto");
  });

  it("arms HASTA on short axis click and projects next reference along selected XYZ axis", () => {
    const viewer = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    const until = read("../apps/web/src/features/bim/native/NativeStepAxisUntil.ts");
    expect(viewer).toContain('const shortClick = e.type === "pointerup"');
    expect(viewer).toContain("armNativeUntil(axis, copy)");
    expect(viewer).toContain("if (wasClick && armedUntilRef.current)");
    expect(viewer).toContain("nativeAxisUntilOffset(armed.pivot, armed.axis, reference.point)");
    expect(viewer).toContain("const copy = armed.copy || e.ctrlKey");
    expect(viewer).toContain("moveRef.current.copyTo(source, offset)");
    expect(viewer).toContain("moveRef.current.moveBy(source, armed.axis");
    expect(viewer).toContain("if (!armed.copy) clearArmedUntil()");
    expect(viewer).toContain("const copy = armed.copy || e.ctrlKey");
    expect(viewer).toContain('data-native-axis-until-active="true"');
    expect(viewer).toContain("Copiar hasta");
    expect(viewer).toContain("Hasta");
    expect(viewer).toContain('data-native-axis-until-surface-marker="true"');
    expect(viewer).toContain("Cara STEP (aprox.)");
    expect(viewer).toContain("clearArmedUntil()");
    expect(until).toContain("findNativeCopySnapDestination(");
    expect(until).toContain("raycaster.intersectObject(root, true)");
    expect(until).toContain('kind: "SURFACE_POINT"');
    expect(until).toContain("dot(NATIVE_MOVE_AXES[axis])");
    expect(viewer).not.toContain("createBimCore(");
  });

  it("moves only the native gizmo centre to an exact B-Rep SNAP, preserving piece geometry", () => {
    const viewer = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    const gizmo = read("../apps/web/src/features/bim/native/NativeStepMoveGizmo.ts");
    const pivot = read("../apps/web/src/features/bim/native/NativeStepGizmoPivot.ts");
    expect(viewer).toContain("pickNativeMoveCenter(");
    expect(viewer).toContain("armNativePivot()");
    expect(viewer).toContain("if (wasClick && armedPivotRef.current)");
    expect(viewer).toContain("const hit = findPivotSnapAt(e.clientX, e.clientY)");
    expect(viewer).toContain("placeNativePivot(hit.point)");
    expect(viewer).toContain("setNativeStepGizmoPivot(scope, point)");
    expect(viewer).toContain("getNativeStepGizmoPivot(scope)");
    expect(viewer).toContain("resetNativeStepGizmoPivot(scope)");
    expect(viewer).toContain('data-native-pivot-tools="true"');
    expect(viewer).toContain("Restablecer centro");
    expect(viewer).toContain("Centro XYZ reubicado con SNAP exacto");
    expect(viewer).toContain("clearArmedPivot()");
    expect(gizmo).toContain('centerHandle.userData["nativeMovePivotCenter"] = true');
    expect(gizmo).toContain("getNativeMoveCenterScreenPosition(gizmo, camera, rect)");
    expect(gizmo).toContain("CENTER_MIN_HIT_RADIUS_PX");
    expect(pivot).toContain('const OFFSET_KEY = "nativeGizmoPivotOffsetMm"');
    expect(pivot).not.toContain("updateTransform(");
    expect(viewer).not.toContain("createBimCore(");
  });

  it("gives the highlighted native XYZ centre priority over coincident SNAP markers", () => {
    const viewer = read("../apps/web/src/features/bim/native/NativeStepViewer.tsx");
    const gizmo = read("../apps/web/src/features/bim/native/NativeStepMoveGizmo.ts");
    expect(viewer).toContain("updateCenterHoverFromPointer(e)");
    expect(viewer).toContain("setNativeMoveCenterHovered(gizmo, hovered)");
    expect(viewer).toContain("canvas.style.cursor = hovered");
    expect(viewer).toContain('data-native-center-hover-marker="true"');
    expect(viewer).toContain('data-native-brep-snap-marker="true"');
    expect(viewer).toContain("snap && !centerCoversSnap");
    expect(viewer).toContain("isNativeSnapCoveredByMoveCenter(");
    expect(viewer).toContain("pointerEvents: \"none\"");
    expect(viewer).toContain("Centro XYZ · clic para reubicar el pivote (prioridad sobre SNAP)");
    expect(gizmo).toContain("centerHandle.renderOrder = 100");
    expect(gizmo).toContain("CENTER_HOVER_COLOR");
    expect(gizmo).toContain("CENTER_MIN_HIT_RADIUS_PX");
  });

  it("keeps perspective blocked and existing CAD drawings untouched", () => {
    const engine = read("../packages/bim/core/src/engine/createBimCore.ts");
    const drawing = read("../packages/bim/core/src/drawing/AssemblyViewShadingRenderer.ts");
    expect(engine).toContain('if (getCameraProjectionMode() === "ORTHOGRAPHIC")');
    expect(drawing).toContain("new THREE.OrthographicCamera(");
  });
});
