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


      /*
       * El arrastre pertenece a la cámara.
       */
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


    /*
     * SNAP tiene prioridad absoluta.
     * Puede producir una línea 3D no ortogonal
     * y puede salir del WorkPlane.
     */
    if (
      snap
    ) {

      return snap.point
        .clone();

    }


    const rawPlanePoint =
      this.workPlane
        .intersectPointer(
          clientX,
          clientY,
          this.cameraProvider(),
          this.domElement,
        );


    if (
      !rawPlanePoint
    ) {

      return null;

    }


    /*
     * Primer punto libre:
     * simplemente cae sobre el WorkPlane.
     */
    if (
      !this.startPoint
    ) {

      return rawPlanePoint;

    }


    /*
     * ORTHO tipo F8:
     *
     * 0° / 90° respecto a los ejes LOCALES
     * del WorkPlane activo.
     *
     * Si el primer punto vino de un SNAP situado
     * fuera del plano, estas mismas direcciones
     * pasan por el primer punto.
     */
    return this.applyWorkPlaneOrtho(
      this.startPoint,
      rawPlanePoint,
    );

  }


  private applyWorkPlaneOrtho(
    start:
      THREE.Vector3,

    candidate:
      THREE.Vector3,
  ):
    THREE.Vector3 {

    const state =
      this.workPlane
        .getState();


    const delta =
      candidate
        .clone()
        .sub(
          start,
        );


    const alongX =
      delta.dot(
        state.xAxis,
      );


    const alongY =
      delta.dot(
        state.yAxis,
      );


    if (
      Math.abs(
        alongX,
      )
      >= Math.abs(
        alongY,
      )
    ) {

      return start
        .clone()
        .addScaledVector(
          state.xAxis,
          alongX,
        );

    }


    return start
      .clone()
      .addScaledVector(
        state.yAxis,
        alongY,
      );

  }


  private acceptPoint(
    point:
      THREE.Vector3,
  ):
    boolean {

    if (
      !this.startPoint
    ) {

      this.startPoint =
        point.clone();


      this.preview.visible =
        false;


      return true;

    }


    if (
      this.startPoint
        .distanceToSquared(
          point,
        )
      <= 1e-12
    ) {

      return false;

    }


    const start =
      this.startPoint
        .clone();


    const end =
      point.clone();


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


    /*
     * LINE continuo:
     * el final se convierte en el siguiente inicio.
     */
    this.startPoint =
      end;


    this.preview.visible =
      false;


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
