import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import { CadLineSceneController } from "./CadLineSceneController";

describe("DWG references render in GPU batches instead of one draw call per line", () => {
  it("shows 12,000 reference segments in only two WebGL draw calls, keeping exact model geometry", () => {
    const model = new DesignModel();
    const green = model.layers.create({
      name: "CAD CUNAS_MEDIR 1 · DIAGONALES", color: "#00ff00",
      visible: true, locked: false, snapEnabled: true,
    });
    const yellow = model.layers.create({
      name: "CAD CUNAS_MEDIR 1 · ESTRUCTURA", color: "#ffff00",
      visible: true, locked: false, snapEnabled: true,
    });
    const editable = model.layers.create({
      name: "CAD EDITABLE NATIVE", color: "#ffffff",
      visible: true, locked: false, snapEnabled: true,
    });
    for (let i = 0; i < 12_000; i++) {
      model.registerCadLine({
        layerId: i % 2 === 0 ? green.id : yellow.id,
        start: { x: 250_000 + i, y: 400_000 + i, z: 0 },
        end: { x: 250_040 + i, y: 400_030 + i, z: 0 },
      });
    }
    const native = model.registerCadLine({
      layerId: editable.id,
      start: { x: 0, y: 0, z: 0 },
      end: { x: 100, y: 0, z: 0 },
    });
    const scene = new THREE.Scene();
    const lines = new CadLineSceneController(scene, model);
    lines.sync();
    expect(model.cadLines.count).toBe(12_001);
    expect(lines.getReferenceBatchCount()).toBe(2);
    expect(lines.getLineObjects()).toHaveLength(3);
    expect(lines.getLineObject(native.id)).toBeDefined();
    expect(scene.children).toHaveLength(3);
    expect(lines.getReferenceBatchEntries().map(([, obj]) =>
      (obj.material as THREE.LineBasicMaterial).color.getHexString()).sort()
    ).toEqual(["00ff00", "ffff00"]);
    const greenBatch = lines.getReferenceBatchEntries()
      .find(([id]) => id === green.id)?.[1];
    expect(greenBatch).toBeDefined();
    expect(greenBatch!.geometry.getAttribute("position").count).toBe(12_000);
    // Vertices are stored relative to the batch origin, for exact large-site CAD.
    expect(greenBatch!.geometry.getAttribute("position").getX(0)).toBe(0);
    const box = new THREE.Box3().setFromObject(greenBatch!);
    expect(box.max.x).toBeGreaterThan(261_000);
    // Edits update the same GPU batch instead of creating separate draw calls.
    const first = model.cadLines.getAll()[0]!;
    model.cadLines.updateGeometry(first.id,
      { x: 400_000, y: 600_000, z: 0 },
      { x: 400_010, y: 600_010, z: 0 });
    lines.sync();
    expect(lines.getReferenceBatchCount()).toBe(2);
    expect(lines.getLineObjects()).toHaveLength(3);
    expect(new THREE.Box3().setFromObject(greenBatch!).max.x).toBeGreaterThan(399_000);
    model.layers.update(green.id, { visible: false });
    lines.sync();
    expect(greenBatch!.visible).toBe(false);
    lines.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("native CAD geometry stays individually selectable and import visuals never replace its IDs", () => {
    const model = new DesignModel();
    const original = model.layers.create({
      name: "CAD test.dwg · 0", visible: true, locked: false, color: "#00ffff",
    });
    const nativeLayer = model.layers.create({
      name: "Editable", visible: true, locked: false, color: "#ff00ff",
    });
    const reference = model.registerCadLine({
      layerId: original.id,
      start: { x: 1, y: 2, z: 0 }, end: { x: 3, y: 4, z: 0 },
    });
    const native = model.registerCadLine({
      layerId: nativeLayer.id,
      start: { x: 5, y: 6, z: 0 }, end: { x: 7, y: 8, z: 0 },
    });
    const scene = new THREE.Scene();
    const lines = new CadLineSceneController(scene, model);
    lines.sync();
    expect(lines.getLineObject(reference.id)).toBeUndefined();
    expect(lines.getLineObject(native.id)).toBeDefined();
    lines.setSelectedIds([native.id]);
    expect((lines.getLineObject(native.id)!.material as THREE.LineBasicMaterial)
      .color.getHexString()).toBe("ffc533");
    lines.setSelectedIds([]);
    expect((lines.getLineObject(native.id)!.material as THREE.LineBasicMaterial)
      .color.getHexString()).toBe("ff00ff");
    lines.setHidden(reference.id, true);
    expect(lines.getReferenceBatchCount()).toBe(0);
    lines.setHidden(reference.id, false);
    expect(lines.getReferenceBatchCount()).toBe(1);
    lines.dispose();
  });
});
