import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  getNativeStepBrepWorldTransform,
  NativeStepMoveController,
  resolveNativeIsolatedStepTarget,
} from "./NativeStepMoveController";
import { resolveNativeStepPartScope } from "./NativeStepPartScope";
import {
  buildNativeStepMeshGroup,
  disposeNativeStepMeshGroup,
} from "./NativeStepViewportModel";

function doc(
  id: string,
  productIds: readonly string[],
  documentId: string = id,
) {
  const meshes = productIds.map((_, index) => ({
    id: `m${index}`,
    positions: new Float32Array([index * 4, 0, 0, index * 4 + 2, 0, 0, index * 4, 2, 0]),
    indices: new Uint32Array([0, 1, 2]),
  }));
  const group = buildNativeStepMeshGroup({
    meshes,
    brepDocumentId: documentId,
    products: [...new Set(productIds)].map((productId) => ({
      id: productId,
      name: productId,
      geometryIds: meshes.filter((_, i) => productIds[i] === productId).map((mesh) => mesh.id),
      childIds: [],
    })),
  }, `${id}.step`);
  return group;
}

describe("Isolated STEP document visual translation controller", () => {
  it("allows full single-product STEP file and never affects other file groups", () => {
    const root = new THREE.Group();
    const first = doc("first", ["plate", "plate"], "brep-A");
    const second = doc("second", ["plate"], "brep-B");
    root.add(first, second);
    const selected = first.children[0] as THREE.Mesh;
    const scope = resolveNativeStepPartScope(root, selected);
    const target = resolveNativeIsolatedStepTarget(scope);
    expect(target).not.toBeNull();
    expect(target?.meshes).toHaveLength(2);
    const moves = new NativeStepMoveController();
    expect(moves.moveBy(target!, "X", 125)).toBe(true);
    expect(first.position.x).toBe(125);
    expect(second.position.toArray()).toEqual([0, 0, 0]);
    expect(moves.canUndo).toBe(true);
    const newScope = resolveNativeStepPartScope(root, selected);
    expect(newScope?.pivot.x).toBeGreaterThan(125);
    expect(moves.undo()).toBe(true);
    expect(first.position.x).toBe(0);
    expect(moves.canRedo).toBe(true);
    expect(moves.redo()).toBe(true);
    expect(first.position.x).toBe(125);
    moves.reset();
    expect(moves.canUndo).toBe(false);
    disposeNativeStepMeshGroup(root);
  });

  it("blocks multi-product STEP, unknown identity, mixed ownership and missing B-Rep", () => {
    const root = new THREE.Group();
    const multi = doc("multi", ["beam", "plate"]);
    root.add(multi);
    expect(resolveNativeIsolatedStepTarget(
      resolveNativeStepPartScope(root, multi.children[0] as THREE.Mesh),
    )).toBeNull();

    const unknown = doc("unknown", ["beam"]);
    const mesh = unknown.children[0] as THREE.Mesh;
    mesh.userData["stepProductId"] = null;
    root.add(unknown);
    expect(resolveNativeIsolatedStepTarget(resolveNativeStepPartScope(root, mesh))).toBeNull();

    const alien = doc("alien", ["beam"]);
    root.add(alien);
    (alien.children[0] as THREE.Mesh).userData["brepDocumentId"] = "other";
    expect(resolveNativeIsolatedStepTarget(
      resolveNativeStepPartScope(root, alien.children[0] as THREE.Mesh),
    )).toBeNull();
    disposeNativeStepMeshGroup(root);
  });

  it("commits axis previews atomically, cancels with Escape and ignores NaN", () => {
    const root = new THREE.Group();
    const group = doc("single", ["plate"]);
    root.add(group);
    const target = resolveNativeIsolatedStepTarget(
      resolveNativeStepPartScope(root, group.children[0] as THREE.Mesh),
    )!;
    const moves = new NativeStepMoveController();
    expect(moves.beginDrag(target, "Z")).toBe(true);
    expect(moves.previewDrag(70)).toBe(true);
    expect(group.position.z).toBe(70);
    expect(moves.endDrag(false)).toBe(false);
    expect(group.position.z).toBe(0);
    expect(moves.canUndo).toBe(false);

    expect(moves.beginDrag(target, "Y")).toBe(true);
    expect(moves.previewDrag(-45)).toBe(true);
    expect(moves.endDrag(true)).toBe(true);
    expect(group.position.y).toBe(-45);
    expect(moves.undo()).toBe(true);
    expect(group.position.y).toBe(0);
    expect(moves.moveBy(target, "Y", Infinity)).toBe(false);
    expect(moves.moveBy(target, "Y", NaN)).toBe(false);
    expect(moves.moveBy(target, "Y", 0)).toBe(false);
    expect(moves.redo()).toBe(true);
    expect(group.position.y).toBe(-45);
    disposeNativeStepMeshGroup(root);
  });

  it("translates visual projection of B-Rep snaps without mutating source points", () => {
    const root = new THREE.Group();
    const group = doc("single", ["plate"]);
    root.add(group);
    const target = resolveNativeIsolatedStepTarget(
      resolveNativeStepPartScope(root, group.children[0] as THREE.Mesh),
    )!;
    const sourceBrepPoint = new THREE.Vector3(10, 20, 30);
    const moves = new NativeStepMoveController();
    expect(moves.moveBy(target, "X", 750)).toBe(true);
    const world = sourceBrepPoint.clone().applyMatrix4(getNativeStepBrepWorldTransform(target)!);
    expect(world.toArray()).toEqual([760, 20, 30]);
    expect(sourceBrepPoint.toArray()).toEqual([10, 20, 30]);
    disposeNativeStepMeshGroup(root);
  });
});
