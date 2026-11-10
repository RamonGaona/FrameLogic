import { describe, expect, it } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { createAssemblyCopies, planAssemblyCopy } from "./AssemblyCopyStructure";

function fixture() {
  const model = new DesignModel();
  const asset = model.registerAsset({ name: "columna.step", format: "STEP" });
  const definition = model.registerPieceDefinition({
    code: "C1", name: "Columna", geometryAssetId: asset.id,
  });
  const a = model.registerPieceInstance({ definitionId: definition.id });
  const b = model.registerPieceInstance({ definitionId: definition.id });
  const c = model.registerPieceInstance({ definitionId: definition.id });
  const child = model.registerAssembly({ name: "Subensamble", pieceInstanceIds: [a.id, b.id] });
  const parent = model.createNestedAssembly({
    name: "Ensamble superior", childAssemblyIds: [child.id],
    pieceInstanceIds: [c.id],
  });
  return { model, asset, definition, a, b, c, child, parent };
}

describe("structural copy planning and assembly IDs", () => {
  it("duplicates the parent and nested child once, keeping original memberships intact", () => {
    const f = fixture();
    const plan = planAssemblyCopy(
      f.model, [f.a.id, f.b.id, f.c.id],
      [f.parent.id, f.child.id],
    );
    expect(plan.roots).toEqual([f.parent.id]);
    expect(plan.assemblies.map((a) => a.id)).toEqual([f.parent.id, f.child.id]);

    const mapped = new Map([
      [f.a.id, "copy-a"], [f.b.id, "copy-b"], [f.c.id, "copy-c"],
    ]);
    // Only the mapping matters for assembly registrations; prototypes are
    // already cloned by PieceMoveCopySession before the hierarchy is rebuilt.
    const realCopies = new Map<string, string>();
    for (const [source, fakeId] of mapped) {
      const sourcePiece = f.model.pieceInstances.get(source)!;
      const piece = f.model.registerPieceInstance({
        id: fakeId, definitionId: sourcePiece.definitionId,
        layerId: sourcePiece.layerId,
      });
      realCopies.set(source, piece.id);
    }
    const result = createAssemblyCopies(f.model, plan, realCopies);
    expect(result.records).toHaveLength(2);
    const clonedParent = f.model.assemblies.get(result.rootIds[0]!)!;
    const clonedChild = result.records.find((a) => a.id !== clonedParent.id)!;
    expect(clonedParent.pieceInstanceIds).toEqual(["copy-c"]);
    expect(clonedChild.pieceInstanceIds).toEqual(["copy-a", "copy-b"]);
    expect(clonedChild.parentAssemblyId).toBe(clonedParent.id);
    expect(f.model.getAssemblyPieceIdsDeep(clonedParent.id).sort())
      .toEqual(["copy-a", "copy-b", "copy-c"].sort());
    expect(f.model.assemblies.get(f.parent.id)?.pieceInstanceIds).toEqual([f.c.id]);
    expect(f.model.assemblies.get(f.child.id)?.pieceInstanceIds)
      .toEqual([f.a.id, f.b.id]);
    expect(f.model.pieceDefinitions.getAll().length).toBe(1);
    expect(f.model.assets.getAll().length).toBe(1);
  });

  it("refuses a partial child selection before making changes", () => {
    const f = fixture();
    const before = f.model.captureAssemblies();
    expect(() => planAssemblyCopy(
      f.model, [f.a.id, f.c.id], [f.parent.id],
    )).toThrow(/todas las piezas/i);
    expect(f.model.captureAssemblies()).toEqual(before);
    expect(f.model.pieceInstances.count).toBe(3);
  });

  it("prohibits copying a locked parent or any locked descendant", () => {
    const f = fixture();
    f.model.setAssemblyLocked(f.parent.id, true);
    expect(() => planAssemblyCopy(
      f.model, [f.a.id, f.b.id, f.c.id], [f.parent.id],
    )).toThrow(/bloqueado/i);
  });
});
