import * as THREE from "three";

import type { NativeExactSnapHit, NativeExactSnapPoint } from "./NativeStepExactSnapController";
import { findNativeExactSnap } from "./NativeStepExactSnapController";
import { isNativeSnapVisible } from "./NativeStepPartScope";
import type { NativeIsolatedStepTarget } from "./NativeStepMoveController";

export interface NativeCopySnapBase {
  /** Instance key prevents accidentally copying another selected product. */
  readonly sourceKey: string;
  readonly sourcePointMm: THREE.Vector3;
}

/**
 * Find a B-Rep snap on a visible STEP document instance, including the source. The B-Rep
 * snapshot remains read-only. Cloned instances share the original topology
 * but have their own world transform and selectable identity.
 */
export function findNativeCopySnapDestination(
  root: THREE.Group,
  indices: ReadonlyMap<string, readonly NativeExactSnapPoint[]>,
  source: NativeIsolatedStepTarget,
  camera: THREE.OrthographicCamera,
  x: number,
  y: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  tolerancePx = 13,
): NativeExactSnapHit | null {
  // Verify source remains a live, independently loaded STEP group.
  if (!source.group.parent) return null;
  let best: NativeExactSnapHit | null = null;

  for (const node of root.children) {
    if (!(node instanceof THREE.Group)
      || node.visible === false
      || node.userData["nativeStepDocument"] !== true) continue;
    const documentId = node.userData["brepDocumentId"];
    if (typeof documentId !== "string") continue;
    const candidates = indices.get(documentId);
    if (!candidates || candidates.length === 0) continue;
    node.updateMatrixWorld(true);

    const hit = findNativeExactSnap(
      candidates, documentId, camera, x, y, rect,
      tolerancePx,
      (candidate) => isNativeSnapVisible(candidate.point, camera, root),
      node.matrixWorld,
    );
    if (!hit) continue;
    if (!best || hit.screenDistancePx < best.screenDistancePx) best = hit;
  }
  return best;
}

/** Exact 3D translation from the selected source base to a target B-Rep snap. */
export function nativeCopySnapOffset(
  sourceBase: NativeCopySnapBase,
  source: NativeIsolatedStepTarget,
  destination: NativeExactSnapHit,
): THREE.Vector3 | null {
  if (source.key !== sourceBase.sourceKey) return null;
  const offset = destination.point.clone().sub(sourceBase.sourcePointMm);
  if (![offset.x, offset.y, offset.z].every(Number.isFinite)
    || offset.lengthSq() < 1e-12
    || Math.max(Math.abs(offset.x), Math.abs(offset.y), Math.abs(offset.z)) > 1_000_000) {
    return null;
  }
  return offset;
}
