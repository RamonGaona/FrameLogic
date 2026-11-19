import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  createNativeMoveGizmo,
  nativeMoveAxisDistanceFromPixels,
  pickNativeMoveAxis,
  pickNativeMoveCenter,
  getNativeMoveCenterScreenPosition,
  isNativeSnapCoveredByMoveCenter,
  setNativeMoveCenterHovered,
} from "./NativeStepMoveGizmo";

function camera() {
  const c = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
  c.position.set(160, -180, 190);
  c.up.set(0, 0, 1);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
  return c;
}

describe("Native Three.js movement gizmo preview", () => {
  it("constructs X/Y/Z axes without modifying the STEP mesh root", () => {
    const gizmo = createNativeMoveGizmo(new THREE.Vector3(1, 2, 3), 500);
    expect(gizmo.group.children).toHaveLength(4);
    expect(gizmo.centerHandle.userData["nativeMovePivotCenter"]).toBe(true);
    expect(gizmo.group.position.toArray()).toEqual([1, 2, 3]);
    const allAxes: string[] = [];
    gizmo.group.traverse((object) => {
      const axis = object.userData["nativeMoveAxis"];
      if (axis) allAxes.push(axis as string);
    });
    expect(new Set(allAxes)).toEqual(new Set(["X", "Y", "Z"]));
    gizmo.dispose();
    expect(gizmo.group.parent).toBeNull();
  });

  it("centre picker locates the pivot without touching STEP mesh geometry", () => {
    const gizmo = createNativeMoveGizmo(new THREE.Vector3(5, 8, 3), 300);
    const c = camera();
    const pivot = gizmo.group.position.clone().project(c);
    const rect = { left: 50, top: 40, width: 400, height: 400 };
    const x = rect.left + (pivot.x + 1) * rect.width * 0.5;
    const y = rect.top + (1 - pivot.y) * rect.height * 0.5;
    expect(pickNativeMoveCenter(gizmo, c, x, y, rect)).toBe(true);
    expect(pickNativeMoveCenter(gizmo, c, rect.left - 1, y, rect)).toBe(false);
    expect(gizmo.group.position.toArray()).toEqual([5, 8, 3]);
    gizmo.dispose();
  });

  it("highlights the centre on hover, then restores its original appearance", () => {
    const gizmo = createNativeMoveGizmo(new THREE.Vector3(), 250);
    const original = gizmo.centerHandle.material.color.clone();
    const axis = gizmo.group.children[1] as THREE.Group;
    const axisMaterial = (axis.children[0] as THREE.Mesh<
      THREE.BufferGeometry, THREE.MeshBasicMaterial
    >).material;
    const axisColor = axisMaterial.color.clone();
    setNativeMoveCenterHovered(gizmo, true);
    expect(gizmo.centerHandle.material.color.equals(original)).toBe(false);
    expect(gizmo.centerHandle.scale.x).toBe(1.6);
    expect(gizmo.centerHandle.material.opacity).toBe(1);
    expect(gizmo.centerHandle.renderOrder).toBeGreaterThan(0);
    expect(gizmo.centerHandle.material.depthTest).toBe(false);
    expect(axisMaterial.color.equals(axisColor)).toBe(true);
    setNativeMoveCenterHovered(gizmo, false);
    expect(gizmo.centerHandle.material.color.equals(original)).toBe(true);
    expect(gizmo.centerHandle.scale.toArray()).toEqual([1, 1, 1]);
    expect(gizmo.centerHandle.material.opacity).toBeCloseTo(0.98);
    gizmo.dispose();
  });

  it("has a screen-space centre hit radius even at zoomed-out scales", () => {
    const gizmo = createNativeMoveGizmo(new THREE.Vector3(), 25);
    const c = camera();
    c.left = -2000; c.right = 2000;
    c.top = 2000; c.bottom = -2000;
    c.updateProjectionMatrix();
    const rect = { left: 20, top: 30, width: 400, height: 400 };
    const center = getNativeMoveCenterScreenPosition(gizmo, c, rect);
    expect(center).not.toBeNull();
    expect(center!.hitRadiusPx).toBeGreaterThanOrEqual(13);
    const x = rect.left + center!.x;
    const y = rect.top + center!.y;
    expect(pickNativeMoveCenter(gizmo, c, x + 12, y, rect)).toBe(true);
    expect(pickNativeMoveCenter(gizmo, c, x + 40, y, rect)).toBe(false);
    gizmo.dispose();
  });

  it("gives centre visual priority over a coincident exact SNAP but not distant snaps", () => {
    const gizmo = createNativeMoveGizmo(new THREE.Vector3(), 300);
    const c = camera();
    const rect = { width: 400, height: 400 };
    const center = getNativeMoveCenterScreenPosition(gizmo, c, rect)!;
    expect(isNativeSnapCoveredByMoveCenter(gizmo, c, {
      screenX: center.x, screenY: center.y,
    }, rect)).toBe(true);
    expect(isNativeSnapCoveredByMoveCenter(gizmo, c, {
      screenX: center.x + 50, screenY: center.y,
    }, rect)).toBe(false);
    gizmo.dispose();
  });

  it("converts projected X-axis screen motion to world millimetres", () => {
    const c = camera();
    const pivot = new THREE.Vector3(0, 0, 0);
    const axisLength = 20;
    const a = pivot.clone().project(c);
    const b = pivot.clone().add(new THREE.Vector3(axisLength, 0, 0)).project(c);
    const pixelDx = (b.x - a.x) * 200;
    const pixelDy = -(b.y - a.y) * 200;
    const delta = nativeMoveAxisDistanceFromPixels(
      c, pivot, "X", axisLength, pixelDx, pixelDy, 400, 400,
    );
    expect(delta).toBeCloseTo(axisLength);
  });

  it("rejects axis drag when projected direction is too small", () => {
    const c = new THREE.OrthographicCamera(-100, 100, 100, -100, 0.1, 1000);
    c.position.set(100, 0, 0);
    c.up.set(0, 0, 1);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    c.updateProjectionMatrix();
    expect(nativeMoveAxisDistanceFromPixels(
      c, new THREE.Vector3(), "X", 10, 20, 15, 400, 400,
    )).toBeNull();
  });

  it("raycasts native handle independently from the STEP model root", () => {
    const gizmo = createNativeMoveGizmo(new THREE.Vector3(), 300);
    const c = camera();
    const point = new THREE.Vector3(gizmo.axisLengthMm * 0.8, 0, 0);
    const p = point.project(c);
    const x = (p.x + 1) * 200;
    const y = (1 - p.y) * 200;
    expect(pickNativeMoveAxis(gizmo, c, x, y,
      { left: 0, top: 0, width: 400, height: 400 })).toBe("X");
    gizmo.dispose();
  });
});
