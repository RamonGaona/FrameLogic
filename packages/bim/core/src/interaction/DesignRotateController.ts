import * as THREE from "three";

import {
  TransformControls,
} from "three/addons/controls/TransformControls.js";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  RotateNumericAxis,
} from "./CadNumericInputController";

import type {
  CadHistoryController,
  CadTransformSnapshot,
} from "./CadHistoryController";

import type {
  DesignSnapController,
} from "./DesignSnapController";


interface RotateStartState {

  worldPosition:
    THREE.Vector3;

  worldQuaternion:
    THREE.Quaternion;

}


export class DesignRotateController {

  private readonly scene:
    THREE.Scene;


  private readonly domElement:
    HTMLElement;


  private camera:
    THREE.Camera;


  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  private readonly selection:
    DesignSelectionController;


  private readonly setCameraEnabled:
    (
      enabled: boolean,
    ) => void;


  private readonly history:
    CadHistoryController;


  private readonly snap:
    DesignSnapController;


  private readonly controls:
    TransformControls;


  private readonly helper:
    THREE.Object3D;


  private readonly pivot =
    new THREE.Object3D();


  /*
   * Centro propio del gizmo ROTATE.
   *
   * Los anillos X/Y/Z pertenecen a TransformControls.
   * Esta esfera permite desplazar temporalmente el centro
   * de rotación sin mover las piezas.
   */
  private readonly centerHandle:
    THREE.Mesh;


  private readonly centerRaycaster =
    new THREE.Raycaster();


  private readonly centerPointer =
    new THREE.Vector2();


  private readonly centerDragPlane =
    new THREE.Plane();


  private readonly centerDragOffset =
    new THREE.Vector3();


  private readonly centerDragPoint =
    new THREE.Vector3();


  private centerDragging =
    false;


  private centerArmed =
    false;


  private centerPointerDownX =
    0;


  private centerPointerDownY =
    0;


  private readonly centerDragStartPivot =
    new THREE.Vector3();


  private armedCenterPointerDownActive =
    false;


  private armedCenterPointerDownX =
    0;


  private armedCenterPointerDownY =
    0;


  private readonly transformedObjects =
    new Map<
      string,
      THREE.Object3D
    >();


  private rotationStartPivotQuaternion =
    new THREE.Quaternion();


  private readonly rotationStartStates =
    new Map<
      string,
      RotateStartState
    >();


  private active =
    false;


  private disposed =
    false;


  private unsubscribeSelection:
    (() => void) | null =
      null;


  private onNumericAxis:
    (
      axis: RotateNumericAxis,
    ) => void =
      () => {};


  private dragHistoryStart:
    CadTransformSnapshot
    | null =
      null;


  constructor(
    scene:
      THREE.Scene,

    camera:
      THREE.Camera,

    domElement:
      HTMLElement,

    designModel:
      DesignModel,

    designScene:
      DesignSceneController,

    selection:
      DesignSelectionController,

    history:
      CadHistoryController,

    snap:
      DesignSnapController,

    setCameraEnabled:
      (
        enabled: boolean,
      ) => void,
  ) {

    this.scene =
      scene;


    this.camera =
      camera;


    this.domElement =
      domElement;


    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.selection =
      selection;


    this.history =
      history;


    this.snap =
      snap;


    this.setCameraEnabled =
      setCameraEnabled;


    this.controls =
      new TransformControls(
        camera,
        domElement,
      );


    this.controls.setMode(
      "rotate",
    );


    this.controls.setSpace(
      "world",
    );


    this.controls.size =
      0.8;


    this.helper =
      this.controls.getHelper();


    this.scene.add(
      this.helper,
    );


    this.pivot.name =
      "FrameLogicRotatePivot";


    this.scene.add(
      this.pivot,
    );


    this.centerHandle =
      new THREE.Mesh(
        new THREE.SphereGeometry(
          0.07,
          20,
          12,
        ),
        new THREE.MeshBasicMaterial({
          color:
            0xffffff,

          depthTest:
            false,

          depthWrite:
            false,
        }),
      );


    this.centerHandle.name =
      "FrameLogicRotateCenterHandle";


    this.centerHandle.renderOrder =
      10000;


    this.centerHandle.visible =
      false;


    this.pivot.add(
      this.centerHandle,
    );


    this.unsubscribeSelection =
      this.selection.subscribe(
        (
          selectedIds,
        ) => {

          this.handleSelectionChanged(
            selectedIds,
          );

        },
      );


    this.controls.addEventListener(
      "mouseDown",
      this.handleRotateStart,
    );


    this.controls.addEventListener(
      "objectChange",
      this.handleRotateChange,
    );


    this.controls.addEventListener(
      "mouseUp",
      this.handleRotateEnd,
    );


    /*
     * Capture=true:
     * si el usuario toma el centro propio,
     * interceptamos el gesto antes de que TransformControls
     * intente interpretar el mismo pointerdown.
     */
    this.domElement.addEventListener(
      "pointerdown",
      this.handleCenterPointerDown,
      true,
    );


    window.addEventListener(
      "pointermove",
      this.handleCenterPointerMove,
    );


    window.addEventListener(
      "pointerup",
      this.handleCenterPointerUp,
    );


    this.controls.detach();

  }


  // ==========================================================
  // ACTIVATE
  // ==========================================================

  activate(): boolean {

    if (
      this.disposed
    ) {

      return false;

    }


    const selectedIds =
      this.selection
        .getSelectedIds();


    if (
      selectedIds.length < 1
      || !this.syncSelectedObjects(
        selectedIds,
      )
    ) {

      this.deactivate();

      return false;

    }


    this.active =
      true;


    this.resetPivotToSelectionBase();


    this.controls.attach(
      this.pivot,
    );


    this.centerHandle.visible =
      true;


    return true;

  }


  // ==========================================================
  // DEACTIVATE
  // ==========================================================

  deactivate(): void {

    /*
     * ESC / doble clic vacío:
     * el centro temporal desaparece y vuelve al punto base.
     */
    this.resetPivotToSelectionBase();


    this.active =
      false;


    this.centerDragging =
      false;


    this.centerArmed =
      false;


    this.armedCenterPointerDownActive =
      false;


    this.snap.clearExcludedInstanceIds();


    this.transformedObjects.clear();


    this.rotationStartStates.clear();


    this.dragHistoryStart =
      null;


    this.controls.detach();


    this.centerHandle.visible =
      false;


    this.setCameraEnabled(
      true,
    );


    this.selection.setEnabled(
      true,
    );

  }


  get isActive():
    boolean {

    return this.active;

  }


  // ==========================================================
  // CAMERA
  // ==========================================================

  setCamera(
    camera:
      THREE.Camera,
  ): void {

    /*
     * Mantener sincronizados:
     *
     * - TransformControls (anillos X/Y/Z)
     * - raycast del centro desplazable
     */
    this.camera =
      camera;


    this.controls.camera =
      camera;

  }


  setNumericAxisHandler(
    handler:
      (
        axis: RotateNumericAxis,
      ) => void,
  ): void {

    this.onNumericAxis =
      handler;

  }


  applyNumericRotation(
    axis:
      RotateNumericAxis,

    degrees:
      number,
  ): boolean {

    if (
      !this.active
      || this.transformedObjects.size
        < 1
    ) {

      return false;

    }


    const before =
      this.history.capture(
        this.selection
          .getSelectedIds(),
      );


    const axisVector =
      new THREE.Vector3();


    switch (
      axis
    ) {

      case "X":

        axisVector.set(
          1,
          0,
          0,
        );

        break;


      case "Y":

        axisVector.set(
          0,
          1,
          0,
        );

        break;


      case "Z":

        axisVector.set(
          0,
          0,
          1,
        );

        break;

    }


    const deltaQuaternion =
      new THREE.Quaternion()
        .setFromAxisAngle(
          axisVector,
          THREE.MathUtils.degToRad(
            degrees,
          ),
        );


    for (
      const object
      of this.transformedObjects.values()
    ) {

      const worldPosition =
        new THREE.Vector3();


      const worldQuaternion =
        new THREE.Quaternion();


      object.getWorldPosition(
        worldPosition,
      );


      object.getWorldQuaternion(
        worldQuaternion,
      );


      const nextWorldPosition =
        worldPosition
          .sub(
            this.pivot.position,
          )
          .applyQuaternion(
            deltaQuaternion,
          )
          .add(
            this.pivot.position,
          );


      const nextWorldQuaternion =
        deltaQuaternion
          .clone()
          .multiply(
            worldQuaternion,
          );


      if (
        object.parent
      ) {

        object.parent.updateMatrixWorld(
          true,
        );


        object.parent.worldToLocal(
          nextWorldPosition,
        );


        const parentWorldQuaternion =
          new THREE.Quaternion();


        object.parent.getWorldQuaternion(
          parentWorldQuaternion,
        );


        object.quaternion.copy(
          parentWorldQuaternion
            .invert()
            .multiply(
              nextWorldQuaternion,
            ),
        );

      }
      else {

        object.quaternion.copy(
          nextWorldQuaternion,
        );

      }


      object.position.copy(
        nextWorldPosition,
      );


      object.updateMatrix();


      object.updateMatrixWorld(
        true,
      );

    }


    this.commitTransforms();


    this.history.recordTransform(
      "ROTATE",
      before,
      this.selection
        .getSelectedIds(),
    );


    return true;

  }


  // ==========================================================
  // SELECTED OBJECTS
  // ==========================================================

  private syncSelectedObjects(
    selectedIds:
      readonly string[],
  ): boolean {

    this.transformedObjects.clear();


    for (
      const instanceId
      of selectedIds
    ) {

      const instance =
        this.designModel
          .pieceInstances
          .get(
            instanceId,
          );


      const layer =
        instance
          ? this.designModel
              .layers
              .get(
                instance.layerId,
              )
          : undefined;


      if (
        !instance
        || layer?.visible === false
        || layer?.locked === true
      ) {

        this.transformedObjects.clear();

        return false;

      }


      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      if (
        object
      ) {

        this.transformedObjects.set(
          instanceId,
          object,
        );

      }

    }


    return (
      this.transformedObjects.size
      > 0
    );

  }


  // ==========================================================
  // PIVOT BASE
  // ==========================================================

  private resetPivotToSelectionBase():
    void {

    const selectedIds =
      this.selection
        .getSelectedIds();


    if (
      selectedIds.length < 1
    ) {

      return;

    }


    const position =
      new THREE.Vector3();


    const worldPosition =
      new THREE.Vector3();


    let count =
      0;


    for (
      const instanceId
      of selectedIds
    ) {

      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      if (
        !object
      ) {

        continue;

      }


      object.getWorldPosition(
        worldPosition,
      );


      position.add(
        worldPosition,
      );


      count +=
        1;

    }


    if (
      count < 1
    ) {

      return;

    }


    position.multiplyScalar(
      1 / count,
    );


    this.pivot.position.copy(
      position,
    );


    /*
     * ROTATE comienza siempre con los ejes cartesianos
     * X / Y / Z del mundo.
     */
    this.pivot.quaternion.identity();


    this.rotationStartPivotQuaternion.copy(
      this.pivot.quaternion,
    );


    this.pivot.updateMatrixWorld(
      true,
    );

  }


  // ==========================================================
  // SELECTION CHANGED
  // ==========================================================

  private handleSelectionChanged(
    selectedIds:
      readonly string[],
  ): void {

    if (
      !this.active
    ) {

      return;

    }


    /*
     * Igual que MOVE:
     * cambiar selección no termina ROTATE.
     */
    if (
      selectedIds.length < 1
      || !this.syncSelectedObjects(
        selectedIds,
      )
    ) {

      this.deactivate();

      return;

    }


    /*
     * La nueva selección recibe su propio punto base.
     * El centro temporal anterior no se conserva.
     */
    this.resetPivotToSelectionBase();


    this.controls.attach(
      this.pivot,
    );


    this.centerHandle.visible =
      true;


    this.centerArmed =
      false;


    this.armedCenterPointerDownActive =
      false;


    this.snap.clearExcludedInstanceIds();

  }


  // ==========================================================
  // ROTATE RINGS
  // ==========================================================

  private readonly handleRotateStart =
    (): void => {

      if (
        !this.active
        || this.centerDragging
      ) {

        return;

      }


      /*
       * Guardamos un snapshot completo al INICIO del drag.
       *
       * Cada objectChange se calculará desde este estado
       * original, en lugar de acumular pequeños deltas.
       * Esto evita deriva y hace que el giro siga exactamente
       * el arco del gizmo también en cámara ortográfica.
       */
      this.rotationStartPivotQuaternion.copy(
        this.pivot.quaternion,
      );


      const axis =
        this.controls.axis;


      if (
        axis === "X"
        || axis === "Y"
        || axis === "Z"
      ) {

        this.onNumericAxis(
          axis,
        );

      }


      this.rotationStartStates.clear();


      this.dragHistoryStart =
        this.history.capture(
          this.selection
            .getSelectedIds(),
        );


      for (
        const [
          instanceId,
          object,
        ]
        of this.transformedObjects
      ) {

        const worldPosition =
          new THREE.Vector3();


        const worldQuaternion =
          new THREE.Quaternion();


        object.getWorldPosition(
          worldPosition,
        );


        object.getWorldQuaternion(
          worldQuaternion,
        );


        this.rotationStartStates.set(
          instanceId,
          {
            worldPosition,
            worldQuaternion,
          },
        );

      }


      this.setCameraEnabled(
        false,
      );


      this.selection.setEnabled(
        false,
      );

    };


  private readonly handleRotateChange =
    (): void => {

      if (
        !this.active
        || this.centerDragging
        || this.transformedObjects.size
          < 1
      ) {

        return;

      }


      /*
       * Rotación TOTAL desde el inicio del drag.
       *
       * current * inverse(start)
       *
       * De esta forma no acumulamos error evento por evento.
       */
      const deltaQuaternion =
        this.pivot.quaternion
          .clone()
          .multiply(
            this.rotationStartPivotQuaternion
              .clone()
              .invert(),
          );


      for (
        const [
          instanceId,
          object,
        ]
        of this.transformedObjects
      ) {

        const startState =
          this.rotationStartStates.get(
            instanceId,
          );


        if (
          !startState
        ) {

          continue;

        }


        /*
         * Posición mundial:
         *
         * P' = pivot + Q * (P0 - pivot)
         */
        const nextWorldPosition =
          startState.worldPosition
            .clone()
            .sub(
              this.pivot.position,
            )
            .applyQuaternion(
              deltaQuaternion,
            )
            .add(
              this.pivot.position,
            );


        /*
         * Orientación mundial:
         *
         * Q' = delta * Q0
         */
        const nextWorldQuaternion =
          deltaQuaternion
            .clone()
            .multiply(
              startState.worldQuaternion,
            );


        if (
          object.parent
        ) {

          object.parent.updateMatrixWorld(
            true,
          );


          object.parent.worldToLocal(
            nextWorldPosition,
          );


          const parentWorldQuaternion =
            new THREE.Quaternion();


          object.parent.getWorldQuaternion(
            parentWorldQuaternion,
          );


          object.quaternion.copy(
            parentWorldQuaternion
              .invert()
              .multiply(
                nextWorldQuaternion,
              ),
          );

        }
        else {

          object.quaternion.copy(
            nextWorldQuaternion,
          );

        }


        object.position.copy(
          nextWorldPosition,
        );


        object.updateMatrix();


        object.updateMatrixWorld(
          true,
        );

      }


      this.selection.refreshHelpers();

    };


  private readonly handleRotateEnd =
    (): void => {

      if (
        !this.active
        || this.centerDragging
      ) {

        return;

      }


      this.commitTransforms();


      if (
        this.dragHistoryStart
      ) {

        this.history.recordTransform(
          "ROTATE",
          this.dragHistoryStart,
          this.selection
            .getSelectedIds(),
        );

      }


      this.dragHistoryStart =
        null;


      this.rotationStartStates.clear();


      this.setCameraEnabled(
        true,
      );


      window.setTimeout(
        () => {

          if (
            this.disposed
          ) {

            return;

          }


          this.selection.setEnabled(
            true,
          );

        },
        0,
      );

    };


  // ==========================================================
  // CENTER HANDLE
  // ==========================================================

  private readonly handleCenterPointerDown =
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


      const pickedCenter =
        this.pickCenterHandle(
          event.clientX,
          event.clientY,
        );


      /*
       * Si el centro está armado y el clic NO cae sobre
       * la esfera blanca, este gesto es el destino SNAP.
       */
      if (
        this.centerArmed
        && !pickedCenter
      ) {

        this.armedCenterPointerDownX =
          event.clientX;


        this.armedCenterPointerDownY =
          event.clientY;


        this.armedCenterPointerDownActive =
          true;


        event.preventDefault();


        event.stopPropagation();


        return;

      }


      if (
        !pickedCenter
      ) {

        return;

      }


      /*
       * Un nuevo gesto sobre la esfera cancela cualquier
       * estado armado anterior y vuelve al modo normal.
       */
      this.centerArmed =
        false;


      this.armedCenterPointerDownActive =
        false;


      this.centerPointerDownX =
        event.clientX;


      this.centerPointerDownY =
        event.clientY;


      this.centerDragStartPivot.copy(
        this.pivot.position,
      );


      event.preventDefault();


      event.stopPropagation();


      this.centerDragging =
        true;


      this.setCameraEnabled(
        false,
      );


      this.selection.setEnabled(
        false,
      );


      const cameraDirection =
        new THREE.Vector3();


      this.camera.getWorldDirection(
        cameraDirection,
      );


      this.centerDragPlane.setFromNormalAndCoplanarPoint(
        cameraDirection,
        this.pivot.position,
      );


      const hit =
        this.intersectPointerWithCenterPlane(
          event.clientX,
          event.clientY,
        );


      if (
        hit
      ) {

        this.centerDragOffset
          .copy(
            this.pivot.position,
          )
          .sub(
            hit,
          );

      }
      else {

        this.centerDragOffset.set(
          0,
          0,
          0,
        );

      }

    };


  private readonly handleCenterPointerMove =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.active
        || !this.centerDragging
      ) {

        return;

      }


      const hit =
        this.intersectPointerWithCenterPlane(
          event.clientX,
          event.clientY,
        );


      if (
        !hit
      ) {

        return;

      }


      this.pivot.position
        .copy(
          hit,
        )
        .add(
          this.centerDragOffset,
        );


      this.pivot.updateMatrixWorld(
        true,
      );

    };


  private readonly handleCenterPointerUp =
    (
      event:
        PointerEvent,
    ): void => {

      /*
       * SEGUNDO CLIC:
       * aplicar ENDPOINT / MIDPOINT / CENTER al pivote.
       */
      if (
        this.centerArmed
        && this.armedCenterPointerDownActive
      ) {

        this.armedCenterPointerDownActive =
          false;


        const movement =
          Math.hypot(
            event.clientX
            - this.armedCenterPointerDownX,
            event.clientY
            - this.armedCenterPointerDownY,
          );


        if (
          movement <= 5
        ) {

          const snap =
            this.snap.findSnap(
              event.clientX,
              event.clientY,
            );


          if (
            snap
          ) {

            event.preventDefault();


            event.stopPropagation();


            this.pivot.position.copy(
              snap.point,
            );


            this.pivot.updateMatrixWorld(
              true,
            );


            this.centerArmed =
              false;


            this.snap.clearExcludedInstanceIds();


            this.selection.setEnabled(
              true,
            );


            return;

          }

        }


        /*
         * Si no hubo SNAP válido, mantenemos el centro armado
         * para que el usuario pueda intentar otro punto.
         */
        return;

      }


      if (
        !this.centerDragging
      ) {

        return;

      }


      event.preventDefault();


      const movement =
        Math.hypot(
          event.clientX
          - this.centerPointerDownX,
          event.clientY
          - this.centerPointerDownY,
        );


      this.centerDragging =
        false;


      /*
       * CLIC CORTO EN LA ESFERA:
       * no desplaza el pivote; arma el siguiente clic SNAP.
       */
      if (
        movement <= 5
      ) {

        this.pivot.position.copy(
          this.centerDragStartPivot,
        );


        this.pivot.updateMatrixWorld(
          true,
        );


        this.centerArmed =
          true;


        /*
         * A diferencia de mover piezas, aquí sí queremos
         * poder elegir SNAPs de la propia selección.
         */
        this.snap.clearExcludedInstanceIds();


        this.setCameraEnabled(
          true,
        );


        this.selection.setEnabled(
          false,
        );


        return;

      }


      /*
       * ARRASTRE NORMAL:
       * mantener exactamente el comportamiento existente.
       */
      this.centerArmed =
        false;


      this.snap.clearExcludedInstanceIds();


      this.setCameraEnabled(
        true,
      );


      window.setTimeout(
        () => {

          if (
            this.disposed
          ) {

            return;

          }


          this.selection.setEnabled(
            true,
          );

        },
        0,
      );

    };


  private pickCenterHandle(
    clientX: number,
    clientY: number,
  ): boolean {

    this.setPointerFromClient(
      clientX,
      clientY,
    );


    this.centerRaycaster.setFromCamera(
      this.centerPointer,
      this.camera,
    );


    return (
      this.centerRaycaster
        .intersectObject(
          this.centerHandle,
          false,
        )
        .length
      > 0
    );

  }


  private intersectPointerWithCenterPlane(
    clientX: number,
    clientY: number,
  ):
    THREE.Vector3
    | null {

    this.setPointerFromClient(
      clientX,
      clientY,
    );


    this.centerRaycaster.setFromCamera(
      this.centerPointer,
      this.camera,
    );


    const intersection =
      this.centerRaycaster.ray
        .intersectPlane(
          this.centerDragPlane,
          this.centerDragPoint,
        );


    return intersection
      ? this.centerDragPoint
      : null;

  }


  private setPointerFromClient(
    clientX: number,
    clientY: number,
  ): void {

    const rect =
      this.domElement
        .getBoundingClientRect();


    this.centerPointer.x =
      (
        (
          clientX
          - rect.left
        )
        / rect.width
      )
      * 2
      - 1;


    this.centerPointer.y =
      -(
        (
          clientY
          - rect.top
        )
        / rect.height
      )
      * 2
      + 1;

  }


  // ==========================================================
  // COMMIT
  // ==========================================================

  private commitTransforms():
    void {

    for (
      const [
        instanceId,
        object,
      ]
      of this.transformedObjects
    ) {

      this.designModel
        .pieceInstances
        .updateTransform(
          instanceId,
          {

            position: {

              x:
                object.position.x,

              y:
                object.position.y,

              z:
                object.position.z,

            },

            rotation: {

              x:
                object.rotation.x,

              y:
                object.rotation.y,

              z:
                object.rotation.z,

            },

          },
        );

    }


    this.selection.refreshHelpers();

  }


  // ==========================================================
  // DISPOSE
  // ==========================================================

  dispose(): void {

    if (
      this.disposed
    ) {

      return;

    }


    this.disposed =
      true;


    this.unsubscribeSelection
      ?.();


    this.unsubscribeSelection =
      null;


    this.controls.removeEventListener(
      "mouseDown",
      this.handleRotateStart,
    );


    this.controls.removeEventListener(
      "objectChange",
      this.handleRotateChange,
    );


    this.controls.removeEventListener(
      "mouseUp",
      this.handleRotateEnd,
    );


    this.domElement.removeEventListener(
      "pointerdown",
      this.handleCenterPointerDown,
      true,
    );


    window.removeEventListener(
      "pointermove",
      this.handleCenterPointerMove,
    );


    window.removeEventListener(
      "pointerup",
      this.handleCenterPointerUp,
    );


    this.deactivate();


    this.scene.remove(
      this.helper,
    );


    this.scene.remove(
      this.pivot,
    );


    this.centerHandle.geometry.dispose();


    if (
      Array.isArray(
        this.centerHandle.material,
      )
    ) {

      for (
        const material
        of this.centerHandle.material
      ) {

        material.dispose();

      }

    }
    else {

      this.centerHandle.material.dispose();

    }


    this.controls.dispose();

  }

}
