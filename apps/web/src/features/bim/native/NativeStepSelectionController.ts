import * as THREE from "three";

export interface NativeStepSelectionInfo {
  readonly uuid: string;
  readonly meshId: string;
  readonly sourceFileName: string;
  readonly brepDocumentId: string | null;
  readonly stepProductId: string | null;
  readonly stepProductName: string | null;
  readonly triangleCount: number;
  readonly boundsMm: readonly [number, number, number];
}

/** Read-only raycast against native-owned STEP triangles. Called on clicks only. */
export function pickNativeStepMesh(
  root: THREE.Object3D,
  camera: THREE.OrthographicCamera,
  clientX: number,
  clientY: number,
  canvasRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null {
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;
  const x = (clientX - canvasRect.left) / canvasRect.width;
  const y = (clientY - canvasRect.top) / canvasRect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;

  // After pointer navigation the latest camera transform may be newer than
  // the last animation frame. Raycast using that updated world matrix.
  camera.updateMatrixWorld(true);
  root.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
  const intersections = raycaster.intersectObject(root, true);
  for (const intersection of intersections) {
    const mesh = intersection.object;
    if (mesh instanceof THREE.Mesh && mesh.geometry instanceof THREE.BufferGeometry
      && mesh.material instanceof THREE.MeshStandardMaterial) {
      return mesh as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    }
  }
  return null;
}

/** Selection is visual only. No modifications to STEP geometry or transforms. */
export class NativeStepSelectionController {
  private selected: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
  private originalEmissive = new THREE.Color();
  private originalIntensity = 0;

  get selectedMesh(): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null {
    return this.selected;
  }

  setSelected(
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null,
  ): NativeStepSelectionInfo | null {
    if (this.selected === mesh) return mesh ? this.describe(mesh) : null;
    this.clear();
    if (!mesh) return null;

    this.selected = mesh;
    this.originalEmissive.copy(mesh.material.emissive);
    this.originalIntensity = mesh.material.emissiveIntensity;
    mesh.material.emissive.setHex(0x15a9e8);
    mesh.material.emissiveIntensity = 1.25;
    return this.describe(mesh);
  }

  clear(): void {
    if (!this.selected) return;
    this.selected.material.emissive.copy(this.originalEmissive);
    this.selected.material.emissiveIntensity = this.originalIntensity;
    this.selected = null;
  }

  dispose(): void {
    this.clear();
  }

  private describe(
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
  ): NativeStepSelectionInfo {
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const bounds = new THREE.Box3().setFromObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());

    return {
      uuid: mesh.uuid,
      meshId: mesh.name || "Malla sin nombre",
      sourceFileName: typeof mesh.userData["sourceFileName"] === "string"
        ? mesh.userData["sourceFileName"] as string
        : "STEP",
      brepDocumentId: typeof mesh.userData["brepDocumentId"] === "string"
        ? mesh.userData["brepDocumentId"] as string : null,
      stepProductId: typeof mesh.userData["stepProductId"] === "string"
        ? mesh.userData["stepProductId"] as string : null,
      stepProductName: typeof mesh.userData["stepProductName"] === "string"
        ? mesh.userData["stepProductName"] as string : null,
      triangleCount: geometry.index
        ? Math.floor(geometry.index.count / 3)
        : Math.floor((geometry.getAttribute("position")?.count ?? 0) / 3),
      boundsMm: [size.x, size.y, size.z],
    };
  }
}
