import * as THREE from "three";

/**
 * Reads the authoritative Model Space PieceInstance objects; never falls back
 * to arbitrary geometry or IFC/DWG references when no piece was hit.
 *
 * The result is only an instance ID. Visual meshes, layer metadata, original
 * STEP geometry, history and .flproject transforms remain owned by CAD.
 */
export type NativeProjectInstanceTarget = readonly [
  instanceId: string,
  object: THREE.Object3D,
];

function isVisibleThrough(
  hitObject: THREE.Object3D,
  owner: THREE.Object3D,
): boolean {
  let node: THREE.Object3D | null = hitObject;
  let foundOwner = false;
  while (node) {
    if (!node.visible) return false;
    if (node === owner) foundOwner = true;
    node = node.parent;
  }
  // A hidden parent assembly or hidden CAD layer must also be rejected.
  return foundOwner;
}

export function pickNativeProjectPieceInstance(
  x: number,
  y: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  camera: THREE.OrthographicCamera,
  entries: readonly NativeProjectInstanceTarget[],
): string | null {
  if (rect.width <= 0 || rect.height <= 0
    || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  const nx = ((x - rect.left) / rect.width) * 2 - 1;
  const ny = -((y - rect.top) / rect.height) * 2 + 1;
  if (Math.abs(nx) > 1 || Math.abs(ny) > 1) return null;

  // Only the production DesignScene's PieceInstance containers are targets.
  // Hidden objects/children cannot win a hit even if Three.js raycasting
  // includes geometry from an invisible ancestor.
  const roots = new Map<THREE.Object3D, string>();
  for (const [id, object] of entries) {
    if (id && object.visible && !roots.has(object)) roots.set(object, id);
  }
  if (!roots.size) return null;

  camera.updateMatrixWorld(true);
  for (const root of roots.keys()) root.updateWorldMatrix(true, true);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(nx, ny), camera);

  const hits = ray.intersectObjects(Array.from(roots.keys()), true);
  for (const hit of hits) {
    let current: THREE.Object3D | null = hit.object;
    while (current) {
      const id = roots.get(current);
      if (id) {
        if (isVisibleThrough(hit.object, current)) return id;
        break;
      }
      current = current.parent;
    }
  }
  return null;
}
