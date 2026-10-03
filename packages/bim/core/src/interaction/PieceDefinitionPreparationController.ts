import * as THREE from "three";

import type {
  DesignModel,
  PersistentSnapType,
  PieceDefinition,
  PieceVector3Data,
  ReferenceAxisType,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";


export interface PieceDefinitionPreparationState {

  readonly active:
    boolean;

  readonly instanceId:
    string
    | null;

  readonly definitionId:
    string
    | null;

  readonly code:
    string
    | null;

  readonly name:
    string
    | null;

  readonly snapCount:
    number;

  readonly axisCount:
    number;

}


export type PieceDefinitionPreparationListener =
  (
    state:
      PieceDefinitionPreparationState,
  ) => void;


export class PieceDefinitionPreparationController {

  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  private readonly pointSelection:
    CadPointSelectionController;


  private readonly lineSelection:
    CadLineSelectionController;


  private readonly listeners =
    new Set<
      PieceDefinitionPreparationListener
    >();


  private activeInstanceId:
    string
    | null =
      null;


  constructor(
    designModel:
      DesignModel,

    designScene:
      DesignSceneController,

    pointSelection:
      CadPointSelectionController,

    lineSelection:
      CadLineSelectionController,
  ) {

    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.pointSelection =
      pointSelection;


    this.lineSelection =
      lineSelection;

  }


  get isActive():
    boolean {

    return this.activeInstanceId
      !== null;

  }


  getState():
    PieceDefinitionPreparationState {

    const context =
      this.getContext();


    if (
      !context
    ) {

      return {
        active:
          false,
        instanceId:
          null,
        definitionId:
          null,
        code:
          null,
        name:
          null,
        snapCount:
          0,
        axisCount:
          0,
      };

    }


    return {
      active:
        true,
      instanceId:
        context.instanceId,
      definitionId:
        context.definition.id,
      code:
        context.definition.code,
      name:
        context.definition.name,
      snapCount:
        context.definition
          .snapPoints
          .length,
      axisCount:
        context.definition
          .referenceGeometry
          .axisLines
          .length,
    };

  }


  start(
    instanceId:
      string,
  ):
    PieceDefinitionPreparationState {

    const instance =
      this.designModel
        .pieceInstances
        .get(
          instanceId,
        );


    if (
      !instance
    ) {

      throw new Error(
        `Cannot prepare piece. PieceInstance "${instanceId}" does not exist.`,
      );

    }


    const definition =
      this.designModel
        .pieceDefinitions
        .get(
          instance.definitionId,
        );


    if (
      !definition
    ) {

      throw new Error(
        `Cannot prepare piece. PieceDefinition "${instance.definitionId}" does not exist.`,
      );

    }


    const object =
      this.designScene
        .getInstanceObject(
          instanceId,
        );


    if (
      !object
    ) {

      throw new Error(
        "Cannot prepare piece because its visual instance is not available.",
      );

    }


    this.activeInstanceId =
      instanceId;


    this.notify();


    return this.getState();

  }


  stop():
    void {

    if (
      this.activeInstanceId
      === null
    ) {

      return;

    }


    this.activeInstanceId =
      null;


    this.notify();

  }


  setOriginFromSelectedCadPoint():
    PieceDefinition {

    const pointIds =
      this.pointSelection
        .getSelectedIds();


    if (
      pointIds.length
      !== 1
    ) {

      throw new Error(
        "Select exactly one CadPoint to define the piece origin.",
      );

    }


    const cadPoint =
      this.designModel
        .cadPoints
        .get(
          pointIds[0]!,
        );


    if (
      !cadPoint
    ) {

      throw new Error(
        "The selected CadPoint no longer exists.",
      );

    }


    return this.setOriginFromWorldPoint(
      new THREE.Vector3(
        cadPoint.position.x,
        cadPoint.position.y,
        cadPoint.position.z,
      ),
    );

  }


  setOriginFromWorldPoint(
    worldPoint:
      THREE.Vector3,
  ):
    PieceDefinition {

    const context =
      this.requireContext();


    const assetPoint =
      this.worldToAsset(
        worldPoint,
        context.object,
      );


    const current =
      context.definition
        .coordinateSystem;


    const updated =
      this.designModel
        .pieceDefinitions
        .updateCoordinateSystem(
          context.definition.id,
          {
            origin:
              this.toData(
                assetPoint,
              ),
            xAxis:
              current.xAxis,
            yAxis:
              current.yAxis,
            zAxis:
              current.zAxis,
          },
          true,
        );


    if (
      !updated
    ) {

      throw new Error(
        "Could not update the piece coordinate system.",
      );

    }


    this.designModel
      .pieceDefinitions
      .removeSnapPointsByType(
        context.definition.id,
        "ORIGIN",
      );


    this.designModel
      .pieceDefinitions
      .addSnapPoint(
        context.definition.id,
        {
          name:
            "Origin",
          type:
            "ORIGIN",
          position: {
            x: 0,
            y: 0,
            z: 0,
          },
        },
      );


    const result =
      this.requireDefinition(
        context.definition.id,
      );


    this.notify();


    return result;

  }


  addSelectedCadPointsAsSnaps(
    type:
      PersistentSnapType =
        "CUSTOM",
  ):
    number {

    const context =
      this.requireContext();


    const pointIds =
      this.pointSelection
        .getSelectedIds();


    if (
      pointIds.length < 1
    ) {

      throw new Error(
        "Select one or more CadPoint objects to convert to persistent snaps.",
      );

    }


    let added =
      0;


    for (
      const pointId
      of pointIds
    ) {

      const cadPoint =
        this.designModel
          .cadPoints
          .get(
            pointId,
          );


      if (
        !cadPoint
      ) {

        continue;

      }


      const localPoint =
        this.worldToDefinitionLocal(
          new THREE.Vector3(
            cadPoint.position.x,
            cadPoint.position.y,
            cadPoint.position.z,
          ),
          context.object,
          context.definition,
        );


      if (
        this.hasSnapNear(
          context.definition.id,
          localPoint,
        )
      ) {

        continue;

      }


      const index =
        this.requireDefinition(
          context.definition.id,
        )
          .snapPoints
          .length
        + 1;


      this.designModel
        .pieceDefinitions
        .addSnapPoint(
          context.definition.id,
          {
            name:
              `Snap ${index}`,
            type,
            position:
              this.toData(
                localPoint,
              ),
          },
        );


      added +=
        1;

    }


    this.notify();


    return added;

  }


  addSelectedCadLinesAsAxes(
    type:
      ReferenceAxisType =
        "REFERENCE",
  ):
    number {

    const context =
      this.requireContext();


    const lineIds =
      this.lineSelection
        .getSelectedIds();


    if (
      lineIds.length < 1
    ) {

      throw new Error(
        "Select one or more CadLine objects to convert to reference axes.",
      );

    }


    let added =
      0;


    for (
      const lineId
      of lineIds
    ) {

      const cadLine =
        this.designModel
          .cadLines
          .get(
            lineId,
          );


      if (
        !cadLine
      ) {

        continue;

      }


      const start =
        this.worldToDefinitionLocal(
          new THREE.Vector3(
            cadLine.start.x,
            cadLine.start.y,
            cadLine.start.z,
          ),
          context.object,
          context.definition,
        );


      const end =
        this.worldToDefinitionLocal(
          new THREE.Vector3(
            cadLine.end.x,
            cadLine.end.y,
            cadLine.end.z,
          ),
          context.object,
          context.definition,
        );


      const direction =
        end
          .clone()
          .sub(
            start,
          );


      const length =
        direction.length();


      if (
        length <= 1e-12
      ) {

        continue;

      }


      direction.multiplyScalar(
        1 / length,
      );


      const index =
        this.requireDefinition(
          context.definition.id,
        )
          .referenceGeometry
          .axisLines
          .length
        + 1;


      this.designModel
        .pieceDefinitions
        .addReferenceAxisLine(
          context.definition.id,
          {
            name:
              `Axis ${index}`,
            type,
            origin:
              this.toData(
                start,
              ),
            direction:
              this.toData(
                direction,
              ),
            length,
          },
        );


      added +=
        1;

    }


    this.notify();


    return added;

  }


  subscribe(
    listener:
      PieceDefinitionPreparationListener,
  ):
    () => void {

    this.listeners.add(
      listener,
    );


    listener(
      this.getState(),
    );


    return () => {

      this.listeners.delete(
        listener,
      );

    };

  }


  private getContext():
    {
      instanceId: string;
      definition: PieceDefinition;
      object: THREE.Object3D;
    }
    | null {

    const instanceId =
      this.activeInstanceId;


    if (
      !instanceId
    ) {

      return null;

    }


    const instance =
      this.designModel
        .pieceInstances
        .get(
          instanceId,
        );


    if (
      !instance
    ) {

      return null;

    }


    const definition =
      this.designModel
        .pieceDefinitions
        .get(
          instance.definitionId,
        );


    const object =
      this.designScene
        .getInstanceObject(
          instanceId,
        );


    if (
      !definition
      || !object
    ) {

      return null;

    }


    return {
      instanceId,
      definition,
      object,
    };

  }


  private requireContext():
    {
      instanceId: string;
      definition: PieceDefinition;
      object: THREE.Object3D;
    } {

    const context =
      this.getContext();


    if (
      !context
    ) {

      throw new Error(
        "No PieceDefinition is currently in preparation mode.",
      );

    }


    return context;

  }


  private requireDefinition(
    definitionId:
      string,
  ):
    PieceDefinition {

    const definition =
      this.designModel
        .pieceDefinitions
        .get(
          definitionId,
        );


    if (
      !definition
    ) {

      throw new Error(
        `PieceDefinition "${definitionId}" no longer exists.`,
      );

    }


    return definition;

  }


  private worldToAsset(
    worldPoint:
      THREE.Vector3,

    instanceObject:
      THREE.Object3D,
  ):
    THREE.Vector3 {

    instanceObject
      .updateMatrixWorld(
        true,
      );


    const inverse =
      instanceObject.matrixWorld
        .clone()
        .invert();


    return worldPoint
      .clone()
      .applyMatrix4(
        inverse,
      );

  }


  private worldToDefinitionLocal(
    worldPoint:
      THREE.Vector3,

    instanceObject:
      THREE.Object3D,

    definition:
      PieceDefinition,
  ):
    THREE.Vector3 {

    const assetPoint =
      this.worldToAsset(
        worldPoint,
        instanceObject,
      );


    const origin =
      new THREE.Vector3(
        definition.coordinateSystem
          .origin.x,
        definition.coordinateSystem
          .origin.y,
        definition.coordinateSystem
          .origin.z,
      );


    const delta =
      assetPoint
        .sub(
          origin,
        );


    return new THREE.Vector3(
      delta.dot(
        this.fromData(
          definition.coordinateSystem
            .xAxis,
        ),
      ),
      delta.dot(
        this.fromData(
          definition.coordinateSystem
            .yAxis,
        ),
      ),
      delta.dot(
        this.fromData(
          definition.coordinateSystem
            .zAxis,
        ),
      ),
    );

  }


  private hasSnapNear(
    definitionId:
      string,

    point:
      THREE.Vector3,
  ):
    boolean {

    const definition =
      this.requireDefinition(
        definitionId,
      );


    return definition.snapPoints.some(
      (
        snap,
      ) =>
        point.distanceToSquared(
          this.fromData(
            snap.position,
          ),
        )
        <= 1e-12,
    );

  }


  private fromData(
    vector:
      PieceVector3Data,
  ):
    THREE.Vector3 {

    return new THREE.Vector3(
      vector.x,
      vector.y,
      vector.z,
    );

  }


  private toData(
    vector:
      THREE.Vector3,
  ):
    PieceVector3Data {

    return {
      x:
        vector.x,
      y:
        vector.y,
      z:
        vector.z,
    };

  }


  private notify():
    void {

    const state =
      this.getState();


    for (
      const listener
      of this.listeners
    ) {

      listener(
        state,
      );

    }

  }


  dispose():
    void {

    this.activeInstanceId =
      null;


    this.listeners.clear();

  }

}
