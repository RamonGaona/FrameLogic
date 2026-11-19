import * as THREE from "three";

import type { NativeStepPartScope } from "./NativeStepPartScope";

export type NativeMoveAxis = "X" | "Y" | "Z";

export const NATIVE_MOVE_AXES: Readonly<Record<NativeMoveAxis, THREE.Vector3>> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};

export interface NativeIsolatedStepTarget {
  readonly key: string;
  readonly documentId: string;
  readonly productId: string;
  /** Entire loaded STEP source group; other file groups are not touched. */
  readonly group: THREE.Group;
  readonly meshes: readonly THREE.Mesh[];
}

/**
 * Never enable native translation on a submesh of a multi-product STEP.
 * Exactly one unambiguous named STEP product must own EVERY visible mesh
 * within ONE independently loaded B-Rep document.
 *
 * This checks visual ownership only, not per-edge B-Rep shape ownership.
 * A successful target enables a temporary VISUAL placement preview, NOT
 * editable STEP solids, precision CAD transforms or export.
 */
export function resolveNativeIsolatedStepTarget(
  scope: NativeStepPartScope | null,
): NativeIsolatedStepTarget | null {
  if (!scope || scope.kind !== "STEP_PRODUCT" || !scope.productId
    || scope.meshes.length === 0) return null;

  const parent = scope.meshes[0].parent;
  if (!(parent instanceof THREE.Group)
    || parent.userData["nativeStepDocument"] !== true
    || parent.userData["brepDocumentId"] !== scope.documentId
    || parent.children.length !== scope.meshes.length) return null;

  for (const child of parent.children) {
    if (!(child instanceof THREE.Mesh)
      || child.userData["brepDocumentId"] !== scope.documentId
      || child.userData["stepProductId"] !== scope.productId
      || child.userData["stepProductAmbiguous"] === true
      || !scope.meshes.includes(child)) return null;
  }

  return {
    key: scope.key,
    documentId: scope.documentId,
    productId: scope.productId,
    group: parent,
    meshes: scope.meshes,
  };
}

interface MoveEntry {
  readonly target: NativeIsolatedStepTarget;
  readonly before: THREE.Vector3;
  readonly after: THREE.Vector3;
}

interface DragState {
  readonly target: NativeIsolatedStepTarget;
  readonly axis: NativeMoveAxis;
  readonly before: THREE.Vector3;
}

/**
 * Session-only native visual translations. All edits are applied to a
 * whole loaded file group, never directly to OpenCascade B-Rep geometry.
 * An explicit, reversible history prevents accidental partial placements.
 */
export class NativeStepMoveController {
  private readonly undoStack: MoveEntry[] = [];
  private readonly redoStack: MoveEntry[] = [];
  private drag: DragState | null = null;

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get isDragging(): boolean {
    return this.drag !== null;
  }

  moveBy(target: NativeIsolatedStepTarget, axis: NativeMoveAxis, amountMm: number): boolean {
    if (this.drag || !Number.isFinite(amountMm) || amountMm === 0) return false;
    const before = target.group.position.clone();
    target.group.position.addScaledVector(NATIVE_MOVE_AXES[axis], amountMm);
    target.group.updateMatrixWorld(true);
    this.record({ target, before, after: target.group.position.clone() });
    return true;
  }

  beginDrag(target: NativeIsolatedStepTarget, axis: NativeMoveAxis): boolean {
    if (this.drag) return false;
    this.drag = { target, axis, before: target.group.position.clone() };
    return true;
  }

  previewDrag(distanceMm: number): boolean {
    if (!this.drag || !Number.isFinite(distanceMm)) return false;
    this.drag.target.group.position.copy(this.drag.before)
      .addScaledVector(NATIVE_MOVE_AXES[this.drag.axis], distanceMm);
    this.drag.target.group.updateMatrixWorld(true);
    return true;
  }

  endDrag(commit: boolean): boolean {
    const drag = this.drag;
    if (!drag) return false;
    this.drag = null;
    const after = drag.target.group.position.clone();
    if (!commit || drag.before.distanceToSquared(after) < 1e-12) {
      drag.target.group.position.copy(drag.before);
      drag.target.group.updateMatrixWorld(true);
      return false;
    }
    this.record({ target: drag.target, before: drag.before, after });
    return true;
  }

  undo(): boolean {
    if (this.drag) return false;
    const entry = this.undoStack.pop();
    if (!entry) return false;
    entry.target.group.position.copy(entry.before);
    entry.target.group.updateMatrixWorld(true);
    this.redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    if (this.drag) return false;
    const entry = this.redoStack.pop();
    if (!entry) return false;
    entry.target.group.position.copy(entry.after);
    entry.target.group.updateMatrixWorld(true);
    this.undoStack.push(entry);
    return true;
  }

  reset(): void {
    this.endDrag(false);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private record(entry: MoveEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack.length = 0;
  }
}

/** Keep exact points in B-Rep local coordinates; project with the file group's
 * current world transform, never rewrite the authoritative OCCT snapshot. */
export function getNativeStepBrepWorldTransform(
  target: NativeIsolatedStepTarget | null,
): THREE.Matrix4 | undefined {
  if (!target) return undefined;
  target.group.updateMatrixWorld(true);
  return target.group.matrixWorld;
}
