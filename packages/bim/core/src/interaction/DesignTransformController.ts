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
  MoveNumericAxis,
} from "./CadNumericInputController";

import type {
  CadHistoryController,
  CadTransformSnapshot,
} from "./CadHistoryController";

import type {
  DesignSnapController,
} from "./DesignSnapController";


export type DesignTransformMode =
  | "translate"
  | "rotate";


export class DesignTransformController {

  private readonly scene:
    THREE.Scene;


  private readonly domElement:
    HTMLElement;


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


  private readonly transformedObjects =
    new Map<
      string,
      THREE.Object3D
    >();


  private previousPivotPosition =
    new THREE.Vector3();


  private previousPivotQuaternion =
    new THREE.Quaternion();


  private dragMode:
    | "NONE"
    | "MOVE_OBJECTS"
    | "MOVE_PIVOT"
    | "ROTATE_OBJECTS" =
      "NONE";


  private active =
    false;


  private disposed =
    false;


  private unsubscribeSelection:
    (() => void) | null =
      null;


  private onNumericAxis:
    (
      axis: MoveNumericAxis,
    ) => void =
      () => {};


  private dragHistoryStart:
    CadTransformSnapshot
    | null =
      null;


  private activeMoveAxis:
    MoveNumericAxis
    | "XYZ"
    | null =
      null;


  private armedMoveAxis:
    MoveNumericAxis
    | null =
      null;


  private readonly dragStartPivotPosition =
    new THREE.Vector3();


  private ignoreNextArmedPointerUp =
    false;


  private armedPointerDownX =
    0;


  private armedPointerDownY =
    0;


  private armedPointerDownActive =
    false;


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
      "translate",
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
      "FrameLogicTransformPivot";


    this.scene.add(
      this.pivot,
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
      this.handleTransformStart,
    );


    this.controls.addEventListener(
      "objectChange",
      this.handleTransformChange,
    );


    this.controls.addEventListener(
      "mouseUp",
      this.handleTransformEnd,
    );


    this.domElement.addEventListener(
      "pointerdown",
      this.handleArmedPointerDown,
      true,
    );


    this.domElement.addEventListener(
      "pointerup",
      this.handleArmedPointerUp,
      true,
    );


    this.controls.detach();

  }


  // ==========================================================
  // ACTIVATE
  // ==========================================================

  activate(
    mode:
      DesignTransformMode =
        "translate",
  ): boolean {

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
    ) {

      this.deactivate();

      return false;

    }


    if (
      !this.syncSelectedObjects(
        selectedIds,
      )
    ) {

      this.deactivate();

      return false;

    }


    this.controls.setMode(
      mode,
    );


    this.active =
      true;


    /*
     * Cada comando empieza desde el punto base
     * de la selección actual.
     */
    this.resetPivotToSelectionBase();


    this.controls.attach(
      this.pivot,
    );


    this.dragMode =
      "NONE";


    return true;

  }


  // ==========================================================
  // DEACTIVATE
  // ==========================================================

  deactivate(): void {

    /*
     * Cualquier cancelación devuelve el pivot
     * al punto base antes de ocultar el gizmo.
     */
    this.resetPivotToSelectionBase();


    this.active =
      false;


    this.transformedObjects.clear();


    this.dragMode =
      "NONE";


    this.dragHistoryStart =
      null;


    this.activeMoveAxis =
      null;


    this.armedMoveAxis =
      null;


    this.ignoreNextArmedPointerUp =
      false;


    this.armedPointerDownActive =
      false;


    this.snap.clearExcludedInstanceIds();


    this.controls.detach();


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
     * OrthoPerspectiveCamera puede reemplazar la instancia
     * THREE.Camera al alternar perspectiva/ortográfica.
     *
     * TransformControls debe usar siempre la cámara activa
     * también para su raycast interno.
     */
    this.controls.camera =
      camera;

  }


  setNumericAxisHandler(
    handler:
      (
        axis: MoveNumericAxis,
      ) => void,
  ): void {

    this.onNumericAxis =
      handler;

  }


  applyNumericMove(
    axis:
      MoveNumericAxis,

    first:
      number,

    second = 0,
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


    const delta =
      new THREE.Vector3();


    switch (
      axis
    ) {

      case "X":

        delta.x =
          first;

        break;


      case "Y":

        delta.y =
          first;

        break;


      case "Z":

        delta.z =
          first;

        break;


      case "XY":

        delta.set(
          first,
          second,
          0,
        );

        break;


      case "XZ":

        delta.set(
          first,
          0,
          second,
        );

        break;


      case "YZ":

        delta.set(
          0,
          first,
          second,
        );

        break;

    }


    for (
      const object
      of this.transformedObjects.values()
    ) {

      object.position.add(
        delta,
      );


      object.updateMatrix();


      object.updateMatrixWorld(
        true,
      );

    }


    this.pivot.position.add(
      delta,
    );


    this.pivot.updateMatrixWorld(
      true,
    );


    this.previousPivotPosition.copy(
      this.pivot.position,
    );


    this.commitTransforms();


    this.history.recordTransform(
      "MOVE",
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


      this.transformedObjects.set(
        instanceId,
        object,
      );

    }


    return (
      this.transformedObjects.size
      > 0
    );

  }


  // ==========================================================
  // SELECTION BASE
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
     * Los ejes del gizmo representan el sistema
     * cartesiano mundial.
     */
    this.pivot.quaternion.identity();


    this.pivot.updateMatrixWorld(
      true,
    );


    this.previousPivotPosition.copy(
      this.pivot.position,
    );


    this.previousPivotQuaternion.copy(
      this.pivot.quaternion,
    );

  }


  // ==========================================================
  // SELECTION CHANGED
  // ==========================================================

  private handleSelectionChanged(
    selectedIds:
      readonly string[],
  ): void {

    /*
     * Seleccionar normalmente no muestra gizmo.
     */
    if (
      !this.active
    ) {

      this.controls.detach();

      return;

    }


    /*
     * Una selección nueva NO cancela el comando.
     * MOVE/ROTATE continúa sobre las nuevas piezas.
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
     * Al cambiar las piezas seleccionadas,
     * el pivot temporal anterior deja de aplicar.
     */
    this.resetPivotToSelectionBase();


    this.controls.attach(
      this.pivot,
    );


    this.dragMode =
      "NONE";


    this.activeMoveAxis =
      null;


    this.armedMoveAxis =
      null;


    this.armedPointerDownActive =
      false;


    this.snap.clearExcludedInstanceIds();

  }


  // ==========================================================
  // TRANSFORM START
  // ==========================================================

  private readonly handleTransformStart =
    (): void => {

      if (
        !this.active
      ) {

        return;

      }


      this.previousPivotPosition.copy(
        this.pivot.position,
      );


      this.dragStartPivotPosition.copy(
        this.pivot.position,
      );


      this.armedMoveAxis =
        null;


      this.armedPointerDownActive =
        false;


      this.previousPivotQuaternion.copy(
        this.pivot.quaternion,
      );


      if (
        this.controls.getMode()
        === "rotate"
      ) {

        this.dragMode =
          "ROTATE_OBJECTS";

      }
      else {

        const axis =
          this.controls.axis;


        this.activeMoveAxis =
          (
            axis === "X"
            || axis === "Y"
            || axis === "Z"
            || axis === "XY"
            || axis === "XZ"
            || axis === "YZ"
            || axis === "XYZ"
          )
            ? axis
            : null;


        this.dragMode =
          axis === "XYZ"
            ? "MOVE_PIVOT"
            : "MOVE_OBJECTS";


        if (
          this.dragMode
          === "MOVE_OBJECTS"
        ) {

          this.snap.setExcludedInstanceIds(
            this.selection
              .getSelectedIds(),
          );

        }
        else {

          this.snap.clearExcludedInstanceIds();

        }


        if (
          axis === "X"
          || axis === "Y"
          || axis === "Z"
          || axis === "XY"
          || axis === "XZ"
          || axis === "YZ"
        ) {

          this.onNumericAxis(
            axis,
          );

        }

      }


      this.dragHistoryStart =
        this.dragMode
          === "MOVE_OBJECTS"
          ? this.history.capture(
              this.selection
                .getSelectedIds(),
            )
          : null;


      this.setCameraEnabled(
        false,
      );


      this.selection.setEnabled(
        false,
      );

    };


  // ==========================================================
  // TRANSFORM CHANGE
  // ==========================================================

  private readonly handleTransformChange =
    (): void => {

      if (
        !this.active
        || this.transformedObjects.size
          < 1
      ) {

        return;

      }


      if (
        this.controls.getMode()
        === "translate"
      ) {

        this.handleTranslateChange();

        return;

      }


      this.handleRotateChange();

    };


  private handleTranslateChange():
    void {

    const delta =
      new THREE.Vector3()
        .subVectors(
          this.pivot.position,
          this.previousPivotPosition,
        );


    // --------------------------------------------------------
    // CENTRO DEL GIZMO = MOVER SOLO PIVOT
    // --------------------------------------------------------

    if (
      this.dragMode
      === "MOVE_PIVOT"
    ) {


      this.previousPivotPosition.copy(
        this.pivot.position,
      );


      return;

    }


    // --------------------------------------------------------
    // EJES / PLANOS = MOVER TODA LA SELECCIÓN
    // --------------------------------------------------------

    for (
      const object
      of this.transformedObjects.values()
    ) {

      object.position.add(
        delta,
      );


      object.updateMatrix();


      object.updateMatrixWorld(
        true,
      );

    }


    this.previousPivotPosition.copy(
      this.pivot.position,
    );


    this.selection.refreshHelpers();

  }


  private handleRotateChange():
    void {

    if (
      this.dragMode
      !== "ROTATE_OBJECTS"
    ) {

      return;

    }


    const inversePrevious =
      this.previousPivotQuaternion
        .clone()
        .invert();


    const deltaQuaternion =
      this.pivot.quaternion
        .clone()
        .multiply(
          inversePrevious,
        );


    for (
      const object
      of this.transformedObjects.values()
    ) {

      const offset =
        object.position
          .clone()
          .sub(
            this.pivot.position,
          );


      offset.applyQuaternion(
        deltaQuaternion,
      );


      object.position.copy(
        this.pivot.position
          .clone()
          .add(
            offset,
          ),
      );


      object.quaternion.premultiply(
        deltaQuaternion,
      );


      object.updateMatrix();


      object.updateMatrixWorld(
        true,
      );

    }


    this.previousPivotQuaternion.copy(
      this.pivot.quaternion,
    );


    this.selection.refreshHelpers();

  }


  // ==========================================================
  // TRANSFORM END
  // ==========================================================

  private readonly handleTransformEnd =
    (): void => {

      if (
        !this.active
      ) {

        return;

      }


      if (
        this.controls.getMode()
        === "translate"
      ) {

        this.applySnapAtTransformEnd();

      }


      if (
        this.dragMode
        === "MOVE_OBJECTS"
        || this.dragMode
          === "ROTATE_OBJECTS"
      ) {

        this.commitTransforms();


        if (
          this.dragHistoryStart
        ) {

          this.history.recordTransform(
            "MOVE",
            this.dragHistoryStart,
            this.selection
              .getSelectedIds(),
          );

        }

      }


      const movedDistance =
        this.pivot.position
          .distanceTo(
            this.dragStartPivotPosition,
          );


      const clickedAxis =
        this.controls.getMode()
          === "translate"
        && this.dragMode
          === "MOVE_OBJECTS"
        && this.activeMoveAxis
          !== null
        && this.activeMoveAxis
          !== "XYZ"
        && movedDistance
          <= 1e-9;


      this.dragHistoryStart =
        null;


      if (
        clickedAxis
      ) {

        this.armedMoveAxis =
          this.activeMoveAxis;


        /*
         * El mismo pointerup que termina el clic del gizmo
         * no debe interpretarse como clic de destino.
         */
        this.ignoreNextArmedPointerUp =
          true;


        /*
         * Mientras esperamos el segundo clic, la selección
         * queda bloqueada para que el destino SNAP no cambie
         * las piezas que se están moviendo.
         */
        this.selection.setEnabled(
          false,
        );


        this.snap.setExcludedInstanceIds(
          this.selection
            .getSelectedIds(),
        );

      }
      else {

        this.armedMoveAxis =
          null;


        this.snap.clearExcludedInstanceIds();

      }


      this.activeMoveAxis =
        null;


      this.dragMode =
        "NONE";


      this.setCameraEnabled(
        true,
      );


      if (
        !clickedAxis
      ) {

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

      }

    };


  private readonly handleArmedPointerDown =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.active
        || !this.armedMoveAxis
        || event.button !== 0
      ) {

        return;

      }


      this.armedPointerDownX =
        event.clientX;


      this.armedPointerDownY =
        event.clientY;


      this.armedPointerDownActive =
        true;

    };


  private readonly handleArmedPointerUp =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.active
        || !this.armedMoveAxis
        || event.button !== 0
      ) {

        return;

      }


      if (
        this.ignoreNextArmedPointerUp
      ) {

        this.ignoreNextArmedPointerUp =
          false;


        return;

      }


      if (
        !this.armedPointerDownActive
      ) {

        return;

      }


      this.armedPointerDownActive =
        false;


      const movement =
        Math.hypot(
          event.clientX
          - this.armedPointerDownX,
          event.clientY
          - this.armedPointerDownY,
        );


      /*
       * Si hubo arrastre, asumimos navegación de cámara.
       * El eje sigue armado para intentar de nuevo.
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


      if (
        !snap
      ) {

        return;

      }


      event.preventDefault();


      event.stopPropagation();


      const before =
        this.history.capture(
          this.selection
            .getSelectedIds(),
        );


      const correction =
        this.getConstrainedSnapCorrection(
          this.armedMoveAxis,
          snap.point,
        );


      if (
        correction.lengthSq()
        > 1e-18
      ) {

        for (
          const object
          of this.transformedObjects.values()
        ) {

          object.position.add(
            correction,
          );


          object.updateMatrix();


          object.updateMatrixWorld(
            true,
          );

        }


        this.pivot.position.add(
          correction,
        );


        this.pivot.updateMatrixWorld(
          true,
        );


        this.previousPivotPosition.copy(
          this.pivot.position,
        );


        this.commitTransforms();


        this.history.recordTransform(
          "MOVE",
          before,
          this.selection
            .getSelectedIds(),
        );

      }


      this.armedMoveAxis =
        null;


      this.snap.clearExcludedInstanceIds();


      this.selection.setEnabled(
        true,
      );

    };


  private getConstrainedSnapCorrection(
    axis:
      MoveNumericAxis,

    targetPoint:
      THREE.Vector3,
  ):
    THREE.Vector3 {

    const correction =
      targetPoint
        .clone()
        .sub(
          this.pivot.position,
        );


    switch (
      axis
    ) {

      case "X":

        correction.set(
          correction.x,
          0,
          0,
        );

        break;


      case "Y":

        correction.set(
          0,
          correction.y,
          0,
        );

        break;


      case "Z":

        correction.set(
          0,
          0,
          correction.z,
        );

        break;


      case "XY":

        correction.z =
          0;

        break;


      case "XZ":

        correction.y =
          0;

        break;


      case "YZ":

        correction.x =
          0;

        break;

    }


    return correction;

  }


  private applySnapAtTransformEnd():
    void {

    const snap =
      this.snap
        .getSnapAtCurrentPointer();


    if (
      !snap
      || !this.activeMoveAxis
    ) {

      return;

    }


    const correction =
      this.activeMoveAxis
        === "XYZ"
        ? snap.point
            .clone()
            .sub(
              this.pivot.position,
            )
        : this.getConstrainedSnapCorrection(
            this.activeMoveAxis,
            snap.point,
          );


    if (
      correction.lengthSq()
      <= 1e-18
    ) {

      return;

    }


    if (
      this.dragMode
      === "MOVE_OBJECTS"
    ) {

      for (
        const object
        of this.transformedObjects.values()
      ) {

        object.position.add(
          correction,
        );


        object.updateMatrix();


        object.updateMatrixWorld(
          true,
        );

      }

    }


    this.pivot.position.add(
      correction,
    );


    this.pivot.updateMatrixWorld(
      true,
    );


    this.previousPivotPosition.copy(
      this.pivot.position,
    );


    this.selection.refreshHelpers();

  }


  // ==========================================================
  // COMMIT TRANSFORMS
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


      object.updateMatrix();


      object.updateMatrixWorld(
        true,
      );

    }


    this.selection.refreshHelpers();

  }


  // ==========================================================
  // MODE
  // ==========================================================

  setMode(
    mode:
      DesignTransformMode,
  ): void {

    this.controls.setMode(
      mode,
    );

  }


  getMode():
    DesignTransformMode {

    return (
      this.controls.getMode()
      === "rotate"
    )
      ? "rotate"
      : "translate";

  }


  // ==========================================================
  // SPACE
  // ==========================================================

  setSpace(
    space:
      "world"
      | "local",
  ): void {

    this.controls.setSpace(
      space,
    );

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
      this.handleTransformStart,
    );


    this.controls.removeEventListener(
      "objectChange",
      this.handleTransformChange,
    );


    this.controls.removeEventListener(
      "mouseUp",
      this.handleTransformEnd,
    );


    this.domElement.removeEventListener(
      "pointerdown",
      this.handleArmedPointerDown,
      true,
    );


    this.domElement.removeEventListener(
      "pointerup",
      this.handleArmedPointerUp,
      true,
    );


    this.deactivate();


    this.scene.remove(
      this.helper,
    );


    this.scene.remove(
      this.pivot,
    );


    this.controls.dispose();

  }

}
