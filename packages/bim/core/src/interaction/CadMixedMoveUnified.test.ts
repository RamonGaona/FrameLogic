import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadMixedMoveController } from "./CadMixedMoveController";
import { getActiveCadReferenceBlockController } from "../import/CadReferenceTransformController";

vi.mock("../import/CadReferenceTransformController", () => ({
  getActiveCadReferenceBlockController: vi.fn(),
}));
function fixture() {
  const model = new DesignModel();
  const asset = model.registerAsset({ name: "beam.step", format: "STEP" });
  const definition = model.registerPieceDefinition({
    code: "A1", name: "Beam", geometryAssetId: asset.id,
  });
  const piece = model.registerPieceInstance({
    definitionId: definition.id, transform: {
      position: { x: 10, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
    },
  });
  const nativeLayer = model.layers.create({ name: "CAD loose", visible: true, locked: false });
  const nativeLine = model.registerCadLine({
    layerId: nativeLayer.id, start: { x: 0, y: 0, z: 0 },
    end: { x: 4, y: 0, z: 0 },
  });
  const refLayer = model.layers.create({ name: "CAD Plano · Muros", locked: false });
  const refLine = model.registerCadLine({
    layerId: refLayer.id, start: { x: 100, y: 0, z: 0 },
    end: { x: 110, y: 0, z: 0 },
  });
  model.layers.update(refLayer.id, {locked: true});

  const objects = new Map<string, THREE.Object3D>();
  const designScene = {
    sync: vi.fn(() => {
      for (const p of model.pieceInstances.getAll()) {
        let obj = objects.get(p.id);
        if (!obj) { obj = new THREE.Object3D(); objects.set(p.id, obj); }
        obj.position.set(p.transform.position.x, p.transform.position.y, p.transform.position.z);
        obj.rotation.set(p.transform.rotation.x, p.transform.rotation.y, p.transform.rotation.z);
        obj.updateMatrixWorld(true);
      }
    }),
    getInstanceObject: (id: string) => objects.get(id) ?? null,
  };
  designScene.sync();
  const lineScene = {sync: vi.fn()};
  const pointScene = {sync: vi.fn()};
  const state = {
    pieceIds: [piece.id], lineIds: [nativeLine.id], pointIds: [],
    items: [
      {type: "PIECE", id: piece.id}, {type: "LINE", id: nativeLine.id},
    ],
    selectedTypeCount: 2,
  };
  const selection = {
    hasSelection: true, isMixed: true, setEnabled: vi.fn(),
    getState: () => state,
  };
  const ref = {
    getSelectedReferenceNames: () => ["Plano"],
    setInteractionEnabled: vi.fn(),
  };
  vi.mocked(getActiveCadReferenceBlockController).mockReturnValue(ref as never);
  const historyOps: Array<{undo: () => void; redo: () => void}> = [];
  const history = {recordOperation: vi.fn((_name: string, undo: () => void, redo: () => void) =>
    historyOps.push({undo,redo}))};
  const designSelection = { refreshHelpers: vi.fn() };
  const snap = {
    clearExcludedInstanceIds: vi.fn(),
    setExcludedInstanceIds: vi.fn(),
    findSnap: vi.fn(() => ({point: new THREE.Vector3(50, 0, 0)})),
  };
  const canvas = new EventTarget() as HTMLElement;
  Object.assign(canvas, {style: {touchAction: ""}});
  const wnd = new EventTarget() as Window;
  vi.stubGlobal("window", wnd);
  type Args = ConstructorParameters<typeof CadMixedMoveController>;
  const controller = new CadMixedMoveController(
    new THREE.Scene(), new THREE.PerspectiveCamera(), canvas, model,
    designScene as unknown as Args[4],
    pointScene as unknown as Args[5],
    lineScene as unknown as Args[6],
    selection as unknown as Args[7],
    designSelection as unknown as Args[8],
    history as unknown as Args[9],
    snap as unknown as Args[10], vi.fn(),
  );
  const events = {
    button: 0, ctrlKey: true, clientX: 100, clientY: 100,
    preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(),
    stopPropagation: vi.fn(),
  };
  return {model, piece, nativeLine, refLine, ref, controller,
    history, historyOps, snap, objects, events};
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MOVE unified selection with loose CAD + 3D + DWG", () => {
  it("moves all categories by one numeric delta, even DWG layers which are locked", () => {
    const f = fixture();
    expect(f.controller.activate()).toBe(true);
    expect(f.ref.setInteractionEnabled).toHaveBeenCalledWith(false);
    expect(f.controller.applyNumericMove("X", 25)).toBe(true);
    expect(f.model.pieceInstances.get(f.piece.id)?.transform.position.x).toBeCloseTo(35);
    expect(f.model.cadLines.get(f.nativeLine.id)?.start.x).toBeCloseTo(25);
    expect(f.model.cadLines.get(f.refLine.id)?.start.x).toBeCloseTo(125);
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
    f.historyOps[0]!.undo();
    expect(f.model.pieceInstances.get(f.piece.id)?.transform.position.x).toBe(10);
    expect(f.model.cadLines.get(f.nativeLine.id)?.start.x).toBe(0);
    expect(f.model.cadLines.get(f.refLine.id)?.start.x).toBe(100);
    f.historyOps[0]!.redo();
    expect(f.model.cadLines.get(f.refLine.id)?.start.x).toBe(125);
    f.controller.deactivate();
    expect(f.ref.setInteractionEnabled).toHaveBeenCalledWith(true);
    f.controller.dispose();
  });

  it("Ctrl + X axis + two SNAP destinations requests two independent group copies", () => {
    const f = fixture();
    const copy = vi.fn((_offset: THREE.Vector3) => 3);
    f.controller.setMixedCopyHandler(copy);
    expect(f.controller.activate()).toBe(true);
    const gizmo = Reflect.get(f.controller, "controls") as {axis: string | null};
    gizmo.axis = "X";
    (Reflect.get(f.controller, "handleCopyPointerDown") as (event: typeof f.events) => void)(f.events);
    (Reflect.get(f.controller, "handleMoveStart") as () => void)();
    (Reflect.get(f.controller, "handleMoveEnd") as () => void)();
    expect(Reflect.get(f.controller, "armedCopy")).toBe(true);
    const down = Reflect.get(f.controller, "handleArmedPointerDown") as (event: typeof f.events) => void;
    const up = Reflect.get(f.controller, "handleArmedPointerUp") as (event: typeof f.events) => void;
    down(f.events);
    up(f.events);
    down(f.events);
    up(f.events);
    expect(copy).toHaveBeenCalledTimes(2);
    for (const [offset] of copy.mock.calls) {
      expect(offset).toBeInstanceOf(THREE.Vector3);
    }
    expect(f.model.pieceInstances.get(f.piece.id)?.transform.position.x).toBe(10);
    expect(f.model.cadLines.get(f.nativeLine.id)?.start.x).toBe(0);
    expect(f.model.cadLines.get(f.refLine.id)?.start.x).toBe(100);
    expect(Reflect.get(f.controller, "armedCopy")).toBe(true);
    f.controller.dispose();
  });
});
