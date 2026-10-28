import type {
  AssemblyPdfController,
} from "./AssemblyPdfController";


type Tool =
  | "SELECT"
  | "DIMENSION"
  | "LABEL"
  | "TEXT"
  | "DETAIL"
  | "CLOUD";


type DimensionMode =
  | "ALIGNED"
  | "HORIZONTAL"
  | "VERTICAL";


type UnitMode =
  | "mm"
  | "m";


interface LocalPoint {
  x: number;
  y: number;
}


interface DimensionAnnotation {
  readonly id: string;
  readonly viewId: string;
  readonly kind: "DIMENSION";
  a: LocalPoint;
  b: LocalPoint;
  offsetX: number;
  offsetY: number;
  mode: DimensionMode;
}


interface LabelAnnotation {
  readonly id: string;
  readonly viewId: string;
  readonly kind: "LABEL";
  target: LocalPoint;
  text: string;
  offsetX: number;
  offsetY: number;
}


interface TextAnnotation {
  readonly id: string;
  readonly viewId: string;
  readonly kind: "TEXT";
  x: number;
  y: number;
  text: string;
}


interface DetailAnnotation {
  readonly id: string;
  readonly viewId: string;
  readonly kind: "DETAIL";
  x: number;
  y: number;
  text: string;
}


interface CloudAnnotation {
  readonly id: string;
  readonly viewId: string;
  readonly kind: "CLOUD";
  a: LocalPoint;
  b: LocalPoint;
  text: string;
}


type AssemblyAnnotation =
  | DimensionAnnotation
  | LabelAnnotation
  | TextAnnotation
  | DetailAnnotation
  | CloudAnnotation;


interface PlanSegmentRuntime {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}


interface AssemblyViewRuntime {
  readonly id: string;
  readonly assemblyName: string;
  readonly width: number;
  readonly height: number;
  readonly segments: readonly PlanSegmentRuntime[];
  resolved: boolean;
}


interface AssemblySheetRuntime {
  readonly id: string;
  readonly name: string;
  readonly views: AssemblyViewRuntime[];
}


interface PaperLineRuntime {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}


interface PaperLabelRuntime {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly size: number;
}


interface PaperFrameRuntime {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}


interface PaperLayoutRuntime {
  readonly lines: readonly PaperLineRuntime[];
  readonly labels: readonly PaperLabelRuntime[];
  readonly frames: readonly PaperFrameRuntime[];
}


interface AssemblyPdfRuntime {
  readonly overlay: HTMLDivElement;
  readonly svg: SVGSVGElement;
  readonly sheets: AssemblySheetRuntime[];
  activeSheetId: string | null;
  render(): void;
  layout(sheet: AssemblySheetRuntime): PaperLayoutRuntime;
  getActiveSheet(): AssemblySheetRuntime | null;
  createSnapshot(): unknown;
  restoreSnapshot(snapshot: unknown): void;
}


interface ViewPlacement {
  readonly frame: PaperFrameRuntime;
  readonly originX: number;
  readonly originY: number;
  readonly drawnWidth: number;
  readonly drawnHeight: number;
  readonly scale: number;
}


interface AnnotationGraphics {
  readonly lines: PaperLineRuntime[];
  readonly labels: PaperLabelRuntime[];
}


interface DragState {
  readonly annotationId: string;
  readonly startPaper: LocalPoint;
  readonly original: AssemblyAnnotation;
}


interface AnnotationSnapshotExtension {
  readonly assemblyAnnotations?: readonly {
    readonly viewId: string;
    readonly annotations: readonly AssemblyAnnotation[];
  }[];
  readonly assemblyAnnotationStyle?: {
    readonly unit: UnitMode;
    readonly precision: number;
    readonly textSize: number;
  };
}


const SVG_NS =
  "http://www.w3.org/2000/svg";
const SHEET_WIDTH =
  1120;
const SHEET_HEIGHT =
  792;
const LEFT =
  42;
const RIGHT =
  42;
const TOP =
  42;
const BOTTOM =
  70;
const VIEW_GAP =
  18;
const EPSILON =
  1e-8;


/**
 * Herramientas de documentación para las vistas de ensamble.
 *
 * Reutiliza la misma hoja y el mismo exportador de AssemblyPdfController:
 * `layout()` se amplía con anotaciones, por lo que lo que se ve en pantalla
 * también se escribe en el PDF. createSnapshot/restoreSnapshot se amplían con
 * datos livianos para conservar las anotaciones dentro del `.flproject`.
 */
export class AssemblyPdfAnnotationController {
  private readonly runtime: AssemblyPdfRuntime;
  private readonly baseRender: () => void;
  private readonly baseLayout:
    (sheet: AssemblySheetRuntime) => PaperLayoutRuntime;
  private readonly baseCreateSnapshot: () => unknown;
  private readonly baseRestoreSnapshot: (snapshot: unknown) => void;
  private readonly documents =
    new Map<string, AssemblyAnnotation[]>();
  private readonly controls: HTMLElement[] = [];
  private readonly toolButtons =
    new Map<Tool, HTMLButtonElement>();
  private readonly status: HTMLSpanElement;

  private tool: Tool =
    "SELECT";
  private dimensionMode: DimensionMode =
    "ALIGNED";
  private unit: UnitMode =
    "mm";
  private precision =
    0;
  private textSize =
    11;
  private pendingPoint:
    LocalPoint | null =
      null;
  private selectedAnnotationId:
    string | null =
      null;
  private dragState:
    DragState | null =
      null;
  private disposed =
    false;

  constructor(
    options: {
      readonly assemblyPdf: AssemblyPdfController;
    },
  ) {
    this.runtime =
      options.assemblyPdf as unknown as AssemblyPdfRuntime;
    this.baseRender =
      this.runtime.render.bind(options.assemblyPdf);
    this.baseLayout =
      this.runtime.layout.bind(options.assemblyPdf);
    this.baseCreateSnapshot =
      this.runtime.createSnapshot.bind(options.assemblyPdf);
    this.baseRestoreSnapshot =
      this.runtime.restoreSnapshot.bind(options.assemblyPdf);

    this.status =
      document.createElement("span");
    this.status.dataset["framelogicAssemblyPdfAnnotationStatus"] =
      "true";
    Object.assign(this.status.style, {
      maxWidth: "220px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      color: "#aebfc7",
      fontSize: "10px",
    });

    this.installToolbar();

    this.runtime.layout = (
      sheet: AssemblySheetRuntime,
    ): PaperLayoutRuntime => {
      const base =
        this.baseLayout(sheet);
      const extra =
        this.buildAnnotationGraphics(sheet);
      return {
        ...base,
        lines: [
          ...base.lines,
          ...extra.lines,
        ],
        labels: [
          ...base.labels,
          ...extra.labels,
        ],
      };
    };

    this.runtime.render = (): void => {
      this.cleanupOrphans();
      this.baseRender();
      this.decorateAnnotationHits();
      this.updateToolbarState();
    };

    this.runtime.createSnapshot = (): unknown => {
      const base =
        this.baseCreateSnapshot();
      const baseObject =
        base && typeof base === "object"
          ? base as Record<string, unknown>
          : {};

      return {
        ...baseObject,
        assemblyAnnotations:
          Array.from(this.documents.entries())
            .filter(([, annotations]) => annotations.length > 0)
            .map(([viewId, annotations]) => ({
              viewId,
              annotations:
                JSON.parse(
                  JSON.stringify(annotations),
                ) as AssemblyAnnotation[],
            })),
        assemblyAnnotationStyle: {
          unit: this.unit,
          precision: this.precision,
          textSize: this.textSize,
        },
      };
    };

    this.runtime.restoreSnapshot = (
      snapshot: unknown,
    ): void => {
      this.baseRestoreSnapshot(snapshot);
      this.restoreAnnotationSnapshot(snapshot);
      this.selectedAnnotationId = null;
      this.pendingPoint = null;
      this.runtime.render();
    };

    this.runtime.svg.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.runtime.svg.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.runtime.svg.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.runtime.svg.addEventListener(
      "pointercancel",
      this.handlePointerUp,
      true,
    );

    this.setTool("SELECT");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.runtime.svg.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.runtime.svg.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.runtime.svg.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.runtime.svg.removeEventListener(
      "pointercancel",
      this.handlePointerUp,
      true,
    );

    this.runtime.render =
      this.baseRender;
    this.runtime.layout =
      this.baseLayout;
    this.runtime.createSnapshot =
      this.baseCreateSnapshot;
    this.runtime.restoreSnapshot =
      this.baseRestoreSnapshot;

    for (const control of this.controls) {
      control.remove();
    }
    this.documents.clear();
  }

  private installToolbar(): void {
    const toolbar =
      this.runtime.overlay.firstElementChild as HTMLElement | null;
    if (!toolbar) return;
    toolbar.style.flexWrap =
      "wrap";

    const exportButton =
      Array.from(toolbar.querySelectorAll("button"))
        .find((button) => button.textContent === "Exportar PDF");

    const addTool = (
      tool: Tool,
      label: string,
    ): void => {
      const button =
        this.makeButton(label);
      button.addEventListener(
        "click",
        () => this.setTool(tool),
      );
      this.toolButtons.set(tool, button);
      this.insertControl(toolbar, button, exportButton);
    };

    addTool("SELECT", "Seleccionar");
    addTool("DIMENSION", "Cota");
    addTool("LABEL", "Label");
    addTool("TEXT", "Texto");

    const remove =
      this.makeButton("Borrar");
    remove.addEventListener(
      "click",
      () => this.deleteSelectedAnnotation(),
    );
    this.insertControl(toolbar, remove, exportButton);

    const dimensionSelect =
      this.makeSelect([
        ["ALIGNED", "Cota alineada"],
        ["HORIZONTAL", "Cota horizontal"],
        ["VERTICAL", "Cota vertical"],
      ]);
    dimensionSelect.title =
      "Tipo de cota";
    dimensionSelect.addEventListener(
      "change",
      () => {
        this.dimensionMode =
          dimensionSelect.value as DimensionMode;
        this.setTool("DIMENSION");
      },
    );
    this.insertControl(toolbar, dimensionSelect, exportButton);

    const unitSelect =
      this.makeSelect([
        ["mm", "mm"],
        ["m", "m"],
      ]);
    unitSelect.value =
      this.unit;
    unitSelect.title =
      "Unidad de cotas";
    unitSelect.addEventListener(
      "change",
      () => {
        this.unit =
          unitSelect.value as UnitMode;
        this.runtime.render();
      },
    );
    this.insertControl(toolbar, unitSelect, exportButton);

    const precisionSelect =
      this.makeSelect([
        ["0", "0"],
        ["1", "0.0"],
        ["2", "0.00"],
        ["3", "0.000"],
      ]);
    precisionSelect.value =
      String(this.precision);
    precisionSelect.title =
      "Decimales";
    precisionSelect.addEventListener(
      "change",
      () => {
        this.precision =
          Number(precisionSelect.value);
        this.runtime.render();
      },
    );
    this.insertControl(toolbar, precisionSelect, exportButton);

    const dimStyle =
      this.makeButton("DIMSTYLE");
    dimStyle.addEventListener(
      "click",
      () => this.editDimensionStyle(),
    );
    this.insertControl(toolbar, dimStyle, exportButton);

    const detail =
      this.makeButton("Detalle");
    detail.addEventListener(
      "click",
      () => this.setTool("DETAIL"),
    );
    this.toolButtons.set("DETAIL", detail);
    this.insertControl(toolbar, detail, exportButton);

    const cloud =
      this.makeButton("Nube rev");
    cloud.addEventListener(
      "click",
      () => this.setTool("CLOUD"),
    );
    this.toolButtons.set("CLOUD", cloud);
    this.insertControl(toolbar, cloud, exportButton);

    this.insertControl(toolbar, this.status, exportButton);
  }

  private insertControl(
    toolbar: HTMLElement,
    control: HTMLElement,
    exportButton: HTMLButtonElement | undefined,
  ): void {
    if (exportButton) {
      toolbar.insertBefore(control, exportButton);
    }
    else {
      toolbar.append(control);
    }
    this.controls.push(control);
  }

  private setTool(tool: Tool): void {
    this.tool = tool;
    this.pendingPoint = null;
    this.dragState = null;

    for (const [current, button] of this.toolButtons) {
      button.style.background =
        current === tool
          ? "#3b6d87"
          : "#27343c";
    }

    const messages: Record<Tool, string> = {
      SELECT: "Selecciona una anotación o viewport.",
      DIMENSION: "COTA: selecciona dos puntos de geometría.",
      LABEL: "LABEL: selecciona geometría de la vista.",
      TEXT: "TEXTO: haz clic dentro de la vista.",
      DETAIL: "DETALLE: haz clic en el punto a identificar.",
      CLOUD: "NUBE REV: dos clics definen el área.",
    };
    this.setStatus(messages[tool]);
  }

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (
      this.runtime.overlay.style.display === "none"
    ) {
      return;
    }

    if (this.tool === "SELECT") {
      return;
    }

    const selected =
      this.getSelectedView();
    const paper =
      this.eventToSheetPoint(event);
    if (!selected || !paper) {
      this.setStatus(
        "Selecciona primero una vista del ensamble.",
      );
      return;
    }

    const placement =
      this.getViewPlacement(
        selected.sheet,
        selected.index,
      );
    if (!placement || !this.pointInFrame(paper, placement.frame)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (
      this.tool === "DIMENSION"
      || this.tool === "LABEL"
    ) {
      const reference =
        this.pickReference(
          selected.view,
          placement,
          paper,
        );
      if (!reference) {
        this.setStatus(
          "No se encontró geometría cercana.",
        );
        return;
      }

      if (this.tool === "LABEL") {
        const text =
          window.prompt(
            "Texto del label",
            selected.view.assemblyName,
          );
        if (text === null) return;
        this.getDocument(selected.view.id).push({
          id: crypto.randomUUID(),
          viewId: selected.view.id,
          kind: "LABEL",
          target: reference,
          text: text.trim() || selected.view.assemblyName,
          offsetX: 48,
          offsetY: -32,
        });
        this.setTool("SELECT");
        this.runtime.render();
        return;
      }

      if (!this.pendingPoint) {
        this.pendingPoint = reference;
        this.setStatus(
          "COTA: primer punto tomado. Selecciona el segundo.",
        );
        return;
      }

      this.getDocument(selected.view.id).push({
        id: crypto.randomUUID(),
        viewId: selected.view.id,
        kind: "DIMENSION",
        a: this.pendingPoint,
        b: reference,
        offsetX:
          this.dimensionMode === "VERTICAL"
            ? 28
            : 0,
        offsetY: -28,
        mode: this.dimensionMode,
      });
      this.pendingPoint = null;
      this.setTool("SELECT");
      this.runtime.render();
      return;
    }

    const local =
      this.paperToLocal(
        placement,
        paper,
      );

    if (this.tool === "TEXT") {
      const text =
        window.prompt(
          "Texto",
          "Nota",
        );
      if (!text?.trim()) return;
      this.getDocument(selected.view.id).push({
        id: crypto.randomUUID(),
        viewId: selected.view.id,
        kind: "TEXT",
        x: local.x,
        y: local.y,
        text: text.trim(),
      });
      this.setTool("SELECT");
      this.runtime.render();
      return;
    }

    if (this.tool === "DETAIL") {
      const text =
        window.prompt(
          "Nombre del detalle",
          "DET A",
        );
      if (!text?.trim()) return;
      this.getDocument(selected.view.id).push({
        id: crypto.randomUUID(),
        viewId: selected.view.id,
        kind: "DETAIL",
        x: local.x,
        y: local.y,
        text: text.trim(),
      });
      this.setTool("SELECT");
      this.runtime.render();
      return;
    }

    if (this.tool === "CLOUD") {
      if (!this.pendingPoint) {
        this.pendingPoint = local;
        this.setStatus(
          "NUBE REV: selecciona la esquina opuesta.",
        );
        return;
      }
      this.getDocument(selected.view.id).push({
        id: crypto.randomUUID(),
        viewId: selected.view.id,
        kind: "CLOUD",
        a: this.pendingPoint,
        b: local,
        text: "REV",
      });
      this.pendingPoint = null;
      this.setTool("SELECT");
      this.runtime.render();
    }
  };

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    const drag =
      this.dragState;
    if (!drag) return;

    const paper =
      this.eventToSheetPoint(event);
    const selected =
      this.getSelectedView();
    if (!paper || !selected) return;
    const placement =
      this.getViewPlacement(
        selected.sheet,
        selected.index,
      );
    if (!placement) return;

    const annotation =
      this.findAnnotation(drag.annotationId);
    if (!annotation) return;

    const dx =
      paper.x - drag.startPaper.x;
    const dy =
      paper.y - drag.startPaper.y;
    const localDelta = {
      x: dx / Math.max(placement.scale, EPSILON),
      y: -dy / Math.max(placement.scale, EPSILON),
    };

    if (
      annotation.kind === "DIMENSION"
      && drag.original.kind === "DIMENSION"
    ) {
      annotation.offsetX = drag.original.offsetX + dx;
      annotation.offsetY = drag.original.offsetY + dy;
    }
    else if (
      annotation.kind === "LABEL"
      && drag.original.kind === "LABEL"
    ) {
      annotation.offsetX = drag.original.offsetX + dx;
      annotation.offsetY = drag.original.offsetY + dy;
    }
    else if (
      annotation.kind === "TEXT"
      && drag.original.kind === "TEXT"
    ) {
      annotation.x = drag.original.x + localDelta.x;
      annotation.y = drag.original.y + localDelta.y;
    }
    else if (
      annotation.kind === "DETAIL"
      && drag.original.kind === "DETAIL"
    ) {
      annotation.x = drag.original.x + localDelta.x;
      annotation.y = drag.original.y + localDelta.y;
    }
    else if (
      annotation.kind === "CLOUD"
      && drag.original.kind === "CLOUD"
    ) {
      annotation.a = {
        x: drag.original.a.x + localDelta.x,
        y: drag.original.a.y + localDelta.y,
      };
      annotation.b = {
        x: drag.original.b.x + localDelta.x,
        y: drag.original.b.y + localDelta.y,
      };
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.runtime.render();
  };

  private readonly handlePointerUp = (): void => {
    this.dragState = null;
  };

  private decorateAnnotationHits(): void {
    this.runtime.svg
      .querySelectorAll('[data-framelogic-assembly-annotation-hit="true"]')
      .forEach((element) => element.remove());

    const selected =
      this.getSelectedView();
    if (!selected) return;
    const placement =
      this.getViewPlacement(
        selected.sheet,
        selected.index,
      );
    if (!placement) return;

    for (const annotation of this.getDocument(selected.view.id)) {
      const graphics =
        this.graphicsForAnnotation(
          placement,
          annotation,
        );
      const bounds =
        this.graphicsBounds(graphics);
      if (!bounds) continue;

      const hit =
        document.createElementNS(
          SVG_NS,
          "rect",
        );
      hit.dataset["framelogicAssemblyAnnotationHit"] =
        "true";
      hit.dataset["annotationId"] =
        annotation.id;
      hit.setAttribute("x", String(bounds.x - 7));
      hit.setAttribute("y", String(bounds.y - 7));
      hit.setAttribute("width", String(bounds.width + 14));
      hit.setAttribute("height", String(bounds.height + 14));
      hit.setAttribute("fill", "transparent");
      hit.setAttribute(
        "stroke",
        annotation.id === this.selectedAnnotationId
          ? "#209ed3"
          : "transparent",
      );
      hit.setAttribute(
        "stroke-width",
        annotation.id === this.selectedAnnotationId
          ? "1.5"
          : "1",
      );
      hit.setAttribute("vector-effect", "non-scaling-stroke");
      hit.style.cursor =
        this.tool === "SELECT"
          ? "move"
          : "crosshair";
      hit.style.pointerEvents =
        "all";

      hit.addEventListener(
        "pointerdown",
        (event) => {
          if (this.tool !== "SELECT") return;
          const paper = this.eventToSheetPoint(event);
          if (!paper) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          this.selectedAnnotationId = annotation.id;
          this.dragState = {
            annotationId: annotation.id,
            startPaper: paper,
            original:
              JSON.parse(
                JSON.stringify(annotation),
              ) as AssemblyAnnotation,
          };
          this.runtime.render();
        },
      );
      hit.addEventListener(
        "dblclick",
        (event) => {
          if (this.tool !== "SELECT") return;
          event.preventDefault();
          event.stopImmediatePropagation();
          this.editAnnotationText(annotation);
        },
      );
      this.runtime.svg.append(hit);
    }
  }

  private buildAnnotationGraphics(
    sheet: AssemblySheetRuntime,
  ): AnnotationGraphics {
    const lines: PaperLineRuntime[] = [];
    const labels: PaperLabelRuntime[] = [];

    sheet.views.forEach((view, index) => {
      const placement =
        this.getViewPlacement(sheet, index);
      if (!placement) return;
      for (const annotation of this.getDocument(view.id)) {
        const graphics =
          this.graphicsForAnnotation(
            placement,
            annotation,
          );
        lines.push(...graphics.lines);
        labels.push(...graphics.labels);
      }
    });

    return {
      lines,
      labels,
    };
  }

  private graphicsForAnnotation(
    placement: ViewPlacement,
    annotation: AssemblyAnnotation,
  ): AnnotationGraphics {
    const lines: PaperLineRuntime[] = [];
    const labels: PaperLabelRuntime[] = [];

    if (annotation.kind === "DIMENSION") {
      const a =
        this.localToPaper(placement, annotation.a);
      const b =
        this.localToPaper(placement, annotation.b);
      let da = {
        x: a.x + annotation.offsetX,
        y: a.y + annotation.offsetY,
      };
      let db = {
        x: b.x + annotation.offsetX,
        y: b.y + annotation.offsetY,
      };

      if (annotation.mode === "HORIZONTAL") {
        const y =
          Math.min(a.y, b.y) + annotation.offsetY;
        da = { x: a.x, y };
        db = { x: b.x, y };
      }
      else if (annotation.mode === "VERTICAL") {
        const x =
          Math.max(a.x, b.x) + annotation.offsetX;
        da = { x, y: a.y };
        db = { x, y: b.y };
      }

      lines.push(
        { x1: a.x, y1: a.y, x2: da.x, y2: da.y },
        { x1: b.x, y1: b.y, x2: db.x, y2: db.y },
        { x1: da.x, y1: da.y, x2: db.x, y2: db.y },
      );

      const localValue =
        annotation.mode === "HORIZONTAL"
          ? Math.abs(annotation.b.x - annotation.a.x)
          : annotation.mode === "VERTICAL"
            ? Math.abs(annotation.b.y - annotation.a.y)
            : Math.hypot(
                annotation.b.x - annotation.a.x,
                annotation.b.y - annotation.a.y,
              );
      labels.push({
        x: (da.x + db.x) / 2,
        y: (da.y + db.y) / 2 - 6,
        text: this.formatDimension(localValue),
        size: this.textSize,
      });
    }
    else if (annotation.kind === "LABEL") {
      const target =
        this.localToPaper(
          placement,
          annotation.target,
        );
      const label = {
        x: target.x + annotation.offsetX,
        y: target.y + annotation.offsetY,
      };
      lines.push({
        x1: target.x,
        y1: target.y,
        x2: label.x,
        y2: label.y,
      });
      labels.push({
        x: label.x + 5,
        y: label.y - 3,
        text: annotation.text,
        size: this.textSize,
      });
    }
    else if (annotation.kind === "TEXT") {
      const point =
        this.localToPaper(
          placement,
          annotation,
        );
      labels.push({
        x: point.x,
        y: point.y,
        text: annotation.text,
        size: this.textSize + 1,
      });
    }
    else if (annotation.kind === "DETAIL") {
      const point =
        this.localToPaper(
          placement,
          annotation,
        );
      const half = 24;
      lines.push(
        { x1: point.x - half, y1: point.y - half, x2: point.x + half, y2: point.y - half },
        { x1: point.x + half, y1: point.y - half, x2: point.x + half, y2: point.y + half },
        { x1: point.x + half, y1: point.y + half, x2: point.x - half, y2: point.y + half },
        { x1: point.x - half, y1: point.y + half, x2: point.x - half, y2: point.y - half },
      );
      labels.push({
        x: point.x,
        y: point.y - half - 5,
        text: annotation.text,
        size: this.textSize,
      });
    }
    else {
      const a =
        this.localToPaper(placement, annotation.a);
      const b =
        this.localToPaper(placement, annotation.b);
      const minX = Math.min(a.x, b.x);
      const minY = Math.min(a.y, b.y);
      const maxX = Math.max(a.x, b.x);
      const maxY = Math.max(a.y, b.y);
      lines.push(
        { x1: minX, y1: minY, x2: maxX, y2: minY },
        { x1: maxX, y1: minY, x2: maxX, y2: maxY },
        { x1: maxX, y1: maxY, x2: minX, y2: maxY },
        { x1: minX, y1: maxY, x2: minX, y2: minY },
      );
      labels.push({
        x: minX + 4,
        y: minY - 5,
        text: annotation.text,
        size: this.textSize,
      });
    }

    return {
      lines,
      labels,
    };
  }

  private getSelectedView(): {
    readonly sheet: AssemblySheetRuntime;
    readonly view: AssemblyViewRuntime;
    readonly index: number;
  } | null {
    const id =
      this.runtime.overlay.dataset[
        "framelogicSelectedAssemblyPdfViewId"
      ];
    const sheet =
      this.runtime.getActiveSheet();
    if (!id || !sheet) return null;
    const index =
      sheet.views.findIndex((view) => view.id === id);
    if (index < 0) return null;
    const view = sheet.views[index];
    return view
      ? { sheet, view, index }
      : null;
  }

  private getDocument(
    viewId: string,
  ): AssemblyAnnotation[] {
    let document =
      this.documents.get(viewId);
    if (!document) {
      document = [];
      this.documents.set(viewId, document);
    }
    return document;
  }

  private findAnnotation(
    id: string,
  ): AssemblyAnnotation | null {
    for (const annotations of this.documents.values()) {
      const found =
        annotations.find((annotation) => annotation.id === id);
      if (found) return found;
    }
    return null;
  }

  private deleteSelectedAnnotation(): void {
    const id =
      this.selectedAnnotationId;
    if (!id) return;

    for (const annotations of this.documents.values()) {
      const index =
        annotations.findIndex((annotation) => annotation.id === id);
      if (index < 0) continue;
      annotations.splice(index, 1);
      this.selectedAnnotationId = null;
      this.runtime.render();
      return;
    }
  }

  private pickReference(
    view: AssemblyViewRuntime,
    placement: ViewPlacement,
    paper: LocalPoint,
  ): LocalPoint | null {
    const local =
      this.paperToLocal(placement, paper);
    const tolerance =
      15 / Math.max(placement.scale, EPSILON);
    let best:
      LocalPoint | null =
        null;
    let bestDistance =
      Number.POSITIVE_INFINITY;

    for (const segment of view.segments) {
      const point =
        this.closestPointOnSegment(local, segment);
      const distance =
        Math.hypot(
          point.x - local.x,
          point.y - local.y,
        );
      if (
        distance <= tolerance
        && distance < bestDistance
      ) {
        best = point;
        bestDistance = distance;
      }
    }
    return best;
  }

  private closestPointOnSegment(
    point: LocalPoint,
    segment: PlanSegmentRuntime,
  ): LocalPoint {
    const abX =
      segment.x2 - segment.x1;
    const abY =
      segment.y2 - segment.y1;
    const denominator =
      abX * abX + abY * abY;
    if (denominator <= EPSILON) {
      return {
        x: segment.x1,
        y: segment.y1,
      };
    }
    const t =
      Math.max(
        0,
        Math.min(
          1,
          (
            (point.x - segment.x1) * abX
            + (point.y - segment.y1) * abY
          ) / denominator,
        ),
      );
    return {
      x: segment.x1 + abX * t,
      y: segment.y1 + abY * t,
    };
  }

  private getViewPlacement(
    sheet: AssemblySheetRuntime,
    index: number,
  ): ViewPlacement | null {
    const view =
      sheet.views[index];
    if (!view) return null;

    const count =
      Math.max(sheet.views.length, 1);
    const columns =
      count === 1
        ? 1
        : count <= 4
          ? 2
          : Math.ceil(Math.sqrt(count));
    const rows =
      Math.ceil(count / columns);
    const availableWidth =
      SHEET_WIDTH - LEFT - RIGHT;
    const availableHeight =
      SHEET_HEIGHT - TOP - BOTTOM;
    const cellWidth =
      (
        availableWidth
        - VIEW_GAP * (columns - 1)
      ) / columns;
    const cellHeight =
      (
        availableHeight
        - VIEW_GAP * (rows - 1)
      ) / rows;
    const column =
      index % columns;
    const row =
      Math.floor(index / columns);
    const cellX =
      LEFT + column * (cellWidth + VIEW_GAP);
    const cellY =
      TOP + row * (cellHeight + VIEW_GAP);
    const titleHeight =
      26;
    const innerWidth =
      Math.max(cellWidth - 20, 1);
    const innerHeight =
      Math.max(cellHeight - titleHeight - 18, 1);
    const scale =
      Math.min(
        innerWidth / Math.max(view.width, EPSILON),
        innerHeight / Math.max(view.height, EPSILON),
      );
    const drawnWidth =
      view.width * scale;
    const drawnHeight =
      view.height * scale;
    const originX =
      cellX + (cellWidth - drawnWidth) / 2;
    const originY =
      cellY + titleHeight + (innerHeight - drawnHeight) / 2;

    return {
      frame: {
        x: cellX,
        y: cellY,
        width: cellWidth,
        height: cellHeight,
      },
      originX,
      originY,
      drawnWidth,
      drawnHeight,
      scale,
    };
  }

  private localToPaper(
    placement: ViewPlacement,
    point: LocalPoint,
  ): LocalPoint {
    return {
      x: placement.originX + point.x * placement.scale,
      y:
        placement.originY
        + placement.drawnHeight
        - point.y * placement.scale,
    };
  }

  private paperToLocal(
    placement: ViewPlacement,
    point: LocalPoint,
  ): LocalPoint {
    return {
      x:
        (point.x - placement.originX)
        / Math.max(placement.scale, EPSILON),
      y:
        (
          placement.originY
          + placement.drawnHeight
          - point.y
        ) / Math.max(placement.scale, EPSILON),
    };
  }

  private pointInFrame(
    point: LocalPoint,
    frame: PaperFrameRuntime,
  ): boolean {
    return point.x >= frame.x
      && point.y >= frame.y
      && point.x <= frame.x + frame.width
      && point.y <= frame.y + frame.height;
  }

  private eventToSheetPoint(
    event: PointerEvent | MouseEvent,
  ): LocalPoint | null {
    const ctm =
      this.runtime.svg.getScreenCTM();
    if (!ctm) return null;
    const point =
      new DOMPoint(
        event.clientX,
        event.clientY,
      ).matrixTransform(
        ctm.inverse(),
      );
    return {
      x: point.x,
      y: point.y,
    };
  }

  private graphicsBounds(
    graphics: AnnotationGraphics,
  ):
    {
      x: number;
      y: number;
      width: number;
      height: number;
    }
    | null {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const line of graphics.lines) {
      xs.push(line.x1, line.x2);
      ys.push(line.y1, line.y2);
    }
    for (const label of graphics.labels) {
      xs.push(
        label.x,
        label.x + Math.max(label.text.length, 1) * label.size * 0.58,
      );
      ys.push(
        label.y - label.size,
        label.y + 3,
      );
    }
    if (xs.length < 1 || ys.length < 1) return null;
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
    };
  }

  private editAnnotationText(
    annotation: AssemblyAnnotation,
  ): void {
    if (
      annotation.kind !== "LABEL"
      && annotation.kind !== "TEXT"
      && annotation.kind !== "DETAIL"
      && annotation.kind !== "CLOUD"
    ) {
      return;
    }
    const text =
      window.prompt(
        "Texto",
        annotation.text,
      );
    if (text === null) return;
    annotation.text = text.trim();
    this.runtime.render();
  }

  private editDimensionStyle(): void {
    const size =
      window.prompt(
        "Altura de texto de cotas (px)",
        String(this.textSize),
      );
    if (size === null) return;
    const numeric =
      Number(size);
    if (
      !Number.isFinite(numeric)
      || numeric < 6
      || numeric > 30
    ) {
      window.alert(
        "Usa una altura entre 6 y 30.",
      );
      return;
    }
    this.textSize = numeric;
    this.runtime.render();
  }

  private formatDimension(
    valueMeters: number,
  ): string {
    const value =
      this.unit === "mm"
        ? valueMeters * 1000
        : valueMeters;
    return `${value.toFixed(this.precision)} ${this.unit}`;
  }

  private restoreAnnotationSnapshot(
    snapshot: unknown,
  ): void {
    this.documents.clear();
    if (!snapshot || typeof snapshot !== "object") return;
    const extension =
      snapshot as AnnotationSnapshotExtension;

    if (Array.isArray(extension.assemblyAnnotations)) {
      for (const document of extension.assemblyAnnotations) {
        if (
          !document
          || typeof document.viewId !== "string"
          || !Array.isArray(document.annotations)
        ) {
          continue;
        }
        this.documents.set(
          document.viewId,
          JSON.parse(
            JSON.stringify(document.annotations),
          ) as AssemblyAnnotation[],
        );
      }
    }

    const style =
      extension.assemblyAnnotationStyle;
    if (style) {
      if (style.unit === "mm" || style.unit === "m") {
        this.unit = style.unit;
      }
      if (
        Number.isInteger(style.precision)
        && style.precision >= 0
        && style.precision <= 3
      ) {
        this.precision = style.precision;
      }
      if (
        Number.isFinite(style.textSize)
        && style.textSize >= 6
        && style.textSize <= 30
      ) {
        this.textSize = style.textSize;
      }
    }
  }

  private cleanupOrphans(): void {
    const valid =
      new Set(
        this.runtime.sheets.flatMap(
          (sheet) => sheet.views.map((view) => view.id),
        ),
      );
    for (const id of Array.from(this.documents.keys())) {
      if (!valid.has(id)) {
        this.documents.delete(id);
      }
    }
    if (
      this.selectedAnnotationId
      && !this.findAnnotation(this.selectedAnnotationId)
    ) {
      this.selectedAnnotationId = null;
    }
  }

  private updateToolbarState(): void {
    const hasView =
      this.getSelectedView() !== null;
    for (const [tool, button] of this.toolButtons) {
      button.disabled = !hasView && tool !== "SELECT";
      button.style.opacity =
        button.disabled
          ? "0.45"
          : "1";
    }
  }

  private setStatus(message: string): void {
    this.status.textContent = message;
  }

  private makeButton(
    label: string,
  ): HTMLButtonElement {
    const button =
      document.createElement("button");
    button.type =
      "button";
    button.textContent =
      label;
    Object.assign(button.style, {
      padding: "5px 8px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#27343c",
      color: "#f3f7f9",
      cursor: "pointer",
      whiteSpace: "nowrap",
    });
    return button;
  }

  private makeSelect(
    options: readonly (readonly [string, string])[],
  ): HTMLSelectElement {
    const select =
      document.createElement("select");
    Object.assign(select.style, {
      padding: "4px 5px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#11181d",
      color: "#eef4f6",
      font: "inherit",
    });
    for (const [value, label] of options) {
      const option =
        document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    return select;
  }
}
