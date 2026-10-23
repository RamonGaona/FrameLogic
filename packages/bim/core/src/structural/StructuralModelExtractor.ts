import * as THREE from "three";

import type {
  DesignModel,
  FrameLogicEngineeringModel,
  LocalCoordinateSystem,
  PieceVector3Data,
  PlacedStructuralAxis,
  StructuralModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";


export interface StructuralModelExtractionOptions {
  readonly includeUnconfirmedAxes?: boolean;
  readonly nodeMergeTolerance?: number;
}


export class StructuralModelExtractor {
  private readonly designModel:
    DesignModel;

  private readonly designScene:
    DesignSceneController;

  private readonly engineeringModel:
    FrameLogicEngineeringModel;


  constructor(
    designModel: DesignModel,
    designScene: DesignSceneController,
    engineeringModel: FrameLogicEngineeringModel,
  ) {
    this.designModel =
      designModel;
    this.designScene =
      designScene;
    this.engineeringModel =
      engineeringModel;
  }


  extractPlacedAxes(
    options?: StructuralModelExtractionOptions,
  ): PlacedStructuralAxis[] {
    const result:
      PlacedStructuralAxis[] = [];

    for (
      const instance
      of this.designModel.pieceInstances.getAll()
    ) {
      const definition =
        this.designModel.pieceDefinitions.get(
          instance.definitionId,
        );
      const engineering =
        this.engineeringModel.pieces.get(
          instance.definitionId,
        );
      const axis =
        engineering?.structuralAxis;

      if (
        !definition
        || !axis
      ) {
        continue;
      }

      if (
        !axis.confirmed
        && !options?.includeUnconfirmedAxes
      ) {
        continue;
      }

      const object =
        this.designScene.getInstanceObject(
          instance.id,
        );

      if (!object) {
        continue;
      }

      object.updateMatrixWorld(true);

      const startAsset =
        localToAssetPoint(
          axis.start,
          definition.coordinateSystem,
        );
      const endAsset =
        localToAssetPoint(
          axis.end,
          definition.coordinateSystem,
        );

      const start =
        new THREE.Vector3(
          startAsset.x,
          startAsset.y,
          startAsset.z,
        ).applyMatrix4(
          object.matrixWorld,
        );
      const end =
        new THREE.Vector3(
          endAsset.x,
          endAsset.y,
          endAsset.z,
        ).applyMatrix4(
          object.matrixWorld,
        );

      const localYDirectionAsset =
        axis.localYDirection
          ? localToAssetDirection(
              axis.localYDirection,
              definition.coordinateSystem,
            )
          : undefined;

      const localYDirection =
        localYDirectionAsset
          ? new THREE.Vector3(
              localYDirectionAsset.x,
              localYDirectionAsset.y,
              localYDirectionAsset.z,
            ).transformDirection(
              object.matrixWorld,
            )
          : undefined;

      result.push({
        id:
          `${instance.id}:${axis.id}`,
        pieceInstanceId:
          instance.id,
        pieceDefinitionId:
          instance.definitionId,
        start: {
          x:
            start.x,
          y:
            start.y,
          z:
            start.z,
        },
        end: {
          x:
            end.x,
          y:
            end.y,
          z:
            end.z,
        },
        localYDirection:
          localYDirection
            ? {
                x:
                  localYDirection.x,
                y:
                  localYDirection.y,
                z:
                  localYDirection.z,
              }
            : undefined,
        material:
          engineering?.material,
        section:
          axis.section,
      });
    }

    return result;
  }


  build(
    options?: StructuralModelExtractionOptions,
  ): StructuralModel {
    return this.engineeringModel.buildStructuralModel(
      this.extractPlacedAxes(
        options,
      ),
      options?.nodeMergeTolerance,
    );
  }
}


function localToAssetPoint(
  local: PieceVector3Data,
  coordinateSystem: LocalCoordinateSystem,
): PieceVector3Data {
  return {
    x:
      coordinateSystem.origin.x
      + local.x * coordinateSystem.xAxis.x
      + local.y * coordinateSystem.yAxis.x
      + local.z * coordinateSystem.zAxis.x,
    y:
      coordinateSystem.origin.y
      + local.x * coordinateSystem.xAxis.y
      + local.y * coordinateSystem.yAxis.y
      + local.z * coordinateSystem.zAxis.y,
    z:
      coordinateSystem.origin.z
      + local.x * coordinateSystem.xAxis.z
      + local.y * coordinateSystem.yAxis.z
      + local.z * coordinateSystem.zAxis.z,
  };
}


function localToAssetDirection(
  local: PieceVector3Data,
  coordinateSystem: LocalCoordinateSystem,
): PieceVector3Data {
  const direction = {
    x:
      local.x * coordinateSystem.xAxis.x
      + local.y * coordinateSystem.yAxis.x
      + local.z * coordinateSystem.zAxis.x,
    y:
      local.x * coordinateSystem.xAxis.y
      + local.y * coordinateSystem.yAxis.y
      + local.z * coordinateSystem.zAxis.y,
    z:
      local.x * coordinateSystem.xAxis.z
      + local.y * coordinateSystem.yAxis.z
      + local.z * coordinateSystem.zAxis.z,
  };

  const length =
    Math.hypot(
      direction.x,
      direction.y,
      direction.z,
    );

  if (
    length <= 1e-12
  ) {
    throw new Error(
      "Structural local Y direction must be non-zero.",
    );
  }

  return {
    x:
      direction.x / length,
    y:
      direction.y / length,
    z:
      direction.z / length,
  };
}
