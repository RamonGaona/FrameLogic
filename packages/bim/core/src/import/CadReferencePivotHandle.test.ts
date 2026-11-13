import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CadReferencePivotHandle } from "./CadReferencePivotHandle";

class FakeButton extends EventTarget {
  type = "";
  title = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  setAttribute = vi.fn();
  remove = vi.fn();
}
function pointerEvent(type: string, x: number, y: number, id = 7): PointerEvent {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { clientX: x, clientY: y, button: 0, pointerId: id });
  return e as PointerEvent;
}
function fixture(mode: "translate" | "rotate" = "rotate", snapOnRelease = false) {
  const button = new FakeButton();
  const host = new EventTarget();
  vi.stubGlobal("window", host);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("document", {
    body: { append: vi.fn() },
    createElement: vi.fn(() => button),
  });
  const camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  camera.position.set(0, 0, 20);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const pivot = new THREE.Object3D();
  pivot.position.set(0, 0, 0);
  const canvas = { getBoundingClientRect: () => ({
    left: 0, top: 0, width: 400, height: 400,
  }) } as unknown as HTMLElement;
  const arm = vi.fn();
  const placed = vi.fn();
  const setCamera = vi.fn();
  const findSnap = vi.fn(() => new THREE.Vector3(3, 4, 0));
  const control = new CadReferencePivotHandle(
    canvas, () => camera, pivot, setCamera, arm, "cad",
    placed, snapOnRelease ? findSnap : undefined,
  );
  control.activate(mode);
  return { button, host, camera, pivot, arm, placed, findSnap, setCamera, control };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("DWG visible pivot button", () => {
  it("is visible at the projected world pivot while ROTATE is active", () => {
    const f = fixture();
    expect(f.button.dataset["framelogicDwgPivot"]).toBe("true");
    expect(f.button.style.display).toBe("block");
    expect(f.button.style.left).toBe("200px");
    expect(f.button.style.top).toBe("200px");
    expect(f.button.title).toContain("Centro ROTATE");
    f.control.dispose();
    expect(f.button.remove).toHaveBeenCalledOnce();
  });

  it("owns a center click and arms the next SNAP without moving the pivot", () => {
    const f = fixture();
    const down = pointerEvent("pointerdown", 200, 200);
    f.button.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(f.setCamera).toHaveBeenCalledWith(false);
    f.host.dispatchEvent(pointerEvent("pointerup", 200, 200));
    expect(f.arm).toHaveBeenCalledOnce();
    expect(f.pivot.position.toArray()).toEqual([0, 0, 0]);
    expect(f.setCamera).toHaveBeenCalledWith(true);
    f.control.dispose();
  });

  it("drags the pivot freely without arming a second click or moving CAD entities", () => {
    const f = fixture();
    f.button.dispatchEvent(pointerEvent("pointerdown", 200, 200));
    f.host.dispatchEvent(pointerEvent("pointermove", 240, 200));
    f.host.dispatchEvent(pointerEvent("pointerup", 240, 200));
    expect(f.arm).not.toHaveBeenCalled();
    expect(f.pivot.position.x).toBeCloseTo(2, 4);
    expect(f.pivot.position.y).toBeCloseTo(0, 4);
    f.control.dispose();
  });

  it("repositions a DWG MOVE base exactly at SNAP on drag release, without arming MOVE", () => {
    const f = fixture("translate", true);
    expect(f.button.style.width).toBe("24px");
    expect(f.button.title).toContain("Punto base MOVE");
    f.button.dispatchEvent(pointerEvent("pointerdown", 200, 200));
    f.host.dispatchEvent(pointerEvent("pointermove", 230, 212));
    f.host.dispatchEvent(pointerEvent("pointerup", 230, 212));
    expect(f.findSnap).toHaveBeenCalledWith(230, 212);
    expect(f.pivot.position.toArray()).toEqual([3, 4, 0]);
    expect(f.placed).toHaveBeenCalledOnce();
    expect(f.arm).not.toHaveBeenCalled();
    f.control.dispose();
  });

  it("hides after deactivation and rejects clicks when ROTATE/MOVE is inactive", () => {
    const f = fixture();
    f.control.deactivate();
    expect(f.button.style.display).toBe("none");
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    f.button.dispatchEvent(pointerEvent("pointerdown", 200, 200));
    f.host.dispatchEvent(pointerEvent("pointerup", 200, 200));
    expect(f.arm).not.toHaveBeenCalled();
    f.control.dispose();
  });
});
