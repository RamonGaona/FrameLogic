import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { getInstanceGroupIds } from "./getInstanceGroupIds";

vi.mock("@framelogic/geometry", () => ({
  createIdentityTransform3D: () => ({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
  }),
}));

describe("Model Space visibility group membership", () => {
  it("separates assembly members from loose pieces by stable IDs", () => {
    const model = new DesignModel();
    const asset = model.registerAsset({ name: "shared.step", format: "STEP" });
    const definition = model.registerPieceDefinition({
      code: "P", name: "P", geometryAssetId: asset.id,
    });
    const a = model.registerPieceInstance({ definitionId: definition.id });
    const b = model.registerPieceInstance({ definitionId: definition.id });
    const loose = model.registerPieceInstance({ definitionId: definition.id });
    const assembly = model.registerAssembly({
      name: "Group", pieceInstanceIds: [a.id, b.id],
    });

    expect(getInstanceGroupIds(model, "assemblies")).toEqual([a.id, b.id]);
    expect(getInstanceGroupIds(model, "loose")).toEqual([loose.id]);

    model.removeAssembly(assembly.id);
    expect(getInstanceGroupIds(model, "assemblies")).toEqual([]);
    expect(getInstanceGroupIds(model, "loose"))
      .toEqual([a.id, b.id, loose.id]);
  });

  it("does not double toggle duplicated legacy memberships or missing IDs", () => {
    const model = new DesignModel();
    const asset = model.registerAsset({ name: "piece.step", format: "STEP" });
    const definition = model.registerPieceDefinition({
      code: "P", name: "P", geometryAssetId: asset.id,
    });
    const a = model.registerPieceInstance({ definitionId: definition.id });
    const b = model.registerPieceInstance({ definitionId: definition.id });
    model.assemblies.register({
      name: "Legacy A", pieceInstanceIds: [a.id, "old-removed-id"],
    });
    model.assemblies.register({
      name: "Legacy B", pieceInstanceIds: [a.id],
    });

    expect(getInstanceGroupIds(model, "assemblies")).toEqual([a.id]);
    expect(getInstanceGroupIds(model, "loose")).toEqual([b.id]);
  });
});
