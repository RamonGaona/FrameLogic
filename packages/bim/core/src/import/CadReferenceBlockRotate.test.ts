import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadReferenceBlockController } from "./CadReferenceBlockController";

/** Test the reference's geometry transactions without native DOM/gizmo setup. */
function fixture() {
  const model = new DesignModel();
  const cadLayer = model.layers.create({
    name: "CAD Obra · 0", visible: true, locked: false, snapEnabled: true,
  });
  const line = model.registerCadLine({
    layerId: cadLayer.id, start: { x: 0, y: 0, z: 0 },
    end: { x: 10, y: 0, z: 0 },
  });
  const point = model.registerCadPoint({
    layerId: cadLayer.id, position: { x: 5, y: 5, z: 0 },
  });
  let undo: () => void = () => {};
  let redo: () => void = () => {};
  const history = {
    recordOperation: vi.fn((_label: string, backward: () => void, forward: () => void) => {
      undo = backward; redo = forward;
    }),
  };
  const controller = Object.create(CadReferenceBlockController.prototype) as CadReferenceBlockController;
  Reflect.set(controller, "options", { designModel: model, history });
  Reflect.set(controller, "selectedReferenceNames", new Set(["Obra"]));
  Reflect.set(controller, "activeMode", "rotate");
  const pivot = new THREE.Object3D();
  pivot.position.set(5, 0, 0);
  Reflect.set(controller, "pivot", pivot);
  Reflect.set(controller, "syncGeometry", vi.fn());
  Reflect.set(controller, "refreshSelectionVisual", vi.fn());
  return { model, line, point, controller, history, undo: () => undo(), redo: () => redo() };
}

describe("DWG/DXF reference block rotation", () => {
  it("rotates every line and point as one block about the shared pivot with history", () => {
    const f = fixture();
    expect(f.controller.isRotateActive).toBe(true);
    expect(f.controller.applyNumericRotation("Z", 90)).toBe(true);
    const line = f.model.cadLines.get(f.line.id)!;
    const point = f.model.cadPoints.get(f.point.id)!;
    expect(line.start.x).toBeCloseTo(5);
    expect(line.start.y).toBeCloseTo(-5);
    expect(line.end.y).toBeCloseTo(5);
    expect(point.position.x).toBeCloseTo(0);
    expect(point.position.y).toBeCloseTo(0);
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
    f.undo();
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBeCloseTo(0);
    expect(f.model.cadPoints.get(f.point.id)?.position.y).toBeCloseTo(5);
    f.redo();
    expect(f.model.cadLines.get(f.line.id)?.end.y).toBeCloseTo(5);
  });

  it("refuses rotation when numeric input is invalid or reference rotation inactive", () => {
    const f = fixture();
    expect(f.controller.applyNumericRotation("X", Infinity)).toBe(false);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
    Reflect.set(f.controller, "activeMode", null);
    expect(f.controller.applyNumericRotation("X", 90)).toBe(false);
  });
});
