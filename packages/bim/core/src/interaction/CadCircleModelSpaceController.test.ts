import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import { CadCircleSceneController } from "../design/CadCircleSceneController";
import { CadCircleModelSpaceController, circleCardinals } from "./CadCircleModelSpaceController";
import { CadCirclePlacementController } from "./CadCirclePlacementController";
import { CadRectanglePlacementController } from "./CadRectanglePlacementController";

function fixture() {
  const model = new DesignModel();
  const layer = model.layers.create({
    name: "CAD drawing", visible: true, locked: false, snapEnabled: true,
  });
  const circleScene = new CadCircleSceneController(new THREE.Scene(), model);
  const circle = circleScene.register({ layerId: layer.id,
    center: { x: 0, y: 0, z: 0 }, radius: 5,
    xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 1, z: 0 },
    normal: { x: 0, y: 0, z: 1 },
  });
  const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const planeState = {
    enabled: false, origin: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 0, 1),
  };
  const controller = Object.create(CadCircleModelSpaceController.prototype) as CadCircleModelSpaceController;
  Reflect.set(controller, "options", {
    domElement: { getBoundingClientRect: () => ({
      left: 0, top: 0, width: 1000, height: 1000,
    }) },
    cameraProvider: () => camera,
    designModel: model, circles: circleScene,
    workPlane: { getState: () => planeState },
  });
  return { model, layer, circle, circleScene, controller, planeState };
}

describe("native CAD circle geometry, snaps and quadrant editing", () => {
  it("provides four exact cardinal positions plus the center", () => {
    const f = fixture();
    const p = circleCardinals(f.circle);
    expect(p.E.toArray()).toEqual([5, 0, 0]);
    expect(p.W.toArray()).toEqual([-5, 0, 0]);
    expect(p.N.toArray()).toEqual([0, 5, 0]);
    expect(p.S.toArray()).toEqual([0, -5, 0]);
    expect(f.controller.findSnap(500, 500)?.type).toBe("CENTER");
    expect(f.controller.findSnap(625, 500)?.point.toArray()).toEqual([5, 0, 0]);
    expect(f.controller.findSnap(500, 375)?.point.toArray()).toEqual([0, 5, 0]);
    expect(f.controller.findSnap(375, 500)?.point.toArray()).toEqual([-5, 0, 0]);
    expect(f.controller.findSnap(500, 625)?.point.toArray()).toEqual([0, -5, 0]);
    expect(f.controller.getCircleIdAt(625, 500)).toBe(f.circle.id);
  });

  it("filters out-of-plane circle SNAPs but not valid free-3D SNAPs", () => {
    const f = fixture();
    f.planeState.enabled = true;
    f.planeState.origin.set(0, 0, 10);
    expect(f.controller.findSnap(625, 500)).toBeNull();
    f.planeState.enabled = false;
    expect(f.controller.findSnap(625, 500)?.point.toArray()).toEqual([5, 0, 0]);
  });

  it("edits radius without replacing ID, honors locked layer and renders independently", () => {
    const f = fixture();
    expect(f.circleScene.updateRadius(f.circle.id, 12)).toBe(true);
    expect(f.circleScene.get(f.circle.id)?.radius).toBe(12);
    expect(f.circleScene.getCircleObject(f.circle.id)?.name).toContain(f.circle.id);
    f.model.layers.update(f.layer.id, { locked: true });
    expect(f.circleScene.updateRadius(f.circle.id, 20)).toBe(false);
    expect(f.circleScene.get(f.circle.id)?.radius).toBe(12);
  });
});

describe("circle radius menu and 3D second point", () => {
  it("Enter selects default RADIUS instead of requiring a menu click", () => {
    const controller = Object.create(CadCirclePlacementController.prototype) as CadCirclePlacementController;
    const choose = () => {};
    const chosen: string[] = [];
    Reflect.set(controller, "active", true);
    Reflect.set(controller, "stage", "SIZE_MODE");
    Reflect.set(controller, "chooseSizeMode", (mode: string) => { chosen.push(mode); choose(); });
    const event = { key: "Enter", ctrlKey: false, metaKey: false, altKey: false,
      preventDefault() {}, stopImmediatePropagation() {} };
    (Reflect.get(controller, "handleKeyDown") as (e: unknown) => void)(event);
    expect(chosen).toEqual(["RADIUS"]);
  });

  it("uses next SNAP as default radius without an extra click", () => {
    const controller = Object.create(CadCirclePlacementController.prototype) as CadCirclePlacementController;
    const canvas = {};
    let radius = 0;
    Reflect.set(controller, "options", { domElement: canvas });
    Reflect.set(controller, "active", true);
    Reflect.set(controller, "stage", "SIZE_MODE");
    Reflect.set(controller, "getManualRadius", () => 75);
    Reflect.set(controller, "commitRadius", (r: number) => { radius = r; });
    const event = { target: canvas, button: 0, clientX: 120, clientY: 80,
      preventDefault() {}, stopImmediatePropagation() {} };
    (Reflect.get(controller, "handlePointerUp") as (e: unknown) => void)(event);
    expect(radius).toBe(75);
    expect(Reflect.get(controller, "sizeMode")).toBe("RADIUS");
  });
});

describe("rectangle numeric Tab focus trap", () => {
  it("cycles X→Y→X with Tab and Shift+Tab, never another toolbar button", () => {
    const rect = Object.create(CadRectanglePlacementController.prototype) as CadRectanglePlacementController;
    const width = { focus: () => { focused = "width"; }, select: () => {} };
    const height = { focus: () => { focused = "height"; }, select: () => {} };
    let focused = "";
    Reflect.set(rect, "active", true);
    Reflect.set(rect, "stage", "SECOND_CORNER");
    Reflect.set(rect, "widthInput", width);
    Reflect.set(rect, "heightInput", height);
    const handler = Reflect.get(rect, "handleNumericKeyDown") as (event: unknown) => void;
    const key = (target: unknown, shiftKey: boolean) => {
      let prevented = false;
      handler({ target, key: "Tab", shiftKey, preventDefault: () => { prevented = true; },
        stopImmediatePropagation() {} });
      return prevented;
    };
    expect(key(width, false)).toBe(true);
    expect(focused).toBe("height");
    expect(key(height, false)).toBe(true);
    expect(focused).toBe("width");
    expect(key(width, true)).toBe(true);
    expect(focused).toBe("height");
  });
});
