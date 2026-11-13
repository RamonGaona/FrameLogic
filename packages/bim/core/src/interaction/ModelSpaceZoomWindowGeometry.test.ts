import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getModelSpaceZoomWindowFrame } from "./ModelSpaceZoomWindowGeometry";

const viewport = {
  left: 30, top: 50, width: 800, height: 600,
  right: 830, bottom: 650,
} as DOMRect;

describe("ZOOM · Seleccionar área (ventana)", () => {
  it("orthographic: centers the chosen region, keeps orientation and increases zoom", () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 75, -75, 0.1, 10000);
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const frame = getModelSpaceZoomWindowFrame(camera, new THREE.Vector3(),
      viewport, { x1: 430, y1: 200, x2: 630, y2: 500 });
    expect(frame).not.toBeNull();
    expect(frame!.orthographicZoom).toBeCloseTo(1.84);
    // Center of the viewport rectangle is 100 px to the right of screen center.
    expect(frame!.target.x).toBeCloseTo(25);
    expect(frame!.target.y).toBeCloseTo(0);
    expect(frame!.position.z).toBeCloseTo(1000);
    const originalForward = camera.getWorldDirection(new THREE.Vector3());
    const moved = camera.clone();
    moved.position.copy(frame!.position);
    moved.lookAt(frame!.target);
    expect(moved.getWorldDirection(new THREE.Vector3()).distanceTo(originalForward)).toBeLessThan(1e-10);
  });

  it("perspective: moves closer to the target plane and frames screen-window corners", () => {
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 10000);
    camera.position.set(300, -600, 1000);
    const target = new THREE.Vector3(25, 5, 10);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    const beforeDistance = camera.position.distanceTo(target);
    const frame = getModelSpaceZoomWindowFrame(camera, target, viewport,
      { x1: 230, y1: 200, x2: 630, y2: 500 });
    expect(frame?.orthographicZoom).toBeNull();
    expect(frame?.viewScale).toBeCloseTo((0.5) / 0.92);
    expect(frame!.position.distanceTo(frame!.target)).toBeCloseTo(beforeDistance * 0.5 / 0.92);

    const facing = camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(facing, target);
    const corner = (x: number, y: number) => {
      const ndc = new THREE.Vector2(
        (x - viewport.left) / viewport.width * 2 - 1,
        1 - (y - viewport.top) / viewport.height * 2,
      );
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      return ray.ray.intersectPlane(plane, new THREE.Vector3())!;
    };
    const corners = [
      corner(230, 200), corner(630, 200), corner(230, 500), corner(630, 500),
    ];
    camera.position.copy(frame!.position);
    camera.lookAt(frame!.target);
    camera.updateMatrixWorld(true);
    for (const point of corners) {
      const p = point.project(camera);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(0.921);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(0.921);
    }
  });

  it("rejects tiny windows, off-canvas zero-size rectangles and invalid values", () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 75, -75, 0.1, 10000);
    camera.position.set(0, 0, 1000);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const target = new THREE.Vector3();
    expect(getModelSpaceZoomWindowFrame(camera, target, viewport,
      { x1: 100, y1: 100, x2: 102, y2: 104 })).toBeNull();
    expect(getModelSpaceZoomWindowFrame(camera, target, viewport,
      { x1: 100, y1: 100, x2: 100, y2: 100 })).toBeNull();
    expect(getModelSpaceZoomWindowFrame(camera, target, viewport,
      { x1: Infinity, y1: 100, x2: 200, y2: 250 })).toBeNull();
    const opposite = getModelSpaceZoomWindowFrame(camera, target, viewport,
      { x1: 700, y1: 500, x2: 120, y2: 90 });
    expect(opposite).not.toBeNull();
    expect(opposite!.orthographicZoom).toBeGreaterThan(0);
  });
});
