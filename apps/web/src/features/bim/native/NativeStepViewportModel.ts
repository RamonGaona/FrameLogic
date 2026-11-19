import * as THREE from "three";

import type { StepGeometryDocument } from "@framelogic/geometry";

/** A visual-only mirror of STEP triangles; exact B-Rep stays in the STEP adapter. */
export function buildNativeStepMeshGroup(
  document: Pick<StepGeometryDocument, "meshes">,
  sourceFileName = "STEP",
): THREE.Group {
  const group = new THREE.Group();
  group.name = "STEP · Three.js nativo";

  for (const mesh of document.meshes) {
    if (mesh.positions.length < 9 || mesh.indices.length < 3) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    if (mesh.normals && mesh.normals.length === mesh.positions.length) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
    } else {
      geometry.computeVertexNormals();
    }
    geometry.computeBoundingSphere();
    const material = new THREE.MeshStandardMaterial({
      color: 0xb8c8d8,
      metalness: 0.14,
      roughness: 0.72,
      side: THREE.DoubleSide,
    });
    const object = new THREE.Mesh(geometry, material);
    object.name = mesh.id;
    object.userData["sourceFileName"] = sourceFileName;
    group.add(object);
  }
  return group;
}

/** Dispose only native-owned visual assets; never dispose shared CAD meshes. */
export function disposeNativeStepMeshGroup(group: THREE.Group): void {
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material.dispose();
  });
  group.clear();
}

export interface NativeCameraState {
  readonly target: THREE.Vector3;
  azimuth: number;
  polar: number;
  distance: number;
  visibleHeight: number;
}

/**
 * Native orthographic navigation in millimetres with Z-up.
 * No That Open camera, controls or renderer is constructed.
 */
export function updateNativeOrthographicCamera(
  camera: THREE.OrthographicCamera,
  state: NativeCameraState,
  aspect: number,
): void {
  const safeAspect = Math.max(0.01, aspect);
  const visibleHeight = Math.max(0.001, state.visibleHeight);
  const halfHeight = visibleHeight / 2;
  const halfWidth = halfHeight * safeAspect;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.near = 0.1;
  camera.far = Math.max(10_000_000, state.distance * 10);
  camera.zoom = 1;

  const polar = THREE.MathUtils.clamp(state.polar, 0.01, Math.PI - 0.01);
  const sin = Math.sin(polar);
  camera.up.set(0, 0, 1);
  camera.position.set(
    state.target.x + state.distance * Math.cos(state.azimuth) * sin,
    state.target.y + state.distance * Math.sin(state.azimuth) * sin,
    state.target.z + state.distance * Math.cos(polar),
  );
  camera.lookAt(state.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/** Reframe an entire STEP assembly without changing native model coordinates. */
export function fitNativeOrthographicCamera(
  bounds: THREE.Box3,
  aspect: number,
): NativeCameraState {
  const target = new THREE.Vector3();
  if (bounds.isEmpty()) {
    return {
      target,
      azimuth: Math.PI / 4,
      polar: Math.acos(1 / Math.sqrt(3)),
      distance: 5000,
      visibleHeight: 5000,
    };
  }
  bounds.getCenter(target);
  const size = bounds.getSize(new THREE.Vector3());
  const diagonal = Math.max(size.length(), 1);
  const height = Math.max(size.z, size.y, size.x / Math.max(0.1, aspect), diagonal * 0.7, 20);
  return {
    target,
    azimuth: Math.PI / 4,
    polar: Math.acos(1 / Math.sqrt(3)),
    distance: Math.max(diagonal * 2.5, 100),
    visibleHeight: height * 1.45,
  };
}

/** Move the target in camera-space, retaining millimetre measurements. */
export function panNativeCamera(
  state: NativeCameraState,
  camera: THREE.OrthographicCamera,
  dx: number,
  dy: number,
  viewportWidth: number,
  viewportHeight: number,
): void {
  if (viewportWidth <= 0 || viewportHeight <= 0) return;
  const worldPerPixel = state.visibleHeight / viewportHeight;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  state.target
    .addScaledVector(right, -dx * worldPerPixel)
    .addScaledVector(up, dy * worldPerPixel);
}

/** Positive delta zooms out, negative delta zooms in. */
export function wheelNativeCamera(state: NativeCameraState, deltaY: number): void {
  const factor = Math.exp(THREE.MathUtils.clamp(deltaY, -500, 500) * 0.0015);
  state.visibleHeight = THREE.MathUtils.clamp(
    state.visibleHeight * factor,
    0.0001,
    1_000_000_000,
  );
}
