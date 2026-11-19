import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  buildNativeStepMeshGroup,
  disposeNativeStepMeshGroup,
  fitNativeOrthographicCamera,
  panNativeCamera,
  updateNativeOrthographicCamera,
  wheelNativeCamera,
} from "./NativeStepViewportModel";

describe("Native STEP viewer geometry and independent orthographic camera", () => {
  it("turns original STEP triangles into native Three.js meshes in mm", () => {
    const group = buildNativeStepMeshGroup({
      meshes: [{
        id: "plate-1",
        positions: new Float32Array([0, 0, 0, 1000, 0, 0, 0, 1000, 0]),
        indices: new Uint32Array([0, 1, 2]),
        normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      }],
    });
    expect(group.children).toHaveLength(1);
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh.name).toBe("plate-1");
    const positions = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
    expect(positions.getX(1)).toBe(1000);
    expect((mesh.geometry.getIndex() as THREE.BufferAttribute).count).toBe(3);
    const geometryDispose = vi.spyOn(mesh.geometry, "dispose");
    const materialDispose = vi.spyOn(mesh.material as THREE.Material, "dispose");
    disposeNativeStepMeshGroup(group);
    expect(group.children).toHaveLength(0);
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("carries STEP product and exact B-Rep source identity on visual meshes", () => {
    const group = buildNativeStepMeshGroup({
      brepDocumentId: "brep:A",
      meshes: [{
        id: "mesh-profile",
        positions: new Float32Array([0, 0, 0, 100, 0, 0, 0, 100, 0]),
        indices: new Uint32Array([0, 1, 2]),
      }],
      products: [{
        id: "product-profile",
        name: "Perfil estructural",
        geometryIds: ["mesh-profile"],
        childIds: [],
      }],
    }, "ensamble.step");
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh.userData["sourceFileName"]).toBe("ensamble.step");
    expect(mesh.userData["brepDocumentId"]).toBe("brep:A");
    expect(mesh.userData["stepProductId"]).toBe("product-profile");
    expect(mesh.userData["stepProductName"]).toBe("Perfil estructural");
    disposeNativeStepMeshGroup(group);
  });

  it("fits a long STEP assembly and preserves a native Z-up orthographic camera", () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(0, -20, -20),
      new THREE.Vector3(3000, 20, 20),
    );
    const state = fitNativeOrthographicCamera(bounds, 16 / 9);
    expect(state.target.x).toBe(1500);
    expect(state.distance).toBeGreaterThan(3000);
    const camera = new THREE.OrthographicCamera();
    updateNativeOrthographicCamera(camera, state, 16 / 9);
    expect(camera.isOrthographicCamera).toBe(true);
    expect(camera.up.toArray()).toEqual([0, 0, 1]);
    expect(camera.right - camera.left).toBeCloseTo(state.visibleHeight * 16 / 9);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(state.distance);
  });

  it("pans and wheel-zooms using orthographic millimetre units", () => {
    const state = fitNativeOrthographicCamera(new THREE.Box3(
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 100, 100),
    ), 1);
    const camera = new THREE.OrthographicCamera();
    updateNativeOrthographicCamera(camera, state, 1);
    const before = state.target.clone();
    panNativeCamera(state, camera, 40, -10, 500, 500);
    expect(state.target.distanceTo(before)).toBeGreaterThan(0);
    const oldHeight = state.visibleHeight;
    wheelNativeCamera(state, -120);
    expect(state.visibleHeight).toBeLessThan(oldHeight);
    wheelNativeCamera(state, 120);
    expect(state.visibleHeight).toBeCloseTo(oldHeight);
    updateNativeOrthographicCamera(camera, state, 1);
    expect(camera.position.distanceTo(state.target)).toBeCloseTo(state.distance);
  });

  it("empty bounds have a safe default framing", () => {
    const state = fitNativeOrthographicCamera(new THREE.Box3(), 1);
    expect(state.visibleHeight).toBe(5000);
    expect(state.target.toArray()).toEqual([0, 0, 0]);
  });
});
