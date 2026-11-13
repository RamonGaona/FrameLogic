import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import { CadScreenSpatialIndex, getNearbyCadLines, MAX_VISIBLE_CAD_SNAP_RECORDS } from "./CadScreenSpatialIndex";
import { getStandaloneCadEntities } from "../navigation/ModelSpaceInstanceTreeBridgeController";

function view() {
  const camera = new THREE.OrthographicCamera(-200, 200, 150, -150, 0.1, 10000);
  camera.position.set(0, 0, 2000);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const rect = { left: 0, top: 0, width: 1000, height: 750 } as DOMRect;
  return { camera, rect };
}

describe("Spatial CAD SNAP queries for very large imported DWG references", () => {
  it("searches 40,000 segments locally instead of comparing 800 million line pairs", () => {
    const model = new DesignModel();
    const layer = model.layers.create({
      name: "CAD CUNAS_MEDIR 1 · 0", visible: true, locked: false,
      color: "#ffff00", snapEnabled: true,
    });
    for (let i = 0; i < 40_000; i++) {
      model.registerCadLine({
        layerId: layer.id,
        start: { x: 1000 + (i % 200) * 4, y: 1000 + Math.floor(i / 200) * 4, z: 0 },
        end: { x: 1001 + (i % 200) * 4, y: 1002 + Math.floor(i / 200) * 4, z: 0 },
      });
    }
    const near = model.registerCadLine({
      layerId: layer.id, start: { x: -10, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 },
    });
    const crossing = model.registerCadLine({
      layerId: layer.id, start: { x: 0, y: -10, z: 0 }, end: { x: 0, y: 10, z: 0 },
    });
    const { camera, rect } = view();
    const index = new CadScreenSpatialIndex(model);
    const a = index.query(camera, rect, 500, 375, 20, 96);
    expect(a.map(v => v.id)).toContain(near.id);
    expect(a.map(v => v.id)).toContain(crossing.id);
    expect(a.length).toBeLessThan(12);
    expect(index.rebuildCount).toBe(1);
    index.query(camera, rect, 500, 375, 20, 96);
    expect(index.rebuildCount).toBe(1);
    model.cadLines.updateGeometry(near.id,
      { x: 10000, y: 10000, z: 0 }, { x: 10001, y: 10001, z: 0 });
    const updated = index.query(camera, rect, 500, 375, 20, 96);
    expect(index.rebuildCount).toBe(2);
    expect(updated.map(v => v.id)).not.toContain(near.id);
    camera.zoom = 0.25;
    camera.updateProjectionMatrix();
    index.query(camera, rect, 500, 375, 20, 96);
    expect(index.rebuildCount).toBe(3);
  });

  it("always retains a very long line crossing the cursor, even if it spans many grid cells", () => {
    const model = new DesignModel();
    const layer = model.layers.create({ name: "CAD bridge · 0", visible: true, locked: false });
    const line = model.registerCadLine({
      layerId: layer.id,
      start: { x: -1_000_000, y: 0, z: 0 },
      end: { x: 1_000_000, y: 0, z: 0 },
    });
    const { camera, rect } = view();
    expect(getNearbyCadLines(model, camera, rect, 500, 375, 10).map(l => l.id))
      .toContain(line.id);
  });

  it("bounds SNAP cache on 120k+ DWG segments but restores exact local snaps after zoom", () => {
    const model = new DesignModel();
    const layer = model.layers.create({
      name: "CAD CUNAS_MEDIR 1 · TRUSS", visible: true, locked: false,
      color: "#ffff00", snapEnabled: true,
    });
    for (let i = 0; i < MAX_VISIBLE_CAD_SNAP_RECORDS + 750; i++) {
      model.registerCadLine({
        layerId: layer.id,
        start: { x: (i % 400) - 200, y: (Math.floor(i / 400) % 300) - 150, z: 0 },
        end: { x: (i % 400) - 199.6, y: (Math.floor(i / 400) % 300) - 149.6, z: 0 },
      });
    }
    const precise = model.registerCadLine({
      layerId: layer.id,
      start: { x: -1, y: 0, z: 0 },
      end: { x: 1, y: 0, z: 0 },
    });
    const { camera, rect } = view();
    const index = new CadScreenSpatialIndex(model);
    index.query(camera, rect, 500, 375, 20);
    expect(index.visibleCount).toBeGreaterThan(MAX_VISIBLE_CAD_SNAP_RECORDS);
    expect(index.indexedCount).toBe(MAX_VISIBLE_CAD_SNAP_RECORDS);
    expect(index.sampled).toBe(true);
    // Once zoomed into a smaller region, all nearby source lines become
    // exact candidates; there is no global DWG geometry cap.
    camera.zoom = 40;
    camera.updateProjectionMatrix();
    const nearby = index.query(camera, rect, 500, 375, 20, 96);
    expect(index.sampled).toBe(false);
    expect(nearby.map((line) => line.id)).toContain(precise.id);
  }, 60_000);

  it("preserves separate native CAD entities but never lists DWG members individually in INSTANCIAS", () => {
    const model = new DesignModel();
    const dwg = model.layers.create({
      name: "CAD CUNAS_MEDIR 1 · TRUSS", visible: true, locked: false,
    });
    const native = model.layers.create({
      name: "Model Sketch", visible: true, locked: false,
    });
    for (let i = 0; i < 34_200; i++) {
      model.registerCadLine({
        layerId: dwg.id,
        start: { x: i, y: 0, z: 0 },
        end: { x: i + 1, y: 1, z: 0 },
      });
    }
    const selected = model.registerCadLine({
      layerId: native.id,
      start: { x: 2, y: 2, z: 0 }, end: { x: 4, y: 2, z: 0 },
    });
    const entities = getStandaloneCadEntities(model);
    expect(entities.lines.map(x => x.id)).toEqual([selected.id]);
    expect(entities.points).toHaveLength(0);
    // Reference members still exist in the model, for exact geometry & undo.
    expect(model.cadLines.count).toBe(34_201);
  });
});
