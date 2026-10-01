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


export class DesignRotateController {

  private readonly scene:
    THREE.Scene;


  private readonly domElement:
    HTMLElement;


  private readonly camera:
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


  private readonly transformedObjects =
    new Map<
      string,
      THREE.Object3D
    >();


  private previousPivotQuaternion =
    new THREE.Quaternion();


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


    this.transformedObjects.clear();


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


    this.previousPivotQuaternion.copy(
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


      this.previousPivotQuaternion.copy(
        this.pivot.quaternion,
      );


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


      const deltaQuaternion =
        this.pivot.quaternion
          .clone()
          .multiply(
            this.previousPivotQuaternion
              .clone()
              .invert(),
          );


      for (
        const object
        of this.transformedObjects.values()
      ) {

        /*
         * Rotar posición alrededor del centro del gizmo.
         */
        const worldPosition =
          new THREE.Vector3();


        object.getWorldPosition(
          worldPosition,
        );


        const offset =
          worldPosition
            .sub(
              this.pivot.position,
            );


        offset.applyQuaternion(
          deltaQuaternion,
        );


        const nextWorldPosition =
          this.pivot.position
            .clone()
            .add(
              offset,
            );


        if (
          object.parent
        ) {

          object.parent.worldToLocal(
            nextWorldPosition,
          );

        }


        object.position.copy(
          nextWorldPosition,
        );


        /*
         * Rotar orientación de la pieza sobre el mismo eje.
         */
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


      if (
        !this.pickCenterHandle(
          event.clientX,
          event.clientY,
        )
      ) {

        return;

      }


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

      if (
        !this.centerDragging
      ) {

        return;

      }


      event.preventDefault();


      this.centerDragging =
        false;


      /*
       * Cambiar el centro NO transforma ni hace commit
       * de las piezas. Solo cambia el centro temporal.
       */
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
