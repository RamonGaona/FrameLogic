import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  NativeStepMoveController,
  getNativeStepBrepWorldTransform,
  resolveNativeIsolatedStepTarget,
} from "./NativeStepMoveController";
import {
  createNativeRotateGizmo,
  nativeRotationAngleToReference,
  nativeRotationDegreesFromPixels,
  nativeRotationStartReference,
  pickNativeRotateRing,
} from "./NativeStepRotateGizmo";
import {
  getNativeMoveCenterScreenPosition,
  pickNativeMoveCenter,
  updateNativeMoveGizmoScreenScale,
} from "./NativeStepMoveGizmo";
import {
  getNativeStepGizmoPivot,
  setNativeStepGizmoPivot,
} from "./NativeStepGizmoPivot";
import { resolveNativeStepPartScope } from "./NativeStepPartScope";
import {
  buildNativeStepMeshGroup,
  disposeNativeStepMeshGroup,
} from "./NativeStepViewportModel";

function setup() {
  const root = new THREE.Group();
  const group = buildNativeStepMeshGroup({
    brepDocumentId: "rot-exact",
    meshes: [{
      id: "plate",
      positions: new Float32Array([0, 0, 0, 20, 0, 0, 0, 10, 0]),
      indices: new Uint32Array([0, 1, 2]),
    }],
    products: [{ id: "plate1", name: "Plate", geometryIds: ["plate"], childIds: [] }],
  }, "rotation.step");
  root.add(group);
  const mesh = group.children[0] as THREE.Mesh;
  const scope = resolveNativeStepPartScope(root, mesh)!;
  const target = resolveNativeIsolatedStepTarget(scope)!;
  return { root, group, mesh, scope, target };
}

function camera() {
  const result = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 2000);
  result.position.set(0, 0, 500);
  result.lookAt(0, 0, 0);
  result.updateProjectionMatrix();
  result.updateMatrixWorld(true);
  return result;
}

describe("Three.js STEP rotation gizmo, parity with move gizmo", () => {
  it("creates independent XYZ rings and a hoverable/pickable centre at fixed screen size", () => {
    const gizmo = createNativeRotateGizmo(new THREE.Vector3(0, 0, 0), 200);
    expect(gizmo.group.children).toHaveLength(4);
    const c = camera();
    const rect = { left: 0, top: 0, width: 600, height: 600 };
    expect(updateNativeMoveGizmoScreenScale(gizmo, c, 600, 600)).toBe(true);
    const center = getNativeMoveCenterScreenPosition(gizmo, c, rect)!;
    expect(pickNativeMoveCenter(gizmo, c, center.x, center.y, rect)).toBe(true);
    const ring = gizmo.group.children.find(
      (object) => object.userData["nativeRotateAxis"] === "Z",
    ) as THREE.Mesh;
    const radius = (ring.geometry as THREE.TorusGeometry).parameters.radius
      * gizmo.group.scale.x;
    const point = new THREE.Vector3(radius / Math.SQRT2, radius / Math.SQRT2, 0).project(c);
    const picked = pickNativeRotateRing(gizmo, c,
      (point.x + 1) * 300, (1 - point.y) * 300, rect);
    expect(picked?.axis).toBe("Z");
    // A click slightly outside the visible thin ring still reaches its
    // transparent hit target, making mouse selection practical.
    const offsetPx = 5;
    const pickedNear = pickNativeRotateRing(gizmo, c,
      (point.x + 1) * 300 + offsetPx / Math.SQRT2,
      (1 - point.y) * 300 - offsetPx / Math.SQRT2, rect);
    expect(pickedNear?.axis).toBe("Z");
    const previous = gizmo.group.scale.x;
    c.zoom = 4;
    c.updateProjectionMatrix();
    updateNativeMoveGizmoScreenScale(gizmo, c, 600, 600);
    expect(gizmo.group.scale.x).toBeCloseTo(previous / 4);
    gizmo.dispose();
  });

  it("computes signed shortest rotation to exact reference and rejects on-axis points", () => {
    const pivot = new THREE.Vector3(0, 0, 0);
    expect(nativeRotationAngleToReference(
      pivot, "Z", new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 10, 0),
    )).toBeCloseTo(90);
    expect(nativeRotationAngleToReference(
      pivot, "Z", new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -10, 0),
    )).toBeCloseTo(-90);
    expect(nativeRotationAngleToReference(
      pivot, "Z", new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 10),
    )).toBeNull();
    expect(nativeRotationStartReference(pivot, "X").toArray()).toEqual([0, 1, 0]);
    const c = camera();
    const rect = { left: 0, top: 0, width: 400, height: 400 };
    expect(nativeRotationDegreesFromPixels(
      c, pivot, "Z", 300, 200, 200, 100, rect,
    )).toBeCloseTo(90);
  });

  it("rotates a STEP around its relocated centre with one Undo/Redo transaction", () => {
    const f = setup();
    const history = new NativeStepMoveController();
    const pivot = new THREE.Vector3(5, 2, 0);
    expect(setNativeStepGizmoPivot(f.scope, pivot)).toBe(true);
    const gpu = Array.from((f.mesh.geometry as THREE.BufferGeometry)
      .getAttribute("position").array);
    expect(history.rotateBy(f.target, "Z", 90, pivot)).toBe(true);
    expect(f.group.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1), Math.PI / 2,
    ))).toBeCloseTo(0, 6);
    expect(getNativeStepGizmoPivot(resolveNativeStepPartScope(f.root, f.mesh)!)
      .distanceTo(pivot)).toBeLessThan(1e-7);
    expect(Array.from((f.mesh.geometry as THREE.BufferGeometry)
      .getAttribute("position").array)).toEqual(gpu);
    const rotatedBrep = new THREE.Vector3(20, 0, 0)
      .applyMatrix4(getNativeStepBrepWorldTransform(f.target)!);
    expect(rotatedBrep.x).toBeCloseTo(7);
    expect(rotatedBrep.y).toBeCloseTo(17);
    expect(history.undo()).toBe(true);
    expect(f.group.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 7);
    expect(history.redo()).toBe(true);
    expect(f.group.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(Math.PI / 2);
    history.reset();
    disposeNativeStepMeshGroup(f.root);
  });

  it("Ctrl pressed during rotation copies independently and cancellation cleans preview", () => {
    const f = setup();
    const history = new NativeStepMoveController();
    const pivot = getNativeStepGizmoPivot(f.scope);
    expect(history.beginRotation(f.target, "Z", pivot)).toBe(true);
    expect(history.previewRotation(35)).toBe(true);
    expect(history.enableCopyDuringRotation()).toBe(true);
    expect(f.group.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0);
    expect(history.previewRotation(90)).toBe(true);
    expect(history.endRotation(true)).toBe(true);
    expect(history.lastResult?.kind).toBe("COPY");
    expect(f.root.children).toHaveLength(2);
    const copy = history.lastResult!.target;
    expect(copy.group.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(Math.PI / 2);
    expect(f.group.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0);
    expect(history.undo()).toBe(true);
    expect(f.root.children).toHaveLength(1);
    expect(history.redo()).toBe(true);
    expect(f.root.children).toHaveLength(2);
    expect(history.beginRotation(f.target, "X", pivot, true)).toBe(true);
    expect(history.previewRotation(45)).toBe(true);
    expect(history.endRotation(false)).toBe(false);
    expect(f.root.children).toHaveLength(2);
    history.reset();
    disposeNativeStepMeshGroup(f.root);
  });

  it("keeps move and rotate actions ordered in the same undo/redo history", () => {
    const f = setup();
    const history = new NativeStepMoveController();
    const pivot = getNativeStepGizmoPivot(f.scope);
    expect(history.moveBy(f.target, "X", 30)).toBe(true);
    expect(history.rotateBy(f.target, "Z", 90, pivot.clone().add(new THREE.Vector3(30, 0, 0))))
      .toBe(true);
    expect(history.undo()).toBe(true);
    expect(f.group.position.x).toBe(30);
    expect(f.group.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0);
    expect(history.undo()).toBe(true);
    expect(f.group.position.x).toBe(0);
    expect(history.redo()).toBe(true);
    expect(history.redo()).toBe(true);
    expect(f.group.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(Math.PI / 2);
    history.reset();
    disposeNativeStepMeshGroup(f.root);
  });
});
