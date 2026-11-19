import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  NativeProjectCadEditBridge,
  type NativeProjectCadEditDependencies,
  type NativeProjectTransform,
  type NativeProjectTransformSnapshot,
} from "./NativeProjectCadEditBridge";

function makeRig() {
  const scene = new THREE.Group();
  const object = new THREE.Group();
  scene.add(object);
  let selected: string[] = ["piece-1"];
  let editable = true;
  const changes: NativeProjectTransform[] = [];
  const recorded: Array<{
    label: string;
    before: NativeProjectTransformSnapshot;
    after: NativeProjectTransformSnapshot;
  }> = [];
  const cancelActiveCommand = vi.fn();

  const transform = (): NativeProjectTransform => ({
    position: { x: object.position.x, y: object.position.y, z: object.position.z },
    rotation: { x: object.rotation.x, y: object.rotation.y, z: object.rotation.z },
  });
  const copy = (snapshot: NativeProjectTransform) => ({
    position: { ...snapshot.position }, rotation: { ...snapshot.rotation },
  });
  const apply = (id: string, state: NativeProjectTransform): boolean => {
    if (id !== "piece-1") return false;
    changes.push(copy(state));
    object.position.set(state.position.x, state.position.y, state.position.z);
    object.rotation.set(state.rotation.x, state.rotation.y, state.rotation.z);
    object.updateMatrixWorld(true);
    return true;
  };
  const capture = (ids: readonly string[]): NativeProjectTransformSnapshot => {
    const snapshot: NativeProjectTransformSnapshot = new Map();
    if (ids.includes("piece-1")) snapshot.set("piece-1", copy(transform()));
    return snapshot;
  };
  const dependencies: NativeProjectCadEditDependencies = {
    selectedIds: () => selected,
    isEditable: () => editable,
    getInstanceObject: (id) => id === "piece-1" ? object : undefined,
    capture,
    apply,
    record: (label, before, ids) => {
      recorded.push({ label, before, after: capture(ids) });
      return true;
    },
    cancelActiveCommand,
  };
  return {
    scene, object, bridge: new NativeProjectCadEditBridge(dependencies),
    changes, recorded, cancelActiveCommand,
    setSelected: (value: string[]) => { selected = value; },
    setEditable: (value: boolean) => { editable = value; },
    apply, transform,
  };
}

describe("native gizmo edits authoritative FrameLogic transforms, not visual clones", () => {
  it("moves a real piece and records only one CAD history entry on commit", () => {
    const rig = makeRig();
    expect(rig.bridge.getTarget()?.id).toBe("piece-1");
    expect(rig.bridge.begin("translate")).toBe(true);
    expect(rig.cancelActiveCommand).toHaveBeenCalledOnce();
    expect(rig.bridge.preview(new THREE.Vector3(125, 0, -30), rig.object.quaternion.clone())).toBe(true);
    expect(rig.object.position.toArray()).toEqual([125, 0, -30]);
    expect(rig.recorded).toHaveLength(0);
    expect(rig.bridge.finish(true)).toBe(true);
    expect(rig.recorded).toHaveLength(1);
    expect(rig.recorded[0].label).toBe("MOVE");
    expect(rig.recorded[0].before.get("piece-1")?.position.x).toBe(0);
    expect(rig.recorded[0].after.get("piece-1")?.position.x).toBe(125);
    // .flproject reads pieceInstances; it must receive the updated transform.
    expect(rig.changes.at(-1)?.position).toEqual({ x: 125, y: 0, z: -30 });
  });

  it("rotates around a real piece origin and restores its Euler transform on cancel", () => {
    const rig = makeRig();
    expect(rig.bridge.begin("rotate")).toBe(true);
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    expect(rig.bridge.preview(new THREE.Vector3(), quat)).toBe(true);
    expect(rig.object.rotation.z).toBeCloseTo(Math.PI / 2);
    expect(rig.bridge.finish(false)).toBe(false);
    expect(rig.object.rotation.z).toBeCloseTo(0);
    expect(rig.recorded).toHaveLength(0);
  });

  it("converts world-space gizmo input correctly when a piece has a transformed parent", () => {
    const rig = makeRig();
    rig.scene.position.set(100, 20, 0);
    rig.scene.rotation.z = Math.PI / 2;
    rig.scene.updateMatrixWorld(true);
    expect(rig.bridge.begin("translate")).toBe(true);
    const worldQ = rig.object.getWorldQuaternion(new THREE.Quaternion());
    expect(rig.bridge.preview(new THREE.Vector3(100, 30, 0), worldQ)).toBe(true);
    expect(rig.object.position.x).toBeCloseTo(10);
    expect(rig.object.position.y).toBeCloseTo(0);
    expect(rig.bridge.finish(true)).toBe(true);
    expect(rig.recorded[0].after.get("piece-1")?.position.x).toBeCloseTo(10);
  });

  it("rejects hidden, locked and multiply-selected pieces", () => {
    const rig = makeRig();
    rig.setEditable(false);
    expect(rig.bridge.getTarget()).toBeNull();
    expect(rig.bridge.begin("translate")).toBe(false);
    rig.setEditable(true);
    rig.setSelected(["piece-1", "another-piece"]);
    expect(rig.bridge.getTarget()).toBeNull();
    rig.setSelected(["piece-1"]);
    rig.scene.visible = false;
    expect(rig.bridge.getTarget()).toBeNull();
    rig.scene.visible = true;
    expect(rig.bridge.getTarget()?.id).toBe("piece-1");
  });

  it("refuses invalid input and rolls back if the target loses edit permission", () => {
    const rig = makeRig();
    expect(rig.bridge.begin("translate")).toBe(true);
    expect(rig.bridge.preview(new THREE.Vector3(Number.NaN, 0, 0), new THREE.Quaternion())).toBe(false);
    expect(rig.changes).toHaveLength(0);
    expect(rig.bridge.preview(new THREE.Vector3(5, 0, 0), new THREE.Quaternion())).toBe(true);
    rig.setEditable(false);
    expect(rig.bridge.preview(new THREE.Vector3(6, 0, 0), new THREE.Quaternion())).toBe(false);
    expect(rig.object.position.x).toBe(0);
    expect(rig.bridge.isDragging).toBe(false);
    expect(rig.recorded).toHaveLength(0);
  });

  it("does not create a history entry when a gizmo drag is cancelled", () => {
    const rig = makeRig();
    expect(rig.bridge.begin("translate")).toBe(true);
    expect(rig.bridge.preview(new THREE.Vector3(15, 0, 0), new THREE.Quaternion())).toBe(true);
    expect(rig.bridge.finish(false)).toBe(false);
    expect(rig.transform().position.x).toBe(0);
    expect(rig.recorded).toHaveLength(0);
  });
});
