import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadReferenceBlockController } from "./CadReferenceBlockController";
import { RotateRingDoubleClick } from "../interaction/RotateRingDoubleClick";
import { CadLinePlacementController } from "../interaction/CadLinePlacementController";

function fixture() {
  const model = new DesignModel();
  const layer = model.layers.create({
    name: "CAD Obra · 0", visible: true, locked: false, snapEnabled: true,
  });
  const line = model.registerCadLine({
    layerId: layer.id,
    start: { x: 0, y: 0, z: 0 },
    end: { x: 10, y: 0, z: 0 },
  });
  let undo = () => {};
  let redo = () => {};
  const history = { recordOperation: vi.fn((_label: string, back: () => void,
    forward: () => void) => { undo = back; redo = forward; }) };
  const snap = new THREE.Vector3(2, 0, 0);
  const controller = Object.create(CadReferenceBlockController.prototype) as CadReferenceBlockController;
  const badge = { textContent: "" };
  const controls = { axis: "XYZ", dragging: false };
  const options = {
    designModel: model,
    history,
    findSnapPoint: vi.fn(() => snap.clone()),
    setCameraEnabled: vi.fn(),
    onRotateAxis: vi.fn(),
  };
  const pivot = new THREE.Object3D();
  pivot.position.set(5, 0, 0);
  const names = new Set(["Obra"]);
  Reflect.set(controller, "options", options);
  Reflect.set(controller, "pivot", pivot);
  Reflect.set(controller, "selectedReferenceNames", names);
  Reflect.set(controller, "activeMode", "translate");
  Reflect.set(controller, "ringClicks", new RotateRingDoubleClick());
  Reflect.set(controller, "transformStartPivot", new THREE.Vector3());
  Reflect.set(controller, "ringGesture", null);
  Reflect.set(controller, "controls", controls);
  Reflect.set(controller, "badge", badge);
  Reflect.set(controller, "pickMoveAxis", vi.fn(() => null));
  Reflect.set(controller, "interactionEnabled", true);
  Reflect.set(controller, "pendingDoubleClickTimer", null);
  Reflect.set(controller, "syncGeometry", vi.fn());
  Reflect.set(controller, "refreshSelectionVisual", vi.fn());
  const handler = (method: string) => (...args: any[]) =>
    (Reflect.get(controller, method) as (...args: any[]) => unknown).apply(controller, args);
  const pointerEvent = (x = 120, y = 80) => ({
    button: 0, pointerId: 7, clientX: x, clientY: y,
    preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn(),
    ctrlKey: false, metaKey: false,
  });
  const release = (x = 120, y = 80) => {
    const event = pointerEvent(x, y);
    handler("pointerUpInternal")(event);
    return event;
  };
  return { model, line, history, pivot, names, controls, badge, options, controller, snap,
    handler, pointerEvent, release, undo: () => undo(), redo: () => redo() };
}

describe("DWG gizmo events: don't reselect imported CAD through rotate ring", () => {
  it("recognizes 2 clicks on same ring and rotates exactly once despite pointerup on DWG geometry", () => {
    const f = fixture();
    Reflect.set(f.controller, "activeMode", "rotate");
    const noReselect = vi.spyOn(f.controller, "selectReference");
    vi.spyOn(Date, "now").mockReturnValue(1000);
    try {
      for (let i = 0; i < 2; i++) {
        Reflect.set(f.controller, "ringGesture",
          { pointerId: 7, x: 120, y: 80, axis: "Z", dragged: false });
        Reflect.set(f.controller, "transformPointerActive", true);
        Reflect.set(f.controller, "pointerDownActive", true);
        Reflect.set(f.controller, "pointerDownX", 120);
        Reflect.set(f.controller, "pointerDownY", 80);
        Reflect.set(f.controller, "transformSnapshot",
          f.handler("captureSelection")());
        f.handler("transformEndInternal")();
        f.release();
      }
      expect(noReselect).not.toHaveBeenCalled();
      expect(f.controller.isRotateActive).toBe(true);
      const event = f.pointerEvent();
      f.handler("ringDoubleClickInternal")(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
      expect(f.model.cadLines.get(f.line.id)?.start.x).toBeCloseTo(5);
      expect(f.model.cadLines.get(f.line.id)?.start.y).toBeCloseTo(-5);
      expect(f.history.recordOperation).toHaveBeenCalledOnce();
    } finally { vi.restoreAllMocks(); }
  });

  it("a short center click arms SNAP, then updates base/pivot ONLY, never DWG geometry", () => {
    const f = fixture();
    Reflect.set(f.controller, "pivotOnlyDrag", true);
    Reflect.set(f.controller, "transformStartPivot", f.pivot.position.clone());
    Reflect.set(f.controller, "transformSnapshot", f.handler("captureSelection")());
    f.handler("transformEndInternal")();
    expect(Reflect.get(f.controller, "armedPivot")).toBe(true);
    expect(f.badge.textContent).toContain("punto base");
    const down = f.pointerEvent();
    f.handler("pointerDownInternal")(down);
    expect(down.stopImmediatePropagation).toHaveBeenCalledOnce();
    f.release();
    expect(f.pivot.position.x).toBeCloseTo(2);
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBeCloseTo(0);
    expect(f.model.cadLines.get(f.line.id)?.end.x).toBeCloseTo(10);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
  });

  it("after rebase, click axis and choose destination SNAP to move DWG with Undo/Redo", () => {
    const f = fixture();
    f.pivot.position.set(2, 0, 0);
    f.controls.axis = "X";
    Reflect.set(f.controller, "pivotOnlyDrag", false);
    Reflect.set(f.controller, "transformStartPivot", f.pivot.position.clone());
    Reflect.set(f.controller, "transformSnapshot", f.handler("captureSelection")());
    f.handler("transformEndInternal")();
    expect(Reflect.get(f.controller, "armedMoveAxis")).toBe("X");
    f.snap.set(20, 50, 0); // Y must be suppressed by X-only move.
    f.handler("pointerDownInternal")(f.pointerEvent());
    f.release();
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBeCloseTo(18);
    expect(f.model.cadLines.get(f.line.id)?.end.y).toBeCloseTo(0);
    expect(f.pivot.position.toArray()).toEqual([20, 0, 0]);
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
    f.undo();
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBeCloseTo(0);
    f.redo();
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBeCloseTo(18);
  });

  it("does not move the block or lose the armed pivot when no SNAP exists", () => {
    const f = fixture();
    Reflect.set(f.controller, "armedPivot", true);
    f.options.findSnapPoint.mockReturnValueOnce(null as never);
    f.handler("pointerDownInternal")(f.pointerEvent());
    f.release();
    expect(Reflect.get(f.controller, "armedPivot")).toBe(true);
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBeCloseTo(0);
    expect(f.pivot.position.x).toBeCloseTo(5);
  });

  it("detects +90° on two pointer releases even if browser never emits native dblclick", async () => {
    const f = fixture();
    Reflect.set(f.controller, "activeMode", "rotate");
    f.controls.axis = "Z";
    vi.spyOn(Date, "now").mockReturnValue(1000);
    const noReselect = vi.spyOn(f.controller, "selectReference");
    for (let i = 0; i < 2; i++) {
      Reflect.set(f.controller, "ringGesture", {
        pointerId: 7, x: 120, y: 80, axis: "Z", dragged: false,
      });
      Reflect.set(f.controller, "pointerDownActive", true);
      Reflect.set(f.controller, "transformPointerActive", true);
      f.release();
    }
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(noReselect).not.toHaveBeenCalled();
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
    expect(f.model.cadLines.get(f.line.id)?.start.y).toBeCloseTo(-5);
    expect(f.model.cadLines.get(f.line.id)?.end.y).toBeCloseTo(5);
    vi.restoreAllMocks();
  });

  it("does not reselect a CAD reference below an active gizmo even if native picking missed", () => {
    const f = fixture();
    Reflect.set(f.controller, "activeMode", "rotate");
    Reflect.set(f.controller, "pointerDownActive", true);
    Reflect.set(f.controller, "transformPointerActive", false);
    const selected = vi.spyOn(f.controller, "selectReference");
    const event = f.release();
    expect(selected).not.toHaveBeenCalled();
    expect(f.controller.isRotateActive).toBe(true);
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("Ctrl+axis followed by repeated SNAP clicks creates independent DWG blocks without moving original", () => {
    const f = fixture();
    f.controls.axis = "X";
    const down = { ...f.pointerEvent(), ctrlKey: true };
    f.handler("pointerDownInternal")(down);
    expect(Reflect.get(f.controller, "ctrlCopyGesture")).toBe(true);

    // TransformControls started on X and completed a short click (no drag).
    Reflect.set(f.controller, "moveDragAxis", "X");
    Reflect.set(f.controller, "copyDrag", true);
    Reflect.set(f.controller, "transformStartPivot", f.pivot.position.clone());
    Reflect.set(f.controller, "transformSnapshot", f.handler("captureSelection")());
    f.handler("transformEndInternal")();
    expect(Reflect.get(f.controller, "armedMoveAxis")).toBe("X");
    expect(Reflect.get(f.controller, "armedCopyMove")).toBe(true);

    f.snap.set(25, 300, -400);
    f.handler("pointerDownInternal")(f.pointerEvent());
    f.release();
    const copy1 = f.model.layers.getAll().find(l => l.name === "CAD Obra copia 1 · 0")!;
    expect(copy1).toBeDefined();
    expect(f.model.cadLines.findByLayerId(copy1.id)[0]?.start.x).toBeCloseTo(20);
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBe(0);
    expect(f.pivot.position.toArray()).toEqual([5, 0, 0]);

    f.snap.set(55, 0, 0);
    f.handler("pointerDownInternal")(f.pointerEvent());
    f.release();
    const copy2 = f.model.layers.getAll().find(l => l.name === "CAD Obra copia 2 · 0")!;
    expect(copy2).toBeDefined();
    expect(f.model.cadLines.findByLayerId(copy2.id)[0]?.start.x).toBeCloseTo(50);
    expect(f.model.cadLines.findByLayerId(copy1.id)[0]?.start.x).toBeCloseTo(20);
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBe(0);
    expect(Reflect.get(f.controller, "armedCopyMove")).toBe(true);
    expect(Reflect.get(f.controller, "armedMoveAxis")).toBe("X");
    expect(f.history.recordOperation).toHaveBeenCalledTimes(2);
  });

  it("Ctrl+drag copies DWG at released delta without moving original or keeping displaced pivot", () => {
    const f = fixture();
    f.controls.axis = "Y";
    Reflect.set(f.controller, "copyDrag", true);
    Reflect.set(f.controller, "moveDragAxis", "Y");
    Reflect.set(f.controller, "pivotOnlyDrag", false);
    Reflect.set(f.controller, "transformStartPivot", f.pivot.position.clone());
    Reflect.set(f.controller, "transformSnapshot", f.handler("captureSelection")());
    f.pivot.position.set(5, 40, 0);
    f.handler("transformEndInternal")();
    const layer = f.model.layers.getAll().find(l => l.name === "CAD Obra copia 1 · 0")!;
    expect(f.model.cadLines.findByLayerId(layer.id)[0]?.end.y).toBe(40);
    expect(f.model.cadLines.get(f.line.id)?.end.y).toBe(0);
    expect(f.pivot.position.toArray()).toEqual([5, 0, 0]);
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
  });

  it("invalid SNAP does not end Ctrl repeated copy mode", () => {
    const f = fixture();
    f.controls.axis = "Z";
    Reflect.set(f.controller, "armedMoveAxis", "Z");
    Reflect.set(f.controller, "armedCopyMove", true);
    f.options.findSnapPoint.mockReturnValueOnce(null as never);
    f.handler("pointerDownInternal")(f.pointerEvent());
    f.release();
    expect(Reflect.get(f.controller, "armedCopyMove")).toBe(true);
    expect(f.model.layers.getAll().filter(l => l.name.includes("copia"))).toHaveLength(0);
  });
});

describe("DWG MOVE: secuencia real de pointerdown/pointerup antes del SNAP", () => {
  for (const [axis, displacement] of [
    ["X", [20, 0, 0]],
    ["Y", [0, 35, 0]],
    ["Z", [0, 0, 45]],
    ["XY", [20, 35, 0]],
    ["XZ", [20, 0, 45]],
    ["YZ", [0, 35, 45]],
  ] as const) {
    it(`un clic corto sobre ${axis} reserva el eje y solo el SNAP desplaza DWG`, () => {
      const f = fixture();
      Reflect.set(f.controller, "pickMoveAxis", vi.fn(() => axis));
      const initiallySelected = [...f.names];
      f.snap.set(25, 35, 45);
      f.handler("pointerDownInternal")(f.pointerEvent());
      const axisRelease = f.release();
      expect(axisRelease.stopImmediatePropagation).toHaveBeenCalledOnce();
      expect(Reflect.get(f.controller, "armedMoveAxis")).toBe(axis);
      expect(f.badge.textContent).toContain("SNAP de destino");
      expect(f.model.cadLines.get(f.line.id)?.start.x).toBe(0);
      expect(f.history.recordOperation).not.toHaveBeenCalled();
      expect([...f.names]).toEqual(initiallySelected);
      // The next down/up is delivered to SNAP, never a fresh selection.
      f.handler("pointerDownInternal")(f.pointerEvent(210, 90));
      const destinationRelease = f.release(210, 90);
      expect(destinationRelease.stopImmediatePropagation).toHaveBeenCalledOnce();
      const line = f.model.cadLines.get(f.line.id)!;
      expect(line.start.x).toBeCloseTo(displacement[0]);
      expect(line.start.y).toBeCloseTo(displacement[1]);
      expect(line.start.z).toBeCloseTo(displacement[2]);
      expect(f.pivot.position.toArray()).toEqual([
        5 + displacement[0], displacement[1], displacement[2],
      ]);
      expect(f.history.recordOperation).toHaveBeenCalledOnce();
      f.undo();
      expect(f.model.cadLines.get(f.line.id)?.start.x).toBeCloseTo(0);
      f.redo();
      expect(f.model.cadLines.get(f.line.id)?.start.x).toBeCloseTo(displacement[0]);
    });
  }

  it("retiene el eje y consume el evento sin SNAP; ESC no ha sido pulsado", () => {
    const f = fixture();
    Reflect.set(f.controller, "pickMoveAxis", vi.fn(() => "Y"));
    f.handler("pointerDownInternal")(f.pointerEvent());
    f.release();
    f.options.findSnapPoint.mockReturnValueOnce(null as never);
    f.handler("pointerDownInternal")(f.pointerEvent());
    const noSnapRelease = f.release();
    expect(noSnapRelease.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(Reflect.get(f.controller, "armedMoveAxis")).toBe("Y");
    expect(f.model.cadLines.get(f.line.id)?.start.y).toBe(0);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
  });

  it("un clic Ctrl+X crea copias sucesivas por SNAP sin modificar el original", () => {
    const f = fixture();
    Reflect.set(f.controller, "pickMoveAxis", vi.fn(() => "X"));
    f.handler("pointerDownInternal")({ ...f.pointerEvent(), ctrlKey: true });
    f.release();
    expect(Reflect.get(f.controller, "armedCopyMove")).toBe(true);
    f.snap.set(25, 0, 0);
    f.handler("pointerDownInternal")(f.pointerEvent());
    f.release();
    f.snap.set(35, 0, 0);
    f.handler("pointerDownInternal")(f.pointerEvent());
    f.release();
    const copies = f.model.layers.getAll().filter(l => l.name.includes("copia"));
    expect(copies).toHaveLength(2);
    expect(f.model.cadLines.findByLayerId(copies[0].id)[0]?.start.x).toBe(20);
    expect(f.model.cadLines.findByLayerId(copies[1].id)[0]?.start.x).toBe(30);
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBe(0);
    expect(f.pivot.position.x).toBe(5);
    expect(Reflect.get(f.controller, "armedCopyMove")).toBe(true);
  });

  it("captura pointerdown/up en orden y no deja que un selector posterior reciba el clic", () => {
    const f = fixture();
    Reflect.set(f.controller, "pickMoveAxis", vi.fn(() => "X"));
    const canvas = new EventTarget();
    Reflect.set(f.controller, "options", { ...f.options, domElement: canvas });
    const pickedBackground = vi.fn();
    canvas.addEventListener("pointerdown", e => f.handler("pointerDownInternal")(e));
    canvas.addEventListener("pointerup", e => f.handler("pointerUpInternal")(e));
    canvas.addEventListener("pointerup", pickedBackground);
    const event = (type: string, x = 120) => Object.assign(
      new Event(type, { bubbles: true, cancelable: true }),
      { button: 0, pointerId: 7, clientX: x, clientY: 80, ctrlKey: false },
    );
    canvas.dispatchEvent(event("pointerdown"));
    canvas.dispatchEvent(event("pointerup"));
    expect(pickedBackground).not.toHaveBeenCalled();
    expect(Reflect.get(f.controller, "armedMoveAxis")).toBe("X");
    canvas.dispatchEvent(event("pointerdown", 160));
    canvas.dispatchEvent(event("pointerup", 160));
    expect(pickedBackground).not.toHaveBeenCalled();
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBeCloseTo(-3);
  });

  it("completa mouseUp nativo exactamente una vez y protege el clic breve", () => {
    const f = fixture();
    Reflect.set(f.controller, "pickMoveAxis", vi.fn(() => "Z"));
    f.handler("pointerDownInternal")(f.pointerEvent());
    Reflect.set(f.controller, "transformSnapshot", f.handler("captureSelection")());
    Reflect.set(f.controller, "transformStartPivot", f.pivot.position.clone());
    const pointerUp = vi.fn(() => {
      f.controls.dragging = false;
      f.handler("transformEndInternal")();
    });
    Reflect.set(f.controls, "pointerUp", pointerUp);
    f.controls.dragging = true;
    const result = f.release(122, 82);
    expect(result.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(pointerUp).toHaveBeenCalledOnce();
    expect(Reflect.get(f.controller, "armedMoveAxis")).toBe("Z");
    expect(f.model.cadLines.get(f.line.id)?.start.x).toBe(0);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
  });
});


describe("DWG reference snap and inspected member", () => {
  it("LINE receives both pointer events over the DWG, preserving the exact SNAP start point", () => {
    const f = fixture();
    Reflect.set(f.controller, "activeMode", null);
    Reflect.set(f.options, "isPlacementActive", () => true);
    const referenceSelect = vi.spyOn(f.controller, "selectReference");
    const pickReference = vi.spyOn(f.controller as any, "getReferenceAt");
    const start = new THREE.Vector3(10, 0, 0);
    const linePlacement = Object.create(CadLinePlacementController.prototype) as CadLinePlacementController;
    Reflect.set(linePlacement, "active", true);
    Reflect.set(linePlacement, "acquirePointerPoint", vi.fn(() => start.clone()));
    const accepted = vi.fn();
    Reflect.set(linePlacement, "acceptPoint", accepted);
    const down = f.pointerEvent();
    f.handler("pointerDownInternal")(down);
    (Reflect.get(linePlacement, "handlePointerDown") as (e: unknown) => void)(down);
    expect(Reflect.get(f.controller, "pointerDownActive")).toBe(false);
    const up = f.pointerEvent();
    f.handler("pointerUpInternal")(up);
    (Reflect.get(linePlacement, "handlePointerUp") as (e: unknown) => void)(up);
    expect(referenceSelect).not.toHaveBeenCalled();
    expect(pickReference).not.toHaveBeenCalled();
    expect(accepted).toHaveBeenCalledOnce();
    expect((accepted.mock.calls[0] as THREE.Vector3[])[0]?.toArray()).toEqual([10, 0, 0]);
    expect(up.stopPropagation).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("clicking a DWG line selects its block and exposes that line only for measurement", () => {
    const f = fixture();
    Reflect.set(f.controller, "activeMode", null);
    Reflect.set(f.controller, "getReferenceAt", () => ({ referenceName: "Obra", lineId: f.line.id }));
    vi.spyOn(f.controller, "selectReference").mockImplementation(() => {});
    Reflect.set(f.controller, "pointerDownActive", true);
    const event = f.release();
    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(f.controller.getInspectedLineId()).toBe(f.line.id);
    // MOVE/ROTATE must not present a stale measurement while transforming.
    Reflect.set(f.controller, "activeMode", "rotate");
    expect(f.controller.getInspectedLineId()).toBeNull();
    vi.restoreAllMocks();
  });
});
