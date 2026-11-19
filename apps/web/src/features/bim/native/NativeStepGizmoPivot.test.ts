import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  getNativeStepGizmoPivot,
  resetNativeStepGizmoPivot,
  setNativeStepGizmoPivot,
} from "./NativeStepGizmoPivot";
import { resolveNativeStepPartScope } from "./NativeStepPartScope";
import {
  NativeStepMoveController,
  resolveNativeIsolatedStepTarget,
} from "./NativeStepMoveController";
import {
  buildNativeStepMeshGroup,
  disposeNativeStepMeshGroup,
} from "./NativeStepViewportModel";

function setup() {
  const root = new THREE.Group();
  const group = buildNativeStepMeshGroup({
    brepDocumentId: "exact:1",
    meshes: [{
      id: "profile",
      positions: new Float32Array([0, 0, 0, 100, 0, 0, 0, 100, 0]),
      indices: new Uint32Array([0, 1, 2]),
    }],
    products: [{
      id: "P1", name: "Profile",
      geometryIds: ["profile"], childIds: [],
    }],
  }, "profile.step");
  root.add(group);
  const mesh = group.children[0] as THREE.Mesh;
  const scope = resolveNativeStepPartScope(root, mesh)!;
  const target = resolveNativeIsolatedStepTarget(scope)!;
  return { root, group, mesh, scope, target };
}

describe("native gizmo centre can relocate independently of STEP geometry", () => {
  it("changes only the gizmo pivot using an exact world SNAP, not the source mesh", () => {
    const f = setup();
    const matrix = f.mesh.matrixWorld.clone();
    const gpuPositions = Array.from((f.mesh.geometry as THREE.BufferGeometry)
      .getAttribute("position").array);
    const before = f.scope.pivot.clone();
    expect(getNativeStepGizmoPivot(f.scope).equals(before)).toBe(true);

    expect(setNativeStepGizmoPivot(f.scope, new THREE.Vector3(300, 20, 12))).toBe(true);
    expect(getNativeStepGizmoPivot(f.scope).toArray()).toEqual([300, 20, 12]);
    expect(f.group.position.toArray()).toEqual([0, 0, 0]);
    expect(f.mesh.matrixWorld.toArray()).toEqual(matrix.toArray());
    expect(Array.from((f.mesh.geometry as THREE.BufferGeometry)
      .getAttribute("position").array)).toEqual(gpuPositions);

    expect(resetNativeStepGizmoPivot(f.scope)).toBe(true);
    expect(getNativeStepGizmoPivot(f.scope).toArray()).toEqual(before.toArray());
    disposeNativeStepMeshGroup(f.root);
  });

  it("the displaced pivot follows a subsequent MOVE and Undo/Redo exactly", () => {
    const f = setup();
    expect(setNativeStepGizmoPivot(f.scope, new THREE.Vector3(15, 42, 0))).toBe(true);
    const history = new NativeStepMoveController();
    expect(history.canUndo).toBe(false);
    expect(history.moveBy(f.target, "X", 400)).toBe(true);
    const updated = resolveNativeStepPartScope(f.root, f.mesh)!;
    expect(getNativeStepGizmoPivot(updated).toArray()).toEqual([415, 42, 0]);
    expect(history.undo()).toBe(true);
    const undone = resolveNativeStepPartScope(f.root, f.mesh)!;
    expect(getNativeStepGizmoPivot(undone).toArray()).toEqual([15, 42, 0]);
    expect(history.redo()).toBe(true);
    expect(getNativeStepGizmoPivot(resolveNativeStepPartScope(f.root, f.mesh)!)
      .toArray()).toEqual([415, 42, 0]);
    history.reset();
    disposeNativeStepMeshGroup(f.root);
  });

  it("Ctrl-copy retains the source pivot offset but never moves its geometry", () => {
    const f = setup();
    expect(setNativeStepGizmoPivot(f.scope, new THREE.Vector3(15, 12, 8))).toBe(true);
    const history = new NativeStepMoveController();
    expect(history.copyTo(f.target, new THREE.Vector3(250, 0, 0))).toBe(true);
    const copy = history.lastResult!.target;
    expect(f.group.position.x).toBe(0);
    const sourcePivot = getNativeStepGizmoPivot(resolveNativeStepPartScope(f.root, f.mesh)!);
    const copiedScope = resolveNativeStepPartScope(f.root, copy.meshes[0])!;
    const copyPivot = getNativeStepGizmoPivot(copiedScope);
    expect(sourcePivot.toArray()).toEqual([15, 12, 8]);
    expect(copyPivot.toArray()).toEqual([265, 12, 8]);
    expect(copy.group.userData["nativeGizmoPivotOffsetMm"]).toEqual(
      f.group.userData["nativeGizmoPivotOffsetMm"],
    );
    expect(resetNativeStepGizmoPivot(copiedScope)).toBe(true);
    expect(getNativeStepGizmoPivot(resolveNativeStepPartScope(f.root, f.mesh)!)
      .toArray()).toEqual([15, 12, 8]);
    expect(history.undo()).toBe(true);
    expect(f.root.children).toHaveLength(1);
    expect(history.redo()).toBe(true);
    history.reset();
    disposeNativeStepMeshGroup(f.root);
  });

  it("refuses invalid coordinates, incorrect document ownership and huge offsets", () => {
    const f = setup();
    expect(setNativeStepGizmoPivot(f.scope, new THREE.Vector3(Infinity, 0, 0)))
      .toBe(false);
    expect(setNativeStepGizmoPivot(f.scope, new THREE.Vector3(1_000_100, 0, 0)))
      .toBe(false);
    const bogus = { ...f.scope, instanceId: "other" };
    expect(setNativeStepGizmoPivot(bogus, new THREE.Vector3(1, 2, 3))).toBe(false);
    expect(getNativeStepGizmoPivot(bogus).toArray()).toEqual(bogus.pivot.toArray());
    expect(f.group.userData["nativeGizmoPivotOffsetMm"]).toBeUndefined();
    disposeNativeStepMeshGroup(f.root);
  });

  it("is a visual pivot setting, not an entry in geometry copy/move history", () => {
    const f = setup();
    const history = new NativeStepMoveController();
    expect(setNativeStepGizmoPivot(f.scope, new THREE.Vector3(0, 0, 0))).toBe(true);
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(f.root.children).toHaveLength(1);
    disposeNativeStepMeshGroup(f.root);
  });
});
