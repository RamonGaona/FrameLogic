import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { DesignTransformController } from "./DesignTransformController";

function fixture() {
  const model = new DesignModel();
  const asset = model.registerAsset({ name: "perfil.step", format: "STEP" });
  const definition = model.registerPieceDefinition({
    code: "S", name: "Perfil", geometryAssetId: asset.id,
  });
  const sourceA = model.registerPieceInstance({
    definitionId: definition.id, transform: {
      position: {x: 10, y: 20, z: 0}, rotation: {x: 0, y: 0, z: 0},
    },
  });
  const sourceB = model.registerPieceInstance({
    definitionId: definition.id, transform: {
      position: {x: 60, y: 20, z: 0}, rotation: {x: 0, y: 0, z: 0},
    },
  });
  const child = model.registerAssembly({ name: "Sub", pieceInstanceIds: [sourceA.id] });
  const parent = model.createNestedAssembly({
    name: "Estructura", pieceInstanceIds: [sourceB.id], childAssemblyIds: [child.id],
  });
  const originals = [sourceA, sourceB].map(p => ({
    id: p.id,
    transform: structuredClone(p.transform),
  }));
  const world = new THREE.Scene();
  const objects = new Map<string, THREE.Object3D>();
  const designScene = {
    getInstanceObject: (id: string) => objects.get(id),
    sync: vi.fn(() => {
      for (const instance of model.pieceInstances.getAll()) {
        let object = objects.get(instance.id);
        if (!object) {
          object = new THREE.Object3D();
          objects.set(instance.id, object);
          world.add(object);
        }
        object.position.set(instance.transform.position.x,
          instance.transform.position.y, instance.transform.position.z);
        object.rotation.set(instance.transform.rotation.x,
          instance.transform.rotation.y, instance.transform.rotation.z);
        object.updateMatrixWorld(true);
      }
      for (const [id, object] of [...objects]) {
        if (!model.pieceInstances.get(id)) {
          world.remove(object);
          objects.delete(id);
        }
      }
    }),
  };
  designScene.sync();
  let selected = [sourceA.id, sourceB.id];
  let selectedAssemblyIds: string[] = [parent.id];
  const listeners: Array<(ids: readonly string[]) => void> = [];
  const selection = {
    getSelectedIds: () => [...selected],
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
  const destination = new THREE.Vector3(250, 20, 0);
  const snap = {
    setExcludedInstanceIds: vi.fn(),
    clearExcludedInstanceIds: vi.fn(),
    getSnapAtCurrentPointer: () => null,
    findSnap: () => ({ point: destination.clone() }),
  };
  let undo = () => {}, redo = () => {};
  const history = {
    capture: () => new Map(),
    recordTransform: vi.fn(),
    recordOperation: vi.fn((_label: string, backward: () => void, forward: () => void) => {
      undo = backward;
      redo = forward;
    }),
  };
  const canvas = new EventTarget() as HTMLElement;
  Object.assign(canvas, { style: { touchAction: "" } });
  const fakeWindow = new EventTarget() as Window;
  Object.assign(fakeWindow, { setTimeout: (callback: () => void) => {
    queueMicrotask(callback);
    return 1;
  }});
  vi.stubGlobal("window", fakeWindow);
  type Args = ConstructorParameters<typeof DesignTransformController>;
  const controller = new DesignTransformController(
    world, new THREE.PerspectiveCamera(), canvas,
    model as Args[3], designScene as unknown as Args[4],
    selection as unknown as Args[5], history as unknown as Args[6],
    snap as unknown as Args[7], vi.fn(),
  );
  controller.setAssemblyCopySelection(
    () => [...selectedAssemblyIds],
    ids => { selectedAssemblyIds = [...ids]; },
  );
  expect(controller.activate("translate")).toBe(true);
  const controls = Reflect.get(controller, "controls") as { axis: string | null };
  const pivot = Reflect.get(controller, "pivot") as THREE.Object3D;
  const start = Reflect.get(controller, "handleTransformStart") as () => void;
  const changed = Reflect.get(controller, "handleTransformChange") as () => void;
  const end = Reflect.get(controller, "handleTransformEnd") as () => void;
  const ctrlDown = Reflect.get(controller, "handleCtrlCopyPointerDown") as
    (event: { button: number; ctrlKey: boolean }) => void;
  const chooseSnap = () => {
    const down = Reflect.get(controller, "handleArmedPointerDown") as
      (event: {button: number; clientX: number; clientY: number}) => void;
    const up = Reflect.get(controller, "handleArmedPointerUp") as
      (event: {button: number; clientX: number; clientY: number;
        preventDefault: () => void; stopPropagation: () => void}) => void;
    down({ button: 0, clientX: 0, clientY: 0 });
    up({ button: 0, clientX: 0, clientY: 0, preventDefault: () => {}, stopPropagation: () => {} });
  };
  return {
    model, controller, parent, originals, objects, pivot, history,
    get selected() { return selected; },
    get selectedAssemblyIds() { return selectedAssemblyIds; },
    startCtrl: () => {
      controls.axis = "X";
      start();
      ctrlDown({ button: 0, ctrlKey: true });
    },
    changed, end, chooseSnap,
    undo: () => undo(), redo: () => redo(),
  };
}

afterEach(() => vi.unstubAllGlobals());

function assertOriginalsAtSource(f: ReturnType<typeof fixture>) {
  for (const original of f.originals) {
    expect(f.model.pieceInstances.get(original.id)?.transform).toEqual(original.transform);
    const object = f.objects.get(original.id)!;
    expect(object.position.toArray()).toEqual([
      original.transform.position.x, original.transform.position.y, original.transform.position.z,
    ]);
  }
}

describe("Ctrl+gizmo copies the assembly, never the source positions", () => {
  it("copies nested assembly via Ctrl drag and moves only the new hierarchy", async () => {
    const f = fixture();
    f.startCtrl();
    f.pivot.position.x += 350;
    f.changed();
    assertOriginalsAtSource(f);
    f.end();
    await Promise.resolve();
    assertOriginalsAtSource(f);
    expect(f.model.pieceInstances.count).toBe(4);
    expect(f.model.assemblies.getAll()).toHaveLength(4);
    expect(f.selectedAssemblyIds).toHaveLength(1);
    const newRootId = f.selectedAssemblyIds[0]!;
    expect(newRootId).not.toBe(f.parent.id);
    const clonedPieceIds = f.model.getAssemblyPieceIdsDeep(newRootId);
    expect(clonedPieceIds).toHaveLength(2);
    expect(clonedPieceIds.map(id => f.model.pieceInstances.get(id)!.transform.position.x).sort((a,b) => a-b))
      .toEqual([360, 410]);
    expect(f.history.recordTransform).not.toHaveBeenCalled();
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
    f.undo();
    assertOriginalsAtSource(f);
    expect(f.model.pieceInstances.count).toBe(2);
    f.redo();
    assertOriginalsAtSource(f);
    expect(f.model.getAssemblyPieceIdsDeep(newRootId)).toHaveLength(2);
    f.controller.dispose();
  });

  it("copies nested assembly to the SNAP destination after Ctrl+axis click", async () => {
    const f = fixture();
    f.startCtrl();
    f.end();
    assertOriginalsAtSource(f);
    expect(f.model.pieceInstances.count).toBe(2); // no copy until destination
    f.chooseSnap();
    await Promise.resolve();
    assertOriginalsAtSource(f);
    expect(f.model.pieceInstances.count).toBe(4);
    const newRoot = f.model.assemblies.getAll().find(a => a.name === "Estructura copia")!;
    expect(newRoot).toBeDefined();
    expect(f.model.getAssemblyPieceIdsDeep(newRoot.id).map(id =>
      f.model.pieceInstances.get(id)!.transform.position.x).sort((a,b) => a-b))
      .toEqual([235, 285]);
    expect(f.selected).toEqual(f.originals.map(s => s.id));
    expect(f.selectedAssemblyIds).toEqual([f.parent.id]);
    expect(f.history.recordTransform).not.toHaveBeenCalled();
    f.controller.dispose();
  });
});
