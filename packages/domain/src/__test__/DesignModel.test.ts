import {
    describe,
    expect,
    it,
  } from "vitest";
  
  import {
    DesignModel,
  } from "../index";
  
  
  describe(
    "DesignModel",
    () => {
  
      it(
        "creates multiple instances using the same piece definition",
        () => {
  
          const design =
            new DesignModel();
  
  
          const asset =
            design.registerAsset({
  
              name:
                "MEGASHOR_1800.ifc",
  
              format:
                "IFC",
  
            });
  
  
          const definition =
            design.registerPieceDefinition({
  
              code:
                "MEGASHOR_1800",
  
              name:
                "Megashor 1800",
  
              geometryAssetId:
                asset.id,
  
              classification:
                "Perfil",
  
              tags: [
                "Megashor",
              ],
  
            });
  
  
          const instance1 =
            design.registerPieceInstance({
  
              definitionId:
                definition.id,
  
            });
  
  
          const instance2 =
            design.registerPieceInstance({
  
              definitionId:
                definition.id,
  
              transform: {
  
                position: {
                  x: 1.8,
                  y: 0,
                  z: 0,
                },
  
                rotation: {
                  x: 0,
                  y: 0,
                  z: 0,
                },
  
              },
  
            });
  
  
          const instance3 =
            design.registerPieceInstance({
  
              definitionId:
                definition.id,
  
              transform: {
  
                position: {
                  x: 3.6,
                  y: 0,
                  z: 0,
                },
  
                rotation: {
                  x: 0,
                  y: 0,
                  z: 0,
                },
  
              },
  
            });
  
  
          expect(
            design.pieceInstances.count,
          ).toBe(
            3,
          );
  
  
          expect(
            instance1.definitionId,
          ).toBe(
            definition.id,
          );
  
  
          expect(
            instance2.definitionId,
          ).toBe(
            definition.id,
          );
  
  
          expect(
            instance3.definitionId,
          ).toBe(
            definition.id,
          );
  
  
          expect(
            instance1.id,
          ).not.toBe(
            instance2.id,
          );
  
        },
      );
  
  
      it(
        "rejects a piece instance when its definition does not exist",
        () => {
  
          const design =
            new DesignModel();
  
  
          expect(
            () => {
  
              design.registerPieceInstance({
  
                definitionId:
                  "missing-definition",
  
              });
  
            },
          ).toThrow(
            /does not exist/i,
          );
  
        },
      );
  
  
      it(
        "rejects a piece definition when its asset does not exist",
        () => {
  
          const design =
            new DesignModel();
  
  
          expect(
            () => {
  
              design.registerPieceDefinition({
  
                code:
                  "TEST",
  
                name:
                  "Test piece",
  
                geometryAssetId:
                  "missing-asset",
  
              });
  
            },
          ).toThrow(
            /does not exist/i,
          );
  
        },
      );
  
  
      it(
        "creates an assembly using existing piece instances",
        () => {
  
          const design =
            new DesignModel();
  
  
          const asset =
            design.registerAsset({
  
              name:
                "piece.ifc",
  
              format:
                "IFC",
  
            });
  
  
          const definition =
            design.registerPieceDefinition({
  
              code:
                "PIECE",
  
              name:
                "Piece",
  
              geometryAssetId:
                asset.id,
  
            });
  
  
          const instance1 =
            design.registerPieceInstance({
  
              definitionId:
                definition.id,
  
            });
  
  
          const instance2 =
            design.registerPieceInstance({
  
              definitionId:
                definition.id,
  
            });
  
  
          const assembly =
            design.registerAssembly({
  
              name:
                "Assembly 01",
  
              classification:
                "Torre",
  
              tags: [
                "Zona Norte",
              ],
  
              pieceInstanceIds: [
                instance1.id,
                instance2.id,
              ],
  
            });
  
  
          expect(
            assembly.pieceInstanceIds,
          ).toEqual([
            instance1.id,
            instance2.id,
          ]);
  
  
          expect(
            assembly.classification,
          ).toBe(
            "Torre",
          );
  
        },
      );
  
  
      it(
        "rejects an assembly containing a missing instance",
        () => {
  
          const design =
            new DesignModel();
  
  
          expect(
            () => {
  
              design.registerAssembly({
  
                name:
                  "Invalid assembly",
  
                pieceInstanceIds: [
                  "missing-instance",
                ],
  
              });
  
            },
          ).toThrow(
            /does not exist/i,
          );
  
        },
      );
  
  
      it(
        "prevents deleting a definition that is still in use",
        () => {
  
          const design =
            new DesignModel();
  
  
          const asset =
            design.registerAsset({
  
              name:
                "piece.ifc",
  
              format:
                "IFC",
  
            });
  
  
          const definition =
            design.registerPieceDefinition({
  
              code:
                "PIECE",
  
              name:
                "Piece",
  
              geometryAssetId:
                asset.id,
  
            });
  
  
          design.registerPieceInstance({
  
            definitionId:
              definition.id,
  
          });
  
  
          expect(
            () => {
  
              design.removePieceDefinition(
                definition.id,
              );
  
            },
          ).toThrow(
            /instance/i,
          );
  
        },
      );
  
  
      it(
        "prevents deleting an instance used by an assembly",
        () => {
  
          const design =
            new DesignModel();
  
  
          const asset =
            design.registerAsset({
  
              name:
                "piece.ifc",
  
              format:
                "IFC",
  
            });
  
  
          const definition =
            design.registerPieceDefinition({
  
              code:
                "PIECE",
  
              name:
                "Piece",
  
              geometryAssetId:
                asset.id,
  
            });
  
  
          const instance =
            design.registerPieceInstance({
  
              definitionId:
                definition.id,
  
            });
  
  
          design.registerAssembly({
  
            name:
              "Assembly",
  
            pieceInstanceIds: [
              instance.id,
            ],
  
          });
  
  
          expect(
            () => {
  
              design.removePieceInstance(
                instance.id,
              );
  
            },
          ).toThrow(
            /assembly/i,
          );
  
        },
      );
  
    },
  );

function createAssemblyFixture() {
  const design = new DesignModel();
  const asset = design.registerAsset({
    name: "shared-geometry.ifc",
    format: "IFC",
  });
  const definition = design.registerPieceDefinition({
    code: "TEST_MEMBER",
    name: "Member",
    geometryAssetId: asset.id,
  });
  const [first, second, third] = [
    design.registerPieceInstance({ definitionId: definition.id }),
    design.registerPieceInstance({ definitionId: definition.id }),
    design.registerPieceInstance({ definitionId: definition.id }),
  ];
  return { design, asset, definition, first, second, third };
}

describe("assembly membership stability", () => {
  it("regroups pieces without removing instances or duplicating geometry", () => {
    const { design, asset, definition, first, second, third } =
      createAssemblyFixture();
    const original = design.registerAssembly({
      name: "Original",
      pieceInstanceIds: [first.id, second.id],
    });

    const regrouped = design.groupPieceInstances({
      name: "Regrouped",
      pieceInstanceIds: [second.id, third.id],
    });

    expect(design.assemblies.get(original.id)?.pieceInstanceIds)
      .toEqual([first.id]);
    expect(design.assemblies.get(regrouped.id)?.pieceInstanceIds)
      .toEqual([second.id, third.id]);
    expect(design.pieceInstances.count).toBe(3);
    expect(design.pieceDefinitions.get(definition.id)?.geometryAssetId)
      .toBe(asset.id);
    expect(design.assets.get(asset.id)).toBeDefined();
  });

  it("does not detach existing groups when assembly creation fails", () => {
    const { design, first, second } = createAssemblyFixture();
    const original = design.registerAssembly({
      id: "original-id",
      name: "Original",
      pieceInstanceIds: [first.id],
    });

    expect(() =>
      design.groupPieceInstances({
        id: original.id,
        name: "Duplicate identifier",
        pieceInstanceIds: [first.id, second.id],
      }),
    ).toThrow(/already exists/i);
    expect(design.assemblies.get(original.id)?.pieceInstanceIds)
      .toEqual([first.id]);
    expect(design.assemblies.count).toBe(1);
  });

  it("rejects repeated, unknown and already owned member IDs", () => {
    const { design, first, second } = createAssemblyFixture();
    expect(() =>
      design.registerAssembly({
        name: "Duplicates",
        pieceInstanceIds: [first.id, first.id],
      }),
    ).toThrow(/twice/i);
    expect(() =>
      design.groupPieceInstances({
        name: "Missing piece",
        pieceInstanceIds: [first.id, "missing-instance"],
      }),
    ).toThrow(/does not exist/i);

    design.registerAssembly({
      name: "Owner",
      pieceInstanceIds: [first.id],
    });
    expect(() =>
      design.registerAssembly({
        name: "Second owner",
        pieceInstanceIds: [first.id, second.id],
      }),
    ).toThrow(/already belongs/i);
    expect(design.assemblies.count).toBe(1);
  });

  it("moves instances between groups without adding duplicates", () => {
    const { design, first, second, third } = createAssemblyFixture();
    const source = design.registerAssembly({
      name: "Source",
      pieceInstanceIds: [first.id, second.id],
    });
    const target = design.registerAssembly({
      name: "Target",
      pieceInstanceIds: [third.id],
    });

    design.movePieceInstancesToAssembly(
      target.id,
      [first.id, second.id, first.id],
    );

    expect(design.assemblies.get(source.id)?.pieceInstanceIds).toEqual([]);
    expect(design.assemblies.get(target.id)?.pieceInstanceIds)
      .toEqual([third.id, first.id, second.id]);
    expect(design.pieceInstances.count).toBe(3);
  });

  it("rejects invalid direct updates without damaging existing groups", () => {
    const { design, first, second, third } = createAssemblyFixture();
    const source = design.registerAssembly({
      name: "Source",
      pieceInstanceIds: [first.id],
    });
    const target = design.registerAssembly({
      name: "Target",
      pieceInstanceIds: [second.id, third.id],
    });

    expect(() =>
      design.updateAssemblyPieceInstances(
        target.id, [second.id, first.id],
      ),
    ).toThrow(/already belongs/i);
    expect(design.assemblies.get(source.id)?.pieceInstanceIds)
      .toEqual([first.id]);
    expect(design.assemblies.get(target.id)?.pieceInstanceIds)
      .toEqual([second.id, third.id]);
  });

  it("ungroups without deleting pieces and keeps the assembly snapshot shape", () => {
    const { design, first, second } = createAssemblyFixture();
    const assembly = design.groupPieceInstances({
      name: "Temporary",
      pieceInstanceIds: [first.id, second.id],
    });
    const saved = JSON.parse(JSON.stringify(design.assemblies.getAll()));
    expect(saved[0].pieceInstanceIds).toEqual([first.id, second.id]);
    expect(saved[0].name).toBe("Temporary");

    expect(design.removeAssembly(assembly.id)).toBe(true);
    expect(design.assemblies.count).toBe(0);
    expect(design.pieceInstances.get(first.id)).toBeDefined();
    expect(design.pieceInstances.get(second.id)).toBeDefined();
  });
});
