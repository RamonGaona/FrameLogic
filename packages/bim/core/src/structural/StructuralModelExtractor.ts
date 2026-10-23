import * as THREE from "three";

import type {
  DesignModel,
  FrameLogicEngineeringModel,
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
      const engineering =
        this.engineeringModel.pieces.get(
          instance.definitionId,
        );
      const axis =
        engineering?.structuralAxis;

      if (!axis) {
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

      const start =
        new THREE.Vector3(
          axis.start.x,
          axis.start.y,
          axis.start.z,
        ).applyMatrix4(
          object.matrixWorld,
        );
      const end =
        new THREE.Vector3(
          axis.end.x,
          axis.end.y,
          axis.end.z,
        ).applyMatrix4(
          object.matrixWorld,
        );

      const localYDirection =
        axis.localYDirection
          ? new THREE.Vector3(
              axis.localYDirection.x,
              axis.localYDirection.y,
              axis.localYDirection.z,
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
