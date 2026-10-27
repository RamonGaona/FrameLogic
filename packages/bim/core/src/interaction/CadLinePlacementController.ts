import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadHistoryController,
} from "./CadHistoryController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  CadWorkPlaneController,
} from "./CadWorkPlaneController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  DesignSnapController,
} from "./DesignSnapController";

import {
  getDesignOrthoController,
} from "./DesignOrthoController";

import type {
  DesignOrthoController,
} from "./DesignOrthoController";

import {
  CAD_LINE_DISTANCE_APPLY_EVENT,
  CAD_LINE_DISTANCE_END_EVENT,
  CAD_LINE_DISTANCE_MODE_EVENT,
} from "./CadNumericInputController";

import type {
  CadLineDistanceApplyDetail,
  CadLineDistanceModeDetail,
} from "./CadNumericInputController";


export class CadLinePlacementController {

  private readonly scene:
    THREE.Scene;


  private readonly domElement:
    HTMLElement;


  private readonly cameraProvider:
    () => THREE.Camera;


  private readonly designModel:
    DesignModel;


  private readonly lineScene:
    CadLineSceneController;


  private readonly snap:
    DesignSnapController;


  private readonly workPlane:
    CadWorkPlaneController;


  private readonly ortho:
    DesignOrthoController;


  private readonly history:
    CadHistoryController;


  private readonly designSelection:
    DesignSelectionController;


  private readonly pointSelection:
    CadPointSelectionController;


  private readonly lineSelection:
    CadLineSelectionController;


  private readonly preview:
    THREE.Line;


  private startPoint:
    THREE.Vector3
    | null =
      null;


  private lastDirection:
    THREE.Vector3
    | null =
      null;


  private pointerDownX =
    0;


  private pointerDownY =
    0;


  private pointerDownActive =
    false;


  private active =
    false;


  private disposed =
    false;


  constructor(
    scene:
      THREE.Scene,

    domElement:
      HTMLElement,

    cameraProvider:
      () => THREE.Camera,

    designModel:
      DesignModel,

    lineScene:
      CadLineSceneController,

    snap:
      DesignSnapController,

    workPlane:
      CadWorkPlaneController,

    history:
      CadHistoryController,

    designSelection:
      DesignSelectionController,

    pointSelection:
      CadPointSelectionController,

    lineSelection:
      CadLineSelectionController,
  ) {

    this.scene =
      scene;


    this.domElement =
      domElement;


    this.cameraProvider =
      cameraProvider;


    this.designModel =
      designModel;


    this.lineScene =
      lineScene;


    this.snap =
      snap;


    this.workPlane =
      workPlane;


    this.ortho =
      getDesignOrthoController(
        domElement,
      );


    this.history =
      history;


    this.designSelection =
      designSelection;


    this.pointSelection =
      pointSelection;


    this.lineSelection =
      lineSelection;


    const previewGeometry =
      new THREE.BufferGeometry();


    const previewMaterial =
      new THREE.LineDashedMaterial({
        dashSize:
          0.15,
        gapSize:
          0.08,
        depthTest:
          false,
      });


    this.preview =
      new THREE.Line(
        previewGeometry,
        previewMaterial,
      );


    this.preview.name =
      "FrameLogicCadLinePreview";


    this.preview.visible =
      false;


    this.preview.renderOrder =
      1000;


    this.scene.add(
      this.preview,
    );


    this.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );


    this.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );


    this.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );


    document.addEventListener(
      CAD_LINE_DISTANCE_APPLY_EVENT,
      this.handleNumericDistanceApply,
    );

  }


  get isActive():
    boolean {

    return this.active;

  }


  get hasStartPoint():
    boolean {

    return this.startPoint
      !== null;

  }


  activate():
    boolean {

    if (
      this.disposed
    ) {

      return false;

    }


    const layer =
      this.designModel
        .layers
        .activeLayer;


    if (
      layer.locked
    ) {

      return false;

    }


    this.active =
      true;


    this.startPoint =
      null;


    this.lastDirection =
      null;


    this.preview.visible =
      false;


    this.designSelection
      .setEnabled(
        false,
      );


    this.pointSelection
      .setEnabled(
        false,
      );


    this.lineSelection
      .setEnabled(
        false,
      );


    return true;

  }


  deactivate():
    void {

    this.active =
      false;


    this.startPoint =
      null;


    this.lastDirection =
      null;


    this.pointerDownActive =
      false;


    this.preview.visible =
      false;


    this.designSelection
      .setEnabled(
        true,
      );


    this.pointSelection
      .setEnabled(
        true,
      );


    this.lineSelection
      .setEnabled(
        true,
      );


    this.endDistanceInput();

  }


  createAtCoordinates(
    x: number,
    y: number,
    z: number,
  ):
    boolean {

    if (
      !this.active
      || !Number.isFinite(
        x,
      )
      || !Number.isFinite(
        y,
      )
      || !Number.isFinite(
        z,
      )
    ) {

      return false;

    }


    const point =
      new THREE.Vector3(
        x,
        y,
        z,
      );


    return this.acceptPoint(
      point,
    );

  }


  createAtDistance(
    distance:
      number,
  ):
    boolean {

    if (
      !this.active
      || !this.startPoint
      || !this.lastDirection
      || !Number.isFinite(
        distance,
      )
      || Math.abs(
        distance,
      ) <= 1e-12
    ) {

      return false;

    }


    const end =
      this.startPoint
        .clone()
        .addScaledVector(
          this.lastDirection,
          distance,
        );


    return this.acceptPoint(
      end,
    );

  }


  private readonly handleNumericDistanceApply =
    (
      event:
        Event,
    ): void => {

      const detail =
        (
          event as CustomEvent<
            CadLineDistanceApplyDetail
          >
        ).detail;


      if (
        !detail
        || !detail.container.contains(
          this.domElement,
        )
      ) {

        return;

      }


      this.createAtDistance(
        detail.distance,
      );

  };


  private readonly handlePointerDown =
    (
      event:
        PointerEvent,
    ):
      void => {

      if (
        !this.active
        || event.button !== 0
      ) {

        return;

      }


      this.pointerDownX =
        event.clientX;


      this.pointerDownY =
        event.clientY;


      this.pointerDownActive =
        true;

  };


  private readonly handlePointerUp =
    (
      event:
        PointerEvent,
    ):
      void => {

      if (
        !this.active
        || !this.pointerDownActive
        || event.button !== 0
      ) {

        return;

      }


      this.pointerDownActive =
        false;


      const movement =
        Math.hypot(
          event.clientX
          - this.pointerDownX,
          event.clientY
          - this.pointerDownY,
        );


      if (
        movement > 5
      ) {

        return;

      }


      const point =
        this.acquirePointerPoint(
          event.clientX,
          event.clientY,
        );


      if (
        !point
      ) {

        return;

      }


      event.preventDefault();

      event.stopPropagation();


      this.acceptPoint(
        point,
      );

  };


  private readonly handlePointerMove =
    (
      event:
        PointerEvent,
    ):
      void => {

      if (
        !this.active
        || !this.startPoint
      ) {

        this.preview.visible =
          false;


        return;

      }


      const end =
        this.acquirePointerPoint(
          event.clientX,
          event.clientY,
        );


      if (
        !end
      ) {

        this.preview.visible =
          false;


        return;

      }


      this.updatePreview(
        this.startPoint,
        end,
      );

  };


  private acquirePointerPoint(
    clientX:
      number,

    clientY:
      number,
  ):
    THREE.Vector3
    | null {

    const snap =
      this.snap.findSnap(
        clientX,
        clientY,
      );


    let candidate:
      THREE.Vector3
      | null =
        snap
          ? snap.point.clone()
          : null;


    if (
      !candidate
    ) {

      candidate =
        this.workPlane
          .intersectPointer(
            clientX,
            clientY,
            this.cameraProvider(),
            this.domElement,
          );

    }


    if (
      !candidate
    ) {

      return null;

    }


    if (
      !this.startPoint
    ) {

      return candidate;

    }


    return this.ortho
      .constrainPoint(
        this.startPoint,
        candidate,
      );

  }


  private acceptPoint(
    point:
      THREE.Vector3,
  ):
    boolean {

    const resolvedPoint =
      this.startPoint
        ? this.ortho
            .constrainPoint(
              this.startPoint,
              point,
            )
        : point.clone();


    if (
      !this.startPoint
    ) {

      this.startPoint =
        resolvedPoint.clone();


      this.lastDirection =
        null;


      this.preview.visible =
        false;


      this.requestDistanceInput();


      return true;

    }


    if (
      this.startPoint
        .distanceToSquared(
          resolvedPoint,
        )
      <= 1e-12
    ) {

      return false;

    }


    const start =
      this.startPoint
        .clone();


    const end =
      resolvedPoint.clone();


    const created =
      this.createLine(
        start,
        end,
      );


    if (
      !created
    ) {

      return false;

    }


    const direction =
      end
        .clone()
        .sub(
          start,
        );


    if (
      direction.lengthSq()
      > 1e-20
    ) {

      this.lastDirection =
        direction.normalize();

    }


    this.startPoint =
      end;


    this.preview.visible =
      false;


    this.requestDistanceInput();


    return true;

  }


  private createLine(
    start:
      THREE.Vector3,

    end:
      THREE.Vector3,
  ):
    boolean {

    const layerId =
      this.designModel
        .layers
        .activeLayerId;


    const line =
      this.designModel
        .registerCadLine({
          layerId,
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
        });


    this.lineScene.sync();


    const snapshot = {
      id:
        line.id,
      layerId:
        line.layerId,
      start: {
        x:
          line.start.x,
        y:
          line.start.y,
        z:
          line.start.z,
      },
      end: {
        x:
          line.end.x,
        y:
          line.end.y,
        z:
          line.end.z,
      },
    };


    this.history.recordOperation(
      "LINE",
      () => {

        this.designModel
          .removeCadLine(
            snapshot.id,
          );


        this.lineScene.sync();

      },
      () => {

        if (
          this.designModel
            .cadLines
            .get(
              snapshot.id,
            )
        ) {

          return;

        }


        this.designModel
          .registerCadLine({
            id:
              snapshot.id,
            layerId:
              snapshot.layerId,
            start: {
              ...snapshot.start,
            },
            end: {
              ...snapshot.end,
            },
          });


        this.lineScene.sync();

      },
    );


    return true;

  }


  private updatePreview(
    start:
      THREE.Vector3,

    end:
      THREE.Vector3,
  ):
    void {

    const direction =
      end
        .clone()
        .sub(
          start,
        );


    if (
      direction.lengthSq()
      > 1e-20
    ) {

      this.lastDirection =
        direction.normalize();

    }


    this.preview.geometry
      .setFromPoints(
        [
          start,
          end,
        ],
      );


    this.preview.computeLineDistances();


    this.preview.visible =
      true;

  }


  private requestDistanceInput():
    void {

    const detail:
      CadLineDistanceModeDetail = {
        domElement:
          this.domElement,
      };


    document.dispatchEvent(
      new CustomEvent<
        CadLineDistanceModeDetail
      >(
        CAD_LINE_DISTANCE_MODE_EVENT,
        {
          detail,
        },
      ),
    );

  }


  private endDistanceInput():
    void {

    const detail:
      CadLineDistanceModeDetail = {
        domElement:
          this.domElement,
      };


    document.dispatchEvent(
      new CustomEvent<
        CadLineDistanceModeDetail
      >(
        CAD_LINE_DISTANCE_END_EVENT,
        {
          detail,
        },
      ),
    );

  }


  dispose():
    void {

    if (
      this.disposed
    ) {

      return;

    }


    this.disposed =
      true;


    this.deactivate();


    this.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );


    this.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );


    this.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );


    document.removeEventListener(
      CAD_LINE_DISTANCE_APPLY_EVENT,
      this.handleNumericDistanceApply,
    );


    this.scene.remove(
      this.preview,
    );


    this.preview.geometry.dispose();


    if (
      Array.isArray(
        this.preview.material,
      )
    ) {

      for (
        const material
        of this.preview.material
      ) {

        material.dispose();

      }

    }
    else {

      this.preview.material.dispose();

    }

  }

}
