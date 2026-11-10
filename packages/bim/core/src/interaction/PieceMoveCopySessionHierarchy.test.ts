import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { PieceMoveCopySession } from "./PieceMoveCopySession";

function fixture() {
  const model = new DesignModel();
  const asset = model.registerAsset({ name: "viga.step", format: "STEP" });
  const definition = model.registerPieceDefinition({
    code: "V", name: "Viga", geometryAssetId: asset.id,
  });
  const a = model.registerPieceInstance({
    definitionId: definition.id,
    tags: ["__FL_LINKED_ASSEMBLY_ID__:original", "__FL_LINKED_ASSEMBLY_COMPONENT__:part", "custom:X"],
    transform: { position: {x: 10, y: 20, z: 30}, rotation: {x: 0, y: 0, z: 0} },
  });
  const b = model.registerPieceInstance({
    definitionId: definition.id,
    transform: { position: {x: 50, y: 60, z: 70}, rotation: {x: 0, y: 0, z: 0} },
  });
  const c = model.registerPieceInstance({ definitionId: definition.id });
  const child = model.registerAssembly({ name: "Sub", pieceInstanceIds: [a.id] });
  const parent = model.createNestedAssembly({
    name: "Parent", pieceInstanceIds: [b.id], childAssemblyIds: [child.id],
  });
  const objects = new Map<string, THREE.Object3D>();
  const scene = {
    sync: vi.fn(() => {
      for (const p of model.pieceInstances.getAll()) {
        let object = objects.get(p.id);
        if (!object) {
          object = new THREE.Object3D();
          objects.set(p.id, object);
        }
        object.position.set(p.transform.position.x, p.transform.position.y, p.transform.position.z);
      }
      for (const id of [...objects.keys()]) {
        if (!model.pieceInstances.get(id)) objects.delete(id);
      }
    }),
    getInstanceObject: (id: string) => objects.get(id),
  };
  scene.sync();
  const selection = { setSelection: vi.fn() };
  const onAssemblySelection = vi.fn();
  let undo = () => {}, redo = () => {};
  const history = { recordOperation: vi.fn((_name: string, u: () => void, r: () => void) => {
    undo = u; redo = r;
  }) };
  type Args = ConstructorParameters<typeof PieceMoveCopySession>;
  const make = (sourcePieceIds: string[], sourceAssemblyIds: string[]) =>
    new PieceMoveCopySession(
      model, scene as unknown as Args[1], selection as unknown as Args[2],
      history as unknown as Args[3], sourcePieceIds, sourceAssemblyIds,
      onAssemblySelection,
    );
  return {
    model, a, b, c, child, parent, selection, onAssemblySelection,
    history, scene, make, undo: () => undo(), redo: () => redo(),
  };
}

describe("Ctrl+gizmo copy as a structural transaction", () => {
  it("copies the hierarchy, translates only its copy, and undoes/redoes it atomically", async () => {
    const f = fixture();
    const session = f.make([f.a.id, f.b.id, f.c.id], [f.parent.id]);
    expect(session.ids).toHaveLength(3);
    expect(session.rootAssemblyIds).toHaveLength(1);

    const root = f.model.assemblies.get(session.rootAssemblyIds[0]!)!;
    const child = f.model.getAssemblyChildren(root.id)[0]!;
    expect(child).toBeDefined();
    const sourceA = f.model.pieceInstances.get(f.a.id)!;
    const copyAId = child.pieceInstanceIds[0]!;
    expect(copyAId).not.toBe(f.a.id);
    expect(f.model.pieceInstances.get(copyAId)?.tags).toEqual(["custom:X"]);

    for (const id of session.ids) {
      const piece = f.model.pieceInstances.get(id)!;
      f.model.pieceInstances.updateTransform(id, {
        position: {x: piece.transform.position.x + 350, y: piece.transform.position.y - 80,
          z: piece.transform.position.z + 25},
        rotation: {...piece.transform.rotation},
      });
    }
    f.scene.sync();
    session.finish();
    await Promise.resolve();
    expect(f.onAssemblySelection).toHaveBeenCalledWith(session.rootAssemblyIds);
    expect(f.model.pieceInstances.get(f.a.id)?.transform).toEqual(sourceA.transform);
    expect(f.model.pieceInstances.get(copyAId)?.transform.position)
      .toEqual({x: 360, y: -60, z: 55});
    expect(f.history.recordOperation).toHaveBeenCalledOnce();

    f.undo();
    expect(f.model.assemblies.get(root.id)).toBeUndefined();
    expect(f.model.assemblies.get(child.id)).toBeUndefined();
    expect(session.ids.every((id) => !f.model.pieceInstances.get(id))).toBe(true);
    expect(f.model.assemblies.get(f.parent.id)?.pieceInstanceIds).toEqual([f.b.id]);
    f.redo();
    expect(f.model.assemblies.get(child.id)?.parentAssemblyId).toBe(root.id);
    expect(f.model.getAssemblyPieceIdsDeep(root.id)).toHaveLength(2);
    expect(f.model.pieceInstances.get(copyAId)?.transform.position.x).toBe(360);
    expect(f.model.pieceDefinitions.count).toBe(1);
    expect(f.model.assets.count).toBe(1);
  });

  it("Esc/cancel drops both duplicated pieces and assembly hierarchy", () => {
    const f = fixture();
    const before = f.model.captureAssemblies();
    const session = f.make([f.a.id, f.b.id], [f.parent.id]);
    session.cancel();
    session.cancel();
    expect(f.model.captureAssemblies()).toEqual(before);
    expect(f.model.pieceInstances.count).toBe(3);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
  });

  it("repeated SNAP copy retains the original assembly selection", async () => {
    const f = fixture();
    const session = f.make([f.a.id, f.b.id], [f.parent.id]);
    session.finish(true);
    await Promise.resolve();
    expect(f.onAssemblySelection).not.toHaveBeenCalled();
    f.undo();
    expect(f.onAssemblySelection).toHaveBeenLastCalledWith([f.parent.id]);
    f.redo();
    expect(f.onAssemblySelection).toHaveBeenLastCalledWith([f.parent.id]);
  });
});
