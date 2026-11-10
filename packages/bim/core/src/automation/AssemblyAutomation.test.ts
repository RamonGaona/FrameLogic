import { describe, expect, it, vi } from "vitest";
import { createAutomationFixture } from "./fixture";
import { createOperationDispatcher } from "./dispatch";

function fixture() {
  const f = createAutomationFixture();
  const definitionId = "fixture-definition";
  const a = f.model.pieceInstances.get("REC1500-instance")!;
  const b = f.model.registerPieceInstance({ definitionId, name: "B",
    tags: ["__FL_LINKED_ASSEMBLY_ID__:source", "keep:B"],
    transform: { position: { x: 10, y: 20, z: 30 }, rotation: { x: 0, y: 0, z: 0 } } });
  const c = f.model.registerPieceInstance({ definitionId, name: "C",
    transform: { position: { x: 50, y: 60, z: 70 }, rotation: { x: 0, y: 0, z: 0 } } });
  const leaf = f.model.registerAssembly({ name: "Leaf", pieceInstanceIds: [a.id] });
  const middle = f.model.createNestedAssembly({ name: "Middle",
    pieceInstanceIds: [b.id], childAssemblyIds: [leaf.id] });
  const root = f.model.createNestedAssembly({ name: "Root",
    pieceInstanceIds: [c.id], childAssemblyIds: [middle.id] });
  return { ...f, a, b, c, leaf, middle, root };
}
const offset = { x: 100, y: -30, z: 20 };

describe("shared assembly automation for chat and MCP", () => {
  it("uses explicit tree identity and moves the entire 3-level hierarchy as one Undo", () => {
    const f = fixture();
    const before = f.model.pieceInstances.getAll().map(p => ({ id: p.id, transform: structuredClone(p.transform) }));
    f.ports.setSelection([f.a.id, f.b.id, f.c.id]);
    expect(f.operations.getSelectionContext().assemblyIds).toEqual([]);
    expect(f.operations.getSelectionContext().requiresExplicitAssemblySelection).toBe(true);
    f.operations.selectAssembly(f.root.id);
    expect(f.operations.getSelectionContext().assemblyIds).toEqual([f.root.id]);
    const p = f.operations.prepareAssembly({ operation: "move_assembly",
      id: f.root.id, space: "world", displacement: offset });
    expect(p.pieceCount).toBe(3);
    expect(p.subassemblyCount).toBe(2);
    expect(f.model.pieceInstances.get(f.a.id)?.transform.position).toEqual(before[0]!.transform.position);
    expect(f.operations.confirmAssembly(p.id).affectedIds).toHaveLength(3);
    for (const item of before) {
      const position = f.model.pieceInstances.get(item.id)!.transform.position;
      expect(position.x).toBeCloseTo(item.transform.position.x + 100);
      expect(position.y).toBeCloseTo(item.transform.position.y - 30);
      expect(position.z).toBeCloseTo(item.transform.position.z + 20);
    }
    expect(f.model.getAssemblyDescendantIds(f.root.id)).toEqual([f.middle.id, f.leaf.id]);
    expect(f.operations.undo().changed).toBe(true);
    for (const item of before)
      expect(f.model.pieceInstances.get(item.id)!.transform).toEqual(item.transform);
    expect(f.history.canUndo).toBe(false);
    expect(f.operations.redo().changed).toBe(true);
    expect(f.model.pieceInstances.get(f.b.id)!.transform.position.x).toBeCloseTo(110);
  });

  it("copies full assembly tree twice with stable IDs and no linked-copy tags", () => {
    const f = fixture();
    f.operations.selectAssembly(f.root.id);
    const source = f.model.captureAssemblies();
    const preview = f.operations.prepareAssembly({ operation: "copy_assembly_array",
      id: f.root.id, space: "world", displacement: { x: 1500, y: 0, z: 0 }, count: 2 });
    expect(preview.copyCount).toBe(2);
    expect(preview.pieceCount).toBe(3);
    expect(f.model.pieceInstances.count).toBe(3); // preview-only
    const response = f.operations.confirmAssembly(preview.id);
    expect(response.createdIds).toHaveLength(6);
    expect(response.createdAssemblyIds).toHaveLength(6);
    expect(response.rootAssemblyIds).toHaveLength(2);
    expect(f.model.pieceInstances.count).toBe(9);
    for (const rootId of response.rootAssemblyIds) {
      const children = f.model.getAssemblyDescendantIds(rootId);
      expect(children).toHaveLength(2);
      expect(f.model.getAssemblyPieceIdsDeep(rootId)).toHaveLength(3);
    }
    expect(f.model.captureAssemblies().slice(0, 3)).toEqual(source);
    expect(f.model.pieceInstances.get(response.createdIds[1]!)?.tags).toEqual(["keep:B"]);
    expect(f.operations.getSelectionContext().assemblyIds).toEqual(response.rootAssemblyIds);
    f.operations.undo();
    expect(f.model.captureAssemblies()).toEqual(source);
    expect(f.model.pieceInstances.count).toBe(3);
    expect(f.history.canUndo).toBe(false);
    f.operations.redo();
    expect(f.model.pieceInstances.count).toBe(9);
    expect(f.model.getAssemblyPieceIdsDeep(response.rootAssemblyIds[0]!)).toHaveLength(3);
    expect(f.operations.getSelectionContext().assemblyIds).toEqual(response.rootAssemblyIds);
  });

  it("rejects locked members and invalid or oversize copies before changing the model", () => {
    const f = fixture();
    f.model.setAssemblyLocked(f.middle.id, true);
    expect(() => f.operations.prepareAssembly({
      operation: "move_assembly", id: f.root.id, space: "world", displacement: offset,
    })).toThrow(/bloquead/);
    f.model.setAssemblyLocked(f.middle.id, false);
    expect(() => f.operations.prepareAssembly({
      operation: "copy_assembly_array", id: f.root.id, space: "world", displacement: offset, count: 21,
    })).toThrow(/1–20/);
    expect(() => f.operations.prepareAssembly({
      operation: "move_assembly", id: f.root.id, space: "world",
      displacement: { x: Number.POSITIVE_INFINITY, y: 0, z: 0 },
    })).toThrow(/finito/);
    expect(f.model.pieceInstances.count).toBe(3);
    expect(f.history.canUndo).toBe(false);
  });

  it("rejects stale and replayed proposals, and does not bypass browser approval", async () => {
    const f = fixture();
    f.operations.selectAssembly(f.root.id);
    const dispatch = createOperationDispatcher(f.operations, () => false);
    const request = { operation: "move_assembly", id: f.root.id,
      space: "world", displacement: offset };
    const p = await dispatch("prepare_assembly_operation", { request });
    expect(p.ok).toBe(true);
    expect((await dispatch("confirm_assembly_operation", { proposalId: p.data!.id })).ok).toBe(false);
    expect((await dispatch("confirm_assembly_operation", { proposalId: p.data!.id })).ok).toBe(false);
    const another = f.operations.prepareAssembly({ operation: "move_assembly",
      id: f.root.id, space: "world", displacement: offset });
    f.model.assemblies.updateName(f.leaf.id, "changed");
    expect(() => f.operations.confirmAssembly(another.id)).toThrow(/cambió/);
    expect(f.model.pieceInstances.count).toBe(3);
    expect((await dispatch("prepare_assembly_operation", {
      request: { ...request, bypassApproval: true },
    })).ok).toBe(false);
  });

  it("rolls back partially created copies and leaves no history entry", () => {
    const f = fixture();
    const source = f.model.captureAssemblies();
    const register = f.model.registerPieceInstance.bind(f.model);
    let n = 0;
    const spy = vi.spyOn(f.model, "registerPieceInstance").mockImplementation(input => {
      if (++n === 3) throw new Error("injected copy failure");
      return register(input);
    });
    try {
      const preview = f.operations.prepareAssembly({ operation: "copy_assembly_array",
        id: f.root.id, space: "world", displacement: offset, count: 2 });
      expect(() => f.operations.confirmAssembly(preview.id)).toThrow(/injected copy failure/);
    } finally { spy.mockRestore(); }
    expect(f.model.captureAssemblies()).toEqual(source);
    expect(f.model.pieceInstances.count).toBe(3);
    expect(f.history.canUndo).toBe(false);
  });

  it("shared dispatcher exposes read-only hierarchy and approved selection", async () => {
    const f = fixture();
    const dispatch = createOperationDispatcher(f.operations, () => true);
    const list = await dispatch("list_assemblies", { limit: 10 });
    expect(list.ok).toBe(true);
    expect(list.data?.total).toBe(3);
    expect((await dispatch("select_assembly", { id: f.root.id })).ok).toBe(true);
    const context = await dispatch("get_selection_context", {});
    expect(context.data?.assemblyIds).toEqual([f.root.id]);
    expect(context.data?.loosePieceIds).toEqual([]);
    const preview = await dispatch("prepare_assembly_operation", { request: {
      operation: "move_assembly", id: f.root.id, space: "world", displacement: offset,
    } });
    expect(preview.ok).toBe(true);
    expect((await dispatch("confirm_assembly_operation", { proposalId: preview.data!.id })).ok).toBe(true);
  });
});
