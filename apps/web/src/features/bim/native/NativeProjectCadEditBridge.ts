import * as THREE from "three";

/**
 * The native inspector owns only gizmo input. FrameLogic's DesignModel,
 * DesignScene, CadHistory and .flproject remain the source of truth.
 */
export type NativeProjectTransform = {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number };
};
export type NativeProjectTransformSnapshot = Map<string, NativeProjectTransform>;

export interface NativeProjectCadEditDependencies {
  selectedIds(): readonly string[];
  isEditable(instanceId: string): boolean;
  getInstanceObject(instanceId: string): THREE.Object3D | undefined;
  capture(instanceIds: readonly string[]): NativeProjectTransformSnapshot;
  apply(instanceId: string, transform: NativeProjectTransform): boolean;
  record(label: string, before: NativeProjectTransformSnapshot, instanceIds: readonly string[]): boolean;
  cancelActiveCommand(): void;
}

export type NativeProjectEditMode = "translate" | "rotate";
export interface NativeProjectEditTarget {
  readonly id: string;
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

function hasVisibleAncestors(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    node = node.parent;
  }
  return true;
}

function validVector(vector: THREE.Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y)
    && Number.isFinite(vector.z);
}

function validQuaternion(quaternion: THREE.Quaternion): boolean {
  return Number.isFinite(quaternion.x) && Number.isFinite(quaternion.y)
    && Number.isFinite(quaternion.z) && Number.isFinite(quaternion.w)
    && quaternion.lengthSq() > 1e-12;
}

/**
 * Single-piece transform bridge. Multi-piece or hierarchy-copy requires its
 * own authoritative group transaction; never guess from display-only meshes.
 */
export class NativeProjectCadEditBridge {
  private session: {
    readonly id: string;
    readonly mode: NativeProjectEditMode;
    readonly before: NativeProjectTransformSnapshot;
  } | null = null;

  constructor(private readonly dependencies: NativeProjectCadEditDependencies) {}

  getTarget(): NativeProjectEditTarget | null {
    const ids = this.dependencies.selectedIds();
    if (ids.length !== 1 || !this.dependencies.isEditable(ids[0])) return null;
    const object = this.dependencies.getInstanceObject(ids[0]);
    if (!object || !object.matrixAutoUpdate || !hasVisibleAncestors(object)) return null;
    object.updateWorldMatrix(true, false);
    return {
      id: ids[0],
      position: object.getWorldPosition(new THREE.Vector3()),
      quaternion: object.getWorldQuaternion(new THREE.Quaternion()),
    };
  }

  get isDragging(): boolean { return this.session !== null; }

  begin(mode: NativeProjectEditMode): boolean {
    if (this.session) return false;
    const target = this.getTarget();
    if (!target) return false;
    this.dependencies.cancelActiveCommand();
    const verified = this.getTarget();
    if (!verified || verified.id !== target.id) return false;
    const before = this.dependencies.capture([verified.id]);
    if (!before.has(verified.id)) return false;
    this.session = { id: verified.id, mode, before };
    return true;
  }

  preview(worldPosition: THREE.Vector3, worldQuaternion: THREE.Quaternion): boolean {
    const active = this.session;
    if (!active || !validVector(worldPosition) || !validQuaternion(worldQuaternion)) return false;
    if (!this.dependencies.isEditable(active.id)) {
      this.finish(false);
      return false;
    }
    const object = this.dependencies.getInstanceObject(active.id);
    if (!object || !hasVisibleAncestors(object)) {
      this.finish(false);
      return false;
    }
    object.parent?.updateWorldMatrix(true, false);

    const position = worldPosition.clone();
    const rotation = worldQuaternion.clone().normalize();
    if (object.parent) {
      object.parent.worldToLocal(position);
      const parentQuaternion = object.parent.getWorldQuaternion(new THREE.Quaternion());
      rotation.premultiply(parentQuaternion.invert());
    }
    if (!validVector(position) || !validQuaternion(rotation)) return false;

    const euler = new THREE.Euler().setFromQuaternion(rotation, "XYZ");
    return this.dependencies.apply(active.id, {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: euler.x, y: euler.y, z: euler.z },
    });
  }

  finish(commit: boolean): boolean {
    const active = this.session;
    this.session = null;
    if (!active) return false;
    if (!commit) {
      const initial = active.before.get(active.id);
      if (initial) this.dependencies.apply(active.id, initial);
      return false;
    }
    return this.dependencies.record(
      active.mode === "translate" ? "MOVE" : "ROTATE",
      active.before,
      [active.id],
    );
  }
}
