import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignTransformController } from "./DesignTransformController";

class FakeButton extends EventTarget {
  type = "";
  title = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  setAttribute = vi.fn();
  remove = vi.fn();
}

function pointer(type: string, x: number, y: number, id = 7) {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.assign(event, { button: 0, pointerId: id, clientX: x, clientY: y });
  return event as PointerEvent;
}

function fixture() {
  const button = new FakeButton();
  const host = new EventTarget() as Window & { setTimeout: (fn: () => void) => number };
  host.setTimeout = callback => { if (typeof callback === "function") queueMicrotask(() => callback()); return 1; };
  vi.stubGlobal("window", host);
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 11));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("document", {
    body: { append: vi.fn() }, createElement: vi.fn(() => button),
  });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 1000);
  camera.position.set(0, 0, 200);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const canvas = new EventTarget() as HTMLElement;
  Object.assign(canvas, {
    style: { touchAction: "" },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
  });
  const instance = {
    id: "p", definitionId: "def", layerId: "geometry", tags: [],
    transform: { position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 } },
  };
  const object = new THREE.Object3D();
  object.position.set(5, 0, 0);
  scene.add(object);
  object.updateMatrixWorld(true);
  const updateTransform = vi.fn((_id: string, transform: typeof instance.transform) => {
    instance.transform = transform;
    return instance;
  });
  const model = {
    pieceInstances: { get: () => instance, updateTransform },
    layers: { get: () => ({ visible: true, locked: false }) },
  };
  const selection = {
    getSelectedIds: () => ["p"], subscribe: vi.fn(() => () => {}),
    refreshHelpers: vi.fn(), setEnabled: vi.fn(),
  };
  const snapPoint = new THREE.Vector3(11, 13, 0);
  const snap = {
    clearExcludedInstanceIds: vi.fn(), setExcludedInstanceIds: vi.fn(),
    findSnap: vi.fn(() => ({ point: snapPoint.clone(), type: "ENDPOINT" })),
  };
  const history = {
    capture: vi.fn(() => new Map()),
    recordTransform: vi.fn(), recordOperation: vi.fn(),
  };
  const designScene = {
    getInstanceObject: () => object, sync: vi.fn(),
  };
  type Args = ConstructorParameters<typeof DesignTransformController>;
  const controller = new DesignTransformController(scene, camera, canvas,
    model as unknown as Args[3], designScene as unknown as Args[4],
    selection as unknown as Args[5], history as unknown as Args[6],
    snap as unknown as Args[7], vi.fn());
  expect(controller.activate("translate")).toBe(true);
  const pivot = Reflect.get(controller, "pivot") as THREE.Object3D;
  const controls = Reflect.get(controller, "controls") as { axis: string | null };
  const down = (x: number, y: number, id = 7) =>
    button.dispatchEvent(pointer("pointerdown", x, y, id));
  const move = (x: number, y: number, id = 7) =>
    host.dispatchEvent(pointer("pointermove", x, y, id));
  const up = (x: number, y: number, id = 7) =>
    host.dispatchEvent(pointer("pointerup", x, y, id));
  const selectSnap = (x = 240, y = 220) => {
    const eventDown = pointer("pointerdown", x, y, 9);
    const eventUp = pointer("pointerup", x, y, 9);
    (Reflect.get(controller, "handleArmedPointerDown") as (event: PointerEvent) => void)(eventDown);
    (Reflect.get(controller, "handleArmedPointerUp") as (event: PointerEvent) => void)(eventUp);
    return { eventDown, eventUp };
  };
  const moveByAxis = (dx: number) => {
    controls.axis = "X";
    (Reflect.get(controller, "handleTransformStart") as () => void)();
    pivot.position.x += dx;
    (Reflect.get(controller, "handleTransformChange") as () => void)();
    (Reflect.get(controller, "handleTransformEnd") as () => void)();
  };
  return { button, controller, instance, object, pivot, down, move, up,
    host, snap, snapPoint, selection, history, updateTransform, moveByAxis, selectSnap };
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("MOVE · visible 3D base-point handle", () => {
  it("matches ROTATE's fixed-size marker and arms a second-click SNAP without moving pieces", () => {
    const f = fixture();
    expect(f.button.dataset["framelogicPiecePivot"]).toBe("true");
    expect(f.button.style.display).toBe("block");
    expect(f.button.style.width).toBe("24px");
    expect(f.button.title).toContain("Punto base MOVE");
    f.down(220, 200);
    f.up(220, 200);
    expect(Reflect.get(f.controller, "armedPivot")).toBe(true);
    expect(f.instance.transform.position.x).toBe(5);
    const events = f.selectSnap();
    expect(events.eventDown.defaultPrevented).toBe(true);
    expect(f.pivot.position.toArray()).toEqual([11, 13, 0]);
    expect(f.instance.transform.position.x).toBe(5);
    expect(f.history.recordTransform).not.toHaveBeenCalled();
    expect(f.history.recordOperation).not.toHaveBeenCalled();
    f.controller.dispose();
  });

  it("free-drags the MOVE base without geometry motion, then next X drag moves only its delta", () => {
    const f = fixture();
    f.snap.findSnap.mockReturnValue(null as never);
    f.down(220, 200);
    f.move(260, 200);
    f.up(260, 200);
    expect(f.pivot.position.x).toBeCloseTo(15);
    expect(f.instance.transform.position.x).toBe(5);
    expect(f.history.recordTransform).not.toHaveBeenCalled();
    expect(Reflect.get(f.controller, "previousPivotPosition").x).toBeCloseTo(15);
    f.moveByAxis(4);
    expect(f.instance.transform.position.x).toBeCloseTo(9);
    expect(f.history.recordTransform).toHaveBeenCalledOnce();
    f.controller.dispose();
  });

  it("snaps a freely dragged base to an existing geometry SNAP at release", () => {
    const f = fixture();
    f.down(220, 200);
    f.move(260, 215);
    f.up(260, 215);
    expect(f.snap.findSnap).toHaveBeenCalledWith(260, 215);
    expect(f.pivot.position.toArray()).toEqual([11, 13, 0]);
    expect(f.instance.transform.position.x).toBe(5);
    expect(f.history.recordTransform).not.toHaveBeenCalled();
    f.controller.deactivate();
    expect(f.button.style.display).toBe("none");
    f.controller.dispose();
    expect(f.button.remove).toHaveBeenCalledOnce();
  });
});
