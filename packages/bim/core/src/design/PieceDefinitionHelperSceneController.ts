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
import type { PieceReferenceFocus } from "./PieceReferenceFocus";
import { pickPieceReferenceAtScreen } from "./pickPieceReferenceAtScreen";


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

  private readonly focusGroup = new THREE.Group();
  private focusedReference: PieceReferenceFocus = null;

  // Only visual helpers are toggled; SNAP geometry/search stays enabled.
  private showGeneralSnaps = false;
  private showGeneralAxes = false;
  private temporaryReferenceHoverInstanceId: string | null = null;

  setGeneralReferenceVisibility(snaps: boolean, axes: boolean): void {
    this.showGeneralSnaps = snaps;
    this.showGeneralAxes = axes;
    this.applyReferenceVisibility();
  }

  setTemporaryReferenceHover(instanceId: string | null): void {
    if (this.temporaryReferenceHoverInstanceId === instanceId) return;
    this.temporaryReferenceHoverInstanceId = instanceId;
    this.applyReferenceVisibility();
  }

  private applyReferenceVisibility(): void {
    const editing = this.activeInstanceId !== null;
    this.snapGroup.visible = editing || this.showGeneralSnaps || this.temporaryReferenceHoverInstanceId !== null;
    this.axisGroup.visible = editing || this.showGeneralAxes || this.temporaryReferenceHoverInstanceId !== null;
    // Never reveal references belonging to a neighbouring instance merely
    // because one candidate under the cursor enabled temporary feedback.
    for (const [group, showAll] of [
      [this.snapGroup, this.showGeneralSnaps],
      [this.axisGroup, this.showGeneralAxes],
    ] as const) {
      for (const child of group.children) {
        const id = child.userData["frameLogic"]?.instanceId as string | undefined;
        child.visible = editing || showAll || (
          this.temporaryReferenceHoverInstanceId !== null
          && id === this.temporaryReferenceHoverInstanceId
        );
      }
    }
  }


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
    this.focusGroup.name = "FrameLogicPieceReferenceFocusOverlay";
    this.scene.add(this.focusGroup);
    this.applyReferenceVisibility();
  }

  findReferenceAtPointer(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    rect: DOMRect,
  ): PieceReferenceFocus {
    if (!this.activeInstanceId) return null;
    return pickPieceReferenceAtScreen(
      this.snapGroup,
      this.axisGroup,
      this.activeInstanceId,
      camera,
      rect,
      clientX,
      clientY,
    );
  }

  setHighlightedReference(reference: PieceReferenceFocus): void {
    if (this.focusedReference?.kind === reference?.kind
      && this.focusedReference?.id === reference?.id) return;
    this.focusedReference = reference;
    this.refreshFocusOverlay();
  }

  private addFocusPoint(position: THREE.Vector3, size: number, renderOrder: number): void {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
    const marker = new THREE.Points(geometry, new THREE.PointsMaterial({
      color: renderOrder === 1100 ? "#facc15" : "#ffffff",
      size, sizeAttenuation: false, depthTest: false,
      depthWrite: false, transparent: true, opacity: 0.95,
    }));
    marker.position.copy(position);
    marker.renderOrder = renderOrder;
    marker.raycast = () => {};
    this.focusGroup.add(marker);
  }

  private refreshFocusOverlay(): void {
    this.clearGroup(this.focusGroup);
    const focus = this.focusedReference;
    const instanceId = this.activeInstanceId;
    if (!focus || !instanceId) return;
    const instance = this.designModel.pieceInstances.get(instanceId);
    const object = this.designScene.getInstanceObject(instanceId);
    if (!instance || !object || !object.visible) return;
    const definition = this.designModel.pieceDefinitions.get(instance.definitionId);
    if (!definition) return;
    object.updateMatrixWorld(true);

    if (focus.kind === "SNAP") {
      const snap = definition.snapPoints.find(item => item.id === focus.id);
      if (!snap) return;
      const point = this.definitionLocalToWorld(snap.position, definition, object);
      this.addFocusPoint(point, 34, 1100);
      this.addFocusPoint(point, 17, 1101);
      return;
    }

    const axis = definition.referenceGeometry.axisLines.find(item => item.id === focus.id);
    if (!axis) return;
    const start = this.definitionLocalToWorld(axis.origin, definition, object);
    const endLocal = this.fromData(axis.origin).addScaledVector(
      this.fromData(axis.direction).normalize(), axis.length ?? 1000,
    );
    const end = this.definitionLocalToWorld(this.toData(endLocal), definition, object);
    const vector = end.clone().sub(start);
    const length = vector.length();
    this.addFocusPoint(start, 25, 1100);
    this.addFocusPoint(end, 25, 1100);
    if (length < 0.001) return;
    const radius = Math.max(5, Math.min(18, length * 0.008));
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 8),
      new THREE.MeshBasicMaterial({
        color: "#facc15", transparent: true, opacity: 0.9,
        depthTest: false, depthWrite: false,
      }),
    );
    tube.position.copy(start).addScaledVector(vector, 0.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vector.normalize());
    tube.renderOrder = 1099;
    tube.raycast = () => {};
    this.focusGroup.add(tube);
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
    this.refreshFocusOverlay();
    this.applyReferenceVisibility();
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


      /*
       * FrameLogic usa milímetros como unidad lineal canónica.
       * El fallback histórico era 1 m; se conserva físicamente como 1000 mm.
       */
      const length =
        axis.length
        ?? 1000;


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
          /* 0.15 m / 0.08 m históricos, ahora expresados en mm. */
          dashSize:
            150,
          gapSize:
            80,
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
        || child
        instanceof THREE.Mesh
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
    this.clearGroup(this.focusGroup);
    this.scene.remove(this.focusGroup);

    this.scene.remove(
      this.snapGroup,
    );


    this.scene.remove(
      this.axisGroup,
    );

  }

}
