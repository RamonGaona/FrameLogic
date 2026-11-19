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

type MoveEntry = {
  readonly kind: "MOVE";
  readonly target: NativeIsolatedStepTarget;
  readonly before: THREE.Vector3;
  readonly after: THREE.Vector3;
};

type CopyEntry = {
  readonly kind: "COPY";
  readonly source: NativeIsolatedStepTarget;
  readonly copy: NativeIsolatedStepTarget;
  readonly parent: THREE.Object3D;
};

type HistoryEntry = MoveEntry | CopyEntry;

interface DragState {
  readonly source: NativeIsolatedStepTarget;
  readonly axis: NativeMoveAxis;
  readonly before: THREE.Vector3;
  copy: NativeIsolatedStepTarget | null;
}

export interface NativeMoveResult {
  readonly kind: "MOVE" | "COPY" | "COPY_UNDONE";
  readonly target: NativeIsolatedStepTarget;
}

/**
 * Clone the visual STEP group with fully independent GPU-owned geometry and
 * materials, while retaining its original read-only OCCT B-Rep source id.
 * The clone receives a fresh instance identity, so product selection cannot
 * accidentally select both the original and its copy.
 */
function cloneIsolatedStepTarget(
  source: NativeIsolatedStepTarget,
): NativeIsolatedStepTarget | null {
  const parent = source.group.parent;
  if (!parent) return null;
  const group = source.group.clone(true);
  group.name = source.group.name + " · copia visual";
  group.userData["nativeStepInstanceId"] = group.uuid;
  group.userData["nativeVisualCopy"] = true;
  group.userData["nativeStepDocument"] = true;
  group.userData["brepDocumentId"] = source.documentId;

  const meshes: THREE.Mesh[] = [];
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry = child.geometry.clone();
    if (Array.isArray(child.material)) {
      child.material = child.material.map((material) => material.clone());
    } else {
      child.material = child.material.clone();
    }
    child.userData["nativeStepInstanceId"] = group.uuid;
    meshes.push(child);
  });
  parent.add(group);
  group.updateMatrixWorld(true);
  return {
    key: source.documentId + ":instance:" + group.uuid + ":product:" + source.productId,
    documentId: source.documentId,
    productId: source.productId,
    group,
    meshes,
  };
}

function discardVisualCopy(copy: NativeIsolatedStepTarget): void {
  copy.group.removeFromParent();
  copy.group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) material.dispose();
  });
  copy.group.clear();
}

/**
 * Session-only reversible visual placements. MOVE translates a complete
 * isolated STEP file. COPY clones that entire file, never moves the source,
 * and enters undo/redo as a single transaction.
 *
 * Ctrl during drag latches copy mode, including if the pointer already
 * started moving; source position is restored before the clone is placed.
 * STEP B-Rep coordinates and .flproject persistence remain untouched.
 */
export class NativeStepMoveController {
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private drag: DragState | null = null;
  private result: NativeMoveResult | null = null;

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get isDragging(): boolean {
    return this.drag !== null;
  }

  get isCopying(): boolean {
    return this.drag?.copy !== null && this.drag !== null;
  }

  get activeDragTarget(): NativeIsolatedStepTarget | null {
    return this.drag?.copy ?? this.drag?.source ?? null;
  }

  get lastResult(): NativeMoveResult | null {
    return this.result;
  }

  moveBy(target: NativeIsolatedStepTarget, axis: NativeMoveAxis, amountMm: number): boolean {
    if (this.drag || !Number.isFinite(amountMm) || amountMm === 0) return false;
    const before = target.group.position.clone();
    target.group.position.addScaledVector(NATIVE_MOVE_AXES[axis], amountMm);
    target.group.updateMatrixWorld(true);
    this.record({
      kind: "MOVE", target, before, after: target.group.position.clone(),
    });
    this.result = { kind: "MOVE", target };
    return true;
  }

  copyBy(target: NativeIsolatedStepTarget, axis: NativeMoveAxis, amountMm: number): boolean {
    if (!Number.isFinite(amountMm) || amountMm === 0 || !this.beginDrag(target, axis, true)) {
      return false;
    }
    if (!this.previewDrag(amountMm)) {
      this.endDrag(false);
      return false;
    }
    return this.endDrag(true);
  }

  beginDrag(target: NativeIsolatedStepTarget, axis: NativeMoveAxis, copy = false): boolean {
    if (this.drag) return false;
    this.result = null;
    this.drag = {
      source: target, axis, before: target.group.position.clone(), copy: null,
    };
    if (copy && !this.enableCopyDuringDrag()) {
      this.drag = null;
      return false;
    }
    return true;
  }

  /** Latch Ctrl-copy even when Ctrl is pressed after drag began. */
  enableCopyDuringDrag(): boolean {
    const drag = this.drag;
    if (!drag) return false;
    if (drag.copy) return true;
    const copy = cloneIsolatedStepTarget(drag.source);
    if (!copy) return false;
    drag.source.group.position.copy(drag.before);
    drag.source.group.updateMatrixWorld(true);
    drag.copy = copy;
    return true;
  }

  previewDrag(distanceMm: number, copy = false): boolean {
    const drag = this.drag;
    if (!drag || !Number.isFinite(distanceMm)) return false;
    if (copy && !this.enableCopyDuringDrag()) return false;
    const active = drag.copy ?? drag.source;
    active.group.position.copy(drag.before)
      .addScaledVector(NATIVE_MOVE_AXES[drag.axis], distanceMm);
    active.group.updateMatrixWorld(true);
    return true;
  }

  endDrag(commit: boolean): boolean {
    const drag = this.drag;
    if (!drag) return false;
    this.drag = null;
    const active = drag.copy ?? drag.source;
    const after = active.group.position.clone();
    if (!commit || drag.before.distanceToSquared(after) < 1e-12) {
      drag.source.group.position.copy(drag.before);
      drag.source.group.updateMatrixWorld(true);
      if (drag.copy) discardVisualCopy(drag.copy);
      this.result = null;
      return false;
    }

    if (drag.copy) {
      // Absolute invariant: COPY never modifies the source group.
      drag.source.group.position.copy(drag.before);
      drag.source.group.updateMatrixWorld(true);
      const parent = drag.copy.group.parent;
      if (!parent) {
        discardVisualCopy(drag.copy);
        return false;
      }
      this.record({ kind: "COPY", source: drag.source, copy: drag.copy, parent });
      this.result = { kind: "COPY", target: drag.copy };
    } else {
      this.record({
        kind: "MOVE", target: drag.source, before: drag.before, after,
      });
      this.result = { kind: "MOVE", target: drag.source };
    }
    return true;
  }

  undo(): boolean {
    if (this.drag) return false;
    const entry = this.undoStack.pop();
    if (!entry) return false;
    if (entry.kind === "COPY") {
      entry.copy.group.removeFromParent();
      this.result = { kind: "COPY_UNDONE", target: entry.source };
    } else {
      entry.target.group.position.copy(entry.before);
      entry.target.group.updateMatrixWorld(true);
      this.result = { kind: "MOVE", target: entry.target };
    }
    this.redoStack.push(entry);
    return true;
  }

  redo(): boolean {
    if (this.drag) return false;
    const entry = this.redoStack.pop();
    if (!entry) return false;
    if (entry.kind === "COPY") {
      entry.parent.add(entry.copy.group);
      entry.copy.group.updateMatrixWorld(true);
      this.result = { kind: "COPY", target: entry.copy };
    } else {
      entry.target.group.position.copy(entry.after);
      entry.target.group.updateMatrixWorld(true);
      this.result = { kind: "MOVE", target: entry.target };
    }
    this.undoStack.push(entry);
    return true;
  }

  reset(): void {
    this.endDrag(false);
    for (const entry of [...this.undoStack, ...this.redoStack]) {
      if (entry.kind === "COPY" && !entry.copy.group.parent) {
        discardVisualCopy(entry.copy);
      }
    }
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.result = null;
  }

  private record(entry: HistoryEntry): void {
    for (const redo of this.redoStack) {
      if (redo.kind === "COPY" && !redo.copy.group.parent) {
        discardVisualCopy(redo.copy);
      }
    }
    this.redoStack.length = 0;
    this.undoStack.push(entry);
    if (this.undoStack.length > 100) this.undoStack.shift();
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
