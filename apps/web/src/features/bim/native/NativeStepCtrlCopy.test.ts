import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  NativeStepMoveController,
  resolveNativeIsolatedStepTarget,
  getNativeStepBrepWorldTransform,
} from "./NativeStepMoveController";
import { NativeStepSelectionController } from "./NativeStepSelectionController";
import { resolveNativeStepPartScope } from "./NativeStepPartScope";
import {
  buildNativeStepMeshGroup,
  disposeNativeStepMeshGroup,
} from "./NativeStepViewportModel";

function createSource(root: THREE.Group, sourceId: string, productId = "PLACA") {
  const group = buildNativeStepMeshGroup({
    brepDocumentId: sourceId,
    meshes: [{
      id: "mesh-1",
      positions: new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    }],
    products: [{
      id: productId, name: "Placa base",
      geometryIds: ["mesh-1"], childIds: [],
    }],
  }, sourceId + ".step");
  root.add(group);
  const selected = group.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  const scope = resolveNativeStepPartScope(root, selected);
  const target = resolveNativeIsolatedStepTarget(scope);
  expect(target).not.toBeNull();
  return { group, selected, target: target! };
}

describe("Ctrl-copy via native Three.js gizmo", () => {
  it("Ctrl+drag copies independently, never moves the original, undo removes and redo restores", () => {
    const root = new THREE.Group();
    const original = createSource(root, "step-A");
    const other = createSource(root, "step-B");
    const originalCoords = original.selected.geometry.attributes.position.array.slice();
    const history = new NativeStepMoveController();

    expect(history.beginDrag(original.target, "X", true)).toBe(true);
    expect(root.children).toHaveLength(3);
    expect(history.isCopying).toBe(true);
    expect(history.previewDrag(250)).toBe(true);
    const copy = history.activeDragTarget!;
    expect(copy.group).not.toBe(original.group);
    expect(copy.group.position.x).toBe(250);
    expect(original.group.position.toArray()).toEqual([0, 0, 0]);
    expect(other.group.position.toArray()).toEqual([0, 0, 0]);
    expect(history.endDrag(true)).toBe(true);
    expect(history.lastResult?.kind).toBe("COPY");
    expect(history.lastResult?.target.group).toBe(copy.group);
    expect(copy.group.userData["nativeVisualCopy"]).toBe(true);
    expect(copy.group.userData["brepDocumentId"]).toBe("step-A");
    expect(copy.meshes[0].geometry).not.toBe(original.selected.geometry);
    expect(copy.meshes[0].material).not.toBe(original.selected.material);
    expect(copy.meshes[0].geometry.attributes.position.array).toEqual(originalCoords);

    const originalScope = resolveNativeStepPartScope(root, original.selected)!;
    const copyScope = resolveNativeStepPartScope(root, copy.meshes[0])!;
    expect(originalScope.meshes).toEqual([original.selected]);
    expect(copyScope.meshes).toEqual([copy.meshes[0]]);
    expect(copyScope.key).not.toBe(originalScope.key);
    expect(resolveNativeIsolatedStepTarget(copyScope)?.group).toBe(copy.group);

    expect(history.undo()).toBe(true);
    expect(history.lastResult?.kind).toBe("COPY_UNDONE");
    expect(root.children).toHaveLength(2);
    expect(copy.group.parent).toBeNull();
    expect(original.group.position.x).toBe(0);
    expect(history.redo()).toBe(true);
    expect(root.children).toHaveLength(3);
    expect(copy.group.position.x).toBe(250);
    expect(original.group.position.x).toBe(0);
    history.reset();
    disposeNativeStepMeshGroup(root);
  });

  it("pressing Ctrl after ordinary drag begins restores original and latches copy mode", () => {
    const root = new THREE.Group();
    const original = createSource(root, "step-A");
    original.group.position.set(15, 0, 5);
    const history = new NativeStepMoveController();
    expect(history.beginDrag(original.target, "Y")).toBe(true);
    expect(history.previewDrag(90)).toBe(true);
    expect(original.group.position.y).toBe(90);
    expect(history.enableCopyDuringDrag()).toBe(true);
    expect(original.group.position.toArray()).toEqual([15, 0, 5]);
    // Releasing Ctrl does not revert the user's explicit copy intention.
    expect(history.previewDrag(125, false)).toBe(true);
    expect(history.endDrag(true)).toBe(true);
    const copy = history.lastResult?.target;
    expect(history.lastResult?.kind).toBe("COPY");
    expect(copy?.group.position.toArray()).toEqual([15, 125, 5]);
    expect(original.group.position.toArray()).toEqual([15, 0, 5]);
    history.reset();
    disposeNativeStepMeshGroup(root);
  });

  it("Escape cancellation removes the preview copy and restores the original", () => {
    const root = new THREE.Group();
    const original = createSource(root, "step-A");
    const history = new NativeStepMoveController();
    history.beginDrag(original.target, "Z", true);
    const preview = history.activeDragTarget!;
    const dispose = vi.spyOn(preview.meshes[0].geometry, "dispose");
    history.previewDrag(100);
    expect(history.endDrag(false)).toBe(false);
    expect(root.children).toHaveLength(1);
    expect(original.group.position.toArray()).toEqual([0, 0, 0]);
    expect(dispose).toHaveBeenCalledOnce();
    expect(history.canUndo).toBe(false);
    disposeNativeStepMeshGroup(root);
  });

  it("numeric copy and repeated copy keep unique selections and independent B-Rep projection", () => {
    const root = new THREE.Group();
    const original = createSource(root, "step-A");
    const history = new NativeStepMoveController();
    expect(history.copyBy(original.target, "X", 100)).toBe(true);
    const first = history.lastResult!.target;
    const exactSource = new THREE.Vector3(5, 0, 0);
    expect(exactSource.clone().applyMatrix4(
      getNativeStepBrepWorldTransform(first)!,
    ).x).toBe(105);
    expect(exactSource.x).toBe(5);
    expect(history.copyBy(first, "X", 60)).toBe(true);
    const second = history.lastResult!.target;
    expect(second.group.position.x).toBe(160);
    expect(first.group.position.x).toBe(100);
    expect(original.group.position.x).toBe(0);
    expect(root.children).toHaveLength(3);

    history.undo();
    expect(root.children).toHaveLength(2);
    history.undo();
    expect(root.children).toHaveLength(1);
    history.redo();
    history.redo();
    expect(root.children).toHaveLength(3);
    expect(second.group.position.x).toBe(160);
    expect(original.group.position.x).toBe(0);
    history.reset();
    disposeNativeStepMeshGroup(root);
  });

  it("copies unselected material colors even when the original is highlighted", () => {
    const root = new THREE.Group();
    const original = createSource(root, "step-A");
    original.selected.material.emissive.setRGB(0.1, 0.2, 0.3);
    original.selected.material.emissiveIntensity = 0.4;
    const expected = original.selected.material.emissive.clone();
    const selection = new NativeStepSelectionController();
    selection.setSelected(original.selected);
    const history = new NativeStepMoveController();
    history.copyBy(original.target, "X", 30);
    const copy = history.lastResult!.target.meshes[0] as THREE.Mesh<
      THREE.BufferGeometry, THREE.MeshStandardMaterial
    >;
    expect(copy.material.emissive.toArray()).toEqual(expected.toArray());
    expect(copy.material.emissiveIntensity).toBe(0.4);
    selection.setSelected(copy);
    selection.clear();
    expect(copy.material.emissive.toArray()).toEqual(expected.toArray());
    // Selecting the clone restores the original's unselected material.
    expect(original.selected.material.emissive.equals(expected)).toBe(true);
    selection.dispose();
    history.reset();
    disposeNativeStepMeshGroup(root);
  });

  it("disposes undone copy assets when a new move invalidates redo", () => {
    const root = new THREE.Group();
    const original = createSource(root, "step-A");
    const history = new NativeStepMoveController();
    history.copyBy(original.target, "Y", 75);
    const copy = history.lastResult!.target;
    history.undo();
    const dispose = vi.spyOn(copy.meshes[0].geometry, "dispose");
    expect(history.moveBy(original.target, "Z", 20)).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(dispose).toHaveBeenCalledOnce();
    expect(original.group.position.z).toBe(20);
    history.reset();
    disposeNativeStepMeshGroup(root);
  });
});
