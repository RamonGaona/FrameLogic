import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  NativeStepSelectionController,
  pickNativeStepMesh,
} from "./NativeStepSelectionController";
import {
  buildNativeStepMeshGroup,
  disposeNativeStepMeshGroup,
} from "./NativeStepViewportModel";

function fixture() {
  const root = buildNativeStepMeshGroup({
    meshes: [{
      id: "PLACA-01",
      positions: new Float32Array([
        -1, -1, 0,
        1, -1, 0,
        0, 1, 0,
      ]),
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    }],
  }, "placas.step");
  const mesh = root.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return { root, mesh, camera, rect: { left: 10, top: 10, width: 100, height: 100 } };
}

describe("Native STEP selection (experimental visual-only)", () => {
  it("raycasts the nearest visible STEP mesh using canvas coordinates", () => {
    const { root, mesh, camera, rect } = fixture();
    expect(pickNativeStepMesh(root, camera, 60, 60, rect)).toBe(mesh);
    expect(pickNativeStepMesh(root, camera, 5, 60, rect)).toBeNull();
    expect(pickNativeStepMesh(root, camera, 60, 120, rect)).toBeNull();
    expect(pickNativeStepMesh(root, camera, 60, 60, { ...rect, width: 0 })).toBeNull();
    disposeNativeStepMeshGroup(root);
  });

  it("highlights a mesh without mutating source geometry or transforms", () => {
    const { root, mesh } = fixture();
    const selection = new NativeStepSelectionController();
    const baseEmissive = mesh.material.emissive.clone();
    const baseIntensity = mesh.material.emissiveIntensity;
    const originalPosition = mesh.position.clone();
    const info = selection.setSelected(mesh);
    expect(info).toMatchObject({
      uuid: mesh.uuid,
      meshId: "PLACA-01",
      sourceFileName: "placas.step",
      triangleCount: 1,
      boundsMm: [2, 2, 0],
    });
    expect(mesh.material.emissive.equals(baseEmissive)).toBe(false);
    expect(mesh.material.emissiveIntensity).toBeGreaterThan(baseIntensity);
    expect(mesh.position.equals(originalPosition)).toBe(true);
    selection.setSelected(mesh);
    selection.clear();
    expect(mesh.material.emissive.equals(baseEmissive)).toBe(true);
    expect(mesh.material.emissiveIntensity).toBe(baseIntensity);
    disposeNativeStepMeshGroup(root);
  });

  it("deselects old mesh on replacement, and cleans before GPU disposal", () => {
    const first = fixture();
    const second = fixture();
    const selection = new NativeStepSelectionController();
    const originalFirst = first.mesh.material.emissive.clone();
    const originalSecond = second.mesh.material.emissive.clone();
    selection.setSelected(first.mesh);
    selection.setSelected(second.mesh);
    expect(first.mesh.material.emissive.equals(originalFirst)).toBe(true);
    selection.dispose();
    expect(second.mesh.material.emissive.equals(originalSecond)).toBe(true);
    expect(selection.selectedMesh).toBeNull();
    const geomDispose = vi.spyOn(second.mesh.geometry, "dispose");
    disposeNativeStepMeshGroup(first.root);
    disposeNativeStepMeshGroup(second.root);
    expect(geomDispose).toHaveBeenCalledOnce();
  });
});
