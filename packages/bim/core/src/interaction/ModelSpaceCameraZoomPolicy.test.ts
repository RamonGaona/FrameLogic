import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  allowPerspectiveDistance,
  allowZoomOutTo,
  getOrthographicZoomForBounds,
} from "./ModelSpaceCameraZoomPolicy";
import { ModelSpaceZoomExtentsController } from "./ModelSpaceZoomExtentsController";

function topCamera() {
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 1, 10_000_000);
  camera.position.set(0, 0, 1000);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return camera;
}

describe("DWG camera zoom-out policy", () => {
  it("fits a 226000 mm wide drawing even when the original minZoom would crop it", () => {
    const camera = topCamera();
    const bounds = new THREE.Box3(
      new THREE.Vector3(0, -5000, 0),
      new THREE.Vector3(226000, 5000, 0),
    );
    const wanted = getOrthographicZoomForBounds(camera, bounds);
    expect(wanted).toBeGreaterThan(0);
    expect(wanted).toBeLessThan(0.0001);
    const ctrl = { minZoom: 0.0001 };
    allowZoomOutTo(ctrl, wanted);
    expect(ctrl.minZoom).toBeLessThan(wanted);
    expect(Math.abs(camera.right - camera.left) / wanted).toBeGreaterThan(226000);
    expect(Math.abs(camera.top - camera.bottom) / wanted).toBeGreaterThan(10000);
  });

  it("supports drawing far off the model origin and a tilted 3D view", () => {
    const camera = topCamera();
    camera.position.set(10000, -10000, 10000);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const bounds = new THREE.Box3(
      new THREE.Vector3(300000, 400000, -1000),
      new THREE.Vector3(526000, 450000, 3000),
    );
    const zoom = getOrthographicZoomForBounds(camera, bounds);
    const quat = camera.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quat);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    const size = bounds.getSize(new THREE.Vector3());
    const projectedWidth = Math.abs(size.x * right.x) + Math.abs(size.y * right.y) + Math.abs(size.z * right.z);
    const projectedHeight = Math.abs(size.x * up.x) + Math.abs(size.y * up.y) + Math.abs(size.z * up.z);
    expect(20 / zoom).toBeGreaterThan(projectedWidth);
    expect(20 / zoom).toBeGreaterThan(projectedHeight);
  });

  it("does not restrict existing ability to zoom close to a small piece", () => {
    const ctrl = { minZoom: 1e-8 };
    allowZoomOutTo(ctrl, 5);
    expect(ctrl.minZoom).toBe(1e-8);
  });

  it("unblocks perspective distance when a camera-control maxDistance is finite", () => {
    const ctrl = { maxDistance: 10000 };
    allowPerspectiveDistance(ctrl, 500000);
    expect(ctrl.maxDistance).toBeGreaterThan(500000);
    allowPerspectiveDistance(ctrl, 1000);
    expect(ctrl.maxDistance).toBeGreaterThan(500000);
  });
});

describe("Zoom Extents with a real-size DWG line and narrow viewport", () => {
  it("re-centers a 226000 mm line and zooms below the old 0.0001 cap", async () => {
    const camera = topCamera();
    const controls = {
      minDistance: 20, minZoom: 0.0001, maxDistance: 10000,
      fitToBox: vi.fn(async () => {}),
      setLookAt: vi.fn(async (
        px: number, py: number, pz: number, tx: number, ty: number, tz: number,
      ) => {
        camera.position.set(px, py, pz);
        camera.lookAt(tx, ty, tz);
        camera.updateMatrixWorld(true);
      }),
      zoomTo: vi.fn(async (zoom: number) => {
        camera.zoom = Math.max(zoom, controls.minZoom);
        camera.updateProjectionMatrix();
      }),
    };
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -250, 0),
        new THREE.Vector3(226000, 250, 0),
      ]),
      new THREE.LineBasicMaterial(),
    );
    line.updateWorldMatrix(true, true);
    const controller = Object.create(ModelSpaceZoomExtentsController.prototype) as ModelSpaceZoomExtentsController;
    Reflect.set(controller, "options", {
      cameraProvider: () => camera,
      controls,
      cadLineScene: { getLineObjects: () => [line] },
      cadPointScene: { getPointObjects: () => [] },
      designScene: { getInstanceObjects: () => [] },
      getLoadedModels: () => [],
    });
    Reflect.set(controller, "showHint", vi.fn());
    const zoomExtents = Reflect.get(controller, "zoomExtents") as
      (this: ModelSpaceZoomExtentsController) => Promise<void>;
    await zoomExtents.call(controller);
    expect(controls.fitToBox).not.toHaveBeenCalled();
    expect(controls.minZoom).toBeLessThan(0.0001);
    expect(camera.zoom).toBeLessThan(0.0001);
    expect(20 / camera.zoom).toBeGreaterThan(226000);
    expect(controls.setLookAt).toHaveBeenCalledOnce();
    const args = controls.setLookAt.mock.calls[0];
    expect(args?.[3]).toBeCloseTo(113000);
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  });
});
