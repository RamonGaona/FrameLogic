import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadLinePlacementController } from "./CadLinePlacementController";
import {
  findFirstCadTrajectoryIntersection,
  intersectCadTrajectorySegments,
} from "./CadLineTrajectoryIntersection";

function view() {
  const camera = new THREE.OrthographicCamera(-200, 200, 150, -150, 0.1, 10000);
  camera.position.set(0, 0, 2000);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const rect = { left: 0, top: 0, width: 1000, height: 750 } as DOMRect;
  return { camera, rect };
}

function modelWithLayer() {
  const model = new DesignModel();
  const layer = model.layers.create({
    name: "CAD Obra · 0", visible: true, locked: false, snapEnabled: true,
  });
  return { model, layer };
}

describe("LINE · trayectoria e intersección geométrica", () => {
  it("snaps to the first finite intersection with existing native CAD lines", () => {
    const { model, layer } = modelWithLayer();
    const first = model.registerCadLine({
      layerId: layer.id,
      start: { x: -5, y: -20, z: 0 }, end: { x: -5, y: 20, z: 0 },
    });
    model.registerCadLine({
      layerId: layer.id,
      start: { x: 12, y: -20, z: 0 }, end: { x: 12, y: 20, z: 0 },
    });
    const { camera, rect } = view();
    const hit = findFirstCadTrajectoryIntersection(model, camera, rect,
      new THREE.Vector3(-30, 0, 0), new THREE.Vector3(25, 0, 0));
    expect(hit?.type).toBe("INTERSECTION");
    expect(hit?.lineId).toBe(first.id);
    expect(hit?.point.toArray()).toEqual([-5, 0, 0]);
  });

  it("uses exact transformed DWG/DXF packed segments, without exploding them", () => {
    const { model, layer } = modelWithLayer();
    const buffer = new Float64Array([0, -20, 0, 0, 20, 0]);
    const transform = new THREE.Matrix4().makeTranslation(7, 0, 5)
      .multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2))
      .toArray();
    // Local horizontal segment becomes a world vertical segment after rotation.
    const geometry = new Float64Array([-20, 0, 0, 20, 0, 0]);
    model.cadLines.registerPackedBatch({
      id: "dwg-1", layerId: layer.id, positions: geometry, transform,
    });
    const { camera, rect } = view();
    const hit = findFirstCadTrajectoryIntersection(model, camera, rect,
      new THREE.Vector3(-30, 0, 5), new THREE.Vector3(25, 0, 5));
    expect(hit?.lineId).toBe("cota:dwg-1:0");
    expect(hit?.point.x).toBeCloseTo(7);
    expect(hit?.point.y).toBeCloseTo(0);
    expect(hit?.point.z).toBeCloseTo(5);
    expect(model.cadLines.getAll()).toHaveLength(0);
    expect(geometry[0]).toBe(-20);
    expect(buffer.length).toBe(6);
  });

  it("does not snap screen crossings at different elevations or outside finite segments", () => {
    const { model, layer } = modelWithLayer();
    model.registerCadLine({
      layerId: layer.id,
      start: { x: 0, y: -20, z: 10 }, end: { x: 0, y: 20, z: 10 },
    });
    const { camera, rect } = view();
    const start = new THREE.Vector3(-25, 0, 0);
    const end = new THREE.Vector3(25, 0, 0);
    expect(findFirstCadTrajectoryIntersection(model, camera, rect, start, end))
      .toBeNull();
    expect(intersectCadTrajectorySegments(start, end,
      new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 20, 0))).toBeNull();
    expect(intersectCadTrajectorySegments(start, end,
      new THREE.Vector3(-10, 0, 0), new THREE.Vector3(10, 0, 0))).toBeNull();
  });

  it("ignores the line starting point and layers hidden or with SNAP disabled", () => {
    const { model, layer } = modelWithLayer();
    model.registerCadLine({
      layerId: layer.id,
      start: { x: -20, y: -20, z: 0 }, end: { x: -20, y: 20, z: 0 },
    });
    const { camera, rect } = view();
    const start = new THREE.Vector3(-20, 0, 0);
    const end = new THREE.Vector3(20, 0, 0);
    expect(findFirstCadTrajectoryIntersection(model, camera, rect, start, end))
      .toBeNull();
    model.registerCadLine({
      layerId: layer.id,
      start: { x: 0, y: -20, z: 0 }, end: { x: 0, y: 20, z: 0 },
    });
    expect(findFirstCadTrajectoryIntersection(model, camera, rect, start, end)?.point.x)
      .toBeCloseTo(0);
    model.layers.update(layer.id, { snapEnabled: false });
    expect(findFirstCadTrajectoryIntersection(model, camera, rect, start, end))
      .toBeNull();
    model.layers.update(layer.id, { snapEnabled: true, visible: false });
    expect(findFirstCadTrajectoryIntersection(model, camera, rect, start, end))
      .toBeNull();
  });

  it("displays the cyan intersection marker, and Alt bypasses it without moving the base point", () => {
    const { model, layer } = modelWithLayer();
    model.registerCadLine({
      layerId: layer.id,
      start: { x: 0, y: -15, z: 0 }, end: { x: 0, y: 15, z: 0 },
    });
    const { camera, rect } = view();
    const controller = Object.create(CadLinePlacementController.prototype) as CadLinePlacementController;
    const start = new THREE.Vector3(-20, 0, 0);
    const marker = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
    marker.visible = false;
    Reflect.set(controller, "startPoint", start);
    Reflect.set(controller, "intersectionMarker", marker);
    Reflect.set(controller, "designModel", model);
    Reflect.set(controller, "cameraProvider", () => camera);
    Reflect.set(controller, "domElement", { getBoundingClientRect: () => rect });
    const snapTo = Reflect.get(controller, "snapToLineTrajectory") as
      (candidate: THREE.Vector3, ignoreIntersections?: boolean) => THREE.Vector3;
    expect(snapTo.call(controller, new THREE.Vector3(20, 0, 0)).x)
      .toBeCloseTo(0);
    expect(marker.visible).toBe(true);
    expect(marker.position.x).toBeCloseTo(0);
    expect(snapTo.call(controller, new THREE.Vector3(20, 0, 0), true).x)
      .toBeCloseTo(20);
    expect(marker.visible).toBe(false);
    expect(start.x).toBe(-20);
    marker.geometry.dispose();
    (marker.material as THREE.Material).dispose();
  });
});
