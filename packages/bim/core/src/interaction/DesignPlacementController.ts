import * as THREE from "three";

import type {
  DesignModel,
  PieceInstance,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";


// ============================================================
// DESIGN PLACEMENT CONTROLLER
// ============================================================

export class DesignPlacementController {

  // ==========================================================
  // DEPENDENCIES
  // ==========================================================

  private readonly scene:
    THREE.Scene;


  private readonly domElement:
    HTMLElement;


  private readonly cameraProvider:
    () => THREE.Camera;


  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  // ==========================================================
  // RAYCAST
  // ==========================================================

  private readonly raycaster =
    new THREE.Raycaster();


  private readonly pointer =
    new THREE.Vector2();


  // ==========================================================
  // WORK PLANE
  //
  // Horizontal XZ plane:
  //
  // Y = 0
  // ==========================================================

  private readonly workPlane =
    new THREE.Plane(
      new THREE.Vector3(
        0,
        1,
        0,
      ),
      0,
    );


  private readonly intersectionPoint =
    new THREE.Vector3();


  // ==========================================================
  // ACTIVE PLACEMENT
  // ==========================================================

  private activeDefinitionId:
    string
    | null =
      null;


  private preview:
    THREE.Object3D
    | null =
      null;


  private currentPoint:
    THREE.Vector3
    | null =
      null;


      private resolver:
      (
        (
          result:
            PieceInstance
            | null,
        ) => void
      )
      | null =
        null;


  // ==========================================================
  // POINTER STATE
  // ==========================================================

  private pointerDownX =
    0;


  private pointerDownY =
    0;


  private pointerDownActive =
    false;


  private previousCursor =
    "";


  // ==========================================================
  // CONSTRUCTOR
  // ==========================================================

  constructor(
    scene: THREE.Scene,
    domElement: HTMLElement,
    cameraProvider: () => THREE.Camera,
    designModel: DesignModel,
    designScene: DesignSceneController,
  ) {

    this.scene =
      scene;


    this.domElement =
      domElement;


    this.cameraProvider =
      cameraProvider;


    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
    );


    this.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
    );


    this.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
    );


    this.domElement.addEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );


    window.addEventListener(
      "keydown",
      this.handleKeyDown,
    );

  }


  // ==========================================================
  // IS PLACING
  // ==========================================================

  get isPlacing(): boolean {

    return (
      this.activeDefinitionId
      !== null
    );

  }


  // ==========================================================
  // START PLACEMENT
  // ==========================================================

  startPlacement(
    definitionId: string,
  ): Promise<
    PieceInstance
    | null
  > {

    // --------------------------------------------------------
    // CANCEL PREVIOUS PLACEMENT
    // --------------------------------------------------------

    if (
      this.isPlacing
    ) {

      this.cancelPlacement();

    }


    // --------------------------------------------------------
    // FIND DEFINITION
    // --------------------------------------------------------

    const definition =
      this.designModel
        .pieceDefinitions
        .get(
          definitionId,
        );


    if (
      !definition
    ) {

      throw new Error(
        `Piece definition "${definitionId}" does not exist.`,
      );

    }


    // --------------------------------------------------------
    // FIND VISUAL PROTOTYPE
    // --------------------------------------------------------

    const prototype =
      this.designScene
        .getAssetPrototype(
          definition.geometryAssetId,
        );


    if (
      !prototype
    ) {

      throw new Error(
        `No visual prototype exists for asset "${definition.geometryAssetId}".`,
      );

    }


    // --------------------------------------------------------
    // CREATE PREVIEW
    //
    // Hierarchy is cloned.
    // Geometry remains shared.
    // Materials are cloned because opacity is preview-only.
    // --------------------------------------------------------

    const preview =
      prototype.clone(
        true,
      );


    preview.name =
      `PlacementPreview:${definition.code}`;


    preview.visible =
      false;


    preview.traverse(
      (
        child,
      ) => {

        if (
          !(child instanceof THREE.Mesh)
        ) {

          return;

        }


        if (
          Array.isArray(
            child.material,
          )
        ) {

          child.material =
            child.material.map(
              (
                material,
              ) =>
                this.createPreviewMaterial(
                  material,
                ),
            );

        }
        else {

          child.material =
            this.createPreviewMaterial(
              child.material,
            );

        }

      },
    );


    // --------------------------------------------------------
    // ADD PREVIEW
    // --------------------------------------------------------

    this.scene.add(
      preview,
    );


    this.preview =
      preview;


    this.activeDefinitionId =
      definitionId;


    this.currentPoint =
      null;


    // --------------------------------------------------------
    // CURSOR
    // --------------------------------------------------------

    this.previousCursor =
      this.domElement.style.cursor;


    this.domElement.style.cursor =
      "crosshair";


    // --------------------------------------------------------
    // WAIT FOR CLICK OR CANCEL
    // --------------------------------------------------------

    return new Promise<
      PieceInstance
      | null
    >(
      (
        resolve,
      ) => {

        this.resolver =
          resolve;

      },
    );

  }


  // ==========================================================
  // CREATE PREVIEW MATERIAL
  // ==========================================================

  private createPreviewMaterial(
    source:
      THREE.Material,
  ): THREE.Material {

    const material =
      source.clone();


    material.transparent =
      true;


    material.opacity =
      0.35;


    material.depthWrite =
      false;


    material.needsUpdate =
      true;


    return material;

  }


  // ==========================================================
  // UPDATE POINTER POSITION
  // ==========================================================

  private updatePointerPosition(
    event:
      PointerEvent,
  ): boolean {

    if (
      !this.preview
    ) {

      return false;

    }


    const rect =
      this.domElement
        .getBoundingClientRect();


    if (
      rect.width <= 0
      || rect.height <= 0
    ) {

      return false;

    }


    // --------------------------------------------------------
    // SCREEN -> NDC
    // --------------------------------------------------------

    this.pointer.x =
      (
        (
          event.clientX
          - rect.left
        )
        / rect.width
      )
      * 2
      - 1;


    this.pointer.y =
      -(
        (
          event.clientY
          - rect.top
        )
        / rect.height
      )
      * 2
      + 1;


    // --------------------------------------------------------
    // RAY
    // --------------------------------------------------------

    this.raycaster.setFromCamera(
      this.pointer,
      this.cameraProvider(),
    );


    // --------------------------------------------------------
    // INTERSECTION WITH Y = 0
    // --------------------------------------------------------

    const intersection =
      this.raycaster.ray
        .intersectPlane(
          this.workPlane,
          this.intersectionPoint,
        );


    if (
      !intersection
    ) {

      this.preview.visible =
        false;


      this.currentPoint =
        null;


      return false;

    }


    // --------------------------------------------------------
    // PREVIEW POSITION
    // --------------------------------------------------------

    this.preview.position.set(
      intersection.x,
      intersection.y,
      intersection.z,
    );


    this.preview.visible =
      true;


    this.preview.updateMatrix();


    this.preview.updateMatrixWorld(
      true,
    );


    this.currentPoint =
      intersection.clone();


    return true;

  }


  // ==========================================================
  // POINTER MOVE
  // ==========================================================

  private readonly handlePointerMove =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.isPlacing
      ) {

        return;

      }


      this.updatePointerPosition(
        event,
      );

    };


  // ==========================================================
  // POINTER DOWN
  // ==========================================================

  private readonly handlePointerDown =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.isPlacing
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


  // ==========================================================
  // POINTER UP
  // ==========================================================

  private readonly handlePointerUp =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.isPlacing
        || event.button !== 0
        || !this.pointerDownActive
      ) {

        return;

      }


      this.pointerDownActive =
        false;


      // ------------------------------------------------------
      // DISTINGUISH CLICK FROM CAMERA DRAG
      // ------------------------------------------------------

      const dx =
        event.clientX
        - this.pointerDownX;


      const dy =
        event.clientY
        - this.pointerDownY;


      const movement =
        Math.hypot(
          dx,
          dy,
        );


      if (
        movement > 5
      ) {

        return;

      }


      // Make sure point corresponds to final mouse position.
      if (
        !this.updatePointerPosition(
          event,
        )
      ) {

        return;

      }


      const point =
        this.currentPoint;


      if (
        !point
      ) {

        return;

      }


      this.confirmPlacement(
        point,
      );

    };


  // ==========================================================
  // POINTER LEAVE
  // ==========================================================

  private readonly handlePointerLeave =
    (): void => {

      if (
        this.preview
      ) {

        this.preview.visible =
          false;

      }


      this.currentPoint =
        null;


      this.pointerDownActive =
        false;

    };


  // ==========================================================
  // KEYBOARD
  // ==========================================================

  private readonly handleKeyDown =
    (
      event:
        KeyboardEvent,
    ): void => {

      if (
        !this.isPlacing
      ) {

        return;

      }


      if (
        event.key === "Escape"
      ) {

        this.cancelPlacement();

      }

    };


  // ==========================================================
  // CONFIRM PLACEMENT
  // ==========================================================

  private confirmPlacement(
    point:
      THREE.Vector3,
  ): void {

    const definitionId =
      this.activeDefinitionId;


    if (
      !definitionId
    ) {

      return;

    }


    // --------------------------------------------------------
    // CREATE DOMAIN INSTANCE
    // --------------------------------------------------------

    const instance =
      this.designModel
        .registerPieceInstance({

          definitionId,

          transform: {

            position: {

              x:
                point.x,

              y:
                point.y,

              z:
                point.z,

            },

            rotation: {

              x:
                0,

              y:
                0,

              z:
                0,

            },

          },

          tags:
            [],

        });


    // --------------------------------------------------------
    // DOMAIN -> SCENE
    // --------------------------------------------------------

    this.designScene.sync();


    // --------------------------------------------------------
    // RESOLVE PROMISE
    // --------------------------------------------------------

    const resolver =
      this.resolver;


    this.finishPlacement();


    resolver?.(
      instance,
    );

  }


  // ==========================================================
  // CANCEL PLACEMENT
  // ==========================================================

  cancelPlacement(): void {

    if (
      !this.isPlacing
    ) {

      return;

    }


    const resolver =
      this.resolver;


    this.finishPlacement();


    resolver?.(
      null,
    );

  }


  // ==========================================================
  // FINISH PLACEMENT
  // ==========================================================

  private finishPlacement(): void {

    // --------------------------------------------------------
    // REMOVE PREVIEW
    // --------------------------------------------------------

    if (
      this.preview
    ) {

      this.scene.remove(
        this.preview,
      );


      this.disposePreviewMaterials(
        this.preview,
      );


      this.preview =
        null;

    }


    // --------------------------------------------------------
    // RESET
    // --------------------------------------------------------

    this.activeDefinitionId =
      null;


    this.currentPoint =
      null;


    this.resolver =
      null;


    this.pointerDownActive =
      false;


    // --------------------------------------------------------
    // RESTORE CURSOR
    // --------------------------------------------------------

    this.domElement.style.cursor =
      this.previousCursor;


    this.previousCursor =
      "";

  }


  // ==========================================================
  // DISPOSE PREVIEW MATERIALS
  //
  // Geometry is NOT disposed because it belongs to the
  // reusable asset prototype.
  // ==========================================================

  private disposePreviewMaterials(
    object:
      THREE.Object3D,
  ): void {

    object.traverse(
      (
        child,
      ) => {

        if (
          !(child instanceof THREE.Mesh)
        ) {

          return;

        }


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

      },
    );

  }


  // ==========================================================
  // DISPOSE
  // ==========================================================

  dispose(): void {

    this.cancelPlacement();


    this.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
    );


    this.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
    );


    this.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
    );


    this.domElement.removeEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );


    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
    );

  }

}