import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  copyNativeOrthographicPreviewCamera,
} from "./ExperimentalNativeThreePreview";

describe("Native Three.js orthographic diagnostic preview", () => {
  it("preserves source camera and copies orientation, zoom and Z-up", () => {
    const source = new THREE.OrthographicCamera(-200, 200, 150, -150, 1, 10000000);
    source.position.set(100, -200, 350);
    source.up.set(0, 0, 1);
    source.lookAt(0, 0, 0);
    source.zoom = 0.5;
    source.updateProjectionMatrix();

    const originalProjection = source.projectionMatrix.clone();
    const cloned = copyNativeOrthographicPreviewCamera(source, 320, 200);

    expect(cloned).not.toBe(source);
    expect(cloned.isOrthographicCamera).toBe(true);
    expect(cloned.position.toArray()).toEqual(source.position.toArray());
    expect(cloned.quaternion.toArray()).toEqual(source.quaternion.toArray());
    expect(cloned.up.toArray()).toEqual([0, 0, 1]);
    expect(cloned.zoom).toBe(0.5);
    expect(cloned.near).toBe(1);
    expect(cloned.far).toBe(10000000);
    expect(source.projectionMatrix.equals(originalProjection)).toBe(true);
    expect(source.left).toBe(-200);
    expect(source.right).toBe(200);
  });

  it("adapts only its own horizontal frustum to preview aspect ratio", () => {
    const source = new THREE.OrthographicCamera(-50, 50, 60, -40, 1, 1000);
    const target = new THREE.OrthographicCamera();
    const camera = copyNativeOrthographicPreviewCamera(source, 320, 200, target);

    expect(camera).toBe(target);
    expect(camera.top - camera.bottom).toBe(100);
    expect(camera.right - camera.left).toBe(160);
    expect((camera.left + camera.right) / 2).toBe(0);
    expect(source.right - source.left).toBe(100);
  });

  it("never recursively clones camera children every rendered frame", () => {
    const source = new THREE.OrthographicCamera();
    source.add(new THREE.Object3D());
    const destination = new THREE.OrthographicCamera();
    copyNativeOrthographicPreviewCamera(source, 320, 200, destination);
    copyNativeOrthographicPreviewCamera(source, 320, 200, destination);
    expect(destination.children).toHaveLength(0);
    expect(source.children).toHaveLength(1);
  });

  it("rejects invalid viewport sizes", () => {
    const source = new THREE.OrthographicCamera();
    expect(() => copyNativeOrthographicPreviewCamera(source, 0, 200)).toThrow(/positive/);
    expect(() => copyNativeOrthographicPreviewCamera(source, 320, -1)).toThrow(/positive/);
  });
});
