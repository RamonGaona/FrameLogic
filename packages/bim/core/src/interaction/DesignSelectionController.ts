import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";


// ============================================================
// TYPES
// ============================================================

export type DesignSelectionListener =
  (
    selectedIds:
      readonly string[],
  ) => void;


// ============================================================
// DESIGN SELECTION CONTROLLER
// ============================================================

export class DesignSelectionController {

  // ==========================================================
  // DEPENDENCIES
  // ==========================================================

  private readonly scene:
    THREE.Scene;


  private readonly domElement:
    HTMLElement;


  private readonly cameraProvider:
    () => THREE.Camera;


  private readonly designScene:
    DesignSceneController;


  private readonly designModel:
    DesignModel
    | null;


  // ==========================================================
  // RAYCAST
  // ==========================================================

  private readonly raycaster =
    new THREE.Raycaster();


  private readonly pointer =
    new THREE.Vector2();


  // ==========================================================
  // SELECTION
  // ==========================================================

  private readonly selectedIds =
    new Set<string>();


  // ==========================================================
  // VISUAL SELECTION HELPERS
  // ==========================================================

  private readonly helpers =
    new Map<
      string,
      THREE.BoxHelper
    >();


  // ==========================================================
  // SUBSCRIBERS
  // ==========================================================

  private readonly listeners =
    new Set<
      DesignSelectionListener
    >();


  // ==========================================================
  // ENABLED
  // ==========================================================

  private enabled =
    true;


  private clearOnEmptyClick =
    true;


  // ==========================================================
  // POINTER STATE
  // ==========================================================

  private pointerDownX =
    0;


  private pointerDownY =
    0;


  private pointerDownActive =
    false;


  // ==========================================================
  // ISOLATION
  //
  // Guarda la visibilidad anterior para restaurarla.
  // ==========================================================

  private isolationSnapshot:
    Map<
      string,
      boolean
    >
    | null =
      null;


  // ==========================================================
  // CONSTRUCTOR
  // ==========================================================

  constructor(
    scene: THREE.Scene,
    domElement: HTMLElement,
    cameraProvider: () => THREE.Camera,
    designScene: DesignSceneController,
    designModel?: DesignModel,
  ) {

    this.scene =
      scene;


    this.domElement =
      domElement;


    this.cameraProvider =
      cameraProvider;


    this.designScene =
      designScene;


    this.designModel =
      designModel
      ?? null;


    this.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
    );


    this.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
    );

  }


  // ==========================================================
  // ENABLE / DISABLE
  // ==========================================================

  setEnabled(
    enabled: boolean,
  ): void {

    this.enabled =
      enabled;


    if (
      !enabled
    ) {

      this.pointerDownActive =
        false;

    }

  }


  get isEnabled(): boolean {

    return this.enabled;

  }


  setClearOnEmptyClick(
    enabled: boolean,
  ): void {

    this.clearOnEmptyClick =
      enabled;

  }


  // ==========================================================
  // GET SELECTION
  // ==========================================================

  getSelectedIds():
    readonly string[] {

    return Array.from(
      this.selectedIds,
    );

  }


  // ==========================================================
  // IS SELECTED
  // ==========================================================

  isSelected(
    instanceId: string,
  ): boolean {

    return this.selectedIds.has(
      instanceId,
    );

  }


  // ==========================================================
  // SUBSCRIBE
  // ==========================================================

  subscribe(
    listener:
      DesignSelectionListener,
  ): () => void {

    this.listeners.add(
      listener,
    );


    listener(
      this.getSelectedIds(),
    );


    return () => {

      this.listeners.delete(
        listener,
      );

    };

  }


  // ==========================================================
  // NOTIFY
  // ==========================================================

  private notify(): void {

    const selectedIds =
      this.getSelectedIds();


    for (
      const listener
      of this.listeners
    ) {

      listener(
        selectedIds,
      );

    }

  }


  // ==========================================================
  // SELECT SINGLE
  // ==========================================================

  selectSingle(
    instanceId: string,
  ): void {

    if (
      !this.isInstanceSelectable(
        instanceId,
      )
    ) {

      return;

    }


    if (
      this.selectedIds.size === 1
      && this.selectedIds.has(
        instanceId,
      )
    ) {

      return;

    }


    this.selectedIds.clear();


    this.selectedIds.add(
      instanceId,
    );


    this.refreshHelpers();

    this.notify();

  }


  // ==========================================================
  // TOGGLE SELECTION
  // ==========================================================

  toggle(
    instanceId: string,
  ): void {

    if (
      !this.selectedIds.has(
        instanceId,
      )
      && !this.isInstanceSelectable(
        instanceId,
      )
    ) {

      return;

    }


    if (
      this.selectedIds.has(
        instanceId,
      )
    ) {

      this.selectedIds.delete(
        instanceId,
      );

    }
    else {

      this.selectedIds.add(
        instanceId,
      );

    }


    this.refreshHelpers();

    this.notify();

  }


  // ==========================================================
  // CLEAR SELECTION
  // ==========================================================

  clearSelection(): void {

    if (
      this.selectedIds.size === 0
    ) {

      return;

    }


    this.selectedIds.clear();


    this.refreshHelpers();

    this.notify();

  }


  // ==========================================================
  // SET SELECTION
  // ==========================================================

  setSelection(
    instanceIds:
      readonly string[],
  ): void {

    this.selectedIds.clear();


    for (
      const instanceId
      of instanceIds
    ) {

      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      if (
        object
        && this.isInstanceSelectable(
          instanceId,
        )
      ) {

        this.selectedIds.add(
          instanceId,
        );

      }

    }


    this.refreshHelpers();

    this.notify();

  }


  // ==========================================================
  // POINTER DOWN
  // ==========================================================

  private readonly handlePointerDown =
    (
      event:
        PointerEvent,
    ): void => {

        

      if (
        !this.enabled
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
        !this.enabled
        || event.button !== 0
        || !this.pointerDownActive
      ) {

        return;

      }


      this.pointerDownActive =
        false;


      // ------------------------------------------------------
      // DIFFERENTIATE CLICK FROM CAMERA DRAG
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


      this.pick(
        event,
      );

    };


  // ==========================================================
  // HIT TEST
  // ==========================================================

  getInstanceIdAt(
    clientX: number,
    clientY: number,
  ):
    string
    | null {

    const rect =
      this.domElement
        .getBoundingClientRect();


    if (
      rect.width <= 0
      || rect.height <= 0
    ) {

      return null;

    }


    this.pointer.x =
      (
        (
          clientX
          - rect.left
        )
        / rect.width
      )
      * 2
      - 1;


    this.pointer.y =
      -(
        (
          clientY
          - rect.top
        )
        / rect.height
      )
      * 2
      + 1;


    this.raycaster.setFromCamera(
      this.pointer,
      this.cameraProvider(),
    );


    const intersections =
      this.raycaster
        .intersectObjects(
          this.designScene
            .getInstanceObjects(),
          true,
        );


    if (
      intersections.length === 0
    ) {

      return null;

    }


    const instanceId =
      this.findInstanceId(
        intersections[0].object,
      );


    return (
      instanceId
      && this.isInstanceSelectable(
        instanceId,
      )
    )
      ? instanceId
      : null;

  }


  // ==========================================================
  // PICK
  // ==========================================================

  private pick(
    event:
      PointerEvent,
  ): void {

    const rect =
      this.domElement
        .getBoundingClientRect();


    if (
      rect.width <= 0
      || rect.height <= 0
    ) {

      return;

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
    // RAYCAST
    // --------------------------------------------------------

    this.raycaster.setFromCamera(
      this.pointer,
      this.cameraProvider(),
    );


    const objects =
  this.designScene
    .getInstanceObjects();





    const intersections =
      this.raycaster
        .intersectObjects(
          objects,
          true,
        );

        


    // --------------------------------------------------------
    // CLICK ON EMPTY SPACE
    // --------------------------------------------------------

    if (
      intersections.length === 0
    ) {

      if (
        this.clearOnEmptyClick
        && !event.ctrlKey
        && !event.metaKey
        && !event.shiftKey
      ) {

        this.clearSelection();

      }


      return;

    }


    // --------------------------------------------------------
    // FIND PIECE INSTANCE ROOT
    // --------------------------------------------------------

    const instanceId =
      this.findInstanceId(
        intersections[0].object,
      );
    

    if (
      !instanceId
      || !this.isInstanceSelectable(
        instanceId,
      )
    ) {

      return;

    }


    // --------------------------------------------------------
    // CTRL / SHIFT = MULTI-SELECTION
    // --------------------------------------------------------

    const multiSelection =
      event.ctrlKey
      || event.metaKey
      || event.shiftKey;


    if (
      multiSelection
    ) {

      this.toggle(
        instanceId,
      );


      return;

    }


    this.selectSingle(
      instanceId,
    );

  }


  // ==========================================================
  // LAYER SELECTABILITY
  // ==========================================================

  private isInstanceSelectable(
    instanceId: string,
  ): boolean {

    if (
      !this.designModel
    ) {

      return true;

    }


    const instance =
      this.designModel
        .pieceInstances
        .get(
          instanceId,
        );


    if (
      !instance
    ) {

      return false;

    }


    const layer =
      this.designModel
        .layers
        .get(
          instance.layerId,
        );


    return (
      layer?.visible
      ?? true
    )
      && !(
        layer?.locked
        ?? false
      );

  }


  // ==========================================================
  // FIND INSTANCE ID
  // ==========================================================

  private findInstanceId(
    object:
      THREE.Object3D,
  ):
    string
    | null {

    let current:
      THREE.Object3D
      | null =
        object;


    while (
      current
    ) {

      const frameLogic =
        current.userData[
          "frameLogic"
        ];


      if (
        frameLogic
        && frameLogic.entityType
          === "PieceInstance"
        && typeof frameLogic.instanceId
          === "string"
      ) {

        return frameLogic.instanceId;

      }


      current =
        current.parent;

    }


    return null;

  }


  // ==========================================================
  // REFRESH VISUAL HELPERS
  // ==========================================================

  refreshHelpers(): void {

    // --------------------------------------------------------
    // REMOVE OLD HELPERS
    // --------------------------------------------------------

    for (
      const helper
      of this.helpers.values()
    ) {

      this.scene.remove(
        helper,
      );


      helper.geometry.dispose();


      helper.material.dispose();

    }


    this.helpers.clear();


    // --------------------------------------------------------
    // CREATE HELPERS FOR CURRENT SELECTION
    // --------------------------------------------------------

    for (
      const instanceId
      of this.selectedIds
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


      const helper =
        new THREE.BoxHelper(
          object,
        );


      helper.name =
        `Selection:${instanceId}`;


      helper.raycast =
        () => {};


      this.scene.add(
        helper,
      );


      this.helpers.set(
        instanceId,
        helper,
      );

    }

  }


  // ==========================================================
  // REMOVE MISSING SELECTIONS
  // ==========================================================

  refresh(): void {

    let changed =
      false;


    for (
      const instanceId
      of Array.from(
        this.selectedIds,
      )
    ) {

      if (
        !this.designScene
          .getInstanceObject(
            instanceId,
          )
      ) {

        this.selectedIds.delete(
          instanceId,
        );


        changed =
          true;

      }

    }


    this.refreshHelpers();


    if (
      changed
    ) {

      this.notify();

    }

  }


  // ==========================================================
  // ISOLATION
  // ==========================================================

  isolateSelection(): boolean {

    if (
      this.selectedIds.size === 0
    ) {

      return false;

    }


    // Si ya está aislado, primero restauramos.
    if (
      this.isolationSnapshot
    ) {

      this.exitIsolation();

    }


    const snapshot =
      new Map<
        string,
        boolean
      >();


    for (
      const [
        instanceId,
        object,
      ]
      of this.designScene
        .getInstanceEntries()
    ) {

      snapshot.set(
        instanceId,
        object.visible,
      );


      object.visible =
        this.selectedIds.has(
          instanceId,
        );

    }


    this.isolationSnapshot =
      snapshot;


    this.refreshHelpers();


    return true;

  }


  // ==========================================================
  // EXIT ISOLATION
  // ==========================================================

  exitIsolation(): boolean {

    const snapshot =
      this.isolationSnapshot;


    if (
      !snapshot
    ) {

      return false;

    }


    for (
      const [
        instanceId,
        visible,
      ]
      of snapshot
    ) {

      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      if (
        object
      ) {

        object.visible =
          visible;

      }

    }


    this.isolationSnapshot =
      null;


    this.refreshHelpers();


    return true;

  }


  // ==========================================================
  // IS ISOLATED
  // ==========================================================

  get isIsolated(): boolean {

    return (
      this.isolationSnapshot
      !== null
    );

  }


  // ==========================================================
  // DISPOSE
  // ==========================================================

  dispose(): void {

    this.exitIsolation();


    this.selectedIds.clear();


    this.refreshHelpers();


    this.listeners.clear();


    this.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
    );


    this.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
    );

  }

}