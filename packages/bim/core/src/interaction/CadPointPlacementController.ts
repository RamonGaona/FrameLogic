import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import type {
  CadHistoryController,
} from "./CadHistoryController";

import type {
  CadWorkPlaneController,
} from "./CadWorkPlaneController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  DesignSnapController,
} from "./DesignSnapController";


export class CadPointPlacementController {

  private readonly domElement:
    HTMLElement;


  private readonly cameraProvider:
    () => THREE.Camera;


  private readonly designModel:
    DesignModel;


  private readonly pointScene:
    CadPointSceneController;


  private readonly snap:
    DesignSnapController;


  private readonly workPlane:
    CadWorkPlaneController;


  private readonly history:
    CadHistoryController;


  private readonly selection:
    DesignSelectionController;


  private readonly pointSelection:
    CadPointSelectionController;


  private readonly lineSelection:
    CadLineSelectionController
    | null;


  private active =
    false;


  private pointerDownX =
    0;


  private pointerDownY =
    0;


  private pointerDownActive =
    false;


  private disposed =
    false;


  constructor(
    domElement:
      HTMLElement,

    cameraProvider:
      () => THREE.Camera,

    designModel:
      DesignModel,

    pointScene:
      CadPointSceneController,

    snap:
      DesignSnapController,

    workPlane:
      CadWorkPlaneController,

    history:
      CadHistoryController,

    selection:
      DesignSelectionController,

    pointSelection:
      CadPointSelectionController,

    lineSelection?:
      CadLineSelectionController,
  ) {

    this.domElement =
      domElement;


    this.cameraProvider =
      cameraProvider;


    this.designModel =
      designModel;


    this.pointScene =
      pointScene;


    this.snap =
      snap;


    this.workPlane =
      workPlane;


    this.history =
      history;


    this.selection =
      selection;


    this.pointSelection =
      pointSelection;


    this.lineSelection =
      lineSelection
      ?? null;


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

  }


  get isActive():
    boolean {

    return this.active;

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


    this.pointerDownActive =
      false;


    this.selection.setEnabled(
      false,
    );


    this.pointSelection.setEnabled(
      false,
    );


    this.lineSelection
      ?.setEnabled(
        false,
      );


    return true;

  }


  deactivate():
    void {

    this.active =
      false;


    this.pointerDownActive =
      false;


    this.selection.setEnabled(
      true,
    );


    this.pointSelection.setEnabled(
      true,
    );


    this.lineSelection
      ?.setEnabled(
        true,
      );

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


    return this.createPoint(
      new THREE.Vector3(
        x,
        y,
        z,
      ),
    );

  }


  private readonly handlePointerDown =
    (
      event:
        PointerEvent,
    ): void => {

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
    ): void => {

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


      /*
       * Arrastrar pertenece a la cámara.
       * Solo un clic corto crea un punto.
       */
      if (
        movement > 5
      ) {

        return;

      }


      const snap =
        this.snap.findSnap(
          event.clientX,
          event.clientY,
        );


      let position:
        THREE.Vector3
        | null =
          null;


      /*
       * SNAP siempre tiene prioridad y puede estar
       * fuera del WorkPlane activo.
       */
      if (
        snap
      ) {

        position =
          snap.point.clone();

      }
      else {

        position =
          this.workPlane
            .intersectPointer(
              event.clientX,
              event.clientY,
              this.cameraProvider(),
              this.domElement,
            );

      }


      /*
       * WorkPlane OFF + sin SNAP:
       * no existe posición válida por clic.
       */
      if (
        !position
      ) {

        return;

      }


      event.preventDefault();

      event.stopPropagation();


      this.createPoint(
        position,
      );

  };


  private createPoint(
    position:
      THREE.Vector3,
  ):
    boolean {

    const layerId =
      this.designModel
        .layers
        .activeLayerId;


    const point =
      this.designModel
        .registerCadPoint({
          layerId,
          position: {
            x:
              position.x,
            y:
              position.y,
            z:
              position.z,
          },
        });


    this.pointScene.sync();


    const snapshot = {
      id:
        point.id,
      layerId:
        point.layerId,
      position: {
        x:
          point.position.x,
        y:
          point.position.y,
        z:
          point.position.z,
      },
    };


    this.history.recordOperation(
      "POINT",
      () => {

        this.designModel
          .removeCadPoint(
            snapshot.id,
          );


        this.pointScene.sync();

      },
      () => {

        if (
          this.designModel
            .cadPoints
            .get(
              snapshot.id,
            )
        ) {

          return;

        }


        this.designModel
          .registerCadPoint({
            id:
              snapshot.id,
            layerId:
              snapshot.layerId,
            position: {
              ...snapshot.position,
            },
          });


        this.pointScene.sync();

      },
    );


    return true;

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

  }

}
