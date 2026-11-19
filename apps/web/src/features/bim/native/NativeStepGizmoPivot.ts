import * as THREE from "three";

import type { NativeStepPartScope } from "./NativeStepPartScope";

const OFFSET_KEY = "nativeGizmoPivotOffsetMm";
const LOCAL_KEY = "nativeGizmoPivotLocalMm";

/**
 * The pivot is a *display-only* offset relative to the selected STEP
 * instance's current world-space bounding centre. Neither STEP B-Rep
 * coordinates nor mesh transforms are changed when this offset changes.
 * The property travels with Three.Group.clone(true) for Ctrl-copies.
 */
function owner(scope: NativeStepPartScope): THREE.Group | null {
  const parent = scope.meshes[0]?.parent;
  if (!(parent instanceof THREE.Group)
    || parent.userData["nativeStepDocument"] !== true
    || parent.userData["nativeStepInstanceId"] !== scope.instanceId
    || parent.userData["brepDocumentId"] !== scope.documentId) return null;
  return parent;
}

export function getNativeStepGizmoPivot(scope: NativeStepPartScope): THREE.Vector3 {
  const parent = owner(scope);
  // A local anchor follows both translation and rotation of its STEP group.
  // Keep the old offset as a fallback for existing in-memory instances.
  const local = parent?.userData[LOCAL_KEY];
  if (parent && Array.isArray(local) && local.length === 3
    && local.every((value: unknown) => typeof value === "number" && Number.isFinite(value))) {
    parent.updateMatrixWorld(true);
    return parent.localToWorld(new THREE.Vector3(local[0], local[1], local[2]));
  }
  const offset = parent?.userData[OFFSET_KEY];
  if (!Array.isArray(offset) || offset.length !== 3
    || !offset.every((value: unknown) => typeof value === "number" && Number.isFinite(value))) {
    return scope.pivot.clone();
  }
  return scope.pivot.clone().add(new THREE.Vector3(offset[0], offset[1], offset[2]));
}

/**
 * Clicking the centre then choosing an exact SNAP relocates only the gizmo,
 * without creating a MOVE/COPY history entry.
 */
export function setNativeStepGizmoPivot(
  scope: NativeStepPartScope,
  newWorldPivotMm: THREE.Vector3,
): boolean {
  const parent = owner(scope);
  if (!parent || scope.kind !== "STEP_PRODUCT" || !scope.productId
    || ![newWorldPivotMm.x, newWorldPivotMm.y, newWorldPivotMm.z]
      .every(Number.isFinite)) return false;
  const offset = newWorldPivotMm.clone().sub(scope.pivot);
  if (Math.max(Math.abs(offset.x), Math.abs(offset.y), Math.abs(offset.z)) > 1_000_000) {
    return false;
  }
  parent.updateMatrixWorld(true);
  const local = parent.worldToLocal(newWorldPivotMm.clone());
  if (![...local.toArray()].every(Number.isFinite)) return false;
  parent.userData[OFFSET_KEY] = offset.toArray();
  parent.userData[LOCAL_KEY] = local.toArray();
  return true;
}

/** Reset is a pivot-only operation; the STEP mesh remains untouched. */
export function resetNativeStepGizmoPivot(scope: NativeStepPartScope): boolean {
  const parent = owner(scope);
  if (!parent) return false;
  delete parent.userData[OFFSET_KEY];
  delete parent.userData[LOCAL_KEY];
  return true;
}
