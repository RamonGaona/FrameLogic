import { describe, expect, it } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadHistoryController } from "../interaction/CadHistoryController";
import type { DesignSceneController } from "../design/DesignSceneController";
import type { DesignSelectionController } from "../interaction/DesignSelectionController";

describe("hierarchical assembly CAD undo and redo", () => {
  it("undoes nesting, restores names and lock state, and redoes the exact hierarchy", () => {
    const model = new DesignModel();
    const asset = model.registerAsset({ name: "fixture.step", format: "STEP" });
    const definition = model.registerPieceDefinition({
      name: "Fixture", code: "F", geometryAssetId: asset.id,
    });
    const a = model.registerPieceInstance({ definitionId: definition.id });
    const b = model.registerPieceInstance({ definitionId: definition.id });
    const child = model.registerAssembly({
      name: "child", pieceInstanceIds: [a.id],
    });
    const history = new CadHistoryController(
      model, {} as DesignSceneController, {} as DesignSelectionController,
    );
    const before = model.captureAssemblies();

    const parent = model.createNestedAssembly({
      name: "Parent", pieceInstanceIds: [b.id],
      childAssemblyIds: [child.id],
    });
    model.setAssemblyLocked(parent.id, true);
    const after = model.captureAssemblies();
    history.recordOperation(
      "Create nested assembly",
      () => model.restoreAssemblies(before),
      () => model.restoreAssemblies(after),
    );

    expect(model.isPieceLocked(a.id)).toBe(true);
    expect(model.getAssemblyPieceIdsDeep(parent.id)).toEqual([b.id, a.id]);
    expect(history.undo()).toBe(true);
    expect(model.assemblies.get(parent.id)).toBeUndefined();
    expect(model.assemblies.get(child.id)?.parentAssemblyId).toBeUndefined();
    expect(model.isPieceLocked(a.id)).toBe(false);
    expect(model.pieceInstances.count).toBe(2);
    expect(history.redo()).toBe(true);
    expect(model.assemblies.get(parent.id)?.locked).toBe(true);
    expect(model.getAssemblyPieceIdsDeep(parent.id)).toEqual([b.id, a.id]);
    expect(model.pieceInstances.count).toBe(2);
  });
});
