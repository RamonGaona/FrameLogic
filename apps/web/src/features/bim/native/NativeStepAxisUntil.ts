import * as THREE from "three";

import type { NativeExactSnapPoint, NativeExactSnapHit } from "./NativeStepExactSnapController";
import type { NativeMoveAxis, NativeIsolatedStepTarget } from "./NativeStepMoveController";
import { NATIVE_MOVE_AXES } from "./NativeStepMoveController";
import { findNativeCopySnapDestination } from "./NativeStepSnapPlacement";

export type NativeAxisUntilReference =
  | { readonly kind: "BREP_SNAP"; readonly point: THREE.Vector3; readonly snap: NativeExactSnapHit }
  | { readonly kind: "SURFACE_POINT"; readonly point: THREE.Vector3 };

/**
 * HASTA prioritizes exact indexed OCCT snap points on all independent STEP
 * instances, including copies; a visible triangulated surface is accepted
 * only as an approximate reference when no B-Rep snap is in tolerance.
 * The surface fallback is deliberately NOT reported as exact geometry.
 */
export function pickNativeAxisUntilReference(
  root: THREE.Group,
  snapIndices: ReadonlyMap<string, readonly NativeExactSnapPoint[]>,
  target: NativeIsolatedStepTarget,
  camera: THREE.OrthographicCamera,
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  tolerancePx = 13,
): NativeAxisUntilReference | null {
  if (rect.width <= 0 || rect.height <= 0
    || !target.group.parent) return null;
  const px = (clientX - rect.left) / rect.width;
  const py = (clientY - rect.top) / rect.height;
  if (px < 0 || px > 1 || py < 0 || py > 1) return null;

  const snap = findNativeCopySnapDestination(
    root, snapIndices, target, camera,
    clientX, clientY, rect, tolerancePx,
  );
  if (snap) return { kind: "BREP_SNAP", point: snap.point.clone(), snap };

  camera.updateMatrixWorld(true);
  root.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - py * 2), camera);

  // Includes surfaces of the source, copies and other loaded STEP files,
  // without picking the gizmo (rendered separately outside modelRoot).
  const visible = (object: THREE.Object3D): boolean => {
    let current: THREE.Object3D | null = object;
    while (current && current !== root) {
      if (!current.visible) return false;
      current = current.parent;
    }
    return current === root;
  };
  for (const hit of raycaster.intersectObject(root, true)) {
    if (!(hit.object instanceof THREE.Mesh) || !visible(hit.object)) continue;
    if (![hit.point.x, hit.point.y, hit.point.z].every(Number.isFinite)) continue;
    return { kind: "SURFACE_POINT", point: hit.point.clone() };
  }
  return null;
}

/**
 * Match the stable Model Space gizmo's HASTA projection: the *gizmo pivot*
 * reaches the selected reference coordinate only along the selected axis.
 * Other coordinates are unchanged; a click is not a free 3D translation.
 */
export function nativeAxisUntilOffset(
  pivotWorldMm: THREE.Vector3,
  axis: NativeMoveAxis,
  destinationWorldMm: THREE.Vector3,
): THREE.Vector3 | null {
  if (![pivotWorldMm.x, pivotWorldMm.y, pivotWorldMm.z,
    destinationWorldMm.x, destinationWorldMm.y, destinationWorldMm.z]
    .every(Number.isFinite)) return null;
  const distance = destinationWorldMm.clone()
    .sub(pivotWorldMm).dot(NATIVE_MOVE_AXES[axis]);
  if (!Number.isFinite(distance) || Math.abs(distance) < 1e-9
    || Math.abs(distance) > 1_000_000) return null;
  return NATIVE_MOVE_AXES[axis].clone().multiplyScalar(distance);
}
