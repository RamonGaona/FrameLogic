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