import { getActiveCadReferenceBlockController } from "../import/CadReferenceTransformController";
import { parseCadReferenceLayerName } from "../import/CadReferenceBlockController";
import { getActiveCadCircleModelController } from "./CadCircleModelSpaceController";
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
  CadLineSelectionController,
} from "./CadLineSelectionController";

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


  private readonly lineSelection:
    CadLineSelectionController;


  private readonly setCameraEnabled:
    (
      enabled: boolean,
    ) => void;

  private readonly isPlacementActive: () => boolean;

  // La inserción inteligente se crea después de la ventana CAD.
  // Registrar su estado impide que dos herramientas consuman el mismo clic.
  private isSmartInsertionActive: () => boolean = () => false;


  private readonly overlay:
    HTMLDivElement;


  private active =
    false;


  /*
   * Primer clic vacío:
   * se registra como candidato.
   *
   * Si el usuario arrastra antes de soltar,
   * el gesto pertenece a la cámara.
   *
   * Si hace clic y suelta sin arrastrar,
   * queda fijada la primera esquina de selección.
   */
  private candidatePointerId:
    number
    | null =
      null;


  private candidateStartX =
    0;


  private candidateStartY =
    0;


  private candidateDragged =
    false;


  private candidateOperation:
    SelectionOperation =
      "REPLACE";


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

    lineSelection:
      CadLineSelectionController,

    setCameraEnabled:
      (
        enabled: boolean,
      ) => void,

    isPlacementActive: () => boolean = () => false,
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


    this.lineSelection =
      lineSelection;


    this.setCameraEnabled =
      setCameraEnabled;
    this.isPlacementActive = isPlacementActive;


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

  setSmartInsertionActiveChecker(checker: () => boolean): void {
    this.isSmartInsertionActive = checker;
    if (checker()) this.cancel();
  }

  private insertionOwnsPointer(): boolean {
    return this.isPlacementActive() || this.isSmartInsertionActive();
  }


  cancel():
    void {

    this.active =
      false;


    this.candidatePointerId =
      null;


    this.candidateDragged =
      false;


    this.hideOverlay();


    this.designSelection
      .setEnabled(
        true,
      );


    this.pointSelection
      .setEnabled(
        true,
      );


    this.lineSelection
      .setEnabled(
        true,
      );


    this.setCameraEnabled(
      true,
    );

  }


  private referenceTransformOwnsCanvas(): boolean {
    // El gizmo de la referencia DWG/DXF tiene prioridad sobre la selección.
    const reference = getActiveCadReferenceBlockController();
    return Boolean(reference?.isMoveActive || reference?.isRotateActive);
  }

  private readonly handlePointerDown =
    (
      event:
        PointerEvent,
    ): void => {

      if (this.referenceTransformOwnsCanvas()) {
        if (this.active) this.cancel();
        this.candidatePointerId = null;
        this.candidateDragged = false;
        return;
      }
      if (
        this.disposed
        || event.button !== 0
        || this.insertionOwnsPointer()
      ) {

        return;

      }


      /*
       * Segunda esquina:
       *
       * cuando la ventana ya está activa, un clic
       * termina inmediatamente la operación.
       */
      if (
        this.active
      ) {

        this.currentX =
          event.clientX;


        this.currentY =
          event.clientY;


        event.preventDefault();

        event.stopPropagation();


        this.applySelection();


        this.active =
          false;


        this.hideOverlay();


        this.designSelection
          .setEnabled(
            true,
          );


        this.pointSelection
          .setEnabled(
            true,
          );


        this.lineSelection
          .setEnabled(
            true,
          );


        this.setCameraEnabled(
          true,
        );


        return;

      }


      if (
        !this.designSelection.isEnabled
        || !this.pointSelection.isEnabled
        || !this.lineSelection.isEnabled
      ) {

        return;

      }


      /*
       * Shift solo no ejecuta ninguna operación
       * de selección.
       */
      if (
        event.shiftKey
        && !event.ctrlKey
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


      const lineId =
        this.lineSelection
          .getLineIdAt(
            event.clientX,
            event.clientY,
          );


      /*
       * Imported DWG geometry lives on locked CAD layers, so the native
       * line selector returns null. It is still a hit on the full reference:
       * do NOT start a window behind the DWG and cancel its selection.
       */
      const cadReferenceHit = getActiveCadReferenceBlockController()
        ?.getReferenceNameAt?.(event.clientX, event.clientY);
      const circleHit = getActiveCadCircleModelController()
        ?.getCircleIdAt(event.clientX, event.clientY);

      /*
       * La primera esquina solo puede empezar
       * desde espacio vacío.
       */
      if (
        pieceId
        || pointId
        || lineId
        || cadReferenceHit
        || circleHit
      ) {

        return;

      }


      /*
       * IMPORTANTE:
       * todavía NO deshabilitamos la cámara.
       *
       * Si desde aquí el usuario mantiene el botón
       * y arrastra, el gesto debe seguir siendo
       * navegación de cámara.
       */
      this.candidatePointerId =
        event.pointerId;


      this.candidateStartX =
        event.clientX;


      this.candidateStartY =
        event.clientY;


      this.candidateDragged =
        false;


      this.candidateOperation =
        event.ctrlKey
        && event.shiftKey
          ? "REMOVE"
          : event.ctrlKey
            ? "ADD"
            : "REPLACE";

  };


  private readonly handlePointerMove =
    (
      event:
        PointerEvent,
    ): void => {

      /*
       * Antes de fijar la primera esquina,
       * un arrastre con el botón pulsado pertenece
       * exclusivamente a la cámara.
       */
      if (
        this.candidatePointerId
        !== null
        && event.pointerId
          === this.candidatePointerId
      ) {

        const movement =
          Math.hypot(
            event.clientX
            - this.candidateStartX,
            event.clientY
            - this.candidateStartY,
          );


        if (
          movement
          > this.dragThreshold
        ) {

          this.candidateDragged =
            true;

        }


        return;

      }


      if (
        !this.active
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

      // Evitar activar una ventana sobre un gizmo DWG, incluso si
      // el candidato nació antes de activar MOVE.
      if (this.referenceTransformOwnsCanvas()) {
        this.candidatePointerId = null;
        this.candidateDragged = false;
        return;
      }
      // Tanto la inserción básica como la inteligente poseen sus clics.
      if (this.insertionOwnsPointer()) {
        this.candidatePointerId = null;
        this.candidateDragged = false;
        return;
      }

      if (
        this.candidatePointerId
        === null
        || event.pointerId
          !== this.candidatePointerId
        || event.button !== 0
      ) {

        return;

      }


      const movement =
        Math.hypot(
          event.clientX
          - this.candidateStartX,
          event.clientY
          - this.candidateStartY,
        );


      const wasCameraDrag =
        this.candidateDragged
        || movement
          > this.dragThreshold;


      this.candidatePointerId =
        null;


      this.candidateDragged =
        false;


      /*
       * El gizmo puede reclamar un pointerdown tras registrarse el
       * candidato de ventana. Al soltar, una seleccion deshabilitada
       * indica que el gesto pertenece a MOVE/ROTATE, no a la ventana.
       */
      if (
        !this.designSelection.isEnabled
        || !this.pointSelection.isEnabled
        || !this.lineSelection.isEnabled
      ) {

        return;

      }


      /*
       * Clic sostenido + arrastre:
       * no inicia selección; la cámara conserva
       * completamente ese gesto.
       */
      if (
        wasCameraDrag
      ) {

        return;

      }


      /*
       * Clic vacío y soltar:
       * fija la primera esquina.
       *
       * Desde aquí la cámara y los selectores por clic
       * quedan temporalmente suspendidos hasta el
       * segundo clic o Escape.
       */
      this.active =
        true;


      this.startX =
        this.candidateStartX;


      this.startY =
        this.candidateStartY;


      this.currentX =
        event.clientX;


      this.currentY =
        event.clientY;


      this.selectionOperation =
        this.candidateOperation;


      this.designSelection
        .setEnabled(
          false,
        );


      this.pointSelection
        .setEnabled(
          false,
        );


      this.lineSelection
        .setEnabled(
          false,
        );


      this.setCameraEnabled(
        false,
      );


      event.preventDefault();

      event.stopPropagation();

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

    // DWG/DXF segments are members of a single, locked reference. Track
    // screen-space segment hits before applying any native CAD selection.
    const cadReference = getActiveCadReferenceBlockController();
    const referenceHits = new Map<string, {
      containsAll: boolean;
      touches: boolean;
      count: number;
    }>();
    const referenceHit = (name: string, contained: boolean, touched: boolean): void => {
      const state = referenceHits.get(name) ?? { containsAll: true, touches: false, count: 0 };
      state.containsAll = state.containsAll && contained;
      state.touches = state.touches || touched;
      state.count += 1;
      referenceHits.set(name, state);
    };


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

      const imported = layer ? parseCadReferenceLayerName(layer) : null;


      if (
        layer?.visible === false
        || (layer?.locked === true && !imported)
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


      if (imported) {
        const contained = Boolean(screenPoint && this.containsPoint(
          selectionRect, screenPoint.x, screenPoint.y,
        ));
        referenceHit(imported.referenceName, contained, contained);
        continue;
      }

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


    const lineIds:
      string[] =
        [];


    for (
      const line
      of this.designModel
        .cadLines
        .getAll()
    ) {

      const layer =
        this.designModel
          .layers
          .get(
            line.layerId,
          );

      const imported = layer ? parseCadReferenceLayerName(layer) : null;


      if (
        layer?.visible === false
        || (layer?.locked === true && !imported)
      ) {

        continue;

      }


      const start =
        this.projectPoint(
          new THREE.Vector3(
            line.start.x,
            line.start.y,
            line.start.z,
          ),
          camera,
          viewportRect,
        );


      const end =
        this.projectPoint(
          new THREE.Vector3(
            line.end.x,
            line.end.y,
            line.end.z,
          ),
          camera,
          viewportRect,
        );


      if (imported) {
        const bothVisible = Boolean(start && end);
        const contained = Boolean(bothVisible
          && this.containsPoint(selectionRect, start!.x, start!.y)
          && this.containsPoint(selectionRect, end!.x, end!.y));
        const touched = Boolean(bothVisible && this.segmentIntersectsRect(
          selectionRect, start!.x, start!.y, end!.x, end!.y,
        ));
        referenceHit(imported.referenceName, contained, touched);
        continue;
      }

      if (
        !start
        || !end
      ) {

        continue;

      }


      const matches =
        direction === "WINDOW"
          ? (
              this.containsPoint(
                selectionRect,
                start.x,
                start.y,
              )
              && this.containsPoint(
                selectionRect,
                end.x,
                end.y,
              )
            )
          : this.segmentIntersectsRect(
              selectionRect,
              start.x,
              start.y,
              end.x,
              end.y,
            );


      if (
        matches
      ) {

        lineIds.push(
          line.id,
        );

      }

    }


    const matchedReferences = [...referenceHits.entries()]
      .filter(([, value]) => value.count > 0
        && (direction === "WINDOW" ? value.containsAll : value.touches))
      .map(([name]) => name);
    const finalReferences = cadReference
      ? this.applySelectionOperation(cadReference.getSelectedReferenceNames(), matchedReferences)
      : [];

    const currentPieceIds =
      this.designSelection
        .getSelectedIds();


    const currentPointIds =
      this.pointSelection
        .getSelectedIds();


    const currentLineIds =
      this.lineSelection
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


    const finalLineIds =
      this.applySelectionOperation(
        currentLineIds,
        lineIds,
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


    this.lineSelection
      .setSelection(
        finalLineIds,
        true,
      );

    // Native selection never takes ownership of locked DWG members.
    // REPLACE/ADD/REMOVE applies to entire imported references.
    cadReference?.setSelection(finalReferences, true);

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


  private segmentIntersectsRect(
    rect:
      ScreenRect,

    ax: number,
    ay: number,
    bx: number,
    by: number,
  ):
    boolean {

    if (
      this.containsPoint(
        rect,
        ax,
        ay,
      )
      || this.containsPoint(
        rect,
        bx,
        by,
      )
    ) {

      return true;

    }


    return (
      this.segmentsIntersect(
        ax,
        ay,
        bx,
        by,
        rect.left,
        rect.top,
        rect.right,
        rect.top,
      )
      || this.segmentsIntersect(
        ax,
        ay,
        bx,
        by,
        rect.right,
        rect.top,
        rect.right,
        rect.bottom,
      )
      || this.segmentsIntersect(
        ax,
        ay,
        bx,
        by,
        rect.right,
        rect.bottom,
        rect.left,
        rect.bottom,
      )
      || this.segmentsIntersect(
        ax,
        ay,
        bx,
        by,
        rect.left,
        rect.bottom,
        rect.left,
        rect.top,
      )
    );

  }


  private segmentsIntersect(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
    dx: number,
    dy: number,
  ):
    boolean {

    const cross =
      (
        ux: number,
        uy: number,
        vx: number,
        vy: number,
      ):
        number =>
          ux * vy
          - uy * vx;


    const rX =
      bx - ax;

    const rY =
      by - ay;

    const sX =
      dx - cx;

    const sY =
      dy - cy;


    const denominator =
      cross(
        rX,
        rY,
        sX,
        sY,
      );


    const qX =
      cx - ax;

    const qY =
      cy - ay;


    if (
      Math.abs(
        denominator,
      ) <= 1e-12
    ) {

      return false;

    }


    const t =
      cross(
        qX,
        qY,
        sX,
        sY,
      )
      / denominator;


    const u =
      cross(
        qX,
        qY,
        rX,
        rY,
      )
      / denominator;


    return (
      t >= 0
      && t <= 1
      && u >= 0
      && u <= 1
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
