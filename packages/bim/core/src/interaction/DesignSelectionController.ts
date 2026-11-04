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


type OutlineMode =
  | "HOVER"
  | "SELECTED";


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
  // TECHNICAL EDGE OUTLINES
  //
  // Solo se crean para piezas seleccionadas o bajo el mouse.
  // EdgesGeometry usa un umbral angular para evitar mostrar
  // diagonales de triangulación y facetas suaves de cilindros.
  // ==========================================================

  private readonly helpers =
    new Map<
      string,
      THREE.Group
    >();


  private hoveredInstanceId:
    string
    | null =
      null;


  private hoverHelper:
    THREE.Group
    | null =
      null;


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


  private externalSelectionClearHandler:
    (() => void)
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


  // ==========================================================
  // ISOLATION
  // ==========================================================

  private readonly isolatedInstanceIds = new Set<string>();

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


    this.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
    );


    this.domElement.addEventListener(
      "pointerleave",
      this.handlePointerLeave,
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

      /*
       * Deshabilitar selección solo bloquea los clics de selección.
       * El hover técnico permanece activo para comandos CAD como
       * LINE, donde el usuario necesita seguir leyendo las aristas
       * de la pieza mientras coloca puntos con SNAP.
       */
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


  setExternalSelectionClearHandler(
    handler:
      (() => void)
      | null,
  ):
    void {

    this.externalSelectionClearHandler =
      handler;

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


    this.externalSelectionClearHandler
      ?.();


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
  // POINTER MOVE / HOVER
  // ==========================================================

  private readonly handlePointerMove =
    (
      event:
        PointerEvent,
    ): void => {

      /*
       * El hover es independiente de `enabled`: durante LINE, POINT
       * y otros comandos la selección puede estar deshabilitada,
       * pero el usuario debe seguir viendo el borde técnico de la
       * pieza que está usando como referencia de SNAP.
       */
      if (
        this.pointerDownActive
      ) {

        return;

      }


      this.setHoveredInstance(
        this.getInstanceIdAt(
          event.clientX,
          event.clientY,
        ),
      );

    };


  private readonly handlePointerLeave =
    (): void => {

      this.setHoveredInstance(
        null,
      );

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

        this.setHoveredInstance(
          this.getInstanceIdAt(
            event.clientX,
            event.clientY,
          ),
        );


        return;

      }


      this.pick(
        event,
      );


      this.setHoveredInstance(
        this.getInstanceIdAt(
          event.clientX,
          event.clientY,
        ),
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


    for (
      const intersection
      of intersections
    ) {

      const instanceId =
        this.findInstanceId(
          intersection.object,
        );


      if (
        instanceId
        && this.isInstanceSelectable(
          instanceId,
        )
      ) {

        return instanceId;

      }

    }


    return null;

  }


  // ==========================================================
  // PICK
  // ==========================================================

  private pick(
    event:
      PointerEvent,
  ): void {

    const instanceId =
      this.getInstanceIdAt(
        event.clientX,
        event.clientY,
      );


    if (
      !instanceId
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


    if (
      event.shiftKey
      && !event.ctrlKey
    ) {

      return;

    }


    if (
      event.ctrlKey
      && event.shiftKey
    ) {

      if (
        this.isSelected(
          instanceId,
        )
      ) {

        this.toggle(
          instanceId,
        );

      }


      return;

    }


    if (
      event.ctrlKey
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
  // OUTLINE HELPERS
  // ==========================================================

  private setHoveredInstance(
    instanceId:
      string
      | null,
  ): void {

    if (
      this.hoveredInstanceId
      === instanceId
    ) {

      return;

    }


    this.hoveredInstanceId =
      instanceId;


    this.refreshHoverHelper();

  }


  private refreshHoverHelper(): void {

    if (
      this.hoverHelper
    ) {

      this.disposeOutlineHelper(
        this.hoverHelper,
      );


      this.hoverHelper =
        null;

    }


    const instanceId =
      this.hoveredInstanceId;


    if (
      !instanceId
      || this.selectedIds.has(
        instanceId,
      )
      || !this.isInstanceSelectable(
        instanceId,
      )
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
      || !object.visible
    ) {

      return;

    }


    this.hoverHelper =
      this.createOutlineHelper(
        instanceId,
        object,
        "HOVER",
      );

  }


  private createOutlineHelper(
    instanceId: string,
    object: THREE.Object3D,
    mode: OutlineMode,
  ):
    THREE.Group {

    const group =
      new THREE.Group();


    group.name =
      mode === "SELECTED"
        ? `SelectionOutline:${instanceId}`
        : `HoverOutline:${instanceId}`;


    group.raycast =
      () => {};


    const material =
      new THREE.LineBasicMaterial({
        color:
          mode === "SELECTED"
            ? 0x8aa6b5
            : 0x334650,
        transparent:
          true,
        opacity:
          mode === "SELECTED"
            ? 0.95
            : 0.72,
        depthTest:
          true,
        depthWrite:
          false,
        toneMapped:
          false,
      });


    this.scene.updateMatrixWorld(
      true,
    );


    object.updateMatrixWorld(
      true,
    );


    const inverseRoot =
      object.matrixWorld
        .clone()
        .invert();


    let edgeObjectCount =
      0;


    object.traverse(
      (
        child,
      ) => {

        if (
          !(child instanceof THREE.Mesh)
        ) {

          return;

        }


        const position =
          child.geometry
            .getAttribute(
              "position",
            );


        if (
          !position
          || position.count < 3
        ) {

          return;

        }


        const geometry =
          new THREE.EdgesGeometry(
            child.geometry,
            28,
          );


        const edgePosition =
          geometry.getAttribute(
            "position",
          );


        if (
          !edgePosition
          || edgePosition.count < 2
        ) {

          geometry.dispose();
          return;

        }


        const lines =
          new THREE.LineSegments(
            geometry,
            material,
          );


        lines.name =
          `${group.name}:Edges`;


        lines.matrixAutoUpdate =
          false;


        lines.matrix.copy(
          inverseRoot
            .clone()
            .multiply(
              child.matrixWorld,
            ),
        );


        lines.renderOrder =
          mode === "SELECTED"
            ? 12
            : 11;


        lines.raycast =
          () => {};


        group.add(
          lines,
        );


        edgeObjectCount += 1;

      },
    );


    if (
      edgeObjectCount === 0
    ) {

      material.dispose();

    }


    object.add(
      group,
    );


    return group;

  }


  private disposeOutlineHelper(
    helper: THREE.Group,
  ): void {

    helper.removeFromParent();


    const materials =
      new Set<
        THREE.Material
      >();


    helper.traverse(
      (
        child,
      ) => {

        if (
          !(child instanceof THREE.LineSegments)
        ) {

          return;

        }


        child.geometry.dispose();


        if (
          Array.isArray(
            child.material,
          )
        ) {

          for (
            const material
            of child.material
          ) {

            materials.add(
              material,
            );

          }

        }
        else {

          materials.add(
            child.material,
          );

        }

      },
    );


    for (
      const material
      of materials
    ) {

      material.dispose();

    }


    helper.clear();

  }


  // ==========================================================
  // REFRESH VISUAL HELPERS
  // ==========================================================

  refreshHelpers(): void {

    for (
      const helper
      of this.helpers.values()
    ) {

      this.disposeOutlineHelper(
        helper,
      );

    }


    this.helpers.clear();


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


      this.helpers.set(
        instanceId,
        this.createOutlineHelper(
          instanceId,
          object,
          "SELECTED",
        ),
      );

    }


    this.refreshHoverHelper();

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


    if (
      this.hoveredInstanceId
      && !this.designScene
        .getInstanceObject(
          this.hoveredInstanceId,
        )
    ) {

      this.hoveredInstanceId =
        null;

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

  isInstanceVisibleByIsolation(
    instanceId: string,
  ): boolean {

    if (
      !this.isolationSnapshot
    ) {

      return true;

    }


    // La vista aislada corresponde a las piezas seleccionadas cuando
    // se entró en aislamiento; no debe desaparecer al seleccionar una
    // LINE CAD, que limpia la selección de piezas temporalmente.
    return this.isolatedInstanceIds.has(instanceId);

  }


  isolateSelection(): boolean {

    if (
      this.selectedIds.size === 0
    ) {

      return false;

    }


    if (
      this.isolationSnapshot
    ) {

      this.exitIsolation();

    }


    this.isolatedInstanceIds.clear();
    for (const selectedId of this.selectedIds) {
      this.isolatedInstanceIds.add(selectedId);
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


    this.setHoveredInstance(
      null,
    );


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
    this.isolatedInstanceIds.clear();


    this.designScene.sync();


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


    this.hoveredInstanceId =
      null;


    if (
      this.hoverHelper
    ) {

      this.disposeOutlineHelper(
        this.hoverHelper,
      );


      this.hoverHelper =
        null;

    }


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


    this.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
    );


    this.domElement.removeEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );

  }

}
