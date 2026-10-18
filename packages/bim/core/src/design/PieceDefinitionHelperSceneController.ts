import * as THREE from "three";

import {
  DEFAULT_DESIGN_LAYER_IDS,
} from "@framelogic/domain";

import type {
  DesignModel,
  PieceDefinition,
  PieceVector3Data,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "./DesignSceneController";


export class PieceDefinitionHelperSceneController {

  private readonly scene:
    THREE.Scene;


  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  /*
   * null = modo proyecto normal: mostrar referencias de todas
   * las PieceInstance visibles.
   *
   * string = modo preparación: mostrar únicamente la instancia
   * que está siendo editada.
   */
  private activeInstanceId:
    string
    | null =
      null;


  private readonly snapGroup =
    new THREE.Group();


  private readonly axisGroup =
    new THREE.Group();


  constructor(
    scene:
      THREE.Scene,

    designModel:
      DesignModel,

    designScene:
      DesignSceneController,
  ) {

    this.scene =
      scene;


    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.snapGroup.name =
      "FrameLogicPieceDefinitionSnapHelpers";


    this.axisGroup.name =
      "FrameLogicPieceDefinitionAxisHelpers";


    this.scene.add(
      this.snapGroup,
    );


    this.scene.add(
      this.axisGroup,
    );

  }


  setActiveInstanceId(
    instanceId:
      string
      | null,
  ):
    void {

    this.activeInstanceId =
      instanceId;


    this.sync();

  }


  sync():
    void {

    this.clearGroup(
      this.snapGroup,
    );


    this.clearGroup(
      this.axisGroup,
    );


    const snapLayer =
      this.designModel
        .layers
        .get(
          DEFAULT_DESIGN_LAYER_IDS
            .SNAP_MANUAL,
        );


    const axisLayer =
      this.designModel
        .layers
        .get(
          DEFAULT_DESIGN_LAYER_IDS
            .REFERENCE_AXES,
        );


    const instanceIds =
      this.activeInstanceId
        ? [
            this.activeInstanceId,
          ]
        : this.designModel
            .pieceInstances
            .getAll()
            .map(
              (
                instance,
              ) =>
                instance.id,
            );


    for (
      const instanceId
      of instanceIds
    ) {

      const instance =
        this.designModel
          .pieceInstances
          .get(
            instanceId,
          );


      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      if (
        !instance
        || !object
        || !object.visible
      ) {

        continue;

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

        continue;

      }


      object.updateMatrixWorld(
        true,
      );


      if (
        snapLayer?.visible
        ?? true
      ) {

        this.buildSnapHelpers(
          definition,
          object,
          instanceId,
        );

      }


      if (
        axisLayer?.visible
        ?? true
      ) {

        this.buildAxisHelpers(
          definition,
          object,
          instanceId,
        );

      }

    }

  }


  private buildSnapHelpers(
    definition:
      PieceDefinition,

    instanceObject:
      THREE.Object3D,

    instanceId:
      string,
  ):
    void {

    for (
      const snap
      of definition.snapPoints
    ) {

      const worldPoint =
        this.definitionLocalToWorld(
          snap.position,
          definition,
          instanceObject,
        );


      const geometry =
        new THREE.BufferGeometry();


      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(
          [
            0,
            0,
            0,
          ],
          3,
        ),
      );


      const material =
        new THREE.PointsMaterial({
          size:
            snap.type
            === "ORIGIN"
              ? 12
              : 9,
          sizeAttenuation:
            false,
          depthTest:
            false,
        });


      const point =
        new THREE.Points(
          geometry,
          material,
        );


      point.position.copy(
        worldPoint,
      );


      point.renderOrder =
        1001;


      point.name =
        `PieceSnap:${instanceId}:${definition.id}:${snap.id}`;


      point.userData = {
        frameLogic: {
          entityType:
            "PieceSnapPoint",
          instanceId,
          definitionId:
            definition.id,
          snapId:
            snap.id,
          snapType:
            snap.type,
        },
      };


      this.snapGroup.add(
        point,
      );

    }

  }


  private buildAxisHelpers(
    definition:
      PieceDefinition,

    instanceObject:
      THREE.Object3D,

    instanceId:
      string,
  ):
    void {

    for (
      const axis
      of definition.referenceGeometry
        .axisLines
    ) {

      const localOrigin =
        this.fromData(
          axis.origin,
        );


      const localDirection =
        this.fromData(
          axis.direction,
        )
          .normalize();


      const length =
        axis.length
        ?? 1;


      const localEnd =
        localOrigin
          .clone()
          .addScaledVector(
            localDirection,
            length,
          );


      const worldStart =
        this.definitionLocalToWorld(
          this.toData(
            localOrigin,
          ),
          definition,
          instanceObject,
        );


      const worldEnd =
        this.definitionLocalToWorld(
          this.toData(
            localEnd,
          ),
          definition,
          instanceObject,
        );


      const geometry =
        new THREE.BufferGeometry()
          .setFromPoints(
            [
              worldStart,
              worldEnd,
            ],
          );


      const material =
        new THREE.LineDashedMaterial({
          dashSize:
            0.15,
          gapSize:
            0.08,
          depthTest:
            false,
        });


      const line =
        new THREE.Line(
          geometry,
          material,
        );


      line.computeLineDistances();


      line.renderOrder =
        1000;


      line.name =
        `PieceAxis:${instanceId}:${definition.id}:${axis.id}`;


      line.userData = {
        frameLogic: {
          entityType:
            "PieceReferenceAxis",
          instanceId,
          definitionId:
            definition.id,
          axisId:
            axis.id,
          axisType:
            axis.type,
        },
      };


      this.axisGroup.add(
        line,
      );

    }

  }


  private definitionLocalToWorld(
    local:
      PieceVector3Data,

    definition:
      PieceDefinition,

    instanceObject:
      THREE.Object3D,
  ):
    THREE.Vector3 {

    const coordinateSystem =
      definition.coordinateSystem;


    const assetPoint =
      new THREE.Vector3(
        coordinateSystem.origin.x,
        coordinateSystem.origin.y,
        coordinateSystem.origin.z,
      );


    assetPoint
      .addScaledVector(
        this.fromData(
          coordinateSystem.xAxis,
        ),
        local.x,
      )
      .addScaledVector(
        this.fromData(
          coordinateSystem.yAxis,
        ),
        local.y,
      )
      .addScaledVector(
        this.fromData(
          coordinateSystem.zAxis,
        ),
        local.z,
      );


    return assetPoint
      .applyMatrix4(
        instanceObject.matrixWorld,
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


  private clearGroup(
    group:
      THREE.Group,
  ):
    void {

    for (
      const child
      of [
        ...group.children,
      ]
    ) {

      group.remove(
        child,
      );


      if (
        child
        instanceof THREE.Points
        || child
        instanceof THREE.Line
      ) {

        child.geometry.dispose();


        if (
          Array.isArray(
            child.material,
          )
        ) {

          for (
            const material
            of child.material
          ) {

            material.dispose();

          }

        }
        else {

          child.material.dispose();

        }

      }

    }

  }


  dispose():
    void {

    this.clearGroup(
      this.snapGroup,
    );


    this.clearGroup(
      this.axisGroup,
    );


    this.scene.remove(
      this.snapGroup,
    );


    this.scene.remove(
      this.axisGroup,
    );

  }

}
