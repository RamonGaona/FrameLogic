import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import { CadWindowSelectionController } from "./CadWindowSelectionController";
import { getActiveCadReferenceBlockController } from "../import/CadReferenceTransformController";

vi.mock("../import/CadReferenceTransformController", () => ({
  getActiveCadReferenceBlockController: vi.fn(() => null),
}));

function pointer(type: string): PointerEvent {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 1, clientX: 120, clientY: 140,
    button: 0, buttons: type === "pointerup" ? 0 : 1, isPrimary: true });
  return event as PointerEvent;
}
function selector() {
  let enabled = true;
  return {
    get isEnabled(): boolean { return enabled; },
    setEnabled: vi.fn((value: boolean) => { enabled = value; }),
    getInstanceIdAt: vi.fn((): string | null => null),
    getPointIdAt: vi.fn((): string | null => null),
    getLineIdAt: vi.fn((): string | null => null),
  };
}
function setup(isPlacing: () => boolean = () => false) {
  const canvas = new EventTarget() as HTMLElement;
  const target = new EventTarget() as Window;
  const overlay = { style: {}, remove: vi.fn() };
  vi.stubGlobal("window", target);
  vi.stubGlobal("document", { createElement: vi.fn(() => overlay), body: { appendChild: vi.fn() } });
  const design = selector(), point = selector(), line = selector();
  const cameraEnabled = vi.fn();
  type Args = ConstructorParameters<typeof CadWindowSelectionController>;
  const controller = new CadWindowSelectionController(
    canvas, () => new THREE.PerspectiveCamera(), {} as Args[2], {} as Args[3],
    design as unknown as Args[4], point as unknown as Args[5],
    line as unknown as Args[6], cameraEnabled, isPlacing,
  );
  return { canvas, target, controller, design, point, line, cameraEnabled };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(getActiveCadReferenceBlockController).mockReset();
  vi.mocked(getActiveCadReferenceBlockController).mockReturnValue(null);
});

describe("CAD window selection and gizmo ownership", () => {

  it("el clic sobre gizmo DWG MOVE no inicia selección por ventana ni cambia selección", () => {
    vi.mocked(getActiveCadReferenceBlockController).mockReturnValue(
      { isMoveActive: true, isRotateActive: false } as ReturnType<typeof getActiveCadReferenceBlockController>,
    );
    const s = setup();
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(false);
    expect(s.design.getInstanceIdAt).not.toHaveBeenCalled();
    expect(s.point.getPointIdAt).not.toHaveBeenCalled();
    expect(s.line.getLineIdAt).not.toHaveBeenCalled();
    expect(s.design.isEnabled).toBe(true);
    expect(s.cameraEnabled).not.toHaveBeenCalled();
    s.controller.dispose();
  });

  it("el gizmo DWG ROTATE tampoco inicia ventana y al desactivarse se restaura selección normal", () => {
    vi.mocked(getActiveCadReferenceBlockController).mockReturnValue(
      { isMoveActive: false, isRotateActive: true } as ReturnType<typeof getActiveCadReferenceBlockController>,
    );
    const s = setup();
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(false);
    vi.mocked(getActiveCadReferenceBlockController).mockReturnValue(null);
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(true);
    s.controller.dispose();
  });
  it("does not start a window for either SmartPieceInsertion click, but restores normal selection", () => {
    let smartActive = false;
    const s = setup();
    s.controller.setSmartInsertionActiveChecker(() => smartActive);
    smartActive = true;
    for (let step = 0; step < 2; step++) {
      s.canvas.dispatchEvent(pointer("pointerdown"));
      s.target.dispatchEvent(pointer("pointerup"));
      expect(s.controller.isActive).toBe(false);
    }
    expect(s.cameraEnabled).not.toHaveBeenCalled();
    smartActive = false;
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(true);
    s.controller.dispose();
  });

  it("does not finish a pending window while SmartPieceInsertion is active", () => {
    let smartActive = false;
    const s = setup();
    s.controller.setSmartInsertionActiveChecker(() => smartActive);
    s.canvas.dispatchEvent(pointer("pointerdown"));
    smartActive = true;
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(false);
    // Starting insertion always cancels any existing rectangle.
    s.controller.cancel();
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(false);
    smartActive = false;
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(true);
    s.controller.dispose();
  });

  it("can cancel a previously active window on handoff to SmartPieceInsertion", () => {
    const s = setup();
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(true);
    s.controller.cancel(); // navigation.beforeStart
    let smartActive = true;
    s.controller.setSmartInsertionActiveChecker(() => smartActive);
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(false);
    smartActive = false;
    s.controller.dispose();
  });


  it("ignores both insertion clicks and preserves ordinary empty selection afterwards", () => {
    let placing = true;
    const s = setup(() => placing);
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(false);
    expect(s.cameraEnabled).not.toHaveBeenCalled();
    placing = false;
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(true);
    s.controller.dispose();
  });

  it("drops a candidate if insertion claims the gesture before release", () => {
    let placing = false;
    const s = setup(() => placing);
    s.canvas.dispatchEvent(pointer("pointerdown"));
    placing = true;
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(false);
    s.controller.dispose();
  });

  it("does not start a window when ROTATE claims an initially empty-looking ring click", () => {
    const s = setup();
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.design.setEnabled(false);
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(false);
    expect(s.cameraEnabled).not.toHaveBeenCalled();
    expect(s.design.isEnabled).toBe(false);
    s.controller.dispose();
  });
  it("drops a candidate when another gizmo disables line selection", () => {
    const s = setup();
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.line.setEnabled(false);
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(false);
    s.controller.dispose();
  });
  it("still starts window selection on a genuine empty-space click", () => {
    const s = setup();
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(true);
    expect(s.cameraEnabled).toHaveBeenCalledWith(false);
    s.controller.dispose();
  });
  it("does not start window selection when a piece is hit", () => {
    const s = setup();
    s.design.getInstanceIdAt.mockReturnValue("piece-1");
    s.canvas.dispatchEvent(pointer("pointerdown"));
    s.target.dispatchEvent(pointer("pointerup"));
    expect(s.controller.isActive).toBe(false);
    s.controller.dispose();
  });
});


describe("DWG reference as a single entity in crossing/window selection", () => {
  function referenceWindow(startX: number, currentX: number, visible = true) {
    const model = new DesignModel();
    const layer = model.layers.create({
      name: "CAD Planta · 0", visible, locked: true, snapEnabled: true,
    });
    model.registerCadLine({ layerId: layer.id,
      start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } });
    const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 100);
    camera.position.set(0, 0, 20);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const refSelect = { getSelectedReferenceNames: vi.fn(() => []),
      setSelection: vi.fn(), isMoveActive: false, isRotateActive: false };
    vi.mocked(getActiveCadReferenceBlockController).mockReturnValue(
      refSelect as unknown as ReturnType<typeof getActiveCadReferenceBlockController>);
    const controller = Object.create(CadWindowSelectionController.prototype) as CadWindowSelectionController;
    const selected = () => ({ getSelectedIds: vi.fn(() => []), setSelection: vi.fn() });
    const pieces = selected(), points = selected(), lines = selected();
    Reflect.set(controller, "startX", startX);
    Reflect.set(controller, "currentX", currentX);
    Reflect.set(controller, "startY", 450);
    Reflect.set(controller, "currentY", 550);
    Reflect.set(controller, "domElement", { getBoundingClientRect: () =>
      ({ left: 0, top: 0, width: 1000, height: 1000 }) });
    Reflect.set(controller, "cameraProvider", () => camera);
    Reflect.set(controller, "designModel", model);
    Reflect.set(controller, "designScene", { getInstanceEntries: () => [] });
    Reflect.set(controller, "designSelection", pieces);
    Reflect.set(controller, "pointSelection", points);
    Reflect.set(controller, "lineSelection", lines);
    Reflect.set(controller, "selectionOperation", "REPLACE");
    const run = () => (Reflect.get(controller, "applySelection") as () => void).call(controller);
    return { run, refSelect, pieces, points, lines };
  }

  it("crossing over just one interior DWG segment selects the ENTIRE locked block", () => {
    const f = referenceWindow(650, 600);
    f.run();
    expect(f.refSelect.setSelection).toHaveBeenCalledWith(["Planta"], true);
    expect(f.lines.setSelection).toHaveBeenCalledWith([], true);
  });

  it("window must enclose all DWG members, not only cross a segment", () => {
    const all = referenceWindow(450, 800);
    all.run();
    expect(all.refSelect.setSelection).toHaveBeenCalledWith(["Planta"], true);
    const partial = referenceWindow(550, 650);
    partial.run();
    expect(partial.refSelect.setSelection).toHaveBeenCalledWith([], true);
  });

  it("a hidden imported DWG is not selectable by crossing window", () => {
    const f = referenceWindow(650, 600, false);
    f.run();
    expect(f.refSelect.setSelection).toHaveBeenCalledWith([], true);
  });
});
