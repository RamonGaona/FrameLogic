import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { NativeExactSnapPoint, NativeExactSnapHit } from "./NativeStepExactSnapController";
import {
  findNativeCopySnapDestination,
  nativeCopySnapOffset,
} from "./NativeStepSnapPlacement";
import {
  NativeStepMoveController,
  resolveNativeIsolatedStepTarget,
} from "./NativeStepMoveController";
import { resolveNativeStepPartScope } from "./NativeStepPartScope";
import {
  buildNativeStepMeshGroup,
  disposeNativeStepMeshGroup,
} from "./NativeStepViewportModel";

function setup() {
  const root = new THREE.Group();
  function doc(id: string) {
    const group = buildNativeStepMeshGroup({
      brepDocumentId: id,
      meshes: [{
        id: "mesh",
        positions: new Float32Array([-5, -5, 0, 5, -5, 0, 0, 5, 0]),
        indices: new Uint32Array([0, 1, 2]),
      }],
      products: [{
        id: "plate", geometryIds: ["mesh"], childIds: [],
      }],
    });
    root.add(group);
    return group;
  }
  const first = doc("brep-source");
  const second = doc("brep-destination");
  second.position.set(20, 0, 0);
  root.updateMatrixWorld(true);
  const target = resolveNativeIsolatedStepTarget(
    resolveNativeStepPartScope(root, first.children[0] as THREE.Mesh),
  )!;
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 200);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const rect = { left: 0, top: 0, width: 400, height: 400 };
  const snap = (id: string): NativeExactSnapPoint => ({
    id: id + ":vertex",
    sourceFileName: id + ".step",
    brepDocumentId: id,
    kind: "VERTEX",
    point: new THREE.Vector3(),
  });
  const indices = new Map<string, readonly NativeExactSnapPoint[]>([
    ["brep-source", [snap("brep-source")]],
    ["brep-destination", [snap("brep-destination")]],
  ]);
  return { root, first, second, target, camera, rect, indices };
}

describe("Visual COPYBASE from exact B-Rep source to destination", () => {
  it("finds the visible destination snap in a different placed STEP group", () => {
    const { root, first, second, target, camera, rect, indices } = setup();
    const world = new THREE.Vector3(20, 0, 0).project(camera);
    const hit = findNativeCopySnapDestination(
      root, indices, target, camera,
      (world.x + 1) * 200, (1 - world.y) * 200, rect,
    );
    expect(hit?.brepDocumentId).toBe("brep-destination");
    expect(hit?.point.toArray()).toEqual([20, 0, 0]);
    expect(hit?.screenDistancePx).toBeLessThan(1e-5);
    disposeNativeStepMeshGroup(root);
  });

  it("COPYBASE places clone exactly at destination and source stays fixed", () => {
    const { root, target, camera, rect, indices } = setup();
    const world = new THREE.Vector3(20, 0, 0).project(camera);
    const destination = findNativeCopySnapDestination(
      root, indices, target, camera, (world.x + 1) * 200,
      (1 - world.y) * 200, rect,
    )!;
    const base = {
      sourceKey: target.key,
      sourcePointMm: new THREE.Vector3(0, 0, 0),
    };
    const delta = nativeCopySnapOffset(base, target, destination)!;
    expect(delta.toArray()).toEqual([20, 0, 0]);
    const history = new NativeStepMoveController();
    expect(history.copyTo(target, delta)).toBe(true);
    expect(target.group.position.toArray()).toEqual([0, 0, 0]);
    expect(history.lastResult?.target.group.position.toArray()).toEqual([20, 0, 0]);
    history.undo();
    expect(root.children).toHaveLength(2);
    history.redo();
    expect(root.children).toHaveLength(3);
    history.reset();
    disposeNativeStepMeshGroup(root);
  });

  it("rejects stale source selection, zero offsets and values beyond safe bounds", () => {
    const { root, target } = setup();
    const base = {
      sourceKey: "a-different-selected-instance",
      sourcePointMm: new THREE.Vector3(0, 0, 0),
    };
    const hit: NativeExactSnapHit = {
      id: "v", brepDocumentId: "dest", sourceFileName: "dest.step",
      kind: "VERTEX", point: new THREE.Vector3(5, 0, 0),
      screenX: 10, screenY: 10, screenDistancePx: 0,
    };
    expect(nativeCopySnapOffset(base, target, hit)).toBeNull();
    expect(nativeCopySnapOffset({ ...base, sourceKey: target.key }, target,
      { ...hit, point: new THREE.Vector3(0, 0, 0) })).toBeNull();
    const controller = new NativeStepMoveController();
    expect(controller.copyTo(target, new THREE.Vector3(0, 0, 0))).toBe(false);
    expect(controller.copyTo(target, new THREE.Vector3(Infinity, 0, 0))).toBe(false);
    expect(controller.copyTo(target, new THREE.Vector3(1_000_001, 0, 0))).toBe(false);
    expect(root.children).toHaveLength(2);
    disposeNativeStepMeshGroup(root);
  });
});
