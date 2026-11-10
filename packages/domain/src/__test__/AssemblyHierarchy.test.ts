import { describe, expect, it } from "vitest";
import { DesignModel, validateAssemblyHierarchy } from "../index";

function fixture() {
  const model = new DesignModel();
  const asset = model.registerAsset({ name: "profile.step", format: "STEP" });
  const definition = model.registerPieceDefinition({
    name: "Profile", code: "P", geometryAssetId: asset.id,
  });
  const a = model.registerPieceInstance({ definitionId: definition.id });
  const b = model.registerPieceInstance({ definitionId: definition.id });
  const c = model.registerPieceInstance({ definitionId: definition.id });
  return { model, asset, definition, a, b, c };
}

describe("hierarchical assemblies (FRAMELOGIC_PROJECT v1 compatible)", () => {
  it("creates a parent containing a whole child assembly and a loose piece", () => {
    const { model, definition, a, b, c } = fixture();
    const child = model.registerAssembly({
      name: "Child", pieceInstanceIds: [a.id, b.id],
    });
    const parent = model.createNestedAssembly({
      name: "Parent",
      childAssemblyIds: [child.id],
      pieceInstanceIds: [c.id],
    });

    expect(model.assemblies.get(child.id)?.pieceInstanceIds).toEqual([a.id, b.id]);
    expect(model.assemblies.get(child.id)?.parentAssemblyId).toBe(parent.id);
    expect(model.assemblies.get(parent.id)?.pieceInstanceIds).toEqual([c.id]);
    expect(model.getAssemblyPieceIdsDeep(parent.id)).toEqual([c.id, a.id, b.id]);
    expect(model.getAssemblyChildren(parent.id).map(x => x.id)).toEqual([child.id]);
    expect(model.pieceInstances.count).toBe(3);
    expect(model.pieceDefinitions.get(definition.id)).toBeDefined();
  });

  it("supports three levels without flattening or duplicating pieces", () => {
    const { model, a, b, c } = fixture();
    const level3 = model.registerAssembly({ name: "3", pieceInstanceIds: [a.id] });
    const level2 = model.createNestedAssembly({
      name: "2", pieceInstanceIds: [b.id], childAssemblyIds: [level3.id],
    });
    const level1 = model.createNestedAssembly({
      name: "1", pieceInstanceIds: [c.id], childAssemblyIds: [level2.id],
    });
    expect(model.getAssemblyDescendantIds(level1.id)).toEqual([level2.id, level3.id]);
    expect(model.getAssemblyPieceIdsDeep(level1.id)).toEqual([c.id, b.id, a.id]);
    expect(model.assemblies.get(level3.id)?.pieceInstanceIds).toEqual([a.id]);
  });

  it("rejects circular and self-parent relationships without changing the tree", () => {
    const { model, a, b } = fixture();
    const child = model.registerAssembly({ name: "child", pieceInstanceIds: [a.id] });
    const parent = model.createNestedAssembly({
      name: "parent", childAssemblyIds: [child.id], pieceInstanceIds: [b.id],
    });
    const before = JSON.stringify(model.captureAssemblies());
    expect(() => model.setAssemblyParent(parent.id, child.id)).toThrow(/circular/i);
    expect(() => model.setAssemblyParent(child.id, child.id)).toThrow(/sí mismo/i);
    expect(JSON.stringify(model.captureAssemblies())).toBe(before);
  });

  it("refuses a duplicate ancestor/descendant in the same new grouping", () => {
    const { model, a } = fixture();
    const leaf = model.registerAssembly({ name: "leaf", pieceInstanceIds: [a.id] });
    const root = model.createNestedAssembly({ name: "root", childAssemblyIds: [leaf.id] });
    const before = JSON.stringify(model.captureAssemblies());
    expect(() => model.createNestedAssembly({
      name: "invalid", childAssemblyIds: [root.id, leaf.id],
    })).toThrow(/descendientes/i);
    expect(JSON.stringify(model.captureAssemblies())).toBe(before);
  });

  it("inherits locks and refuses edits of children in locked parents", () => {
    const { model, a, b, c } = fixture();
    const inner = model.registerAssembly({ name: "inner", pieceInstanceIds: [a.id] });
    const outer = model.createNestedAssembly({
      name: "outer", pieceInstanceIds: [b.id], childAssemblyIds: [inner.id],
    });
    model.setAssemblyLocked(outer.id, true);
    expect(model.isAssemblyLocked(inner.id)).toBe(true);
    expect(model.isPieceLocked(a.id)).toBe(true);
    expect(model.isPieceLocked(b.id)).toBe(true);
    expect(model.isPieceLocked(c.id)).toBe(false);
    expect(() => model.setAssemblyParent(inner.id, null)).toThrow(/bloqueado/i);
    expect(() => model.removeAssembly(inner.id)).toThrow(/bloqueado/i);
    model.setAssemblyLocked(outer.id, false);
    expect(model.isPieceLocked(a.id)).toBe(false);
  });

  it("ungroups a parent without deleting or orphaning nested subassemblies", () => {
    const { model, a, b, c } = fixture();
    const inner = model.registerAssembly({ name: "inner", pieceInstanceIds: [a.id] });
    const middle = model.createNestedAssembly({
      name: "middle", pieceInstanceIds: [b.id], childAssemblyIds: [inner.id],
    });
    const root = model.createNestedAssembly({
      name: "root", pieceInstanceIds: [c.id], childAssemblyIds: [middle.id],
    });
    expect(model.removeAssembly(middle.id)).toBe(true);
    expect(model.assemblies.get(inner.id)?.parentAssemblyId).toBe(root.id);
    expect(model.assemblies.get(root.id)?.pieceInstanceIds).toEqual([c.id, b.id]);
    expect(model.getAssemblyPieceIdsDeep(root.id)).toEqual([c.id, b.id, a.id]);
    expect(model.pieceInstances.count).toBe(3);
  });

  it("round-trips parent, child and locks in JSON snapshots for undo/redo", () => {
    const { model, a, b } = fixture();
    const child = model.registerAssembly({ name: "child", pieceInstanceIds: [a.id] });
    const saved = model.createNestedAssembly({
      name: "parent", childAssemblyIds: [child.id], pieceInstanceIds: [b.id],
    });
    const snapshot = JSON.parse(JSON.stringify(model.captureAssemblies()));
    validateAssemblyHierarchy(snapshot);
    model.setAssemblyLocked(saved.id, true);
    model.restoreAssemblies(snapshot);
    expect(model.assemblies.get(saved.id)?.locked).toBeUndefined();
    expect(model.getAssemblyChildren(saved.id).map(x=>x.id)).toEqual([child.id]);
    expect(model.pieceInstances.count).toBe(3);
  });

  it("rejects corrupt saved cycles and missing parents before history restore", () => {
    const { model, a } = fixture();
    const base = model.registerAssembly({ name: "base", pieceInstanceIds: [a.id] });
    const original = model.captureAssemblies();
    expect(() => validateAssemblyHierarchy([
      { ...base, parentAssemblyId: "gone" },
    ])).toThrow(/missing parent/i);
    expect(() => model.restoreAssemblies([
      { ...base, id: "a", parentAssemblyId: "b" },
      { ...base, id: "b", parentAssemblyId: "a" },
    ])).toThrow(/circular/i);
    expect(model.captureAssemblies()).toEqual(original);
  });
});
