import * as THREE from "three";

import type {
  DesignModel,
  PieceInstance,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";


// ============================================================
// SURFACE HIT
// ============================================================

export interface DesignSurfaceHit {

  readonly point:
    THREE.Vector3;

  readonly distance:
    number;

  readonly modelId:
    string;

  readonly localId:
    number;

}


// ============================================================
// SURFACE PICKER
// ============================================================

export type DesignSurfacePicker =
  (
    clientX: number,
    clientY: number,
  ) =>
    Promise<
      DesignSurfaceHit
      | null
    >;


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


  private readonly surfacePicker:
    DesignSurfacePicker;


  // ==========================================================
  // FALLBACK RAYCAST
  // ==========================================================

  private readonly raycaster =
    new THREE.Raycaster();


  private readonly pointer =
    new THREE.Vector2();


  // ==========================================================
  // FALLBACK WORK PLANE
  //
  // Horizontal plane:
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

  // Paso 1 = ubicación; paso 2 = dirección horizontal del eje +X local.
  private placementOrigin: THREE.Vector3 | null = null;


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
  // ASYNC PICK CONTROL
  //
  // Evita que un raycast antiguo mueva la pieza después
  // de haber llegado un resultado más reciente.
  // ==========================================================

  private pickRequestId =
    0;


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
    surfacePicker: DesignSurfacePicker,
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


    this.surfacePicker =
      surfacePicker;


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
    // --------------------------------------------------------

    const preview =
      prototype.clone(
        true,
      );


    preview.name =
      `PlacementPreview:${definition.code}`;


    preview.visible =
      false;


    // --------------------------------------------------------
    // PREVIEW MATERIAL
    //
    // Geometría compartida.
    // Material independiente semitransparente.
    // --------------------------------------------------------

    preview.traverse(
      (
        child,
      ) => {

        if (
          !(
            child
            instanceof THREE.Mesh
          )
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
    this.placementOrigin = null;


    // --------------------------------------------------------
    // CURSOR
    // --------------------------------------------------------

    this.previousCursor =
      this.domElement.style.cursor;


    this.domElement.style.cursor =
      "crosshair";


    // --------------------------------------------------------
    // WAIT FOR CLICK / CANCEL
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
  // SET PREVIEW POINT
  // ==========================================================

  private assetTranslationForAnchor(anchor: THREE.Vector3, yaw: number): THREE.Vector3 {
    const definition = this.activeDefinitionId
      ? this.designModel.pieceDefinitions.get(this.activeDefinitionId)
      : undefined;
    if (!definition?.coordinateSystem) return anchor.clone();
    const { origin } = definition.coordinateSystem;
    const offset = new THREE.Vector3(origin.x, origin.y, origin.z)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    return anchor.clone().sub(offset);
  }

  private setPreviewPoint(
    point:
      THREE.Vector3,
  ): void {

    const preview =
      this.preview;


    if (
      !preview
    ) {

      return;

    }


    const origin = this.placementOrigin;
    if (origin) {
      preview.position.copy(origin);
      const dx = point.x - origin.x;
      const dz = point.z - origin.z;
      if (Math.hypot(dx, dz) > 1e-6) {
        preview.rotation.y = -Math.atan2(dz, dx);
      }
      preview.position.copy(this.assetTranslationForAnchor(origin, preview.rotation.y));
    } else {
      preview.rotation.y = 0;
      preview.position.copy(this.assetTranslationForAnchor(point, 0));
    }


    preview.visible =
      true;


    preview.updateMatrix();


    preview.updateMatrixWorld(
      true,
    );


    this.currentPoint =
      point.clone();

  }


  // ==========================================================
  // UPDATE POINTER POSITION
  //
  // ORDER:
  //
  // 1. IFC reference surface
  // 2. Fallback work plane Y = 0
  // ==========================================================

  private async updatePointerPosition(
    event:
      PointerEvent,
  ): Promise<boolean> {

    if (
      !this.preview
      || !this.isPlacing
    ) {

      return false;

    }


    const requestId =
      ++this.pickRequestId;


    // --------------------------------------------------------
    // 1. TRY IFC REFERENCE SURFACE
    // --------------------------------------------------------

    let surfaceHit:
      DesignSurfaceHit
      | null =
        null;


    try {

      surfaceHit =
        await this.surfacePicker(
          event.clientX,
          event.clientY,
        );

    }
    catch (
      error
    ) {

      console.error(
        "Reference surface raycast failed:",
        error,
      );

    }


    // --------------------------------------------------------
    // IGNORE OLD ASYNC RESULT
    // --------------------------------------------------------

    if (
      requestId
      !== this.pickRequestId
      || !this.preview
      || !this.isPlacing
    ) {

      return false;

    }


    // --------------------------------------------------------
    // IFC SURFACE FOUND
    // --------------------------------------------------------

    if (
      surfaceHit
    ) {

      this.setPreviewPoint(
        surfaceHit.point,
      );


      return true;

    }


    // --------------------------------------------------------
    // 2. FALLBACK TO Y = 0
    // --------------------------------------------------------

    return this.updateFromWorkPlane(
      event,
    );

  }


  // ==========================================================
  // FALLBACK WORK PLANE
  // ==========================================================

  private updateFromWorkPlane(
    event:
      PointerEvent,
  ): boolean {

    const preview =
      this.preview;


    if (
      !preview
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

      preview.visible =
        false;


      this.currentPoint =
        null;


      return false;

    }


    this.setPreviewPoint(
      intersection,
    );


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


      void this.updatePointerPosition(
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

      void this.processPointerUp(
        event,
      );

    };


  // ==========================================================
  // PROCESS POINTER UP
  // ==========================================================

  private async processPointerUp(
    event:
      PointerEvent,
  ): Promise<void> {

    if (
      !this.isPlacing
      || event.button !== 0
      || !this.pointerDownActive
    ) {

      return;

    }


    this.pointerDownActive =
      false;


    // --------------------------------------------------------
    // DISTINGUISH CLICK FROM CAMERA DRAG
    // --------------------------------------------------------

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


    // --------------------------------------------------------
    // FINAL PICK
    // --------------------------------------------------------

    const updated =
      await this.updatePointerPosition(
        event,
      );


    if (
      !updated
    ) {

      return;

    }


    const point =
      this.currentPoint
        ?.clone();


    if (
      !point
    ) {

      return;

    }


    this.confirmPlacement(
      point,
    );

  }


  // ==========================================================
  // POINTER LEAVE
  // ==========================================================

  private readonly handlePointerLeave =
    (): void => {

      // Invalidamos raycasts pendientes.
      ++this.pickRequestId;


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


    // El primer clic fija la ubicación sin terminar la inserción.
    if (!this.placementOrigin) {
      this.placementOrigin = point.clone();
      this.setPreviewPoint(point);
      return;
    }
    const origin = this.placementOrigin;
    const dx = point.x - origin.x;
    const dz = point.z - origin.z;
    if (Math.hypot(dx, dz) <= 1e-6) return;
    const yaw = -Math.atan2(dz, dx);
    const translation = this.assetTranslationForAnchor(origin, yaw);

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
                translation.x,

              y:
                translation.y,

              z:
                translation.z,

            },

            rotation: {

              x:
                0,

              y:
                yaw,

              z:
                0,

            },

          },

          tags:
            [],

        });


    // --------------------------------------------------------
    // DOMAIN -> VISUAL SCENE
    // --------------------------------------------------------

    this.designScene.sync();


    // --------------------------------------------------------
    // RESOLVE
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

    // Invalidamos cualquier raycast pendiente.
    ++this.pickRequestId;


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
    this.placementOrigin = null;


    this.resolver =
      null;


    this.pointerDownActive =
      false;


    // --------------------------------------------------------
    // CURSOR
    // --------------------------------------------------------

    this.domElement.style.cursor =
      this.previousCursor;


    this.previousCursor =
      "";

  }


  // ==========================================================
  // DISPOSE PREVIEW MATERIALS
  //
  // Geometry must NOT be disposed because it is shared
  // with the reusable PieceDefinition prototype.
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
          !(
            child
            instanceof THREE.Mesh
          )
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


    // Invalidamos también cualquier callback async pendiente.
    ++this.pickRequestId;


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