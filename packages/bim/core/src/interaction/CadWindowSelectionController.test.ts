import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { CadWindowSelectionController } from "./CadWindowSelectionController";

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
function setup() {
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
    line as unknown as Args[6], cameraEnabled,
  );
  return { canvas, target, controller, design, point, line, cameraEnabled };
}
afterEach(() => vi.unstubAllGlobals());

describe("CAD window selection and gizmo ownership", () => {
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
