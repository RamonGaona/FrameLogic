import * as THREE from "three";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";


type DrawingTool =
  | "SELECT"
  | "DIMENSION"
  | "LABEL"
  | "TEXT";


interface DrawingPointReference {
  readonly instanceId: string;
  readonly x: number;
  readonly y: number;
}


interface DrawingSegment {
  readonly instanceId: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly cut: boolean;
}


interface DimensionAnnotation {
  readonly id: string;
  readonly kind: "DIMENSION";
  readonly a: DrawingPointReference;
  readonly b: DrawingPointReference;
  offsetX: number;
  offsetY: number;
}


interface LabelAnnotation {
  readonly id: string;
  readonly kind: "LABEL";
  readonly target: DrawingPointReference;
  text: string;
  offsetX: number;
  offsetY: number;
}


interface TextAnnotation {
  readonly id: string;
  readonly kind: "TEXT";
  text: string;
  x: number;
  y: number;
}


type DrawingAnnotation =
  | DimensionAnnotation
  | LabelAnnotation
  | TextAnnotation;


interface DrawingDocument {
  readonly sectionId: string;
  readonly annotations: DrawingAnnotation[];
}


interface DrawingSnapshot {
  readonly section: SectionViewDefinition;
  readonly segments: DrawingSegment[];
}


interface PaperTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly drawingHeight: number;
}


interface AnnotationDragState {
  readonly annotationId: string;
  readonly startX: number;
  readonly startY: number;
  readonly startOffsetX?: number;
  readonly startOffsetY?: number;
  readonly startTextX?: number;
  readonly startTextY?: number;
}


export interface DrawingWorkspaceControllerOptions {
  readonly container: HTMLElement;
  readonly designScene: DesignSceneController;
  readonly sectionDrawing: SectionDrawingController;
}


const SVG_NS =
  "http://www.w3.org/2000/svg";

const SHEET_WIDTH =
  1120;

const SHEET_HEIGHT =
  792;

const CONTENT_LEFT =
  70;

const CONTENT_TOP =
  62;

const CONTENT_RIGHT =
  70;

const CONTENT_BOTTOM =
  96;

const EPSILON =
  1e-7;


export class DrawingWorkspaceController {
  private readonly container:
    HTMLElement;

  private readonly designScene:
    DesignSceneController;

  private readonly sectionDrawing:
    SectionDrawingController;

  private readonly documents =
    new Map<string, DrawingDocument>();

  private readonly overlay:
    HTMLDivElement;

  private readonly title:
    HTMLDivElement;

  private readonly status:
    HTMLDivElement;

  private readonly stage:
    HTMLDivElement;

  private readonly svg:
    SVGSVGElement;

  private readonly toolButtons =
    new Map<DrawingTool, HTMLButtonElement>();

  private activeSectionId:
    string | null =
      null;

  private tool:
    DrawingTool =
      "SELECT";

  private pendingDimensionStart:
    DrawingPointReference | null =
      null;

  private selectedAnnotationId:
    string | null =
      null;

  private dragState:
    AnnotationDragState | null =
      null;

  private snapshot:
    DrawingSnapshot | null =
      null;

  private zoom =
    1;

  private disposed =
    false;


  constructor(
    options: DrawingWorkspaceControllerOptions,
  ) {
    this.container =
      options.container;
    this.designScene =
      options.designScene;
    this.sectionDrawing =
      options.sectionDrawing;

    const overlay =
      document.createElement(
        "div",
      );

    overlay.dataset[
      "framelogicDrawingWorkspace"
    ] = "true";
    overlay.style.position =
      "absolute";
    overlay.style.inset =
      "0";
    overlay.style.zIndex =
      "500";
    overlay.style.display =
      "none";
    overlay.style.flexDirection =
      "column";
    overlay.style.background =
      "#20272c";
    overlay.style.color =
      "#edf2f5";
    overlay.style.font =
      "12px/1.25 system-ui, sans-serif";

    const toolbar =
      document.createElement(
        "div",
      );

    toolbar.style.display =
      "flex";
    toolbar.style.alignItems =
      "center";
    toolbar.style.gap =
      "6px";
    toolbar.style.padding =
      "8px 10px";
    toolbar.style.background =
      "#141b20";
    toolbar.style.borderBottom =
      "1px solid rgba(255,255,255,0.12)";
    toolbar.style.flex =
      "0 0 auto";

    const backButton =
      this.makeButton(
        "← Model Space",
      );

    const title =
      document.createElement(
        "div",
      );

    title.style.fontWeight =
      "700";
    title.style.marginRight =
      "10px";
    title.style.minWidth =
      "140px";

    toolbar.append(
      backButton,
      title,
    );

    this.appendToolButton(
      toolbar,
      "SELECT",
      "Seleccionar",
    );
    this.appendToolButton(
      toolbar,
      "DIMENSION",
      "Cota",
    );
    this.appendToolButton(
      toolbar,
      "LABEL",
      "Label",
    );
    this.appendToolButton(
      toolbar,
      "TEXT",
      "Texto",
    );

    const deleteButton =
      this.makeButton(
        "Borrar",
      );
    const refreshButton =
      this.makeButton(
        "Actualizar",
      );
    const zoomOutButton =
      this.makeButton(
        "−",
      );
    const zoomInButton =
      this.makeButton(
        "+",
      );
    const exportButton =
      this.makeButton(
        "Exportar PDF",
      );

    exportButton.style.marginLeft =
      "auto";

    toolbar.append(
      deleteButton,
      refreshButton,
      zoomOutButton,
      zoomInButton,
      exportButton,
    );

    const stage =
      document.createElement(
        "div",
      );

    stage.style.position =
      "relative";
    stage.style.flex =
      "1 1 auto";
    stage.style.overflow =
      "auto";
    stage.style.padding =
      "28px";
    stage.style.background =
      "#3a4248";

    const svg =
      document.createElementNS(
        SVG_NS,
        "svg",
      );

    svg.setAttribute(
      "viewBox",
      `0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}`,
    );
    svg.setAttribute(
      "width",
      String(
        SHEET_WIDTH,
      ),
    );
    svg.setAttribute(
      "height",
      String(
        SHEET_HEIGHT,
      ),
    );
    svg.style.display =
      "block";
    svg.style.background =
      "white";
    svg.style.boxShadow =
      "0 10px 30px rgba(0,0,0,0.32)";
    svg.style.transformOrigin =
      "0 0";
    svg.style.touchAction =
      "none";

    stage.append(
      svg,
    );

    const status =
      document.createElement(
        "div",
      );

    status.style.flex =
      "0 0 auto";
    status.style.padding =
      "6px 10px";
    status.style.background =
      "#141b20";
    status.style.borderTop =
      "1px solid rgba(255,255,255,0.10)";
    status.style.minHeight =
      "16px";
    status.style.color =
      "#c8d3d9";

    overlay.append(
      toolbar,
      stage,
      status,
    );

    this.container.append(
      overlay,
    );

    this.overlay =
      overlay;
    this.title =
      title;
    this.status =
      status;
    this.stage =
      stage;
    this.svg =
      svg;

    backButton.addEventListener(
      "click",
      this.close,
    );
    deleteButton.addEventListener(
      "click",
      this.deleteSelectedAnnotation,
    );
    refreshButton.addEventListener(
      "click",
      this.refresh,
    );
    zoomOutButton.addEventListener(
      "click",
      () =>
        this.setZoom(
          this.zoom / 1.18,
        ),
    );
    zoomInButton.addEventListener(
      "click",
      () =>
        this.setZoom(
          this.zoom * 1.18,
        ),
    );
    exportButton.addEventListener(
      "click",
      this.exportPdf,
    );

    this.svg.addEventListener(
      "pointerdown",
      this.handlePointerDown,
    );
    this.svg.addEventListener(
      "pointermove",
      this.handlePointerMove,
    );
    this.svg.addEventListener(
      "pointerup",
      this.handlePointerUp,
    );
    this.svg.addEventListener(
      "pointercancel",
      this.handlePointerUp,
    );
    this.svg.addEventListener(
      "dblclick",
      this.handleDoubleClick,
    );
    this.stage.addEventListener(
      "wheel",
      this.handleWheel,
      {
        passive:
          false,
      },
    );
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
    );

    this.setTool(
      "SELECT",
    );
  }


  openActiveSection(): boolean {
    const section =
      this.sectionDrawing
        .getActiveSection();

    if (!section) {
      return false;
    }

    this.activeSectionId =
      section.id;
    this.snapshot =
      this.buildSnapshot(
        section,
      );
    this.ensureDocument(
      section.id,
    );
    this.pendingDimensionStart =
      null;
    this.selectedAnnotationId =
      null;
    this.title.textContent =
      `PLANO · ${section.name}`;
    this.overlay.style.display =
      "flex";
    this.setTool(
      "SELECT",
    );
    this.setStatus(
      "Plano editable. Cotas y labels mantienen referencia a la geometría de la sección.",
    );
    this.render();
    return true;
  }


  readonly close =
    (): void => {
      this.overlay.style.display =
        "none";
      this.dragState =
        null;
      this.pendingDimensionStart =
        null;
    };


  readonly refresh =
    (): void => {
      const section =
        this.getActiveSection();

      if (!section) {
        this.setStatus(
          "La sección ya no existe.",
        );
        return;
      }

      this.snapshot =
        this.buildSnapshot(
          section,
        );
      this.render();
      this.setStatus(
        "Vista regenerada desde el Model Space. Las anotaciones conservaron sus referencias.",
      );
    };


  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed =
      true;
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
    );
    this.overlay.remove();
    this.documents.clear();
  }


  private appendToolButton(
    toolbar: HTMLDivElement,
    tool: DrawingTool,
    label: string,
  ): void {
    const button =
      this.makeButton(
        label,
      );

    button.addEventListener(
      "click",
      () =>
        this.setTool(
          tool,
        ),
    );
    this.toolButtons.set(
      tool,
      button,
    );
    toolbar.append(
      button,
    );
  }


  private makeButton(
    label: string,
  ):
    HTMLButtonElement {
    const button =
      document.createElement(
        "button",
      );

    button.type =
      "button";
    button.textContent =
      label;
    button.style.padding =
      "5px 8px";
    button.style.border =
      "1px solid rgba(255,255,255,0.16)";
    button.style.borderRadius =
      "4px";
    button.style.background =
      "#27343c";
    button.style.color =
      "#f3f7f9";
    button.style.cursor =
      "pointer";

    return button;
  }


  private setTool(
    tool: DrawingTool,
  ): void {
    this.tool =
      tool;
    this.pendingDimensionStart =
      null;

    for (
      const [
        current,
        button,
      ]
      of this.toolButtons
    ) {
      button.style.background =
        current === tool
          ? "#3b6d87"
          : "#27343c";
    }

    if (
      tool === "DIMENSION"
    ) {
      this.setStatus(
        "COTA: selecciona dos puntos de geometría.",
      );
    }
    else if (
      tool === "LABEL"
    ) {
      this.setStatus(
        "LABEL: selecciona una pieza en el plano.",
      );
    }
    else if (
      tool === "TEXT"
    ) {
      this.setStatus(
        "TEXTO: haz clic donde quieras colocar la nota.",
      );
    }
    else {
      this.setStatus(
        "Selecciona una anotación para moverla o borrarla. Doble clic edita texto/label.",
      );
    }
  }


  private ensureDocument(
    sectionId: string,
  ):
    DrawingDocument {
    const current =
      this.documents.get(
        sectionId,
      );

    if (current) {
      return current;
    }

    const created:
      DrawingDocument = {
        sectionId,
        annotations: [],
      };

    this.documents.set(
      sectionId,
      created,
    );
    return created;
  }


  private getActiveDocument():
    DrawingDocument | null {
    if (!this.activeSectionId) {
      return null;
    }

    return this.documents.get(
      this.activeSectionId,
    )
      ?? null;
  }


  private getActiveSection():
    SectionViewDefinition | null {
    if (!this.activeSectionId) {
      return null;
    }

    return this.sectionDrawing
      .getSections()
      .find(
        (
          section,
        ) =>
          section.id
          === this.activeSectionId,
      )
      ?? null;
  }


  private readonly handlePointerDown =
    (
      event: PointerEvent,
    ): void => {
      const annotationElement =
        this.closestAnnotationElement(
          event.target,
        );

      if (
        annotationElement
        && this.tool === "SELECT"
      ) {
        const id =
          annotationElement.getAttribute(
            "data-annotation-id",
          );

        if (id) {
          const point =
            this.eventToSheetPoint(
              event,
            );

          if (!point) {
            return;
          }

          const annotation =
            this.findAnnotation(
              id,
            );

          if (!annotation) {
            return;
          }

          this.selectedAnnotationId =
            id;
          this.dragState = {
            annotationId:
              id,
            startX:
              point.x,
            startY:
              point.y,
            startOffsetX:
              annotation.kind === "TEXT"
                ? undefined
                : annotation.offsetX,
            startOffsetY:
              annotation.kind === "TEXT"
                ? undefined
                : annotation.offsetY,
            startTextX:
              annotation.kind === "TEXT"
                ? annotation.x
                : undefined,
            startTextY:
              annotation.kind === "TEXT"
                ? annotation.y
                : undefined,
          };
          this.render();
          event.preventDefault();
          return;
        }
      }

      const point =
        this.eventToSheetPoint(
          event,
        );

      if (!point) {
        return;
      }

      if (
        this.tool === "DIMENSION"
      ) {
        this.handleDimensionPoint(
          point.x,
          point.y,
        );
        return;
      }

      if (
        this.tool === "LABEL"
      ) {
        this.handleLabelPoint(
          point.x,
          point.y,
        );
        return;
      }

      if (
        this.tool === "TEXT"
      ) {
        this.handleTextPoint(
          point.x,
          point.y,
        );
        return;
      }

      this.selectedAnnotationId =
        null;
      this.render();
    };


  private readonly handlePointerMove =
    (
      event: PointerEvent,
    ): void => {
      const drag =
        this.dragState;

      if (!drag) {
        return;
      }

      const point =
        this.eventToSheetPoint(
          event,
        );

      if (!point) {
        return;
      }

      const annotation =
        this.findAnnotation(
          drag.annotationId,
        );

      if (!annotation) {
        return;
      }

      const dx =
        point.x
        - drag.startX;
      const dy =
        point.y
        - drag.startY;

      if (
        annotation.kind === "TEXT"
      ) {
        annotation.x =
          (drag.startTextX ?? annotation.x)
          + dx;
        annotation.y =
          (drag.startTextY ?? annotation.y)
          + dy;
      }
      else {
        annotation.offsetX =
          (drag.startOffsetX ?? annotation.offsetX)
          + dx;
        annotation.offsetY =
          (drag.startOffsetY ?? annotation.offsetY)
          + dy;
      }

      this.render();
      event.preventDefault();
    };


  private readonly handlePointerUp =
    (): void => {
      this.dragState =
        null;
    };


  private readonly handleDoubleClick =
    (
      event: MouseEvent,
    ): void => {
      const element =
        this.closestAnnotationElement(
          event.target,
        );
      const id =
        element?.getAttribute(
          "data-annotation-id",
        );

      if (!id) {
        return;
      }

      const annotation =
        this.findAnnotation(
          id,
        );

      if (
        !annotation
        || annotation.kind === "DIMENSION"
      ) {
        return;
      }

      const text =
        window.prompt(
          annotation.kind === "LABEL"
            ? "Texto del label"
            : "Texto",
          annotation.text,
        );

      if (text === null) {
        return;
      }

      annotation.text =
        text.trim();
      this.render();
      event.preventDefault();
    };


  private readonly handleWheel =
    (
      event: WheelEvent,
    ): void => {
      if (
        !event.ctrlKey
        && !event.metaKey
      ) {
        return;
      }

      event.preventDefault();
      this.setZoom(
        this.zoom
        * (
          event.deltaY < 0
            ? 1.12
            : 1 / 1.12
        ),
      );
    };


  private readonly handleKeyDown =
    (
      event: KeyboardEvent,
    ): void => {
      if (
        this.overlay.style.display
        === "none"
      ) {
        return;
      }

      if (
        event.key === "Escape"
      ) {
        if (
          this.tool !== "SELECT"
        ) {
          this.setTool(
            "SELECT",
          );
          return;
        }

        this.close();
        return;
      }

      if (
        event.key === "Delete"
        || event.key === "Backspace"
      ) {
        this.deleteSelectedAnnotation();
      }
    };


  private handleDimensionPoint(
    paperX: number,
    paperY: number,
  ): void {
    const reference =
      this.pickReference(
        paperX,
        paperY,
      );

    if (!reference) {
      this.setStatus(
        "COTA: acércate a una arista de una pieza.",
      );
      return;
    }

    if (!this.pendingDimensionStart) {
      this.pendingDimensionStart =
        reference;
      this.setStatus(
        "COTA: primer punto tomado. Selecciona el segundo.",
      );
      return;
    }

    const document =
      this.getActiveDocument();

    if (!document) {
      return;
    }

    document.annotations.push({
      id:
        crypto.randomUUID(),
      kind:
        "DIMENSION",
      a:
        this.pendingDimensionStart,
      b:
        reference,
      offsetX:
        0,
      offsetY:
        -28,
    });
    this.pendingDimensionStart =
      null;
    this.setTool(
      "SELECT",
    );
    this.render();
  }


  private handleLabelPoint(
    paperX: number,
    paperY: number,
  ): void {
    const reference =
      this.pickReference(
        paperX,
        paperY,
      );

    if (!reference) {
      this.setStatus(
        "LABEL: selecciona geometría de una pieza.",
      );
      return;
    }

    const suggested =
      `PIEZA ${reference.instanceId.slice(0, 8)}`;
    const text =
      window.prompt(
        "Texto del label",
        suggested,
      );

    if (text === null) {
      return;
    }

    const document =
      this.getActiveDocument();

    if (!document) {
      return;
    }

    document.annotations.push({
      id:
        crypto.randomUUID(),
      kind:
        "LABEL",
      target:
        reference,
      text:
        text.trim()
        || suggested,
      offsetX:
        55,
      offsetY:
        -38,
    });
    this.setTool(
      "SELECT",
    );
    this.render();
  }


  private handleTextPoint(
    paperX: number,
    paperY: number,
  ): void {
    const text =
      window.prompt(
        "Texto",
        "Nota",
      );

    if (
      text === null
      || !text.trim()
    ) {
      return;
    }

    const document =
      this.getActiveDocument();

    if (!document) {
      return;
    }

    document.annotations.push({
      id:
        crypto.randomUUID(),
      kind:
        "TEXT",
      text:
        text.trim(),
      x:
        paperX,
      y:
        paperY,
    });
    this.setTool(
      "SELECT",
    );
    this.render();
  }


  private readonly deleteSelectedAnnotation =
    (): void => {
      const id =
        this.selectedAnnotationId;
      const document =
        this.getActiveDocument();

      if (
        !id
        || !document
      ) {
        return;
      }

      const index =
        document.annotations
          .findIndex(
            (
              annotation,
            ) =>
              annotation.id
              === id,
          );

      if (index < 0) {
        return;
      }

      document.annotations.splice(
        index,
        1,
      );
    this.selectedAnnotationId =
      null;
    this.render();
  };


  private findAnnotation(
    id: string,
  ):
    DrawingAnnotation | null {
    return this.getActiveDocument()
      ?.annotations
      .find(
        (
          annotation,
        ) =>
          annotation.id === id,
      )
      ?? null;
  }


  private closestAnnotationElement(
    target: EventTarget | null,
  ):
    Element | null {
    if (!(target instanceof Element)) {
      return null;
    }

    return target.closest(
      "[data-annotation-id]",
    );
  }


  private eventToSheetPoint(
    event:
      PointerEvent
      | MouseEvent,
  ):
    THREE.Vector2 | null {
    const ctm =
      this.svg.getScreenCTM();

    if (!ctm) {
      return null;
    }

    const point =
      new DOMPoint(
        event.clientX,
        event.clientY,
      ).matrixTransform(
        ctm.inverse(),
      );

    return new THREE.Vector2(
      point.x,
      point.y,
    );
  }


  private setZoom(
    value: number,
  ): void {
    this.zoom =
      THREE.MathUtils.clamp(
        value,
        0.45,
        4,
      );
    this.svg.style.transform =
      `scale(${this.zoom})`;
    this.svg.style.marginRight =
      `${SHEET_WIDTH * (this.zoom - 1)}px`;
    this.svg.style.marginBottom =
      `${SHEET_HEIGHT * (this.zoom - 1)}px`;
  }


  private setStatus(
    message: string,
  ): void {
    this.status.textContent =
      message;
  }


  private paperTransform(
    section: SectionViewDefinition,
  ):
    PaperTransform {
    const availableWidth =
      SHEET_WIDTH
      - CONTENT_LEFT
      - CONTENT_RIGHT;
    const availableHeight =
      SHEET_HEIGHT
      - CONTENT_TOP
      - CONTENT_BOTTOM;
    const scale =
      Math.min(
        availableWidth
        / Math.max(
          section.width,
          EPSILON,
        ),
        availableHeight
        / Math.max(
          section.height,
          EPSILON,
        ),
      );
    const drawingWidth =
      section.width
      * scale;
    const drawingHeight =
      section.height
      * scale;

    return {
      scale,
      offsetX:
        CONTENT_LEFT
        + (
          availableWidth
          - drawingWidth
        ) / 2,
      offsetY:
        CONTENT_TOP
        + (
          availableHeight
          - drawingHeight
        ) / 2,
      drawingHeight,
    };
  }


  private sectionToPaper(
    section: SectionViewDefinition,
    x: number,
    y: number,
  ):
    THREE.Vector2 {
    const transform =
      this.paperTransform(
        section,
      );

    return new THREE.Vector2(
      transform.offsetX
      + x * transform.scale,
      transform.offsetY
      + transform.drawingHeight
      - y * transform.scale,
    );
  }


  private paperToSection(
    section: SectionViewDefinition,
    x: number,
    y: number,
  ):
    THREE.Vector2 {
    const transform =
      this.paperTransform(
        section,
      );

    return new THREE.Vector2(
      (
        x
        - transform.offsetX
      )
      / transform.scale,
      (
        transform.offsetY
        + transform.drawingHeight
        - y
      )
      / transform.scale,
    );
  }


  private pickReference(
    paperX: number,
    paperY: number,
  ):
    DrawingPointReference | null {
    const snapshot =
      this.snapshot;

    if (!snapshot) {
      return null;
    }

    const sectionPoint =
      this.paperToSection(
        snapshot.section,
        paperX,
        paperY,
      );
    const transform =
      this.paperTransform(
        snapshot.section,
      );
    const tolerance =
      18
      / transform.scale;
    let best:
      {
        segment: DrawingSegment;
        point: THREE.Vector2;
        distance: number;
      }
      | null =
        null;

    for (
      const segment
      of snapshot.segments
    ) {
      const point =
        this.closestPointOnSegment(
          sectionPoint,
          segment,
        );
      const distance =
        point.distanceTo(
          sectionPoint,
        );

      if (
        distance > tolerance
        || (
          best
          && distance >= best.distance
        )
      ) {
        continue;
      }

      best = {
        segment,
        point,
        distance,
      };
    }

    if (!best) {
      return null;
    }

    return {
      instanceId:
        best.segment.instanceId,
      x:
        best.point.x,
      y:
        best.point.y,
    };
  }


  private resolveReference(
    reference: DrawingPointReference,
  ):
    {
      readonly point: THREE.Vector2;
      readonly lost: boolean;
    } {
    const snapshot =
      this.snapshot;

    if (!snapshot) {
      return {
        point:
          new THREE.Vector2(),
        lost:
          true,
      };
    }

    const candidates =
      snapshot.segments.filter(
        (
          segment,
        ) =>
          segment.instanceId
          === reference.instanceId,
      );

    if (candidates.length < 1) {
      return {
        point:
          this.sectionToPaper(
            snapshot.section,
            reference.x,
            reference.y,
          ),
        lost:
          true,
      };
    }

    const source =
      new THREE.Vector2(
        reference.x,
        reference.y,
      );
    let bestPoint =
      source.clone();
    let bestDistance =
      Number.POSITIVE_INFINITY;

    for (
      const segment
      of candidates
    ) {
      const point =
        this.closestPointOnSegment(
          source,
          segment,
        );
      const distance =
        point.distanceToSquared(
          source,
        );

      if (distance < bestDistance) {
        bestDistance =
          distance;
        bestPoint =
          point;
      }
    }

    return {
      point:
        this.sectionToPaper(
          snapshot.section,
          bestPoint.x,
          bestPoint.y,
        ),
      lost:
        false,
    };
  }


  private closestPointOnSegment(
    point: THREE.Vector2,
    segment: DrawingSegment,
  ):
    THREE.Vector2 {
    const a =
      new THREE.Vector2(
        segment.x1,
        segment.y1,
      );
    const b =
      new THREE.Vector2(
        segment.x2,
        segment.y2,
      );
    const ab =
      b.clone()
        .sub(
          a,
        );
    const denominator =
      ab.lengthSq();

    if (denominator <= EPSILON) {
      return a;
    }

    const t =
      THREE.MathUtils.clamp(
        point.clone()
          .sub(
            a,
          )
          .dot(
            ab,
          )
        / denominator,
        0,
        1,
      );

    return a.addScaledVector(
      ab,
      t,
    );
  }


  private render(): void {
    const snapshot =
      this.snapshot;
    const document =
      this.getActiveDocument();

    while (
      this.svg.firstChild
    ) {
      this.svg.firstChild.remove();
    }

    if (
      !snapshot
      || !document
    ) {
      return;
    }

    this.appendSvgRect(
      0.5,
      0.5,
      SHEET_WIDTH - 1,
      SHEET_HEIGHT - 1,
      "none",
      "#111",
      1,
    );

    const transform =
      this.paperTransform(
        snapshot.section,
      );

    this.appendSvgRect(
      transform.offsetX,
      transform.offsetY,
      snapshot.section.width
      * transform.scale,
      snapshot.section.height
      * transform.scale,
      "none",
      "#aab0b4",
      0.8,
    );

    for (
      const segment
      of snapshot.segments
    ) {
      const a =
        this.sectionToPaper(
          snapshot.section,
          segment.x1,
          segment.y1,
        );
      const b =
        this.sectionToPaper(
          snapshot.section,
          segment.x2,
          segment.y2,
        );

      this.appendSvgLine(
        a.x,
        a.y,
        b.x,
        b.y,
        "#181818",
        segment.cut
          ? 1.5
          : 0.65,
      );
    }

    for (
      const annotation
      of document.annotations
    ) {
      if (
        annotation.kind === "DIMENSION"
      ) {
        this.renderDimension(
          annotation,
          snapshot.section,
        );
      }
      else if (
        annotation.kind === "LABEL"
      ) {
        this.renderLabel(
          annotation,
        );
      }
      else {
        this.renderText(
          annotation,
        );
      }
    }

    this.appendSvgText(
      34,
      SHEET_HEIGHT - 36,
      snapshot.section.name,
      16,
      "#111",
      "start",
      undefined,
    );
    this.appendSvgText(
      SHEET_WIDTH - 34,
      SHEET_HEIGHT - 36,
      `Profundidad ${this.formatNumber(snapshot.section.depth)} m`,
      11,
      "#333",
      "end",
      undefined,
    );
  }


  private renderDimension(
    annotation: DimensionAnnotation,
    section: SectionViewDefinition,
  ): void {
    const a =
      this.resolveReference(
        annotation.a,
      );
    const b =
      this.resolveReference(
        annotation.b,
      );
    const lost =
      a.lost
      || b.lost;
    const da =
      a.point.clone()
        .add(
          new THREE.Vector2(
            annotation.offsetX,
            annotation.offsetY,
          ),
        );
    const db =
      b.point.clone()
        .add(
          new THREE.Vector2(
            annotation.offsetX,
            annotation.offsetY,
          ),
        );
    const color =
      lost
        ? "#d33"
        : "#135f89";
    const selected =
      this.selectedAnnotationId
      === annotation.id;
    const width =
      selected
        ? 2
        : 1.15;

    this.appendSvgLine(
      a.point.x,
      a.point.y,
      da.x,
      da.y,
      color,
      0.75,
      annotation.id,
    );
    this.appendSvgLine(
      b.point.x,
      b.point.y,
      db.x,
      db.y,
      color,
      0.75,
      annotation.id,
    );
    this.appendSvgLine(
      da.x,
      da.y,
      db.x,
      db.y,
      color,
      width,
      annotation.id,
    );

    const direction =
      db.clone()
        .sub(
          da,
        );

    if (direction.lengthSq() > EPSILON) {
      direction.normalize();
      const normal =
        new THREE.Vector2(
          -direction.y,
          direction.x,
        );
      const arrow =
        6;

      this.appendSvgLine(
        da.x
        - direction.x * arrow
        + normal.x * arrow * 0.55,
        da.y
        - direction.y * arrow
        + normal.y * arrow * 0.55,
        da.x,
        da.y,
        color,
        width,
        annotation.id,
      );
      this.appendSvgLine(
        da.x
        - direction.x * arrow
        - normal.x * arrow * 0.55,
        da.y
        - direction.y * arrow
        - normal.y * arrow * 0.55,
        da.x,
        da.y,
        color,
        width,
        annotation.id,
      );
      this.appendSvgLine(
        db.x
        + direction.x * arrow
        + normal.x * arrow * 0.55,
        db.y
        + direction.y * arrow
        + normal.y * arrow * 0.55,
        db.x,
        db.y,
        color,
        width,
        annotation.id,
      );
      this.appendSvgLine(
        db.x
        + direction.x * arrow
        - normal.x * arrow * 0.55,
        db.y
        + direction.y * arrow
        - normal.y * arrow * 0.55,
        db.x,
        db.y,
        color,
        width,
        annotation.id,
      );
    }

    const value =
      Math.hypot(
        annotation.b.x
        - annotation.a.x,
        annotation.b.y
        - annotation.a.y,
      );
    const midpoint =
      da.clone()
        .add(
          db,
        )
        .multiplyScalar(
          0.5,
        );

    this.appendSvgText(
      midpoint.x,
      midpoint.y - 6,
      lost
        ? "⚠ REFERENCIA PERDIDA"
        : `${this.formatNumber(value)} m`,
      12,
      color,
      "middle",
      annotation.id,
    );

    void section;
  }


  private renderLabel(
    annotation: LabelAnnotation,
  ): void {
    const target =
      this.resolveReference(
        annotation.target,
      );
    const labelPoint =
      target.point.clone()
        .add(
          new THREE.Vector2(
            annotation.offsetX,
            annotation.offsetY,
          ),
        );
    const color =
      target.lost
        ? "#d33"
        : "#1b4f69";

    this.appendSvgLine(
      target.point.x,
      target.point.y,
      labelPoint.x,
      labelPoint.y,
      color,
      1,
      annotation.id,
    );
    this.appendSvgText(
      labelPoint.x + 5,
      labelPoint.y - 3,
      target.lost
        ? `⚠ ${annotation.text}`
        : annotation.text,
      12,
      color,
      "start",
      annotation.id,
    );
  }


  private renderText(
    annotation: TextAnnotation,
  ): void {
    this.appendSvgText(
      annotation.x,
      annotation.y,
      annotation.text,
      13,
      this.selectedAnnotationId
      === annotation.id
        ? "#0b6b9c"
        : "#222",
      "start",
      annotation.id,
    );
  }


  private appendSvgLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
    strokeWidth: number,
    annotationId?: string,
  ): void {
    const line =
      document.createElementNS(
        SVG_NS,
        "line",
      );

    line.setAttribute(
      "x1",
      String(x1),
    );
    line.setAttribute(
      "y1",
      String(y1),
    );
    line.setAttribute(
      "x2",
      String(x2),
    );
    line.setAttribute(
      "y2",
      String(y2),
    );
    line.setAttribute(
      "stroke",
      stroke,
    );
    line.setAttribute(
      "stroke-width",
      String(strokeWidth),
    );
    line.setAttribute(
      "vector-effect",
      "non-scaling-stroke",
    );

    if (annotationId) {
      line.setAttribute(
        "data-annotation-id",
        annotationId,
      );
      line.style.cursor =
        "move";
    }

    this.svg.append(
      line,
    );
  }


  private appendSvgRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string,
    strokeWidth: number,
  ): void {
    const rect =
      document.createElementNS(
        SVG_NS,
        "rect",
      );

    rect.setAttribute(
      "x",
      String(x),
    );
    rect.setAttribute(
      "y",
      String(y),
    );
    rect.setAttribute(
      "width",
      String(width),
    );
    rect.setAttribute(
      "height",
      String(height),
    );
    rect.setAttribute(
      "fill",
      fill,
    );
    rect.setAttribute(
      "stroke",
      stroke,
    );
    rect.setAttribute(
      "stroke-width",
      String(strokeWidth),
    );
    rect.style.pointerEvents =
      "none";
    this.svg.append(
      rect,
    );
  }


  private appendSvgText(
    x: number,
    y: number,
    text: string,
    fontSize: number,
    fill: string,
    anchor: "start" | "middle" | "end",
    annotationId?: string,
  ): void {
    const element =
      document.createElementNS(
        SVG_NS,
        "text",
      );

    element.setAttribute(
      "x",
      String(x),
    );
    element.setAttribute(
      "y",
      String(y),
    );
    element.setAttribute(
      "font-size",
      String(fontSize),
    );
    element.setAttribute(
      "font-family",
      "Arial, Helvetica, sans-serif",
    );
    element.setAttribute(
      "fill",
      fill,
    );
    element.setAttribute(
      "text-anchor",
      anchor,
    );
    element.textContent =
      text;

    if (annotationId) {
      element.setAttribute(
        "data-annotation-id",
        annotationId,
      );
      element.style.cursor =
        "move";
    }
    else {
      element.style.pointerEvents =
        "none";
    }

    this.svg.append(
      element,
    );
  }


  private buildSnapshot(
    section: SectionViewDefinition,
  ):
    DrawingSnapshot {
    const segments:
      DrawingSegment[] = [];
    const worldToSection =
      this.sectionWorldToLocalMatrix(
        section,
      );

    for (
      const [
        instanceId,
        object,
      ]
      of this.designScene.getInstanceEntries()
    ) {
      if (!object.visible) {
        continue;
      }

      object.updateWorldMatrix(
        true,
        true,
      );
      object.traverse(
        (
          child,
        ) => {
          if (
            !(child instanceof THREE.Mesh)
            || !child.visible
          ) {
            return;
          }

          const edgeGeometry =
            new THREE.EdgesGeometry(
              child.geometry,
              28,
            );
          const position =
            edgeGeometry.getAttribute(
              "position",
            );

          for (
            let index = 0;
            index + 1 < position.count;
            index += 2
          ) {
            const a =
              new THREE.Vector3()
                .fromBufferAttribute(
                  position,
                  index,
                )
                .applyMatrix4(
                  child.matrixWorld,
                )
                .applyMatrix4(
                  worldToSection,
                );
            const b =
              new THREE.Vector3()
                .fromBufferAttribute(
                  position,
                  index + 1,
                )
                .applyMatrix4(
                  child.matrixWorld,
                )
                .applyMatrix4(
                  worldToSection,
                );
            const clipped =
              this.clipSegmentToBox(
                a,
                b,
                section,
              );

            if (clipped) {
              segments.push({
                instanceId,
                x1:
                  clipped[0].x,
                y1:
                  clipped[0].y,
                x2:
                  clipped[1].x,
                y2:
                  clipped[1].y,
                cut:
                  false,
              });
            }
          }

          edgeGeometry.dispose();

          for (
            const segment
            of this.extractCutSegments(
              child,
              worldToSection,
              section,
            )
          ) {
            segments.push({
              instanceId,
              ...segment,
              cut:
                true,
            });
          }
        },
      );
    }

    return {
      section,
      segments,
    };
  }


  private extractCutSegments(
    mesh: THREE.Mesh,
    worldToSection: THREE.Matrix4,
    section: SectionViewDefinition,
  ):
    Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }> {
    const result:
      Array<{
        x1: number;
        y1: number;
        x2: number;
        y2: number;
      }> = [];
    const geometry =
      mesh.geometry;
    const position =
      geometry.getAttribute(
        "position",
      );

    if (
      !position
      || position.count < 3
    ) {
      return result;
    }

    const geometryIndex =
      geometry.getIndex();
    const triangleCount =
      geometryIndex
        ? Math.floor(
            geometryIndex.count / 3,
          )
        : Math.floor(
            position.count / 3,
          );

    const readVertex =
      (
        vertexIndex: number,
      ) =>
        new THREE.Vector3()
          .fromBufferAttribute(
            position,
            vertexIndex,
          )
          .applyMatrix4(
            mesh.matrixWorld,
          )
          .applyMatrix4(
            worldToSection,
          );

    for (
      let triangle = 0;
      triangle < triangleCount;
      triangle += 1
    ) {
      const base =
        triangle * 3;
      const ia =
        geometryIndex
          ? geometryIndex.getX(base)
          : base;
      const ib =
        geometryIndex
          ? geometryIndex.getX(base + 1)
          : base + 1;
      const ic =
        geometryIndex
          ? geometryIndex.getX(base + 2)
          : base + 2;
      const points =
        this.intersectTriangleWithPlane(
          readVertex(ia),
          readVertex(ib),
          readVertex(ic),
        );

      if (points.length < 2) {
        continue;
      }

      const first =
        points[0];
      const second =
        points[1];

      if (
        !first
        || !second
      ) {
        continue;
      }

      const clipped =
        this.clipCutSegment(
          first,
          second,
          section,
        );

      if (clipped) {
        result.push({
          x1:
            clipped[0].x,
          y1:
            clipped[0].y,
          x2:
            clipped[1].x,
          y2:
            clipped[1].y,
        });
      }
    }

    return result;
  }


  private intersectTriangleWithPlane(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
  ):
    THREE.Vector3[] {
    const vertices =
      [
        a,
        b,
        c,
      ];

    if (
      vertices.every(
        (
          point,
        ) =>
          Math.abs(point.z)
          <= EPSILON,
      )
    ) {
      return [];
    }

    const intersections:
      THREE.Vector3[] = [];

    for (
      let index = 0;
      index < 3;
      index += 1
    ) {
      const first =
        vertices[index];
      const second =
        vertices[(index + 1) % 3];

      if (
        !first
        || !second
      ) {
        continue;
      }

      if (
        Math.abs(first.z)
        <= EPSILON
      ) {
        this.pushUniquePoint(
          intersections,
          first,
        );
      }

      if (
        first.z * second.z
        < 0
      ) {
        const t =
          first.z
          / (
            first.z
            - second.z
          );
        const point =
          first.clone()
            .lerp(
              second,
              t,
            );

        point.z =
          0;
        this.pushUniquePoint(
          intersections,
          point,
        );
      }
    }

    return intersections.slice(
      0,
      2,
    );
  }


  private pushUniquePoint(
    points: THREE.Vector3[],
    point: THREE.Vector3,
  ): void {
    if (
      points.some(
        (
          current,
        ) =>
          current.distanceToSquared(
            point,
          )
          <= 1e-12,
      )
    ) {
      return;
    }

    points.push(
      point.clone(),
    );
  }


  private clipCutSegment(
    a: THREE.Vector3,
    b: THREE.Vector3,
    section: SectionViewDefinition,
  ):
    [THREE.Vector3, THREE.Vector3]
    | null {
    const start =
      a.clone();
    const end =
      b.clone();

    start.z =
      EPSILON;
    end.z =
      EPSILON;

    return this.clipSegmentToBox(
      start,
      end,
      {
        ...section,
        depth:
          EPSILON * 2,
      },
    );
  }


  private clipSegmentToBox(
    start: THREE.Vector3,
    end: THREE.Vector3,
    section: SectionViewDefinition,
  ):
    [THREE.Vector3, THREE.Vector3]
    | null {
    let t0 =
      0;
    let t1 =
      1;
    const delta =
      end.clone()
        .sub(
          start,
        );
    const axes = [
      {
        start:
          start.x,
        delta:
          delta.x,
        min:
          0,
        max:
          section.width,
      },
      {
        start:
          start.y,
        delta:
          delta.y,
        min:
          0,
        max:
          section.height,
      },
      {
        start:
          start.z,
        delta:
          delta.z,
        min:
          0,
        max:
          section.depth,
      },
    ];

    for (
      const axis
      of axes
    ) {
      if (
        Math.abs(axis.delta)
        <= EPSILON
      ) {
        if (
          axis.start < axis.min
          || axis.start > axis.max
        ) {
          return null;
        }
        continue;
      }

      let near =
        (
          axis.min
          - axis.start
        )
        / axis.delta;
      let far =
        (
          axis.max
          - axis.start
        )
        / axis.delta;

      if (near > far) {
        [near, far] =
          [far, near];
      }

      t0 =
        Math.max(
          t0,
          near,
        );
      t1 =
        Math.min(
          t1,
          far,
        );

      if (t0 > t1) {
        return null;
      }
    }

    return [
      start.clone()
        .addScaledVector(
          delta,
          t0,
        ),
      start.clone()
        .addScaledVector(
          delta,
          t1,
        ),
    ];
  }


  private sectionWorldToLocalMatrix(
    section: SectionViewDefinition,
  ):
    THREE.Matrix4 {
    const matrix =
      new THREE.Matrix4()
        .makeBasis(
          new THREE.Vector3(
            section.xAxis.x,
            section.xAxis.y,
            section.xAxis.z,
          ),
          new THREE.Vector3(
            section.yAxis.x,
            section.yAxis.y,
            section.yAxis.z,
          ),
          new THREE.Vector3(
            section.normal.x,
            section.normal.y,
            section.normal.z,
          ),
        );

    matrix.setPosition(
      section.origin.x,
      section.origin.y,
      section.origin.z,
    );
    return matrix.invert();
  }


  private readonly exportPdf =
    (): void => {
      const snapshot =
        this.snapshot;
      const document =
        this.getActiveDocument();

      if (
        !snapshot
        || !document
      ) {
        return;
      }

      const pdf =
        this.createPdf(
          snapshot,
          document,
        );
      const blob =
        new Blob(
          [
            pdf,
          ],
          {
            type:
              "application/pdf",
          },
        );
      const url =
        URL.createObjectURL(
          blob,
        );
      const anchor =
        document.createElement(
          "a",
        );

      anchor.href =
        url;
      anchor.download =
        `${this.fileSafeName(snapshot.section.name)}_plano.pdf`;
      anchor.click();
      window.setTimeout(
        () =>
          URL.revokeObjectURL(
            url,
          ),
        0,
      );
    };


  private createPdf(
    snapshot: DrawingSnapshot,
    drawingDocument: DrawingDocument,
  ):
    Uint8Array<ArrayBuffer> {
    const pageWidth =
      1190.55;
    const pageHeight =
      841.89;
    const sx =
      pageWidth
      / SHEET_WIDTH;
    const sy =
      pageHeight
      / SHEET_HEIGHT;
    const toPdfX =
      (
        value: number,
      ) =>
        value * sx;
    const toPdfY =
      (
        value: number,
      ) =>
        pageHeight
        - value * sy;
    const commands:
      string[] = [
        "q",
        "1 J 1 j",
        "0 G 0.45 w",
      ];

    for (
      const segment
      of snapshot.segments
    ) {
      const a =
        this.sectionToPaper(
          snapshot.section,
          segment.x1,
          segment.y1,
        );
      const b =
        this.sectionToPaper(
          snapshot.section,
          segment.x2,
          segment.y2,
        );

      commands.push(
        `${this.pdfNumber(toPdfX(a.x))} ${this.pdfNumber(toPdfY(a.y))} m ${this.pdfNumber(toPdfX(b.x))} ${this.pdfNumber(toPdfY(b.y))} l S`,
      );
    }

    commands.push(
      "0.05 0.30 0.45 RG 0.75 w",
    );

    for (
      const annotation
      of drawingDocument.annotations
    ) {
      if (
        annotation.kind === "DIMENSION"
      ) {
        const a =
          this.resolveReference(
            annotation.a,
          );
        const b =
          this.resolveReference(
            annotation.b,
          );
        const da =
          a.point.clone()
            .add(
              new THREE.Vector2(
                annotation.offsetX,
                annotation.offsetY,
              ),
            );
        const db =
          b.point.clone()
            .add(
              new THREE.Vector2(
                annotation.offsetX,
                annotation.offsetY,
              ),
            );

        commands.push(
          this.pdfLine(
            a.point,
            da,
            toPdfX,
            toPdfY,
          ),
          this.pdfLine(
            b.point,
            db,
            toPdfX,
            toPdfY,
          ),
          this.pdfLine(
            da,
            db,
            toPdfX,
            toPdfY,
          ),
        );

        const midpoint =
          da.clone()
            .add(
              db,
            )
            .multiplyScalar(
              0.5,
            );
        const value =
          Math.hypot(
            annotation.b.x
            - annotation.a.x,
            annotation.b.y
            - annotation.a.y,
          );
        const text =
          a.lost
          || b.lost
            ? "REFERENCIA PERDIDA"
            : `${this.formatNumber(value)} m`;

        commands.push(
          this.pdfTextCommand(
            midpoint.x,
            midpoint.y - 6,
            text,
            9,
            toPdfX,
            toPdfY,
          ),
        );
      }
      else if (
        annotation.kind === "LABEL"
      ) {
        const target =
          this.resolveReference(
            annotation.target,
          );
        const label =
          target.point.clone()
            .add(
              new THREE.Vector2(
                annotation.offsetX,
                annotation.offsetY,
              ),
            );

        commands.push(
          this.pdfLine(
            target.point,
            label,
            toPdfX,
            toPdfY,
          ),
          this.pdfTextCommand(
            label.x + 5,
            label.y - 3,
            target.lost
              ? `REF PERDIDA ${annotation.text}`
              : annotation.text,
            9,
            toPdfX,
            toPdfY,
          ),
        );
      }
      else {
        commands.push(
          this.pdfTextCommand(
            annotation.x,
            annotation.y,
            annotation.text,
            10,
            toPdfX,
            toPdfY,
          ),
        );
      }
    }

    commands.push(
      "0 G",
      this.pdfTextCommand(
        34,
        SHEET_HEIGHT - 36,
        snapshot.section.name,
        12,
        toPdfX,
        toPdfY,
      ),
      "Q",
    );

    const stream =
      commands.join(
        "\n",
      );
    const encoder =
      new TextEncoder();
    const streamLength =
      encoder.encode(
        stream,
      ).length;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pdfNumber(pageWidth)} ${this.pdfNumber(pageHeight)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`,
    ];

    let pdf =
      "%PDF-1.4\n";
    const offsets:
      number[] = [
        0,
      ];

    for (
      let index = 0;
      index < objects.length;
      index += 1
    ) {
      offsets.push(
        encoder.encode(
          pdf,
        ).length,
      );
      pdf +=
        `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefOffset =
      encoder.encode(
        pdf,
      ).length;

    pdf +=
      `xref\n0 ${objects.length + 1}\n`;
    pdf +=
      "0000000000 65535 f \n";

    for (
      let index = 1;
      index < offsets.length;
      index += 1
    ) {
      pdf +=
        `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }

    pdf +=
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return encoder.encode(
      pdf,
    );
  }


  private pdfLine(
    a: THREE.Vector2,
    b: THREE.Vector2,
    toPdfX: (value: number) => number,
    toPdfY: (value: number) => number,
  ): string {
    return `${this.pdfNumber(toPdfX(a.x))} ${this.pdfNumber(toPdfY(a.y))} m ${this.pdfNumber(toPdfX(b.x))} ${this.pdfNumber(toPdfY(b.y))} l S`;
  }


  private pdfTextCommand(
    x: number,
    y: number,
    value: string,
    fontSize: number,
    toPdfX: (value: number) => number,
    toPdfY: (value: number) => number,
  ): string {
    return `BT /F1 ${this.pdfNumber(fontSize)} Tf ${this.pdfNumber(toPdfX(x))} ${this.pdfNumber(toPdfY(y))} Td (${this.pdfText(value)}) Tj ET`;
  }


  private pdfNumber(
    value: number,
  ): string {
    return value.toFixed(
      3,
    );
  }


  private pdfText(
    value: string,
  ): string {
    return value
      .normalize(
        "NFD",
      )
      .replace(
        /[\u0300-\u036f]/g,
        "",
      )
      .replace(
        /[^\x20-\x7E]/g,
        "",
      )
      .replace(
        /\\/g,
        "\\\\",
      )
      .replace(
        /\(/g,
        "\\(",
      )
      .replace(
        /\)/g,
        "\\)",
      );
  }


  private fileSafeName(
    value: string,
  ): string {
    return this.pdfText(
      value,
    )
      .replace(
        /[^A-Za-z0-9_-]+/g,
        "_",
      );
  }


  private formatNumber(
    value: number,
  ): string {
    return Number(
      value.toFixed(
        4,
      ),
    ).toString();
  }
}
