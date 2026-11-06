import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlignController } from "./AlignController";
import { CadHistoryController } from "./CadHistoryController";

afterEach(() => vi.unstubAllGlobals());

describe("ALIGN four-point undo and redo", () => {
  it("records the previous position and rotation and restores both on Ctrl+Z", () => {
    const object = new THREE.Object3D();
    object.position.set(10, 0, 0);
    object.updateMatrixWorld(true);
    const instance = {
      id: "piece-1",
      transform: {
        position: { x:10, y:0, z:0 },
        rotation: { x:0, y:0, z:0 },
      },
    };
    const updateTransform = vi.fn((_id: string, transform: typeof instance.transform) => {
      instance.transform = {
        position: {...transform.position}, rotation: {...transform.rotation},
      };
    });
    const designModel = {
      pieceInstances: { get: () => instance, updateTransform },
    };
    const designScene = {
      getInstanceObject: () => object,
      sync: vi.fn(),
    };
    const designSelection = { refreshHelpers: vi.fn() };
    const Args = null as unknown as ConstructorParameters<typeof CadHistoryController>;
    const history = new CadHistoryController(
      designModel as unknown as typeof Args[0],
      designScene as unknown as typeof Args[1],
      designSelection as unknown as typeof Args[2],
    );
    const closeLater = vi.fn();
    vi.stubGlobal("window", {setTimeout: closeLater});

    const align = Object.create(AlignController.prototype) as AlignController;
    Reflect.set(align, "selectedPieceIds", ["piece-1"]);
    Reflect.set(align, "selectedCadReferences", []);
    Reflect.set(align, "points", [
      new THREE.Vector3(0,0,0),
      new THREE.Vector3(100,0,0),
      new THREE.Vector3(10,0,0),
      new THREE.Vector3(100,10,0),
    ]);
    Reflect.set(align, "status", { textContent: "" });
    Reflect.set(align, "options", {
      designModel, designScene, designSelection, history,
      cadReferenceBlocks: {transformReference: vi.fn(), refresh: vi.fn()},
      clearGeometryQueryCache: vi.fn(),
    });
    const apply = Reflect.get(align,"applyAlignment") as () => void;
    apply.call(align);

    expect(instance.transform.position.x).toBeCloseTo(100, 8);
    expect(instance.transform.position.y).toBeCloseTo(10, 8);
    expect(instance.transform.rotation.z).toBeCloseTo(Math.PI/2, 8);
    expect(history.canUndo).toBe(true);
    expect(history.undo()).toBe(true);
    expect(instance.transform.position).toEqual({x:10,y:0,z:0});
    expect(instance.transform.rotation).toEqual({x:0,y:0,z:0});
    expect(object.position.toArray()).toEqual([10,0,0]);
    expect(object.rotation.z).toBeCloseTo(0, 8);
    expect(history.redo()).toBe(true);
    expect(instance.transform.position.x).toBeCloseTo(100, 8);
    expect(instance.transform.position.y).toBeCloseTo(10, 8);
    expect(instance.transform.rotation.z).toBeCloseTo(Math.PI/2, 8);
    expect(closeLater).toHaveBeenCalledOnce();
    expect(updateTransform).toHaveBeenCalledTimes(3);
  });
});
