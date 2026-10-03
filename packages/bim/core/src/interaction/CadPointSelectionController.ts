import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";


export type CadPointSelectionListener =
  (
    selectedIds:
      readonly string[],
  ) => void;


export class CadPointSelectionController {

  private readonly domElement:
    HTMLElement;


  private readonly cameraProvider:
    () => THREE.Camera;


  private readonly designModel:
    DesignModel;


  private readonly pointScene:
    CadPointSceneController;


  private readonly designSelection:
    DesignSelectionController;


  private readonly selectedIds =
    new Set<
      string
    >();


  private readonly listeners =
    new Set<
      CadPointSelectionListener
    >();


  private enabled =
    true;


  private clearOnEmptyClick =
    true;


  private externalSelectionClearHandler:
    (() => void)
    | null =
      null;


  private pointerDownX =
    0;


  private pointerDownY =
    0;


  private pointerDownActive =
    false;


  private readonly pixelTolerance =
    12;


  constructor(
    domElement:
      HTMLElement,

    cameraProvider:
      () => THREE.Camera,

    designModel:
      DesignModel,

    pointScene:
      CadPointSceneController,

    designSelection:
      DesignSelectionController,
  ) {

    this.domElement =
      domElement;


    this.cameraProvider =
      cameraProvider;


    this.designModel =
      designModel;


    this.pointScene =
      pointScene;


    this.designSelection =
      designSelection;


    this.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
    );


    this.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
    );

  }


  setEnabled(
    enabled:
      boolean,
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


  get isEnabled():
    boolean {

    return this.enabled;

  }


  setClearOnEmptyClick(
    enabled:
      boolean,
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


  getSelectedIds():
    readonly string[] {

    return Array.from(
      this.selectedIds,
    );

  }


  isSelected(
    pointId:
      string,
  ):
    boolean {

    return this.selectedIds.has(
      pointId,
    );

  }


  selectSingle(
    pointId:
      string,
  ): void {

    if (
      !this.isPointSelectable(
        pointId,
      )
    ) {

      return;

    }


    this.designSelection
      .clearSelection();


    this.externalSelectionClearHandler
      ?.();


    this.selectedIds.clear();


    this.selectedIds.add(
      pointId,
    );


    this.refreshVisuals();

    this.notify();

  }


  toggle(
    pointId:
      string,

    preserveDesignSelection =
      false,
  ): void {

    if (
      !this.selectedIds.has(
        pointId,
      )
      && !this.isPointSelectable(
        pointId,
      )
    ) {

      return;

    }


    if (
      !preserveDesignSelection
    ) {

      this.designSelection
        .clearSelection();

    }


    if (
      this.selectedIds.has(
        pointId,
      )
    ) {

      this.selectedIds.delete(
        pointId,
      );

    }
    else {

      this.selectedIds.add(
        pointId,
      );

    }


    this.refreshVisuals();

    this.notify();

  }


  clearSelection():
    void {

    if (
      this.selectedIds.size
      === 0
    ) {

      return;

    }


    this.selectedIds.clear();


    this.refreshVisuals();

    this.notify();

  }


  setSelection(
    pointIds:
      readonly string[],

    preserveDesignSelection =
      false,
  ): void {

    this.selectedIds.clear();


    for (
      const pointId
      of pointIds
    ) {

      if (
        this.isPointSelectable(
          pointId,
        )
      ) {

        this.selectedIds.add(
          pointId,
        );

      }

    }


    if (
      this.selectedIds.size > 0
      && !preserveDesignSelection
    ) {

      this.designSelection
        .clearSelection();

    }


    this.refreshVisuals();

    this.notify();

  }


  subscribe(
    listener:
      CadPointSelectionListener,
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


  refresh():
    void {

    let changed =
      false;


    for (
      const pointId
      of Array.from(
        this.selectedIds,
      )
    ) {

      if (
        !this.designModel
          .cadPoints
          .get(
            pointId,
          )
      ) {

        this.selectedIds.delete(
          pointId,
        );


        changed =
          true;

      }

    }


    this.refreshVisuals();


    if (
      changed
    ) {

      this.notify();

    }

  }


  getPointIdAt(
    clientX:
      number,

    clientY:
      number,
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


    const camera =
      this.cameraProvider();


    let bestId:
      string
      | null =
        null;


    let bestPixels =
      this.pixelTolerance;


    for (
      const point
      of this.designModel
        .cadPoints
        .getAll()
    ) {

      if (
        !this.isPointSelectable(
          point.id,
        )
      ) {

        continue;

      }


      const projected =
        new THREE.Vector3(
          point.position.x,
          point.position.y,
          point.position.z,
        )
          .project(
            camera,
          );


      if (
        projected.z < -1
        || projected.z > 1
      ) {

        continue;

      }


      const screenX =
        rect.left
        + (
          projected.x
          + 1
        )
        * 0.5
        * rect.width;


      const screenY =
        rect.top
        + (
          1
          - projected.y
        )
        * 0.5
        * rect.height;


      const pixels =
        Math.hypot(
          clientX
          - screenX,
          clientY
          - screenY,
        );


      if (
        pixels
        >= bestPixels
      ) {

        continue;

      }


      bestPixels =
        pixels;


      bestId =
        point.id;

    }


    return bestId;

  }


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


  private readonly handlePointerUp =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.enabled
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


      if (
        movement > 5
      ) {

        return;

      }


      const pointId =
        this.getPointIdAt(
          event.clientX,
          event.clientY,
        );


      if (
        !pointId
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


      /*
       * Ctrl         = add / toggle
       * Ctrl + Shift = remove only
       * Shift only   = no-op
       */
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
            pointId,
          )
        ) {

          this.toggle(
            pointId,
            true,
          );

        }


        return;

      }


      if (
        event.ctrlKey
      ) {

        this.toggle(
          pointId,
          true,
        );


        return;

      }


      this.selectSingle(
        pointId,
      );

  };


  private isPointSelectable(
    pointId:
      string,
  ):
    boolean {

    const point =
      this.designModel
        .cadPoints
        .get(
          pointId,
        );


    if (
      !point
    ) {

      return false;

    }


    const layer =
      this.designModel
        .layers
        .get(
          point.layerId,
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


  private refreshVisuals():
    void {

    this.pointScene
      .setSelectedIds(
        this.getSelectedIds(),
      );

  }


  private notify():
    void {

    const ids =
      this.getSelectedIds();


    for (
      const listener
      of this.listeners
    ) {

      listener(
        ids,
      );

    }

  }


  dispose():
    void {

    this.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
    );


    this.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
    );


    this.selectedIds.clear();

    this.refreshVisuals();

    this.listeners.clear();

  }

}
