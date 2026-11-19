import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { NativeExactSnapPoint } from "./NativeStepExactSnapController";
import { nativeAxisUntilOffset, pickNativeAxisUntilReference } from "./NativeStepAxisUntil";
import { NativeStepMoveController, resolveNativeIsolatedStepTarget } from "./NativeStepMoveController";
import { resolveNativeStepPartScope } from "./NativeStepPartScope";
import {
  buildNativeStepMeshGroup,
  disposeNativeStepMeshGroup,
} from "./NativeStepViewportModel";

function setup() {
  const root = new THREE.Group();
  const create = (id: string, x: number) => {
    const group = buildNativeStepMeshGroup({
      brepDocumentId: id,
      meshes: [{
        id: "panel",
        positions: new Float32Array([-5, -5, 0, 5, -5, 0, 0, 5, 0]),
        indices: new Uint32Array([0, 1, 2]),
      }],
      products: [{ id: "plate", geometryIds: ["panel"], childIds: [] }],
    });
    group.position.x = x;
    root.add(group);
    return group;
  };
  const source = create("brep-source", 0);
  const reference = create("brep-ref", 20);
  const scope = resolveNativeStepPartScope(root, source.children[0] as THREE.Mesh)!;
  const target = resolveNativeIsolatedStepTarget(scope)!;
  const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 200);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const rect = { left: 0, top: 0, width: 400, height: 400 };
  const screen = (point: THREE.Vector3) => {
    const p = point.clone().project(camera);
    return { clientX: (p.x + 1) * 200, clientY: (1 - p.y) * 200 };
  };
  const snap = (id: string): NativeExactSnapPoint => ({
    id: id + ":v",
    brepDocumentId: id, sourceFileName: id + ".step",
    kind: "VERTEX", point: new THREE.Vector3(0, 0, 0),
  });
  const indices = new Map<string, readonly NativeExactSnapPoint[]>([
    ["brep-ref", [snap("brep-ref")]],
  ]);
  return { root, source, reference, scope, target, camera, rect, screen, indices };
}

describe("Native MOVER HASTA / COPIAR HASTA axis picking", () => {
  it("projects the destination onto only the selected X/Y/Z axis from gizmo pivot", () => {
    const pivot = new THREE.Vector3(5, 10, 15);
    const reference = new THREE.Vector3(35, -22, 90);
    expect(nativeAxisUntilOffset(pivot, "X", reference)?.toArray()).toEqual([30, 0, 0]);
    expect(nativeAxisUntilOffset(pivot, "Y", reference)?.toArray()).toEqual([0, -32, 0]);
    expect(nativeAxisUntilOffset(pivot, "Z", reference)?.toArray()).toEqual([0, 0, 75]);
    expect(pivot.toArray()).toEqual([5, 10, 15]);
    expect(reference.toArray()).toEqual([35, -22, 90]);
  });

  it("rejects zero-distance on the selected axis and invalid or unsafe coordinates", () => {
    const origin = new THREE.Vector3();
    expect(nativeAxisUntilOffset(origin, "X", new THREE.Vector3(0, 5, 10))).toBeNull();
    expect(nativeAxisUntilOffset(origin, "Z", new THREE.Vector3(5, 10, 0))).toBeNull();
    expect(nativeAxisUntilOffset(origin, "X", new THREE.Vector3(Infinity, 0, 0))).toBeNull();
    expect(nativeAxisUntilOffset(origin, "X", new THREE.Vector3(1_000_001, 0, 0))).toBeNull();
  });

  it("prefers a visible exact OpenCascade snap over the triangle under the cursor", () => {
    const f = setup();
    const pixel = f.screen(new THREE.Vector3(20, 0, 0));
    const reference = pickNativeAxisUntilReference(
      f.root, f.indices, f.target, f.camera,
      pixel.clientX, pixel.clientY, f.rect,
    );
    expect(reference?.kind).toBe("BREP_SNAP");
    expect(reference?.point.toArray()).toEqual([20, 0, 0]);
    if (reference?.kind === "BREP_SNAP") {
      expect(reference.snap.brepDocumentId).toBe("brep-ref");
    }
    disposeNativeStepMeshGroup(f.root);
  });

  it("accepts a visible face as an approximate fallback when no snap exists", () => {
    const f = setup();
    const pixel = f.screen(new THREE.Vector3(20, -2, 0));
    const reference = pickNativeAxisUntilReference(
      f.root, new Map(), f.target, f.camera,
      pixel.clientX, pixel.clientY, f.rect,
    );
    expect(reference?.kind).toBe("SURFACE_POINT");
    expect(reference?.point.x).toBeCloseTo(20);
    expect(reference?.point.y).toBeCloseTo(-2);
    expect(reference?.point.z).toBeCloseTo(0);
    const offset = nativeAxisUntilOffset(f.scope.pivot, "X", reference!.point)!;
    expect(offset.x).toBeCloseTo(20, 9);
    expect(offset.y).toBe(0);
    expect(offset.z).toBe(0);
    disposeNativeStepMeshGroup(f.root);
  });

  it("ignores empty canvas and invisible reference geometry without fabricating a snap", () => {
    const f = setup();
    f.reference.visible = false;
    const pixel = f.screen(new THREE.Vector3(20, 0, 0));
    expect(pickNativeAxisUntilReference(
      f.root, new Map(), f.target, f.camera,
      pixel.clientX, pixel.clientY, f.rect,
    )).toBeNull();
    expect(pickNativeAxisUntilReference(
      f.root, new Map(), f.target, f.camera,
      -10, -10, f.rect,
    )).toBeNull();
    disposeNativeStepMeshGroup(f.root);
  });

  it("MOVER HASTA uses one undoable axis transaction and keeps other coordinates", () => {
    const f = setup();
    const move = new NativeStepMoveController();
    const reference = new THREE.Vector3(20, -4, 50);
    const delta = nativeAxisUntilOffset(f.scope.pivot, "X", reference)!;
    expect(move.moveBy(f.target, "X", delta.x)).toBe(true);
    expect(f.source.position.toArray()).toEqual([20, 0, 0]);
    expect(f.reference.position.toArray()).toEqual([20, 0, 0]);
    expect(move.undo()).toBe(true);
    expect(f.source.position.toArray()).toEqual([0, 0, 0]);
    expect(move.redo()).toBe(true);
    expect(f.source.position.toArray()).toEqual([20, 0, 0]);
    move.reset();
    disposeNativeStepMeshGroup(f.root);
  });

  it("Ctrl COPIAR HASTA can place repeated copies from the same original/pivot", () => {
    const f = setup();
    const move = new NativeStepMoveController();
    for (const x of [40, 60]) {
      const delta = nativeAxisUntilOffset(f.scope.pivot, "X",
        new THREE.Vector3(x, -100, 100))!;
      expect(move.copyTo(f.target, delta)).toBe(true);
    }
    expect(f.root.children).toHaveLength(4);
    expect(f.source.position.toArray()).toEqual([0, 0, 0]);
    expect(f.root.children[2].position.toArray()).toEqual([40, 0, 0]);
    expect(f.root.children[3].position.toArray()).toEqual([60, 0, 0]);
    expect(move.undo()).toBe(true);
    expect(move.undo()).toBe(true);
    expect(f.root.children).toHaveLength(2);
    expect(f.source.position.toArray()).toEqual([0, 0, 0]);
    expect(move.redo()).toBe(true);
    expect(move.redo()).toBe(true);
    expect(f.root.children).toHaveLength(4);
    move.reset();
    disposeNativeStepMeshGroup(f.root);
  });
});
