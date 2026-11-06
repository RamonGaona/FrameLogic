import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignTransformController } from "./DesignTransformController";

function fixture() {
  type Instance = {
    id: string; definitionId: string; layerId: string; tags: string[]; name?: string;
    transform: { position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number } };
  };
  const instances = new Map<string, Instance>([["original", {
    id: "original", definitionId: "def", layerId: "geometry", tags: ["custom"],
    transform: { position: { x: 5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
  }]]);
  let serial = 0;
  const registerPieceInstance = vi.fn((data: Omit<Instance, "id"> & { id?: string }) => {
    const record = { ...data, id: data.id ?? "copy-" + ++serial,
      tags: [...data.tags], transform: { position: { ...data.transform.position },
        rotation: { ...data.transform.rotation } } };
    instances.set(record.id, record);
    return record;
  });
  const objects = new Map<string, THREE.Object3D>();
  const world = new THREE.Scene();
  const designScene = {
    getInstanceObject: (id: string) => objects.get(id),
    sync: vi.fn(() => {
      for (const [id, record] of instances) {
        if (!objects.has(id)) {
          const object = new THREE.Object3D();
          objects.set(id, object);
          world.add(object);
        }
        const object = objects.get(id)!;
        object.position.set(record.transform.position.x,
          record.transform.position.y, record.transform.position.z);
        object.updateMatrixWorld(true);
      }
      for (const [id, object] of [...objects]) {
        if (!instances.has(id)) { world.remove(object); objects.delete(id); }
      }
    }),
  };
  designScene.sync();
  const model = {
    pieceInstances: {
      get: (id: string) => instances.get(id),
      updateTransform: (id: string, transform: Instance["transform"]) => {
        const previous = instances.get(id)!;
        const record = { ...previous, transform };
        instances.set(id, record);
        return record;
      },
    },
    layers: { get: () => ({ visible: true, locked: false }) },
    registerPieceInstance,
    removePieceInstance: (id: string) => instances.delete(id),
  };
  let selected = ["original"];
  const listeners: ((ids: readonly string[]) => void)[] = [];
  const selection = {
    getSelectedIds: () => selected,
    subscribe: (callback: (ids: readonly string[]) => void) => {
      listeners.push(callback);
      return () => {};
    },
    setSelection: (ids: readonly string[]) => {
      selected = [...ids];
      listeners.forEach(callback => callback(selected));
    },
    refreshHelpers: vi.fn(),
    setEnabled: vi.fn(),
  };
  const snapDestination = new THREE.Vector3(120, 0, 0);
  const snap = {
    setExcludedInstanceIds: vi.fn(),
    clearExcludedInstanceIds: vi.fn(),
    getSnapAtCurrentPointer: () => null,
    findSnap: () => ({ point: snapDestination.clone() }),
  };
  const history = {
    capture: () => new Map(),
    recordTransform: vi.fn(),
    recordOperation: vi.fn(),
  };
  const canvas = new EventTarget() as HTMLElement;
  Object.assign(canvas, { style: { touchAction: "" } });
  const fakeWindow = new EventTarget() as Window;
  Object.assign(fakeWindow, { setTimeout: (callback: () => void) => {
    queueMicrotask(callback); return 1;
  } });
  vi.stubGlobal("window", fakeWindow);
  type Args = ConstructorParameters<typeof DesignTransformController>;
  const controller = new DesignTransformController(
    world, new THREE.PerspectiveCamera(), canvas,
    model as unknown as Args[3], designScene as unknown as Args[4],
    selection as unknown as Args[5], history as unknown as Args[6],
    snap as unknown as Args[7], vi.fn(),
  );
  expect(controller.activate("translate")).toBe(true);
  const controls = Reflect.get(controller, "controls") as { axis: string | null };
  const pivot = Reflect.get(controller, "pivot") as THREE.Object3D;
  const start = Reflect.get(controller, "handleTransformStart") as () => void;
  const change = Reflect.get(controller, "handleTransformChange") as () => void;
  const end = Reflect.get(controller, "handleTransformEnd") as () => void;
  const ctrlDown = Reflect.get(controller, "handleCtrlCopyPointerDown") as
    (e: { button: number; ctrlKey: boolean }) => void;
  return {
    controller, instances, objects, history, selection, snap, pivot, model,
    get selected() { return selected; },
    startAxis: (ctrl: boolean) => {
      controls.axis = "X";
      start();
      ctrlDown({ button: 0, ctrlKey: ctrl });
    },
    change, end,
    setSnapDestination: (x: number, y = 0, z = 0) => {
      snapDestination.set(x, y, z);
    },
    cancelRepeatCopy: () => {
      const keyDown = Reflect.get(controller, "handleRepeatCopyKeyDown") as
        (event: {key: string; preventDefault: () => void; stopImmediatePropagation: () => void}) => void;
      keyDown({key: "Escape", preventDefault: () => {}, stopImmediatePropagation: () => {}});
    },
    chooseSnap: () => {
      const pointerDown = Reflect.get(controller, "handleArmedPointerDown") as
        (e: { button: number; clientX: number; clientY: number }) => void;
      const pointerUp = Reflect.get(controller, "handleArmedPointerUp") as
        (e: { button: number; clientX: number; clientY: number;
          preventDefault: () => void; stopPropagation: () => void }) => void;
      pointerDown({ button: 0, clientX: 0, clientY: 0 });
      pointerUp({ button: 0, clientX: 0, clientY: 0,
        preventDefault: () => {}, stopPropagation: () => {} });
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("aligned piece-local movement", () => {
  it("orients the gizmo to the selected rotated piece and constrains SNAP X locally", () => {
    const f = fixture();
    const object = f.objects.get("original")!;
    object.rotation.z = Math.PI / 2;
    object.updateMatrixWorld(true);

    // Re-selecting the aligned piece updates the gizmo, not the geometry.
    f.selection.setSelection(["original"]);
    const controls = Reflect.get(f.controller, "controls") as { space: string };
    expect(controls.space).toBe("local");
    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(f.pivot.quaternion);
    expect(localX.x).toBeCloseTo(0, 7);
    expect(localX.y).toBeCloseTo(1, 7);

    const correction = (Reflect.get(f.controller, "getConstrainedSnapCorrection") as
      (axis: string, target: THREE.Vector3) => THREE.Vector3).bind(f.controller);
    const snappedX = correction("X", new THREE.Vector3(40, 80, 20));
    expect(snappedX.x).toBeCloseTo(0, 7);
    expect(snappedX.y).toBeCloseTo(80, 7);
    expect(snappedX.z).toBeCloseTo(0, 7);

    expect(f.controller.applyNumericMove("X", 25)).toBe(true);
    expect(f.instances.get("original")?.transform.position.x).toBeCloseTo(5);
    expect(f.instances.get("original")?.transform.position.y).toBeCloseTo(25);

    f.controller.setSpace("world");
    const worldX = correction("X", new THREE.Vector3(40, 80, 20));
    expect(worldX.x).toBeCloseTo(35, 7);
    expect(worldX.y).toBeCloseTo(0, 7);
    expect(worldX.z).toBeCloseTo(0, 7);
    f.controller.dispose();
  });

  it("combines authored FrameLogic axes with instance rotation, and uses world axes for a group", () => {
    const f = fixture();
    Reflect.set(f.model, "pieceDefinitions", { get: () => ({
      coordinateSystem: {
        origin: {x:0,y:0,z:0},
        xAxis: {x:0,y:1,z:0}, yAxis: {x:-1,y:0,z:0}, zAxis: {x:0,y:0,z:1},
      },
    }) });
    f.selection.setSelection(["original"]);
    const worldX = new THREE.Vector3(1,0,0).applyQuaternion(f.pivot.quaternion);
    expect(worldX.x).toBeCloseTo(0, 7);
    expect(worldX.y).toBeCloseTo(1, 7);

    const second = f.model.registerPieceInstance({
      id:"second", definitionId:"def", layerId:"geometry", tags:[],
      transform:{position:{x:200,y:0,z:0},rotation:{x:0,y:0,z:0}},
    });
    expect(second.id).toBe("second");
    // New instance object must be available to the transform controller.
    const secondObject = new THREE.Object3D();
    secondObject.position.set(200,0,0);
    f.objects.set("second",secondObject);
    f.selection.setSelection(["original", "second"]);
    const controls = Reflect.get(f.controller, "controls") as {space: string};
    expect(controls.space).toBe("world");
    expect(f.pivot.quaternion.equals(new THREE.Quaternion())).toBe(true);
    f.controller.dispose();
  });
});

describe("Ctrl + translate gizmo integration", () => {
  it("moves only a copy when Ctrl is held on the X-axis", async () => {
    const f = fixture();
    f.startAxis(true);
    f.pivot.position.x += 40;
    f.change();
    expect(f.instances.size).toBe(2);
    expect(f.objects.get("original")!.position.x).toBe(5);
    expect(f.objects.get("copy-1")!.position.x).toBe(45);
    f.end();
    await Promise.resolve();
    expect(f.instances.get("original")!.transform.position.x).toBe(5);
    expect(f.instances.get("copy-1")!.transform.position.x).toBe(45);
    expect(f.selected).toEqual(["copy-1"]);
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
    expect(f.history.recordTransform).not.toHaveBeenCalled();
    f.controller.dispose();
  });

  it("a short Ctrl+axis click creates no copy until SNAP destination is chosen", async () => {
    const f = fixture();
    f.startAxis(true);
    f.end();
    expect(f.instances.size).toBe(1);
    f.chooseSnap();
    await Promise.resolve();
    expect(f.instances.size).toBe(2);
    expect(f.instances.get("copy-1")!.transform.position.x).toBe(120);
    expect(f.instances.get("original")!.transform.position.x).toBe(5);
    expect(f.selected).toEqual(["original"]);
    expect(f.controller.isActive).toBe(true);
    f.controller.dispose();
  });

  it("continues copying onto successive SNAPs without reactivating the gizmo", async () => {
    const f = fixture();
    f.startAxis(true);
    f.end(); // arm the axis once
    f.chooseSnap();
    await Promise.resolve();

    expect(f.instances.get("copy-1")!.transform.position.x).toBe(120);
    expect(f.selected).toEqual(["original"]);
    expect(f.pivot.position.x).toBe(5);
    expect(Reflect.get(f.controller, "armedMoveAxis")).toBe("X");
    expect(Reflect.get(f.controller, "armedCopyMove")).toBe(true);

    f.setSnapDestination(235);
    f.chooseSnap(); // ordinary click; Ctrl and axis click are NOT repeated
    await Promise.resolve();

    expect(f.instances.size).toBe(3);
    expect(f.instances.get("copy-1")!.transform.position.x).toBe(120);
    expect(f.instances.get("copy-2")!.transform.position.x).toBe(235);
    expect(f.instances.get("original")!.transform.position.x).toBe(5);
    expect(f.selected).toEqual(["original"]);
    expect(f.pivot.position.x).toBe(5);
    expect(f.controller.isActive).toBe(true);
    expect(f.history.recordOperation).toHaveBeenCalledTimes(2);
    expect(f.history.recordTransform).not.toHaveBeenCalled();

    f.setSnapDestination(5); // same origin: don't make a zero-distance copy
    f.chooseSnap();
    expect(f.instances.size).toBe(3);
    expect(Reflect.get(f.controller, "armedCopyMove")).toBe(true);

    f.setSnapDestination(330);
    f.chooseSnap();
    expect(f.instances.size).toBe(4);
    expect(f.instances.get("copy-3")!.transform.position.x).toBe(330);

    f.cancelRepeatCopy();
    expect(Reflect.get(f.controller, "armedCopyMove")).toBe(false);
    expect(f.controller.isActive).toBe(true); // gizmo stays visible
    f.setSnapDestination(440);
    f.chooseSnap();
    expect(f.instances.size).toBe(4);
    f.controller.dispose();
  });

  it("without Ctrl the gizmo moves the original and never creates a copy", () => {
    const f = fixture();
    f.startAxis(false);
    f.pivot.position.x += 20;
    f.change();
    f.end();
    expect(f.instances.size).toBe(1);
    expect(f.instances.get("original")!.transform.position.x).toBe(25);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
    f.controller.dispose();
  });

  it("Escape/cancel removes unconfirmed copies and restores the original", () => {
    const f = fixture();
    f.startAxis(true);
    f.pivot.position.x += 30;
    f.change();
    expect(f.instances.size).toBe(2);
    f.controller.deactivate();
    expect(f.instances.size).toBe(1);
    expect(f.instances.get("original")!.transform.position.x).toBe(5);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
    f.controller.dispose();
  });
});
