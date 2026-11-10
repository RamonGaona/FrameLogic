import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { InstanceTreeController } from "./InstanceTreeController";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const model = new DesignModel();
  const asset = model.registerAsset({ name: "beam.step", format: "STEP" });
  const definition = model.registerPieceDefinition({
    code: "BEAM", name: "Beam", geometryAssetId: asset.id,
  });
  const a = model.registerPieceInstance({ definitionId: definition.id });
  const b = model.registerPieceInstance({ definitionId: definition.id });
  const c = model.registerPieceInstance({ definitionId: definition.id });
  const child = model.registerAssembly({
    name: "Original", pieceInstanceIds: [a.id, b.id],
  });
  return { model, a, b, c, child };
}

function makeTree(
  model: DesignModel,
  selectedPieces: readonly string[],
  selectedAssemblyIds: Set<string>,
) {
  const recordOperation = vi.fn();
  const refresh = vi.fn();
  const hideContextMenu = vi.fn();
  const tree = Object.assign(Object.create(InstanceTreeController.prototype) as object, {
    options: {
      designModel: model,
      designSelection: { getSelectedIds: () => [...selectedPieces] },
      cadHistory: { recordOperation },
    },
    selectedAssemblyIds,
    refresh,
    hideContextMenu,
  }) as {
    createAssemblyFromSelection(): void;
  };
  return { tree, recordOperation, refresh };
}

describe("tree: create parent from an assembly and a loose piece", () => {
  it("keeps the original assembly complete and nests it without duplicating STEP", () => {
    const { model, a, b, c, child } = fixture();
    const alert = vi.fn();
    vi.stubGlobal("window", { prompt: () => "Ensamble principal", alert });
    const { tree, recordOperation } = makeTree(
      model, [a.id, b.id, c.id], new Set([child.id]),
    );

    tree.createAssemblyFromSelection();

    const parent = model.assemblies.getAll().find(
      (entry) => entry.name === "Ensamble principal",
    );
    expect(parent).toBeDefined();
    expect(parent?.pieceInstanceIds).toEqual([c.id]);
    expect(model.assemblies.get(child.id)?.pieceInstanceIds).toEqual([a.id, b.id]);
    expect(model.assemblies.get(child.id)?.parentAssemblyId).toBe(parent?.id);
    expect(model.pieceInstances.count).toBe(3);
    expect(recordOperation).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });

  it("warns instead of ripping a single selected member out of its assembly", () => {
    const { model, a, child } = fixture();
    const alert = vi.fn();
    const prompt = vi.fn();
    vi.stubGlobal("window", { prompt, alert });
    const { tree, recordOperation } = makeTree(
      model, [a.id], new Set(),
    );
    const before = model.captureAssemblies();

    tree.createAssemblyFromSelection();

    expect(model.captureAssemblies()).toEqual(before);
    expect(model.assemblies.get(child.id)?.pieceInstanceIds).toContain(a.id);
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("Selecciona la fila"));
    expect(prompt).not.toHaveBeenCalled();
    expect(recordOperation).not.toHaveBeenCalled();
  });
});
