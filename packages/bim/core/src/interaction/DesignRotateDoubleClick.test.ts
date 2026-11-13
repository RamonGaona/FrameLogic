import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadHistoryController } from "./CadHistoryController";
import { DesignRotateController } from "./DesignRotateController";

class FakePivotButton extends EventTarget {
  type = "";
  title = "";
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  setAttribute = vi.fn();
  remove = vi.fn();
}

function fixture(withScreenPivot = false) {
  const screenButton = withScreenPivot ? new FakePivotButton() : null;
  if (screenButton) {
    vi.stubGlobal("document", {
      body: { append: vi.fn() },
      createElement: vi.fn(() => screenButton),
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  }
  const model = new DesignModel();
  const asset = model.registerAsset({ name: "pieza.step", format: "STEP" });
  const definition = model.registerPieceDefinition({
    code: "A", name: "Pieza", geometryAssetId: asset.id,
  });
  const ids = [
    model.registerPieceInstance({
      definitionId: definition.id, transform: {
        position: {x: 0, y: -5, z: 0}, rotation: {x: 0, y: 0, z: 0},
      },
    }).id,
    model.registerPieceInstance({
      definitionId: definition.id, transform: {
        position: {x: 0, y: 5, z: 0}, rotation: {x: 0, y: 0, z: 0},
      },
    }).id,
  ];
  const world = new THREE.Scene();
  const objects = new Map<string, THREE.Object3D>();
  const scene = {
    getInstanceObject: (id: string) => objects.get(id),
    sync: vi.fn(() => {
      for (const instance of model.pieceInstances.getAll()) {
        let object = objects.get(instance.id);
        if (!object) {
          object = new THREE.Object3D();
          objects.set(instance.id, object);
          world.add(object);
        }
        object.position.set(instance.transform.position.x, instance.transform.position.y,
          instance.transform.position.z);
        object.rotation.set(instance.transform.rotation.x, instance.transform.rotation.y,
          instance.transform.rotation.z);
        object.updateMatrixWorld(true);
      }
    }),
  };
  scene.sync();
  let selected = [...ids];
  const listeners: Array<(ids: readonly string[]) => void> = [];
  const selection = {
    getSelectedIds: () => selected,
    subscribe: (callback: (ids: readonly string[]) => void) => {
      listeners.push(callback);
      return () => {};
    },
    setSelection: (next: string[]) => {
      selected = [...next];
      listeners.forEach(cb => cb(selected));
    },
    setEnabled: vi.fn(),
    refreshHelpers: vi.fn(),
  };
  const history = new CadHistoryController(model, scene as never, selection as never);
  const historyRecord = vi.spyOn(history, "recordTransform");
  const dom = new EventTarget() as HTMLElement;
  Object.assign(dom, {
    style: { touchAction: "" },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }),
  });
  const win = new EventTarget() as Window;
  Object.assign(win, { setTimeout: (callback: () => void) => {
    queueMicrotask(callback);
    return 1;
  }});
  vi.stubGlobal("window", win);
  const snap = {
    clearExcludedInstanceIds: vi.fn(),
    setExcludedInstanceIds: vi.fn(),
    findSnap: vi.fn(() => ({ point: new THREE.Vector3(10, 0, 0), type: "ENDPOINT" })),
  };
  type Args = ConstructorParameters<typeof DesignRotateController>;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 0, 50);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const controller = new DesignRotateController(
    world, camera, dom,
    model, scene as unknown as Args[4], selection as unknown as Args[5],
    history, snap as unknown as Args[7], vi.fn(),
  );
  expect(controller.activate()).toBe(true);
  const controls = Reflect.get(controller, "controls") as { axis: string | null };
  const pivot = Reflect.get(controller, "pivot") as THREE.Object3D;
  const begin = Reflect.get(controller, "handleRotateStart") as () => void;
  const end = Reflect.get(controller, "handleRotateEnd") as () => void;
  const down = Reflect.get(controller, "handleRingPointerDown") as
    (event: {button: number; clientX: number; clientY: number; pointerId: number}) => void;
  const move = Reflect.get(controller, "handleRingPointerMove") as
    (event: {clientX: number; clientY: number; pointerId: number}) => void;
  const dbl = Reflect.get(controller, "handleRingDoubleClick") as
    (event: {button: number; clientX: number; clientY: number;
      preventDefault: () => void; stopImmediatePropagation: () => void}) => void;
  const doubleEvent = {
    button: 0, clientX: 120, clientY: 80,
    preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(),
  };
  const click = (axis: string, dragged = false) => {
    controls.axis = axis;
    down({button: 0, clientX: 120, clientY: 80, pointerId: 1});
    begin();
    if (dragged) move({clientX: 150, clientY: 80, pointerId: 1});
    end();
  };
  return { model, scene, objects, ids, history, historyRecord, selection,
    controller, pivot, click, dbl, doubleEvent, screenButton, win, snap };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DesignRotateController - exact degrees and ring double click", () => {
  it("double-clicking X rotates the selected pieces +90 degrees around group pivot, once", () => {
    vi.spyOn(Date, "now").mockReturnValue(1100);
    const f = fixture();
    f.click("X");
    f.click("X");
    f.dbl(f.doubleEvent);
    expect(f.doubleEvent.preventDefault).toHaveBeenCalledOnce();
    expect(f.doubleEvent.stopImmediatePropagation).toHaveBeenCalledOnce();
    const a = f.model.pieceInstances.get(f.ids[0]!)!;
    const b = f.model.pieceInstances.get(f.ids[1]!)!;
    expect(a.transform.position.y).toBeCloseTo(0, 7);
    expect(a.transform.position.z).toBeCloseTo(-5, 7);
    expect(b.transform.position.z).toBeCloseTo(5, 7);
    expect(a.transform.rotation.x).toBeCloseTo(Math.PI / 2, 7);
    // Two short clicks must not create extra real history entries.
    expect(f.history.canUndo).toBe(true);
    expect(f.history.undo()).toBe(true);
    expect(f.model.pieceInstances.get(f.ids[0]!)?.transform.position.y).toBeCloseTo(-5, 7);
    expect(f.history.redo()).toBe(true);
    expect(f.model.pieceInstances.get(f.ids[0]!)?.transform.position.z).toBeCloseTo(-5, 7);
    f.controller.dispose();
  });

  it("never spins from different ring clicks or a drag", () => {
    vi.spyOn(Date, "now").mockReturnValue(1100);
    const f = fixture();
    f.click("X");
    f.click("Y");
    f.dbl(f.doubleEvent);
    expect(f.doubleEvent.preventDefault).not.toHaveBeenCalled();
    expect(f.model.pieceInstances.get(f.ids[0]!)?.transform.rotation.x).toBeCloseTo(0);
    f.click("Z");
    f.click("Z", true);
    f.dbl(f.doubleEvent);
    expect(f.doubleEvent.preventDefault).not.toHaveBeenCalled();
    f.controller.dispose();
  });

  it("completes exactly one +90 degree turn from two clicks without native dblclick", async () => {
    const f = fixture();
    f.click("Z");
    f.click("Z");
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(f.model.pieceInstances.get(f.ids[0]!)?.transform.rotation.z)
      .toBeCloseTo(Math.PI / 2, 7);
    expect(f.history.canUndo).toBe(true);
    expect(f.history.undo()).toBe(true);
    expect(f.history.canUndo).toBe(false); // no empty mouseDown/mouseUp entries
    expect(f.model.pieceInstances.get(f.ids[0]!)?.transform.rotation.z).toBeCloseTo(0);
    expect(f.history.redo()).toBe(true);
    expect(f.history.canRedo).toBe(false);
    f.controller.dispose();
  });

  it("exposes a visible 3D pivot handle that moves only the rotation center to SNAP", () => {
    const f = fixture(true);
    expect(f.screenButton?.dataset["framelogicPiecePivot"]).toBe("true");
    expect(f.screenButton?.style.display).toBe("block");
    const before = f.model.pieceInstances.get(f.ids[0]!)!.transform.position;
    const down = Object.assign(new Event("pointerdown", { cancelable: true }), {
      button: 0, pointerId: 9, clientX: 200, clientY: 200,
    });
    f.screenButton!.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    f.win.dispatchEvent(Object.assign(new Event("pointerup", { cancelable: true }), {
      button: 0, pointerId: 9, clientX: 200, clientY: 200,
    }));
    expect(Reflect.get(f.controller, "centerArmed")).toBe(true);
    const end = Object.assign(new Event("pointerup", { cancelable: true }), {
      button: 0, pointerId: 10, clientX: 300, clientY: 170,
    });
    const start = Object.assign(new Event("pointerdown", { cancelable: true }), {
      button: 0, pointerId: 10, clientX: 300, clientY: 170,
    });
    (Reflect.get(f.controller, "handleCenterPointerDown") as (e: PointerEvent) => void)(start as PointerEvent);
    (Reflect.get(f.controller, "handleCenterPointerUp") as (e: PointerEvent) => void)(end as PointerEvent);
    expect(f.pivot.position.toArray()).toEqual([10, 0, 0]);
    expect(f.model.pieceInstances.get(f.ids[0]!)!.transform.position).toEqual(before);
    expect(f.historyRecord).not.toHaveBeenCalled();
    expect(f.controller.applyNumericRotation("Z", 90)).toBe(true);
    expect(f.model.pieceInstances.get(f.ids[0]!)?.transform.position.x).toBeCloseTo(15);
    expect(f.model.pieceInstances.get(f.ids[0]!)?.transform.position.y).toBeCloseTo(-10);
    f.controller.dispose();
    expect(f.screenButton?.remove).toHaveBeenCalledOnce();
  });

  it("applies fractional and negative numeric degrees around the chosen world axis", () => {
    const f = fixture();
    expect(f.controller.applyNumericRotation("X", -37.5)).toBe(true);
    const expected = THREE.MathUtils.degToRad(-37.5);
    expect(f.model.pieceInstances.get(f.ids[0]!)?.transform.rotation.x).toBeCloseTo(expected, 7);
    expect(f.history.undo()).toBe(true);
    expect(f.model.pieceInstances.get(f.ids[0]!)?.transform.rotation.x).toBeCloseTo(0, 7);
    f.controller.dispose();
  });
});
