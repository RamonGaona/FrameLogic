import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createNativeProjectRotationRings,
  nativeProjectRotationDragAngle,
  nativeProjectRotationFromStart,
  pickNativeProjectRotationRing,
  sizeNativeProjectRotationRings,
} from "./NativeProjectRotationRings";

const camera = new THREE.OrthographicCamera(-200, 200, 200, -200, 0.1, 1000);
camera.position.set(0, 0, 300);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();
const rect = { left: 100, top: 200, width: 400, height: 400 };
const center: readonly [number, number] = [300, 400];

describe("native project rotation rings under inspector camera", () => {
  it("starts hidden until explicit Rotate and picks the XY-screen Z ring", () => {
    const rings = createNativeProjectRotationRings();
    sizeNativeProjectRotationRings(rings.group, camera, 400);
    rings.group.visible = false;
    expect(pickNativeProjectRotationRing(rings.group, camera, 350, 350, rect)).toBeNull();
    rings.group.visible = true;
    expect(pickNativeProjectRotationRing(rings.group, camera, 350, 350, rect)).toBe("Z");
    expect(pickNativeProjectRotationRing(rings.group, camera, 300, 400, rect)).toBeNull();
    rings.dispose();
    expect(rings.group.children).toHaveLength(0);
  });

  it("converts a quarter-circle drag into +90 degrees around world Z", () => {
    const radians = nativeProjectRotationDragAngle(
      camera, new THREE.Vector3(), "Z",
      [350, 350], [250, 350], rect,
    );
    expect(radians).not.toBeNull();
    expect(radians).toBeCloseTo(Math.PI / 2, 4);
    const rotated = nativeProjectRotationFromStart(new THREE.Quaternion(), "Z", radians!);
    const x = new THREE.Vector3(1, 0, 0).applyQuaternion(rotated!);
    expect(x.x).toBeCloseTo(0, 4);
    expect(x.y).toBeCloseTo(1, 4);
  });

  it("does not rotate when the camera sees an axis plane exactly edge-on", () => {
    expect(nativeProjectRotationDragAngle(
      camera, new THREE.Vector3(), "X",
      [350, 350], [250, 350], rect,
    )).toBeNull();
    expect(nativeProjectRotationFromStart(new THREE.Quaternion(), "Z", Number.NaN)).toBeNull();
  });

  it("keeps rotation ring size stable across orthographic zoom", () => {
    const rings = createNativeProjectRotationRings();
    const view = camera.clone();
    view.zoom = 1;
    view.updateProjectionMatrix();
    sizeNativeProjectRotationRings(rings.group, view, 400);
    const scale1 = rings.group.scale.x;
    view.zoom = 4;
    view.updateProjectionMatrix();
    sizeNativeProjectRotationRings(rings.group, view, 400);
    expect(rings.group.scale.x).toBeCloseTo(scale1 / 4);
    rings.dispose();
  });

  it("never mutates the source STEP/CAD quaternion when computing rotation", () => {
    const original = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0), Math.PI / 3,
    );
    const before = original.clone();
    const rotated = nativeProjectRotationFromStart(original, "Y", Math.PI / 2);
    expect(original.equals(before)).toBe(true);
    expect(rotated!.equals(original)).toBe(false);
  });
});
