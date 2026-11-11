import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadPolylineRegistryController } from "../design/CadPolylineRegistryController";
import { copyUnifiedCadSelection, type UnifiedCadCopyContext, type UnifiedCadSelection } from "./UnifiedCadCopyTransaction";

function fixture() {
  const model = new DesignModel();
  const asset = model.registerAsset({ name: "viga.step", format: "STEP" });
  const definition = model.registerPieceDefinition({
    code: "B1", name: "Viga", geometryAssetId: asset.id,
  });
  const piece = model.registerPieceInstance({
    definitionId: definition.id, transform: {
      position: { x: 3, y: 4, z: 5 },
      rotation: { x: 0, y: 0, z: 0 },
    },
  });
  const layer = model.layers.create({ name: "Libre CAD", visible: true, locked: false });
  const line = model.registerCadLine({
    layerId: layer.id, start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 },
  });
  const point = model.registerCadPoint({
    layerId: layer.id, position: { x: 5, y: 5, z: 0 },
  });
  const refLayer = model.layers.create({ name: "CAD Plano · Muros", color: "#ddccbb" });
  const refLine = model.registerCadLine({
    layerId: refLayer.id, start: { x: 20, y: 0, z: 0 },
    end: { x: 20, y: 10, z: 0 },
  });
  const objects = new Map<string, THREE.Object3D>();
  const designScene = {
    sync: vi.fn(() => {
      for (const record of model.pieceInstances.getAll()) {
        let object = objects.get(record.id);
        if (!object) {
          object = new THREE.Object3D();
          objects.set(record.id, object);
        }
        object.position.set(record.transform.position.x, record.transform.position.y,
          record.transform.position.z);
        object.rotation.set(record.transform.rotation.x, record.transform.rotation.y,
          record.transform.rotation.z);
        object.updateMatrixWorld(true);
      }
    }),
    getInstanceObject: (id: string) => model.pieceInstances.get(id) ? objects.get(id) ?? null : null,
  };
  designScene.sync();
  const lineScene = { sync: vi.fn() };
  const pointScene = { sync: vi.fn() };
  const polylines = new CadPolylineRegistryController(model);
  const selection = { setSelection: vi.fn() };
  const records: Array<{label: string; undo: () => void; redo: () => void}> = [];
  const history = { recordOperation: vi.fn((label: string, undo: () => void, redo: () => void) => {
    records.push({ label, undo, redo });
  }) };
  const ctx: UnifiedCadCopyContext = {
    model, polylines,
    designScene: designScene as unknown as UnifiedCadCopyContext["designScene"],
    lineScene: lineScene as unknown as UnifiedCadCopyContext["lineScene"],
    pointScene: pointScene as unknown as UnifiedCadCopyContext["pointScene"],
    designSelection: selection as unknown as UnifiedCadCopyContext["designSelection"],
    history: history as unknown as UnifiedCadCopyContext["history"],
    clearCache: vi.fn(),
  };
  const chosen: UnifiedCadSelection = {
    pieceIds: [piece.id], assemblyIds: [],
    lineIds: [line.id], pointIds: [point.id],
    referenceNames: ["Plano"],
  };
  return { model, piece, line, point, refLine, layer, refLayer,
    objects, designScene, lineScene, pointScene, polylines,
    selection, ctx, chosen, history, records };
}

describe("COPYBASE / Ctrl+gizmo mixed selection transaction", () => {
  it("copies a 3D piece, native line/point and full DWG as ONE undoable action", () => {
    const f = fixture();
    expect(copyUnifiedCadSelection(
      f.ctx, f.chosen, new THREE.Vector3(100, -2, 30),
    )).toBe(4);
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
    expect(f.records[0]?.label).toBe("COPY MIXED");
    const copies = f.model.pieceInstances.getAll().filter(p => p.id !== f.piece.id);
    expect(copies).toHaveLength(1);
    expect(copies[0]?.transform.position).toEqual({ x: 103, y: 2, z: 35 });
    const nativeCopies = f.model.cadLines.findByLayerId(f.layer.id)
      .filter(l => l.id !== f.line.id);
    expect(nativeCopies).toHaveLength(1);
    expect(nativeCopies[0]?.start).toEqual({ x: 100, y: -2, z: 30 });
    const pointCopies = f.model.cadPoints.findByLayerId(f.layer.id)
      .filter(p => p.id !== f.point.id);
    expect(pointCopies[0]?.position).toEqual({ x: 105, y: 3, z: 30 });
    const layerCopy = f.model.layers.getAll()
      .find(l => l.name === "CAD Plano copia 1 · Muros");
    expect(layerCopy).toBeDefined();
    expect(f.model.cadLines.findByLayerId(layerCopy!.id)[0]?.start)
      .toEqual({ x: 120, y: -2, z: 30 });
    expect(f.model.pieceInstances.get(f.piece.id)?.transform.position)
      .toEqual({ x: 3, y: 4, z: 5 });
    expect(f.model.cadLines.get(f.line.id)?.start).toEqual({ x: 0, y: 0, z: 0 });
    expect(f.model.cadLines.get(f.refLine.id)?.start).toEqual({ x: 20, y: 0, z: 0 });

    f.records[0]!.undo();
    expect(f.model.pieceInstances.getAll()).toHaveLength(1);
    expect(f.model.cadLines.findByLayerId(f.layer.id)).toHaveLength(1);
    expect(f.model.cadPoints.findByLayerId(f.layer.id)).toHaveLength(1);
    expect(f.model.layers.get(layerCopy!.id)).toBeUndefined();
    f.records[0]!.redo();
    expect(f.model.pieceInstances.getAll()).toHaveLength(2);
    expect(f.model.layers.get(layerCopy!.id)).toBeDefined();
    expect(f.model.cadLines.findByLayerId(f.layer.id)).toHaveLength(2);
  });

  it("does not double-copy a line also included within its selected DWG block", () => {
    const f = fixture();
    const selection = { ...f.chosen, lineIds: [f.line.id, f.refLine.id] };
    copyUnifiedCadSelection(f.ctx, selection, new THREE.Vector3(10, 0, 0));
    const refCopy = f.model.layers.getAll().find(l => l.name === "CAD Plano copia 1 · Muros")!;
    expect(f.model.cadLines.findByLayerId(refCopy.id)).toHaveLength(1);
    expect(f.model.cadLines.findByLayerId(f.refLayer.id)).toHaveLength(1);
  });

  it("preserves complete polyline metadata when copying one of its selected segments", () => {
    const f = fixture();
    const other = f.model.registerCadLine({
      layerId: f.layer.id, start: { x: 10, y: 0, z: 0 }, end: { x: 10, y: 5, z: 0 },
    });
    const parent = f.polylines.register({
      layerId: f.layer.id, closed: false,
      segments: [{lineId: f.line.id, reversed: false}, {lineId: other.id, reversed: true}],
    });
    copyUnifiedCadSelection(f.ctx, {
      pieceIds: [], assemblyIds: [], lineIds: [f.line.id],
      pointIds: [], referenceNames: [],
    }, new THREE.Vector3(0, 0, 50));
    const copiedParent = f.polylines.getAll().find(p => p.id !== parent.id)!;
    expect(copiedParent.segments).toHaveLength(2);
    expect(copiedParent.segments.map(s => s.reversed)).toEqual([false, true]);
    f.records[0]!.undo();
    expect(f.polylines.getAll()).toHaveLength(1);
    f.records[0]!.redo();
    expect(f.polylines.get(copiedParent.id)).toBeDefined();
  });

  it("rolls back any previously created piece if an invalid CAD entity blocks the transaction", () => {
    const f = fixture();
    expect(() => copyUnifiedCadSelection(f.ctx,
      { ...f.chosen, lineIds: ["missing-cad-line"], referenceNames: [] },
      new THREE.Vector3(5, 0, 0),
    )).toThrow("no encontrada");
    expect(f.model.pieceInstances.getAll()).toHaveLength(1);
    expect(f.model.cadLines.getAll()).toHaveLength(2);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
  });

  it("rejects invalid offsets before touching any object", () => {
    const f = fixture();
    expect(() => copyUnifiedCadSelection(f.ctx, f.chosen,
      new THREE.Vector3(NaN, 0, 0))).toThrow("destino");
    expect(f.history.recordOperation).not.toHaveBeenCalled();
    expect(f.model.pieceInstances.getAll()).toHaveLength(1);
  });
});
