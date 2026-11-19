import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  FrameLogicCameraController,
  type FrameLogicCameraDriver,
} from "./FrameLogicCameraController";

function fixture() {
  let activeCamera: THREE.Camera = new THREE.OrthographicCamera();
  let enabled = true;
  let azimuth = Math.PI / 4;
  let polar = Math.PI / 3;
  const listeners = new Set<() => void>();
  let minZoom = 0;
  const mouseButtons = { left: 0, middle: 1, right: 2, wheel: 8 };
  const ortho = new THREE.OrthographicCamera();
  const rotateTo = vi.fn(async (nextAzimuth: number, nextPolar: number) => {
    azimuth = nextAzimuth;
    polar = nextPolar;
  });
  const setLookAt = vi.fn(async () => undefined);
  const zoomTo = vi.fn(async () => undefined);
  const driver: FrameLogicCameraDriver = {
    getAzimuth: () => azimuth,
    getPolar: () => polar,
    getEnabled: () => enabled,
    setEnabled: (next) => { enabled = next; },
    rotateTo,
    setLookAt,
    zoomTo,
    subscribeUpdate: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    getDistance: () => 100,
    getTarget: (target) => target.set(1, 2, 3),
    getOrthographicCamera: () => ortho,
    setMinimumZoom: (value) => { minZoom = value; },
    getMouseButtons: () => mouseButtons,
  };
  const camera = new FrameLogicCameraController(() => activeCamera, driver);
  return {
    camera,
    listeners,
    rotateTo,
    setLookAt,
    zoomTo,
    getMinimumZoom: () => minZoom,
    mouseButtons,
    ortho,
    replaceCamera: (replacement: THREE.Camera) => { activeCamera = replacement; },
  };
}

describe("FrameLogicCameraController", () => {
  it("uses the active THREE.Camera without caching a stale reference", () => {
    const f = fixture();
    const first = f.camera.camera;
    const second = new THREE.OrthographicCamera();
    f.replaceCamera(second);
    expect(f.camera.camera).toBe(second);
    expect(f.camera.camera).not.toBe(first);
  });

  it("forwards CAD camera locks without altering navigation state", () => {
    const f = fixture();
    expect(f.camera.enabled).toBe(true);
    f.camera.setEnabled(false);
    expect(f.camera.enabled).toBe(false);
    f.camera.setEnabled(true);
    expect(f.camera.enabled).toBe(true);
  });

  it("delegates orientation, look-at and zoom commands", async () => {
    const f = fixture();
    const position = new THREE.Vector3(100, 200, 300);
    const target = new THREE.Vector3(1, 2, 3);
    await f.camera.rotateTo(1, 2, false);
    await f.camera.setLookAt(position, target, false);
    await f.camera.zoomTo(0.2, false);
    expect(f.rotateTo).toHaveBeenCalledWith(1, 2, false);
    expect(f.camera.orientation).toEqual({ azimuth: 1, polar: 2 });
    expect(f.setLookAt).toHaveBeenCalledWith(position, target, false);
    expect(f.zoomTo).toHaveBeenCalledWith(0.2, false);
  });

  it("exposes target, native ortho camera and minimum zoom through FrameLogic", () => {
    const f = fixture();
    const target = new THREE.Vector3();
    expect(f.camera.distance).toBe(100);
    expect(f.camera.getTarget(target)).toBe(target);
    expect(target.toArray()).toEqual([1, 2, 3]);
    expect(f.camera.orthographicCamera).toBe(f.ortho);
    f.camera.setMinimumZoom(1e-8);
    expect(f.getMinimumZoom()).toBe(1e-8);
    expect(f.camera.mouseBindings.mouseButtons).toBe(f.mouseButtons);
  });

  it("emits initial and updated camera orientations and unsubscribes", () => {
    const f = fixture();
    const observed: Array<{ azimuth: number; polar: number }> = [];
    const unsubscribe = f.camera.subscribeOrientation((o) => observed.push(o));
    expect(observed).toHaveLength(1);
    expect(f.listeners.size).toBe(1);
    for (const listener of f.listeners) listener();
    expect(observed).toHaveLength(2);
    unsubscribe();
    expect(f.listeners.size).toBe(0);
    expect(observed[1]).toEqual(observed[0]);
  });
});
