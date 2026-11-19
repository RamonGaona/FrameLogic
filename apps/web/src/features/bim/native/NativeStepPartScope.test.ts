import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  isNativeSnapVisible,
  isSnapWithinNativePartScope,
  prepareNativeStepTransformTarget,
  resolveNativeStepPartScope,
} from "./NativeStepPartScope";
import {
  NativeStepSelectionController,
} from "./NativeStepSelectionController";

function model() {
  const root = new THREE.Group();
  const build = (name: string, documentId: string, productId?: string, x = 0) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
    );
    mesh.name = name;
    mesh.position.set(x, 0, 0);
    mesh.userData["brepDocumentId"] = documentId;
    if (productId) mesh.userData["stepProductId"] = productId;
    root.add(mesh);
    return mesh;
  };
  const a1 = build("placa-A", "brep-A", "product-A", 0);
  const a2 = build("placa-B", "brep-A", "product-A", 3);
  const other = build("otro-producto", "brep-A", "product-B", 30);
  const separate = build("otro-archivo", "brep-B", "product-A", 50);
  root.updateMatrixWorld(true);
  return { root, a1, a2, other, separate };
}

describe("Native STEP product scoping, visibility and gizmo preparation", () => {
  it("groups only meshes of the same unique product AND B-Rep document", () => {
    const { root, a1, a2, other, separate } = model();
    const scope = resolveNativeStepPartScope(root, a1);
    expect(scope?.kind).toBe("STEP_PRODUCT");
    expect(scope?.meshes).toEqual([a1, a2]);
    expect(scope?.meshes).not.toContain(other);
    expect(scope?.meshes).not.toContain(separate);
    expect(scope?.key).toBe("brep-A:product:product-A");
    expect(scope?.pivot.x).toBeCloseTo(1.5);
    expect(scope && isSnapWithinNativePartScope(new THREE.Vector3(3, 0, 0), scope)).toBe(true);
    expect(scope && isSnapWithinNativePartScope(new THREE.Vector3(30, 0, 0), scope)).toBe(false);
  });

  it("never confuses a visual-only mesh with an editable STEP product", () => {
    const { root, a1 } = model();
    a1.userData["stepProductAmbiguous"] = true;
    const scope = resolveNativeStepPartScope(root, a1);
    expect(scope?.kind).toBe("VISUAL_MESH");
    expect(scope?.meshes).toEqual([a1]);
    expect(scope?.key).toContain("brep-A:visual:");
    expect(scope && prepareNativeStepTransformTarget(scope)).toMatchObject({
      editable: false,
      productId: null,
      affectedMeshCount: 1,
    });
  });

  it("retains native transform target as a non-mutating read-only pivot", () => {
    const { root, a1 } = model();
    const scope = resolveNativeStepPartScope(root, a1)!;
    const before = a1.position.clone();
    const target = prepareNativeStepTransformTarget(scope);
    expect(target.editable).toBe(false);
    expect(target.affectedMeshCount).toBe(2);
    expect(target.pivot.toArray()).toEqual(scope.pivot.toArray());
    target.pivot.set(999, 999, 999);
    expect(scope.pivot.x).not.toBe(999);
    expect(a1.position.equals(before)).toBe(true);
  });

  it("highlights every mesh in the selected product then restores both materials", () => {
    const { root, a1, a2, other } = model();
    const scope = resolveNativeStepPartScope(root, a1)!;
    const colorA = a1.material.emissive.clone();
    const colorB = a2.material.emissive.clone();
    const selection = new NativeStepSelectionController();
    selection.setSelected(a1, scope.meshes);
    expect(a1.material.emissive.equals(colorA)).toBe(false);
    expect(a2.material.emissive.equals(colorB)).toBe(false);
    expect(other.material.emissive.equals(colorA)).toBe(true);
    selection.dispose();
    expect(a1.material.emissive.equals(colorA)).toBe(true);
    expect(a2.material.emissive.equals(colorB)).toBe(true);
  });

  it("rejects B-Rep candidates hidden behind the nearest rendered surface", () => {
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const root = new THREE.Group();
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
    );
    root.add(face);
    expect(isNativeSnapVisible(new THREE.Vector3(0, 0, -2), camera, root)).toBe(false);
    expect(isNativeSnapVisible(new THREE.Vector3(0, 0, 0), camera, root)).toBe(true);
    expect(isNativeSnapVisible(new THREE.Vector3(0, 0, 2), camera, root)).toBe(true);
    expect(isNativeSnapVisible(new THREE.Vector3(20, 0, 0), camera, root)).toBe(true);
    expect(isNativeSnapVisible(new THREE.Vector3(0, 0, -150), camera, root)).toBe(false);
  });

  it("permits a real circle centre through an empty opening", () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const root = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2, 4, 24),
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }),
    );
    root.add(ring);
    expect(isNativeSnapVisible(new THREE.Vector3(0, 0, 0), camera, root)).toBe(true);
  });
});
