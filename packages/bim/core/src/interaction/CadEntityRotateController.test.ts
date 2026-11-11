import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadEntityRotateController } from "./CadEntityRotateController";

function fixture() {
  const model = new DesignModel();
  const line = model.registerCadLine({
    start: { x: 0, y: 0, z: 0 },
    end: { x: 10, y: 0, z: 0 },
  });
  const point = model.registerCadPoint({ position: { x: 5, y: 5, z: 0 } });
  let lineIds = [line.id];
  let pointIds: string[] = [];
  let undo: () => void = () => {};
  let redo: () => void = () => {};
  const history = { recordOperation: vi.fn((_label: string, backward: () => void,
    forward: () => void) => { undo = backward; redo = forward; }) };
  const lineScene = { sync: vi.fn() };
  const pointScene = { sync: vi.fn() };
  const lineSelection = { getSelectedIds: () => [...lineIds], setEnabled: vi.fn() };
  const pointSelection = { getSelectedIds: () => [...pointIds], setEnabled: vi.fn() };
  const designSelection = { setEnabled: vi.fn() };
  const canvas = new EventTarget() as HTMLElement;
  Object.assign(canvas, { style: { touchAction: "" } });
  const fakeWindow = new EventTarget() as Window;
  Object.assign(fakeWindow, { setTimeout: (callback: () => void) => { queueMicrotask(callback); return 1; } });
  vi.stubGlobal("window", fakeWindow);
  type Args = ConstructorParameters<typeof CadEntityRotateController>;
  const controller = new CadEntityRotateController({
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(),
    canvas, model,
    lineScene: lineScene as unknown as Args[0]["lineScene"],
    pointScene: pointScene as unknown as Args[0]["pointScene"],
    lineSelection: lineSelection as unknown as Args[0]["lineSelection"],
    pointSelection: pointSelection as unknown as Args[0]["pointSelection"],
    designSelection: designSelection as unknown as Args[0]["designSelection"],
    history: history as unknown as Args[0]["history"],
    setCameraEnabled: vi.fn(),
    onAxis: vi.fn(),
    onDeactivate: vi.fn(),
  });
  const read = () => model.cadLines.get(line.id)!;
  return {
    controller, model, line, point, read, history,
    setSelectedPoint: () => { pointIds = [point.id]; },
    clearSelectedLines: () => { lineIds = []; },
    undo: () => undo(), redo: () => redo(),
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("ROTATE native CAD geometry", () => {
  it("rotates selected lines around their center by exact +90° and restores Undo/Redo", () => {
    const f = fixture();
    expect(f.controller.activate()).toBe(true);
    expect(f.controller.applyNumericRotation("Z", 90)).toBe(true);
    expect(f.read().start.x).toBeCloseTo(5);
    expect(f.read().start.y).toBeCloseTo(-5);
    expect(f.read().end.x).toBeCloseTo(5);
    expect(f.read().end.y).toBeCloseTo(5);
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
    f.undo();
    expect(f.read().start.x).toBeCloseTo(0);
    expect(f.read().end.x).toBeCloseTo(10);
    f.redo();
    expect(f.read().end.y).toBeCloseTo(5);
    f.controller.dispose();
  });

  it("uses selected points and lines together and supports negative fractional angles", () => {
    const f = fixture();
    f.setSelectedPoint();
    expect(f.controller.activate()).toBe(true);
    const length0 = Math.hypot(f.read().end.x - f.read().start.x,
      f.read().end.y - f.read().start.y);
    expect(f.controller.applyNumericRotation("X", -37.5)).toBe(true);
    const changedPoint = f.model.cadPoints.get(f.point.id)!;
    expect(changedPoint.position.z).not.toBeCloseTo(0);
    const length1 = Math.hypot(
      f.read().end.x - f.read().start.x,
      f.read().end.y - f.read().start.y,
      f.read().end.z - f.read().start.z,
    );
    expect(length1).toBeCloseTo(length0);
    f.undo();
    expect(f.model.cadPoints.get(f.point.id)?.position.z).toBeCloseTo(0);
    f.controller.dispose();
  });

  it("rejects invalid or empty-selection rotation", () => {
    const f = fixture();
    expect(f.controller.activate()).toBe(true);
    expect(f.controller.applyNumericRotation("Z", Number.NaN)).toBe(false);
    expect(f.controller.applyNumericRotation("Z", 0)).toBe(false);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
    f.controller.deactivate();
    f.clearSelectedLines();
    expect(f.controller.activate()).toBe(false);
    f.controller.dispose();
  });
});
