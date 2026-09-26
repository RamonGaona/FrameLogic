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


private transformedObject:
  THREE.Object3D | null =
    null;


private previousPivotPosition =
  new THREE.Vector3();

  private dragMode:
  "NONE"
  | "MOVE_OBJECT"
  | "MOVE_PIVOT" =
    "NONE";


private hasCustomPivot =
  false;


  private activeInstanceId:
    string | null =
      null;


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


    /*
     * IMPORTANTE:
     *
     * seleccionar una pieza NO activa el gizmo.
     *
     * Solo actualizamos el objeto conectado si
     * actualmente existe una orden activa.
     */

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


    /*
     * El controlador empieza apagado.
     */

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
      selectedIds.length !== 1
    ) {

      this.deactivate();

      return false;

    }


    const instanceId =
      selectedIds[0];


    const object =
      this.designScene
        .getInstanceObject(
          instanceId,
        );


    if (
      !object
    ) {

      this.deactivate();

      return false;

    }


    this.controls.setMode(
      mode,
    );


    this.active =
  true;


this.activeInstanceId =
  instanceId;


this.transformedObject =
  object;


/*
 * Inicialmente el punto base coincide
 * con el origen de la pieza.
 */

this.active =
  true;

this.activeInstanceId =
  instanceId;

this.transformedObject =
  object;


/*
 * Si todavía no existe un pivot personalizado,
 * arrancamos en el origen de la pieza.
 *
 * Si el usuario ya movió el pivot desde el
 * centro del gizmo, lo conservamos.
 */
if (
  !this.hasCustomPivot
) {

  object.getWorldPosition(
    this.pivot.position,
  );

}


this.previousPivotPosition.copy(
  this.pivot.position,
);

this.pivot.rotation.copy(
  object.rotation,
);

this.pivot.updateMatrixWorld(
  true,
);

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

    this.active =
      false;
  
  
    this.activeInstanceId =
      null;
  
  
    this.transformedObject =
      null;
  
  
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
  // SELECTION CHANGED
  // ==========================================================

  private handleSelectionChanged(
    selectedIds:
      readonly string[],
  ): void {

    /*
     * Si MOVE/ROTATE no está activo,
     * una selección normal NO muestra gizmo.
     */

    if (
      !this.active
    ) {

      this.activeInstanceId =
        null;


      this.controls.detach();


      return;

    }


    if (
      selectedIds.length !== 1
    ) {

      this.deactivate();

      return;

    }


    const instanceId =
      selectedIds[0];


    const object =
      this.designScene
        .getInstanceObject(
          instanceId,
        );


    if (
      !object
    ) {

      this.deactivate();

      return;

    }


    this.activeInstanceId =
  instanceId;
  this.activeInstanceId =
  instanceId;

this.transformedObject =
  object;

/*
 * Al cambiar de selección,
 * el pivot vuelve al origen de la nueva pieza.
 */
this.hasCustomPivot =
  false;

object.getWorldPosition(
  this.pivot.position,
);

this.previousPivotPosition.copy(
  this.pivot.position,
);

this.pivot.rotation.copy(
  object.rotation,
);

this.pivot.updateMatrixWorld(
  true,
);

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


    /*
     * En TransformControls, el control central de translate
     * suele reportarse como "XYZ".
     *
     * Si en tu build reporta otro valor, lo veremos enseguida.
     */
    const axis =
      this.controls.axis;

    this.dragMode =
      axis === "XYZ"
        ? "MOVE_PIVOT"
        : "MOVE_OBJECT";


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
      || !this.transformedObject
    ) {

      return;

    }

    if (
      this.controls.getMode()
      !== "translate"
    ) {

      return;

    }

    const delta =
      new THREE.Vector3()
        .subVectors(
          this.pivot.position,
          this.previousPivotPosition,
        );


    // ======================================================
    // DRAG DEL CENTRO = MOVER SOLO PIVOT
    // ======================================================

    if (
      this.dragMode
      === "MOVE_PIVOT"
    ) {

      this.hasCustomPivot =
        true;

      this.previousPivotPosition.copy(
        this.pivot.position,
      );

      this.selection.refreshHelpers();

      return;

    }


    // ======================================================
    // DRAG NORMAL = MOVER PIEZA
    // ======================================================

    this.transformedObject.position.add(
      delta,
    );

    this.transformedObject.updateMatrix();

    this.transformedObject.updateMatrixWorld(
      true,
    );

    this.previousPivotPosition.copy(
      this.pivot.position,
    );

    this.selection.refreshHelpers();

  };

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
      === "MOVE_OBJECT"
    ) {

      this.commitTransform();

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
  // COMMIT TRANSFORM
  // ==========================================================

  private commitTransform():
    void {

    const instanceId =
      this.activeInstanceId;


    if (
      !instanceId
    ) {

      return;

    }


    const object =
      this.designScene
        .getInstanceObject(
          instanceId,
        );


    if (
      !object
    ) {

      return;

    }


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