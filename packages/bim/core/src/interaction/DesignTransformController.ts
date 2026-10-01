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


export type DesignTransformMode =
  | "translate"
  | "rotate";


export class DesignTransformController {

  private readonly scene:
    THREE.Scene;


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


  private hasCustomPivot =
    false;


  private active =
    false;


  private disposed =
    false;


  private unsubscribeSelection:
    (() => void) | null =
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

    setCameraEnabled:
      (
        enabled: boolean,
      ) => void,
  ) {

    this.scene =
      scene;


    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.selection =
      selection;


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


    this.hasCustomPivot =
      false;


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

      this.hasCustomPivot =
        false;


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

      this.hasCustomPivot =
        false;


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


    this.hasCustomPivot =
      false;

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


        this.dragMode =
          axis === "XYZ"
            ? "MOVE_PIVOT"
            : "MOVE_OBJECTS";

      }


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

      this.hasCustomPivot =
        true;


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
        this.dragMode
        === "MOVE_OBJECTS"
        || this.dragMode
          === "ROTATE_OBJECTS"
      ) {

        this.commitTransforms();

      }


      this.dragMode =
        "NONE";


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
