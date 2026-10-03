import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";


export type CadLineSelectionListener =
  (
    selectedIds:
      readonly string[],
  ) => void;


export class CadLineSelectionController {

  private readonly domElement:
    HTMLElement;


  private readonly cameraProvider:
    () => THREE.Camera;


  private readonly designModel:
    DesignModel;


  private readonly lineScene:
    CadLineSceneController;


  private readonly designSelection:
    DesignSelectionController;


  private readonly pointSelection:
    CadPointSelectionController;


  private readonly selectedIds =
    new Set<
      string
    >();


  private readonly listeners =
    new Set<
      CadLineSelectionListener
    >();


  private enabled =
    true;


  private clearOnEmptyClick =
    true;


  private pointerDownX =
    0;


  private pointerDownY =
    0;


  private pointerDownActive =
    false;


  private readonly pixelTolerance =
    10;


  constructor(
    domElement:
      HTMLElement,

    cameraProvider:
      () => THREE.Camera,

    designModel:
      DesignModel,

    lineScene:
      CadLineSceneController,

    designSelection:
      DesignSelectionController,

    pointSelection:
      CadPointSelectionController,
  ) {

    this.domElement =
      domElement;


    this.cameraProvider =
      cameraProvider;


    this.designModel =
      designModel;


    this.lineScene =
      lineScene;


    this.designSelection =
      designSelection;


    this.pointSelection =
      pointSelection;


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
  ):
    void {

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
  ):
    void {

    this.clearOnEmptyClick =
      enabled;

  }


  getSelectedIds():
    readonly string[] {

    return Array.from(
      this.selectedIds,
    );

  }


  isSelected(
    lineId:
      string,
  ):
    boolean {

    return this.selectedIds.has(
      lineId,
    );

  }


  selectSingle(
    lineId:
      string,
  ):
    void {

    if (
      !this.isLineSelectable(
        lineId,
      )
    ) {

      return;

    }


    this.designSelection
      .clearSelection();


    this.pointSelection
      .clearSelection();


    this.selectedIds.clear();


    this.selectedIds.add(
      lineId,
    );


    this.refreshVisuals();

    this.notify();

  }


  toggle(
    lineId:
      string,

    preserveOtherSelections =
      false,
  ):
    void {

    if (
      !this.selectedIds.has(
        lineId,
      )
      && !this.isLineSelectable(
        lineId,
      )
    ) {

      return;

    }


    if (
      !preserveOtherSelections
    ) {

      this.designSelection
        .clearSelection();


      this.pointSelection
        .clearSelection();

    }


    if (
      this.selectedIds.has(
        lineId,
      )
    ) {

      this.selectedIds.delete(
        lineId,
      );

    }
    else {

      this.selectedIds.add(
        lineId,
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
    lineIds:
      readonly string[],

    preserveOtherSelections =
      false,
  ):
    void {

    this.selectedIds.clear();


    for (
      const lineId
      of lineIds
    ) {

      if (
        this.isLineSelectable(
          lineId,
        )
      ) {

        this.selectedIds.add(
          lineId,
        );

      }

    }


    if (
      this.selectedIds.size > 0
      && !preserveOtherSelections
    ) {

      this.designSelection
        .clearSelection();


      this.pointSelection
        .clearSelection();

    }


    this.refreshVisuals();

    this.notify();

  }


  subscribe(
    listener:
      CadLineSelectionListener,
  ):
    () => void {

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
      const lineId
      of Array.from(
        this.selectedIds,
      )
    ) {

      if (
        !this.designModel
          .cadLines
          .get(
            lineId,
          )
      ) {

        this.selectedIds.delete(
          lineId,
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


  getLineIdAt(
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
      const line
      of this.designModel
        .cadLines
        .getAll()
    ) {

      if (
        !this.isLineSelectable(
          line.id,
        )
      ) {

        continue;

      }


      const start =
        this.project(
          new THREE.Vector3(
            line.start.x,
            line.start.y,
            line.start.z,
          ),
          camera,
          rect,
        );


      const end =
        this.project(
          new THREE.Vector3(
            line.end.x,
            line.end.y,
            line.end.z,
          ),
          camera,
          rect,
        );


      if (
        !start
        || !end
      ) {

        continue;

      }


      const pixels =
        this.distanceToSegment(
          clientX,
          clientY,
          start.x,
          start.y,
          end.x,
          end.y,
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
        line.id;

    }


    return bestId;

  }


  private readonly handlePointerDown =
    (
      event:
        PointerEvent,
    ):
      void => {

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
    ):
      void => {

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


      if (
        event.shiftKey
        && !event.ctrlKey
      ) {

        return;

      }


      const lineId =
        this.getLineIdAt(
          event.clientX,
          event.clientY,
        );


      if (
        !lineId
      ) {

        if (
          this.clearOnEmptyClick
          && !event.ctrlKey
          && !event.shiftKey
        ) {

          this.clearSelection();

        }


        return;

      }


      if (
        event.ctrlKey
        && event.shiftKey
      ) {

        if (
          this.isSelected(
            lineId,
          )
        ) {

          this.toggle(
            lineId,
            true,
          );

        }


        return;

      }


      if (
        event.ctrlKey
      ) {

        this.toggle(
          lineId,
          true,
        );


        return;

      }


      this.selectSingle(
        lineId,
      );

  };


  private isLineSelectable(
    lineId:
      string,
  ):
    boolean {

    const line =
      this.designModel
        .cadLines
        .get(
          lineId,
        );


    if (
      !line
    ) {

      return false;

    }


    const layer =
      this.designModel
        .layers
        .get(
          line.layerId,
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


  private project(
    point:
      THREE.Vector3,

    camera:
      THREE.Camera,

    rect:
      DOMRect,
  ):
    {
      x: number;
      y: number;
    }
    | null {

    const projected =
      point
        .clone()
        .project(
          camera,
        );


    if (
      !Number.isFinite(
        projected.x,
      )
      || !Number.isFinite(
        projected.y,
      )
      || !Number.isFinite(
        projected.z,
      )
      || projected.z < -1
      || projected.z > 1
    ) {

      return null;

    }


    return {

      x:
        rect.left
        + (
          projected.x
          + 1
        )
        * 0.5
        * rect.width,

      y:
        rect.top
        + (
          1
          - projected.y
        )
        * 0.5
        * rect.height,

    };

  }


  private distanceToSegment(
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ):
    number {

    const abX =
      bx - ax;


    const abY =
      by - ay;


    const lengthSq =
      abX * abX
      + abY * abY;


    if (
      lengthSq <= 1e-12
    ) {

      return Math.hypot(
        px - ax,
        py - ay,
      );

    }


    const t =
      Math.max(
        0,
        Math.min(
          1,
          (
            (
              px - ax
            )
            * abX
            + (
              py - ay
            )
            * abY
          )
          / lengthSq,
        ),
      );


    const closestX =
      ax
      + t * abX;


    const closestY =
      ay
      + t * abY;


    return Math.hypot(
      px - closestX,
      py - closestY,
    );

  }


  private refreshVisuals():
    void {

    this.lineScene
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
