import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { copyCadReferenceBlocks } from "./CadReferenceCopyTransaction";

function fixture() {
  const model = new DesignModel();
  const one = model.layers.create({
    name: "CAD Planta · Estructura", color: "#90aabc",
    visible: true, locked: false, snapEnabled: true,
  });
  const two = model.layers.create({
    name: "CAD Planta · Oculto", color: "#102030",
    visible: false, locked: false, snapEnabled: false,
  });
  const line = model.registerCadLine({
    layerId: one.id, start: { x: 2, y: 3, z: 4 },
    end: { x: 8, y: 3, z: 4 },
  });
  const point = model.registerCadPoint({
    layerId: two.id, position: { x: 2, y: 7, z: 0 },
  });
  model.layers.update(two.id, { locked: true });
  const undoActions: Array<() => void> = [];
  const redoActions: Array<() => void> = [];
  const history = {
    recordOperation: vi.fn((_label: string, undo: () => void, redo: () => void) => {
      undoActions.push(undo);
      redoActions.push(redo);
    }),
  };
  const sync = vi.fn();
  return { model, one, two, line, point, history, sync, undoActions, redoActions };
}

describe("COPY DWG/DXF full-reference transaction", () => {
  it("creates an independent block with own layers, lines and points and leaves source untouched", () => {
    const f = fixture();
    const result = copyCadReferenceBlocks(
      f.model, f.history as never, ["Planta"], new THREE.Vector3(100, -20, 50), f.sync,
    );
    expect(result.referenceNames).toEqual(["Planta copia 1"]);
    expect(result.lineIds).toHaveLength(1);
    expect(result.pointIds).toHaveLength(1);
    const copiedLine = f.model.cadLines.get(result.lineIds[0]!)!;
    const copiedPoint = f.model.cadPoints.get(result.pointIds[0]!)!;
    expect(copiedLine.start).toEqual({ x: 102, y: -17, z: 54 });
    expect(copiedLine.end).toEqual({ x: 108, y: -17, z: 54 });
    expect(copiedPoint.position).toEqual({ x: 102, y: -13, z: 50 });
    expect(copiedLine.id).not.toBe(f.line.id);
    expect(copiedLine.layerId).not.toBe(f.one.id);
    expect(copiedPoint.layerId).not.toBe(f.two.id);
    const hidden = f.model.layers.get(copiedPoint.layerId)!;
    expect(hidden).toMatchObject({
      name: "CAD Planta copia 1 · Oculto",
      color: "#102030", visible: false, locked: true, snapEnabled: false,
    });
    expect(f.model.cadLines.get(f.line.id)?.start).toEqual({ x: 2, y: 3, z: 4 });
    expect(f.model.cadPoints.get(f.point.id)?.position).toEqual({ x: 2, y: 7, z: 0 });
    expect(f.history.recordOperation).toHaveBeenCalledOnce();

    f.undoActions[0]!();
    expect(f.model.cadLines.get(result.lineIds[0]!)).toBeUndefined();
    expect(f.model.layers.get(copiedPoint.layerId)).toBeUndefined();
    expect(f.model.cadLines.get(f.line.id)).toBeDefined();
    f.redoActions[0]!();
    expect(f.model.cadLines.get(result.lineIds[0]!)?.start.x).toBe(102);
    expect(f.model.layers.get(copiedPoint.layerId)?.name).toContain("copia 1");
  });

  it("supports repeated copies with unique independent reference names from original", () => {
    const f = fixture();
    const first = copyCadReferenceBlocks(
      f.model, f.history as never, ["Planta"], new THREE.Vector3(10, 0, 0), f.sync,
    );
    const second = copyCadReferenceBlocks(
      f.model, f.history as never, ["Planta"], new THREE.Vector3(30, 0, 0), f.sync,
    );
    expect(first.referenceNames).toEqual(["Planta copia 1"]);
    expect(second.referenceNames).toEqual(["Planta copia 2"]);
    expect(f.model.cadLines.get(first.lineIds[0]!)?.start.x).toBe(12);
    expect(f.model.cadLines.get(second.lineIds[0]!)?.start.x).toBe(32);
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBe(2);
    f.undoActions[1]!();
    expect(f.model.cadLines.get(first.lineIds[0]!)).toBeDefined();
    expect(f.model.cadLines.get(second.lineIds[0]!)).toBeUndefined();
    f.redoActions[1]!();
    expect(f.model.cadLines.get(second.lineIds[0]!)?.start.x).toBe(32);
  });

  it("fails closed without creating anything for invalid displacement or missing reference", () => {
    const f = fixture();
    const originalCount = f.model.layers.getAll().length;
    expect(() => copyCadReferenceBlocks(
      f.model, f.history as never, ["Planta"], new THREE.Vector3(0, 0, 0), f.sync,
    )).toThrow("destino");
    expect(() => copyCadReferenceBlocks(
      f.model, f.history as never, ["Missing"], new THREE.Vector3(1, 0, 0), f.sync,
    )).toThrow("no existe");
    expect(f.model.layers.getAll()).toHaveLength(originalCount);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
  });

  it("copies all selected references as independent blocks, not overlapping names", () => {
    const f = fixture();
    const other = f.model.layers.create({ name: "CAD Alzado · Perfil" });
    f.model.registerCadLine({
      layerId: other.id, start: { x: 1, y: 0, z: 0 },
      end: { x: 1, y: 1, z: 0 },
    });
    const copied = copyCadReferenceBlocks(f.model, f.history as never,
      ["Planta", "Alzado"], new THREE.Vector3(0, 0, 10), f.sync);
    expect(copied.referenceNames).toEqual(["Planta copia 1", "Alzado copia 1"]);
    expect(copied.lineIds).toHaveLength(2);
    expect(copied.pointIds).toHaveLength(1);
    f.undoActions[0]!();
    expect(f.model.layers.get(other.id)).toBeDefined();
  });
});
