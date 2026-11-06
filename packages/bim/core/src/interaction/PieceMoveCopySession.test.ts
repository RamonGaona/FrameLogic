import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { PieceMoveCopySession } from "./PieceMoveCopySession";

interface TestInstance {
  id: string; definitionId: string; layerId: string; name?: string; tags: string[];
  transform: { position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number } };
}
function fixture() {
  const instances = new Map<string, TestInstance>([["original", {
    id: "original", definitionId: "definition", layerId: "layer", name: "Viga",
    tags: ["color:#abc", "fabricante:X"],
    transform: { position: { x: 5, y: 10, z: 20 },
      rotation: { x: 0, y: 0.5, z: 0 } },
  }]]);
  let counter = 0;
  const registerPieceInstance = vi.fn((data: Omit<TestInstance, "id"> & { id?: string }) => {
    const record = {
      ...data, id: data.id ?? "copy-" + ++counter, tags: [...data.tags],
      transform: { position: { ...data.transform.position },
        rotation: { ...data.transform.rotation } },
    };
    instances.set(record.id, record);
    return record;
  });
  const removePieceInstance = vi.fn((id: string) => instances.delete(id));
  const objects = new Map<string, THREE.Object3D>();
  const scene = {
    sync: vi.fn(() => {
      for (const [id, rec] of instances) {
        if (!objects.has(id)) objects.set(id, new THREE.Object3D());
        objects.get(id)!.position.set(
          rec.transform.position.x, rec.transform.position.y, rec.transform.position.z,
        );
      }
      for (const id of [...objects.keys()]) if (!instances.has(id)) objects.delete(id);
    }),
    getInstanceObject: (id: string) => objects.get(id),
  };
  const select = vi.fn();
  let undo = () => {}, redo = () => {};
  const history = { recordOperation: vi.fn((_label: string, u: () => void, r: () => void) => {
    undo = u; redo = r;
  }) };
  const model = {
    pieceInstances: { get: (id: string) => instances.get(id) },
    registerPieceInstance, removePieceInstance,
  };
  type Args = ConstructorParameters<typeof PieceMoveCopySession>;
  return {
    instances, registerPieceInstance, removePieceInstance,
    scene, select, history, model,
    make: (ids: string[] = ["original"]) => new PieceMoveCopySession(
      model as unknown as Args[0], scene as unknown as Args[1],
      { setSelection: select } as unknown as Args[2],
      history as unknown as Args[3], ids,
    ),
    undo: () => undo(), redo: () => redo(),
  };
}

describe("Ctrl + axis: reversible piece copy", () => {
  it("copies the definition, layer, tags and initial transform without moving the original", () => {
    const f = fixture();
    const copy = f.make();
    expect(copy.ids).toHaveLength(1);
    const instance = f.instances.get(copy.ids[0]!)!;
    const original = f.instances.get("original")!;
    expect(instance.definitionId).toBe(original.definitionId);
    expect(instance.layerId).toBe(original.layerId);
    expect(instance.transform).toEqual(original.transform);
    expect(instance.tags).toEqual(original.tags);
    expect(instance.tags).not.toBe(original.tags);
    expect(copy.objects.get(instance.id)?.position.x).toBe(5);
    copy.cancel();
    expect(f.instances.has("original")).toBe(true);
  });

  it("records one COPY operation: undo deletes only copy, redo restores moved copy", async () => {
    const f = fixture();
    const copy = f.make();
    const id = copy.ids[0]!;
    f.instances.get(id)!.transform.position.x = 150;
    copy.finish();
    expect(f.history.recordOperation).toHaveBeenCalledOnce();
    await Promise.resolve(); // selection changes after native TransformControls.mouseUp
    expect(f.select).toHaveBeenLastCalledWith([id]);
    expect(f.instances.get("original")?.transform.position.x).toBe(5);
    f.undo();
    expect(f.instances.has(id)).toBe(false);
    expect(f.instances.has("original")).toBe(true);
    expect(f.select).toHaveBeenLastCalledWith(["original"]);
    f.redo();
    expect(f.instances.get(id)?.transform.position.x).toBe(150);
    expect(f.select).toHaveBeenLastCalledWith([id]);
  });

  it("keeps the originals selected for repeated placements and Undo/Redo", async () => {
    const f = fixture();
    const first = f.make();
    const firstId = first.ids[0]!;
    f.instances.get(firstId)!.transform.position.x = 150;
    first.finish(true);
    await Promise.resolve();
    expect(f.select).not.toHaveBeenCalled();
    expect(f.instances.get("original")!.transform.position.x).toBe(5);

    const second = f.make();
    const secondId = second.ids[0]!;
    f.instances.get(secondId)!.transform.position.x = 250;
    second.finish(true);
    await Promise.resolve();
    expect(f.instances.size).toBe(3);
    expect(f.history.recordOperation).toHaveBeenCalledTimes(2);
    expect(f.select).not.toHaveBeenCalled();

    f.undo(); // undo the latest copy
    expect(f.instances.has(secondId)).toBe(false);
    expect(f.instances.has(firstId)).toBe(true);
    expect(f.select).toHaveBeenLastCalledWith(["original"]);
    f.redo();
    expect(f.instances.get(secondId)!.transform.position.x).toBe(250);
    expect(f.select).toHaveBeenLastCalledWith(["original"]);
  });

  it("cancel removes any unconfirmed copies without creating history", () => {
    const f = fixture();
    const copy = f.make();
    const id = copy.ids[0]!;
    copy.cancel();
    copy.cancel();
    expect(f.instances.has(id)).toBe(false);
    expect(f.instances.get("original")?.transform.position.x).toBe(5);
    expect(f.history.recordOperation).not.toHaveBeenCalled();
  });

  it("duplicates a multi-piece selection and leaves both originals unchanged", () => {
    const f = fixture();
    f.registerPieceInstance({
      id: "second", name: "Columna", definitionId: "definition", layerId: "layer",
      tags: [], transform: { position: { x: 40, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 } },
    });
    const copy = f.make(["original", "second"]);
    expect(copy.ids).toHaveLength(2);
    expect(f.instances.size).toBe(4);
    copy.cancel();
    expect([...f.instances.keys()].sort()).toEqual(["original", "second"]);
  });
});
