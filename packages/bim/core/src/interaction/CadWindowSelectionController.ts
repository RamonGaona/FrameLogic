import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";


type SelectionDirection =
  | "WINDOW"
  | "CROSSING";


type SelectionOperation =
  | "REPLACE"
  | "ADD"
  | "REMOVE";


interface ScreenRect {

  left: number;

  right: number;

  top: number;

  bottom: number;

}


export class CadWindowSelectionController {

  private readonly domElement:
    HTMLElement;


  private readonly cameraProvider:
    () => THREE.Camera;


  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  private readonly designSelection:
    DesignSelectionController;


  private readonly pointSelection:
    CadPointSelectionController;


  private readonly setCameraEnabled:
    (
      enabled: boolean,
    ) => void;


  private readonly overlay:
    HTMLDivElement;


  private active =
    false;


  private pointerId:
    number
    | null =
      null;


  private startX =
    0;


  private startY =
    0;


  private currentX =
    0;


  private currentY =
    0;


  private selectionOperation:
    SelectionOperation =
      "REPLACE";


  private disposed =
    false;


  private readonly dragThreshold =
    5;


  constructor(
    domElement:
      HTMLElement,

    cameraProvider:
      () => THREE.Camera,

    designModel:
      DesignModel,

    designScene:
      DesignSceneController,

    designSelection:
      DesignSelectionController,

    pointSelection:
      CadPointSelectionController,

    setCameraEnabled:
      (
        enabled: boolean,
      ) => void,
  ) {

    this.domElement =
      domElement;


    this.cameraProvider =
      cameraProvider;


    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.designSelection =
      designSelection;


    this.pointSelection =
      pointSelection;


    this.setCameraEnabled =
      setCameraEnabled;


    this.overlay =
      document.createElement(
        "div",
      );


    this.overlay.style.position =
      "fixed";

    this.overlay.style.display =
      "none";

    this.overlay.style.pointerEvents =
      "none";

    this.overlay.style.zIndex =
      "1000";

    this.overlay.style.boxSizing =
      "border-box";


    document.body.appendChild(
      this.overlay,
    );


    this.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );


    window.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );


    window.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );

  }


  get isActive():
    boolean {

    return this.active;

  }


  cancel():
    void {

    if (
      !this.active
    ) {

      this.hideOverlay();

      return;

    }


    this.active =
      false;


    this.pointerId =
      null;


    this.hideOverlay();


    this.setCameraEnabled(
      true,
    );

  }


  private readonly handlePointerDown =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        this.disposed
        || event.button !== 0
        || !this.designSelection.isEnabled
        || !this.pointSelection.isEnabled
      ) {

        return;

      }


      const pieceId =
        this.designSelection
          .getInstanceIdAt(
            event.clientX,
            event.clientY,
          );


      const pointId =
        this.pointSelection
          .getPointIdAt(
            event.clientX,
            event.clientY,
          );


      /*
       * La ventana solo nace desde espacio vacío.
       * Clic sobre entidad conserva el flujo normal.
       */
      if (
        pieceId
        || pointId
      ) {

        return;

      }


      this.active =
        true;


      this.pointerId =
        event.pointerId;


      this.startX =
        event.clientX;


      this.startY =
        event.clientY;


      this.currentX =
        event.clientX;


      this.currentY =
        event.clientY;


      const controlModifier =
        event.ctrlKey
        || event.metaKey;


      this.selectionOperation =
        controlModifier
        && event.shiftKey
          ? "REMOVE"
          : controlModifier
            || event.shiftKey
              ? "ADD"
              : "REPLACE";


      this.setCameraEnabled(
        false,
      );

  };


  private readonly handlePointerMove =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.active
        || (
          this.pointerId !== null
          && event.pointerId
            !== this.pointerId
        )
      ) {

        return;

      }


      this.currentX =
        event.clientX;


      this.currentY =
        event.clientY;


      const movement =
        Math.hypot(
          this.currentX
          - this.startX,
          this.currentY
          - this.startY,
        );


      if (
        movement
        <= this.dragThreshold
      ) {

        this.hideOverlay();

        return;

      }


      this.updateOverlay();

  };


  private readonly handlePointerUp =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.active
        || (
          this.pointerId !== null
          && event.pointerId
            !== this.pointerId
        )
        || event.button !== 0
      ) {

        return;

      }


      this.currentX =
        event.clientX;


      this.currentY =
        event.clientY;


      const movement =
        Math.hypot(
          this.currentX
          - this.startX,
          this.currentY
          - this.startY,
        );


      const shouldSelect =
        movement
        > this.dragThreshold;


      if (
        shouldSelect
      ) {

        event.preventDefault();

        event.stopPropagation();


        this.applySelection();

      }


      this.active =
        false;


      this.pointerId =
        null;


      this.hideOverlay();


      this.setCameraEnabled(
        true,
      );

  };


  private applySelection():
    void {

    const direction:
      SelectionDirection =
        this.currentX
        >= this.startX
          ? "WINDOW"
          : "CROSSING";


    const selectionRect =
      this.createRect(
        this.startX,
        this.startY,
        this.currentX,
        this.currentY,
      );


    const camera =
      this.cameraProvider();


    const viewportRect =
      this.domElement
        .getBoundingClientRect();


    const pieceIds:
      string[] =
        [];


    for (
      const [
        instanceId,
        object,
      ]
      of this.designScene
        .getInstanceEntries()
    ) {

      if (
        !object.visible
      ) {

        continue;

      }


      const bounds =
        this.getObjectScreenBounds(
          object,
          camera,
          viewportRect,
        );


      if (
        !bounds
      ) {

        continue;

      }


      const matches =
        direction === "WINDOW"
          ? this.containsRect(
              selectionRect,
              bounds,
            )
          : this.intersectsRect(
              selectionRect,
              bounds,
            );


      if (
        matches
      ) {

        pieceIds.push(
          instanceId,
        );

      }

    }


    const pointIds:
      string[] =
        [];


    for (
      const point
      of this.designModel
        .cadPoints
        .getAll()
    ) {

      const layer =
        this.designModel
          .layers
          .get(
            point.layerId,
          );


      if (
        layer?.visible === false
        || layer?.locked === true
      ) {

        continue;

      }


      const screenPoint =
        this.projectPoint(
          new THREE.Vector3(
            point.position.x,
            point.position.y,
            point.position.z,
          ),
          camera,
          viewportRect,
        );


      if (
        !screenPoint
      ) {

        continue;

      }


      if (
        this.containsPoint(
          selectionRect,
          screenPoint.x,
          screenPoint.y,
        )
      ) {

        pointIds.push(
          point.id,
        );

      }

    }


    const currentPieceIds =
      this.designSelection
        .getSelectedIds();


    const currentPointIds =
      this.pointSelection
        .getSelectedIds();


    const finalPieceIds =
      this.applySelectionOperation(
        currentPieceIds,
        pieceIds,
      );


    const finalPointIds =
      this.applySelectionOperation(
        currentPointIds,
        pointIds,
      );


    this.designSelection
      .setSelection(
        finalPieceIds,
      );


    this.pointSelection
      .setSelection(
        finalPointIds,
        true,
      );

  }


  private getObjectScreenBounds(
    object:
      THREE.Object3D,

    camera:
      THREE.Camera,

    viewportRect:
      DOMRect,
  ):
    ScreenRect
    | null {

    const box =
      new THREE.Box3()
        .setFromObject(
          object,
          true,
        );


    if (
      box.isEmpty()
    ) {

      return null;

    }


    const min =
      box.min;


    const max =
      box.max;


    const corners = [
      new THREE.Vector3(
        min.x,
        min.y,
        min.z,
      ),
      new THREE.Vector3(
        max.x,
        min.y,
        min.z,
      ),
      new THREE.Vector3(
        min.x,
        max.y,
        min.z,
      ),
      new THREE.Vector3(
        max.x,
        max.y,
        min.z,
      ),
      new THREE.Vector3(
        min.x,
        min.y,
        max.z,
      ),
      new THREE.Vector3(
        max.x,
        min.y,
        max.z,
      ),
      new THREE.Vector3(
        min.x,
        max.y,
        max.z,
      ),
      new THREE.Vector3(
        max.x,
        max.y,
        max.z,
      ),
    ];


    let left =
      Number.POSITIVE_INFINITY;

    let right =
      Number.NEGATIVE_INFINITY;

    let top =
      Number.POSITIVE_INFINITY;

    let bottom =
      Number.NEGATIVE_INFINITY;


    let visibleCornerCount =
      0;


    for (
      const corner
      of corners
    ) {

      const screen =
        this.projectPoint(
          corner,
          camera,
          viewportRect,
        );


      if (
        !screen
      ) {

        continue;

      }


      visibleCornerCount +=
        1;


      left =
        Math.min(
          left,
          screen.x,
        );


      right =
        Math.max(
          right,
          screen.x,
        );


      top =
        Math.min(
          top,
          screen.y,
        );


      bottom =
        Math.max(
          bottom,
          screen.y,
        );

    }


    if (
      visibleCornerCount
      === 0
    ) {

      return null;

    }


    return {
      left,
      right,
      top,
      bottom,
    };

  }


  private projectPoint(
    worldPoint:
      THREE.Vector3,

    camera:
      THREE.Camera,

    viewportRect:
      DOMRect,
  ):
    {
      x: number;
      y: number;
    }
    | null {

    const projected =
      worldPoint
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
        viewportRect.left
        + (
          projected.x
          + 1
        )
        * 0.5
        * viewportRect.width,

      y:
        viewportRect.top
        + (
          1
          - projected.y
        )
        * 0.5
        * viewportRect.height,

    };

  }


  private updateOverlay():
    void {

    const rect =
      this.createRect(
        this.startX,
        this.startY,
        this.currentX,
        this.currentY,
      );


    const direction:
      SelectionDirection =
        this.currentX
        >= this.startX
          ? "WINDOW"
          : "CROSSING";


    this.overlay.style.display =
      "block";


    this.overlay.style.left =
      `${rect.left}px`;


    this.overlay.style.top =
      `${rect.top}px`;


    this.overlay.style.width =
      `${Math.max(
        1,
        rect.right
        - rect.left,
      )}px`;


    this.overlay.style.height =
      `${Math.max(
        1,
        rect.bottom
        - rect.top,
      )}px`;


    this.overlay.style.boxShadow =
      this.selectionOperation
      === "REMOVE"
        ? "inset 0 0 0 2px rgba(255, 85, 85, 0.95)"
        : "none";


    if (
      direction
      === "WINDOW"
    ) {

      this.overlay.style.border =
        "1px solid rgba(60, 150, 255, 0.95)";

      this.overlay.style.background =
        "rgba(60, 150, 255, 0.14)";

    }
    else {

      this.overlay.style.border =
        "1px dashed rgba(70, 210, 120, 0.95)";

      this.overlay.style.background =
        "rgba(70, 210, 120, 0.14)";

    }

  }


  private hideOverlay():
    void {

    this.overlay.style.display =
      "none";

  }


  private createRect(
    x1:
      number,

    y1:
      number,

    x2:
      number,

    y2:
      number,
  ):
    ScreenRect {

    return {

      left:
        Math.min(
          x1,
          x2,
        ),

      right:
        Math.max(
          x1,
          x2,
        ),

      top:
        Math.min(
          y1,
          y2,
        ),

      bottom:
        Math.max(
          y1,
          y2,
        ),

    };

  }


  private containsPoint(
    rect:
      ScreenRect,

    x:
      number,

    y:
      number,
  ):
    boolean {

    return (
      x >= rect.left
      && x <= rect.right
      && y >= rect.top
      && y <= rect.bottom
    );

  }


  private containsRect(
    outer:
      ScreenRect,

    inner:
      ScreenRect,
  ):
    boolean {

    return (
      inner.left >= outer.left
      && inner.right <= outer.right
      && inner.top >= outer.top
      && inner.bottom <= outer.bottom
    );

  }


  private intersectsRect(
    first:
      ScreenRect,

    second:
      ScreenRect,
  ):
    boolean {

    return !(
      first.right
        < second.left
      || first.left
        > second.right
      || first.bottom
        < second.top
      || first.top
        > second.bottom
    );

  }


  private applySelectionOperation(
    current:
      readonly string[],

    matched:
      readonly string[],
  ):
    string[] {

    switch (
      this.selectionOperation
    ) {

      case "ADD":

        return this.mergeIds(
          current,
          matched,
        );


      case "REMOVE":

        return this.removeIds(
          current,
          matched,
        );


      case "REPLACE":

        return [
          ...matched,
        ];

    }

  }


  private removeIds(
    current:
      readonly string[],

    removed:
      readonly string[],
  ):
    string[] {

    const removedSet =
      new Set(
        removed,
      );


    return current.filter(
      (
        id,
      ) =>
        !removedSet.has(
          id,
        ),
    );

  }


  private mergeIds(
    current:
      readonly string[],

    added:
      readonly string[],
  ):
    string[] {

    return Array.from(
      new Set([
        ...current,
        ...added,
      ]),
    );

  }


  dispose():
    void {

    if (
      this.disposed
    ) {

      return;

    }


    this.disposed =
      true;


    this.cancel();


    this.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );


    window.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );


    window.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );


    this.overlay.remove();

  }

}
