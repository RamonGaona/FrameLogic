import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import { CadLineSceneController } from "./CadLineSceneController";
import { getNearbyCadLines } from "../precision/CadScreenSpatialIndex";

describe("Cota CAD underlay rendering, SNAP, and visibility", () => {
  it("renders compact packets with double precision origins and no editable per-segment objects", () => {
    const model = new DesignModel();
    const layer = model.layers.create({
      name: "CAD CUNAS_MEDIR 1 · 0",
      visible: true, locked: false, color: "#00ffff", snapEnabled: true,
    });
    model.cadLines.registerPackedBatch({
      id: "cota-test", layerId: layer.id,
      positions: new Float64Array([461564.80125, 0, 0, 461565.80125, 0, 0]),
    });
    expect(model.cadLines.getAll()).toHaveLength(0);
    expect(model.cadLines.count).toBe(1);
    expect(model.cadLines.packedCount).toBe(1);
    const scene = new THREE.Scene();
    const renderer = new CadLineSceneController(scene, model);
    renderer.sync();
    const objects = renderer.getLineObjects();
    expect(objects).toHaveLength(1);
    expect(objects[0]?.position.x).toBeCloseTo(461564.80125, 5);
    expect(objects[0]?.geometry.getAttribute("position").getX(0)).toBe(0);
    expect(objects[0]?.geometry.getAttribute("position").getX(1)).toBe(1);
    model.layers.update(layer.id, { visible: false });
    renderer.sync();
    expect(objects[0]?.visible).toBe(false);
    model.cadLines.removePackedByLayerIds(new Set([layer.id]));
    renderer.sync();
    expect(renderer.getLineObjects()).toHaveLength(0);
    renderer.dispose();
  });

  it("allows local SNAP on packed geometry without materializing the whole DWG", () => {
    const model = new DesignModel();
    const layer = model.layers.create({
      name: "CAD CUNAS_MEDIR 1 · snap", visible: true, locked: false,
      color: "#00ffff", snapEnabled: true,
    });
    model.cadLines.registerPackedBatch({
      id: "cota-snap-test", layerId: layer.id,
      positions: new Float64Array([-10, 0, 0, 10, 0, 0]),
    });
    const camera = new THREE.OrthographicCamera(-200, 200, 150, -150, .1, 10000);
    camera.position.set(0, 0, 2000);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const rect = { left: 0, top: 0, width: 1000, height: 750 } as DOMRect;
    const candidates = getNearbyCadLines(model, camera, rect, 500, 375, 12);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.id).toMatch(/^cota:/);
    expect(candidates[0]?.start.x).toBe(-10);
    model.layers.update(layer.id, { visible: false });
    expect(getNearbyCadLines(model, camera, rect, 500, 375, 12)).toEqual([]);
  });
});
