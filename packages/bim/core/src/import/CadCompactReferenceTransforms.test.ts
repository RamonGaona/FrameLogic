import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadLineSceneController } from "../design/CadLineSceneController";
import { getNearbyCadLines } from "../precision/CadScreenSpatialIndex";
import { CadReferenceBlockController } from "./CadReferenceBlockController";
import { copyCadReferenceBlocks } from "./CadReferenceCopyTransaction";

function setup() {
  const model = new DesignModel();
  const layer = model.layers.create({
    name: "CAD Placa · Ejes", visible: true, locked: false,
    color: "#ffffff", snapEnabled: true,
  });
  const positions = new Float64Array([0, 0, 0, 10, 0, 0]);
  model.cadLines.registerPackedBatch({ id: "packed-source", layerId: layer.id, positions });
  const origin = model.registerCadPoint({
    layerId: layer.id, position: { x: 0, y: 0, z: 0 },
  });
  let undo = () => {};
  let redo = () => {};
  const history = {
    recordOperation: vi.fn((_name: string, back: () => void, forward: () => void) => {
      undo = back; redo = forward;
    }),
  };
  const controller = Object.create(CadReferenceBlockController.prototype) as CadReferenceBlockController;
  const pivot = new THREE.Object3D();
  pivot.position.set(0, 0, 0);
  Reflect.set(controller, "options", { designModel: model, history });
  Reflect.set(controller, "selectedReferenceNames", new Set(["Placa"]));
  Reflect.set(controller, "activeMode", "rotate");
  Reflect.set(controller, "pivot", pivot);
  Reflect.set(controller, "syncGeometry", vi.fn());
  Reflect.set(controller, "refreshSelectionVisual", vi.fn());
  return { model, layer, positions, origin, history, controller,
    undo: () => undo(), redo: () => redo() };
}

describe("compact CAD reference transforms", () => {
  it("rotates 90° about a chosen pivot without changing any source segment and supports Undo/Redo", () => {
    const f = setup();
    f.model.cadPoints.updatePosition(f.origin.id, { x: 5, y: 0, z: 0 });
    const pivot = Reflect.get(f.controller, "pivot") as THREE.Object3D;
    pivot.position.set(5, 0, 0);
    const source = [...f.positions];
    expect(f.controller.applyNumericRotation("Z", 90)).toBe(true);
    expect([...f.positions]).toEqual(source);
    let packet = f.model.cadLines.getPackedBatches()[0]!;
    const transformPoint = (x: number) =>
      new THREE.Vector3(x, 0, 0).applyMatrix4(new THREE.Matrix4().fromArray(packet.transform!));
    expect(transformPoint(0).x).toBeCloseTo(5);
    expect(transformPoint(0).y).toBeCloseTo(-5);
    expect(transformPoint(10).y).toBeCloseTo(5);
    expect(f.model.cadPoints.get(f.origin.id)?.position.x).toBeCloseTo(5);
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
    f.undo();
    packet = f.model.cadLines.getPackedBatches()[0]!;
    expect(new THREE.Vector3(10, 0, 0)
      .applyMatrix4(new THREE.Matrix4().fromArray(packet.transform!)).x).toBeCloseTo(10);
    f.redo();
    packet = f.model.cadLines.getPackedBatches()[0]!;
    expect(new THREE.Vector3(10, 0, 0)
      .applyMatrix4(new THREE.Matrix4().fromArray(packet.transform!)).y).toBeCloseTo(5);
  });

  it("computes transformed world bounds using the shared local buffer", () => {
    const f = setup();
    const original = f.model.cadLines.getPackedBatchBounds("packed-source");
    f.model.cadLines.setPackedBatchTransform("packed-source",
      new THREE.Matrix4().makeTranslation(100, 200, 300).toArray());
    expect(f.model.cadLines.getPackedBatchBounds("packed-source")).toBe(original);
    const bounds = f.controller.getReferenceBounds("Placa");
    expect(bounds?.max.x).toBeCloseTo(110);
    expect(bounds?.max.y).toBeCloseTo(200);
    expect(bounds?.min.z).toBeCloseTo(0); // the native point remains at origin
    expect(f.positions[0]).toBe(0);
  });

  it("SNAP returns current world coordinates after a 90° rotation", () => {
    const f = setup();
    f.model.cadLines.setPackedBatchTransform("packed-source",
      new THREE.Matrix4().makeRotationZ(Math.PI / 2).toArray());
    const camera = new THREE.OrthographicCamera(-100, 100, 75, -75, .1, 10000);
    camera.position.set(0, 0, 2000);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const rect = { left: 0, top: 0, width: 1000, height: 750 } as DOMRect;
    const lines = getNearbyCadLines(f.model, camera, rect, 500, 350, 14);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.end.x).toBeCloseTo(0);
    expect(lines[0]?.end.y).toBeCloseTo(10);
  });

  it("COPYBASE reuses source Float64Array with independent matrices and reversible history", () => {
    const f = setup();
    const copy = copyCadReferenceBlocks(f.model, f.history as never,
      ["Placa"], new THREE.Vector3(25, 15, 0), () => {});
    expect(copy.referenceNames).toEqual(["Placa copia 1"]);
    const packets = f.model.cadLines.getPackedBatches();
    expect(packets).toHaveLength(2);
    expect(packets[0]!.positions).toBe(packets[1]!.positions);
    expect(packets[0]!.transform).toBeUndefined();
    expect(packets[1]!.transform?.[12]).toBe(25);
    expect(packets[1]!.transform?.[13]).toBe(15);
    const scene = new THREE.Scene();
    const renderer = new CadLineSceneController(scene, f.model);
    renderer.sync();
    const rendered = renderer.getLineObjects();
    expect(rendered).toHaveLength(2);
    expect(rendered[0]!.geometry).toBe(rendered[1]!.geometry);
    expect(rendered[1]!.matrixWorld.elements[12]).toBeCloseTo(25);
    f.undo();
    renderer.sync();
    expect(f.model.cadLines.getPackedBatches()).toHaveLength(1);
    f.redo();
    renderer.sync();
    expect(f.model.cadLines.getPackedBatches()).toHaveLength(2);
    expect(f.model.cadLines.getPackedBatches()[0]!.positions).toBe(f.positions);
    renderer.dispose();
  });

  it("transforms and copies 1.4 million packed segments without allocating per-segment CAD entities", () => {
    const model = new DesignModel();
    const sourceLayer = model.layers.create({
      name: "CAD GranPlano · 0", visible: true, locked: false, snapEnabled: true,
    });
    const segmentCount = 1_400_000;
    const data = new Float64Array(segmentCount * 6);
    for (let i = 0; i < segmentCount; i++) {
      const o = i * 6;
      data[o] = i;
      data[o + 3] = i + 1;
    }
    model.cadLines.registerPackedBatch({
      id: "large-reference", layerId: sourceLayer.id, positions: data,
    });
    const original = data.slice(0, 6);
    expect(model.cadLines.getAll()).toHaveLength(0);
    expect(model.cadLines.packedCount).toBe(segmentCount);

    const transform = new THREE.Matrix4().makeRotationZ(Math.PI / 2);
    const moved = new THREE.Matrix4().makeTranslation(100, 200, 0).multiply(transform);
    expect(model.cadLines.setPackedBatchTransform("large-reference", moved.toArray())).toBe(true);
    const point = new THREE.Vector3(1, 0, 0).applyMatrix4(
      new THREE.Matrix4().fromArray(model.cadLines.getPackedBatches()[0]!.transform!),
    );
    expect(point.x).toBeCloseTo(100);
    expect(point.y).toBeCloseTo(201);

    const second = model.layers.create({
      name: "CAD GranPlano copia 1 · 0", visible: true,
      locked: false, snapEnabled: true,
    });
    model.cadLines.registerPackedCopy(
      "large-reference-copy", second.id, "large-reference",
      new THREE.Matrix4().makeTranslation(300, 0, 0).multiply(moved).toArray(),
    );
    const packets = model.cadLines.getPackedBatches();
    expect(packets[0]!.positions).toBe(packets[1]!.positions);
    expect(model.cadLines.getAll()).toHaveLength(0);
    expect(data.slice(0, 6)).toEqual(original);
    expect(packets[0]!.transform).not.toEqual(packets[1]!.transform);
    expect(model.cadLines.getPackedBatchBounds("large-reference"))
      .toBe(model.cadLines.getPackedBatchBounds("large-reference-copy"));
  });

  it("rejects corrupt matrices without modifying packed geometry", () => {
    const f = setup();
    expect(() => f.model.cadLines.setPackedBatchTransform(
      "packed-source", [1, Number.NaN],
    )).toThrow();
    expect(f.model.cadLines.getPackedBatches()[0]?.transform).toBeUndefined();
    expect(f.model.cadLines.packedCount).toBe(1);
  });
});
