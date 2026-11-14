import * as THREE from "three";
import { planAutomaticSheetLayout, type ProjectedViewCode } from "./AutoSheetLayoutPlanner";

import {
  OpenCascadeDrawingKernel,
  getOpenCascadeBrepKernel,
} from "@framelogic/geometry";

import type {
  DesignModel,
  FrameLogicEngineeringModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import {
  getStepBrepDocumentId,
} from "../step/StepEngineeringBridge";

import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";
import { clipDrawingSegmentToView } from "./DrawingViewScale";

import type {
  DrawingProductionController,
  FrameLogicDocumentationSnapshot,
  SheetState,
} from "./DrawingProductionController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";

import {
  cloneProfessionalState,
  createDefaultProfessionalState,
  formatDrawingMeasurement,
} from "./DrawingProfessionalModel";

import type {
  DimensionStyleState,
  DrawingProfessionalSnapshot,
  DrawingProfessionalState,
  DrawingSnapMode,
  DrawingViewLayoutState,
  ProfessionalDimensionMode,
  RevisionCloudState,
} from "./DrawingProfessionalModel";

interface DrawingReference {
  instanceId: string;
  x: number;
  y: number;
  featureId?: string;
  topologyId?: string;
  snapKind?: string;
  precision?: "BREP_EXACT" | "DERIVED_MESH";
  radius?: number;
  centerX?: number;
  centerY?: number;
}

interface DrawingSegment {
  readonly instanceId: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly cut: boolean;
  readonly hidden?: boolean;
  readonly precision?: "BREP_EXACT" | "DERIVED_MESH";
  readonly topologyId?: string;
}

interface DrawingSnapshotRuntime {
  readonly section: SectionViewDefinition;
  segments: DrawingSegment[];
}

interface DrawingDocumentRuntime {
  readonly sectionId: string;
  readonly annotations: Array<Record<string, unknown>>;
}

interface PaperTransformRuntime {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly height: number;
}

interface WorkspaceRuntime {
  documents: Map<string, DrawingDocumentRuntime>;
  activeSectionId: string | null;
  snapshot: DrawingSnapshotRuntime | null;
  pendingDimensionStart: DrawingReference | null;
  selectedAnnotationId: string | null;
  tool: string;
  readonly svg: SVGSVGElement;
  readonly overlay: HTMLDivElement;
  readonly stage: HTMLDivElement;
  render(): void;
  buildSnapshot(section: SectionViewDefinition): DrawingSnapshotRuntime;
  paperTransform(section: SectionViewDefinition): PaperTransformRuntime;
  sectionToPaper(section: SectionViewDefinition, x: number, y: number): THREE.Vector2;
  paperToSection(section: SectionViewDefinition, x: number, y: number): THREE.Vector2;
  eventToSheetPoint(event: PointerEvent | MouseEvent): THREE.Vector2 | null;
  pickReference(x: number, y: number): DrawingReference | null;
  resolveReference(reference: DrawingReference): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  };
  handleDimensionPoint(x: number, y: number): void;
  renderDimension(annotation: Record<string, unknown>): void;
  appendSvgLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
    strokeWidth: number,
    annotationId?: string,
  ): void;
  appendSvgRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string,
    strokeWidth: number,
  ): void;
  appendSvgText(
    x: number,
    y: number,
    text: string,
    fontSize: number,
    fill: string,
    anchor: "start" | "middle" | "end",
    annotationId?: string,
  ): void;
  setTool(tool: "SELECT" | "DIMENSION" | "LABEL" | "TEXT"): void;
  setStatus(message: string): void;
}

interface SectionVisualRuntime {
  readonly group: THREE.Group;
  readonly handles: Map<string, THREE.Object3D>;
  readonly arrow: THREE.Object3D;
}

interface SectionRuntime {
  activeSectionId: string | null;
  readonly sections: SectionViewDefinition[];
  readonly visuals: Map<string, SectionVisualRuntime>;
  createVisual(section: SectionViewDefinition): void;
  refreshUi(): void;
}

interface ProductionRuntime {
  readonly sheets: Map<string, SheetState>;
  dimensionMode: string;
  syncSectionLayerVisibility(): void;
  renderSecondaryViews(sheet: SheetState): void;
  renderHatch(snapshot: DrawingSnapshotRuntime): void;
  renderTitleBlock(sheet: SheetState, section: SectionViewDefinition): void;
  renderRevisionTable(sheet: SheetState): void;
  getActiveSheet(): SheetState | null;
  ensureActiveSheet(): SheetState | null;
  pickReference(x: number, y: number): DrawingReference | null;
  handleDimensionPoint(x: number, y: number): void;
  renderDimension(annotation: Record<string, unknown>): void;
  exportPdf(): void;
}

interface ExactSnapshotCache {
  readonly replaceVisibleIds: ReadonlySet<string>;
  readonly replaceCutIds: ReadonlySet<string>;
  readonly segments: readonly DrawingSegment[];
  readonly precision: "BREP_EXACT" | "FALLBACK";
  readonly messages: readonly string[];
}

interface ViewDragState {
  readonly viewId: string;
  readonly action: "MOVE" | "RESIZE";
  readonly start: THREE.Vector2;
  readonly initial: DrawingViewLayoutState;
}

interface HistoryBundle {
  readonly documentation: FrameLogicDocumentationSnapshot;
  readonly professional: DrawingProfessionalSnapshot;
}

interface DetailCaptureState {
  readonly first: THREE.Vector2 | null;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "framelogic.drawing-professional.v1";
const HISTORY_LIMIT = 50;
const VIEWPORT_MIN_SIZE = 80;

export interface DrawingProfessionalControllerOptions {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly engineeringModel: FrameLogicEngineeringModel;
  readonly sectionDrawing: SectionDrawingController;
  readonly drawingWorkspace: DrawingWorkspaceController;
  readonly drawingProduction: DrawingProductionController;
}

/**
 * Segunda capa del Drawing Workspace. Conserva el editor básico y añade las
 * funciones de documentación CAD que requieren estado persistente y B-Rep.
 */
export class DrawingProfessionalController {
  private readonly designModel: DesignModel;
  private readonly designScene: DesignSceneController;
  private readonly engineeringModel: FrameLogicEngineeringModel;
  private readonly sectionDrawing: SectionDrawingController;
  private readonly drawingWorkspace: DrawingWorkspaceController;
  private readonly drawingProduction: DrawingProductionController;
  private readonly workspace: WorkspaceRuntime;
  private readonly production: ProductionRuntime;
  private readonly sectionRuntime: SectionRuntime;
  private readonly ocDrawing = new OpenCascadeDrawingKernel();
  private state: DrawingProfessionalState = createDefaultProfessionalState();
  private readonly exactCache = new Map<string, ExactSnapshotCache>();
  private readonly controls: HTMLElement[] = [];
  private readonly sectionManager: HTMLDivElement;
  private readonly undoStack: HistoryBundle[] = [];
  private readonly redoStack: HistoryBundle[] = [];
  private historySerialized = "";
  private restoringHistory = false;
  private viewDrag: ViewDragState | null = null;
  private detailCapture: DetailCaptureState | null = null;
  private revisionCloudStart: THREE.Vector2 | null = null;
  private angularReferences: DrawingReference[] = [];
  private baselineReference: DrawingReference | null = null;
  private disposed = false;
  private readonly timer: number;

  private readonly baseWorkspaceRender: () => void;
  private readonly baseBuildSnapshot: (section: SectionViewDefinition) => DrawingSnapshotRuntime;
  private readonly basePaperTransform: (section: SectionViewDefinition) => PaperTransformRuntime;
  private readonly baseProductionPickReference: (x: number, y: number) => DrawingReference | null;
  private readonly baseProductionHandleDimension: (x: number, y: number) => void;
  private readonly baseProductionSyncLayers: () => void;

  constructor(
    options: DrawingProfessionalControllerOptions,
  ) {
    this.designModel = options.designModel;
    this.designScene = options.designScene;
    this.engineeringModel = options.engineeringModel;
    this.sectionDrawing = options.sectionDrawing;
    this.drawingWorkspace = options.drawingWorkspace;
    this.drawingProduction = options.drawingProduction;
    this.workspace = options.drawingWorkspace as unknown as WorkspaceRuntime;
    this.production = options.drawingProduction as unknown as ProductionRuntime;
    this.sectionRuntime = options.sectionDrawing as unknown as SectionRuntime;

    this.baseWorkspaceRender = this.workspace.render.bind(options.drawingWorkspace);
    this.baseBuildSnapshot = this.workspace.buildSnapshot.bind(options.drawingWorkspace);
    this.basePaperTransform = this.workspace.paperTransform.bind(options.drawingWorkspace);
    this.baseProductionPickReference = this.production.pickReference.bind(options.drawingProduction);
    this.baseProductionHandleDimension = this.production.handleDimensionPoint.bind(options.drawingProduction);
    this.baseProductionSyncLayers = this.production.syncSectionLayerVisibility.bind(options.drawingProduction);

    this.sectionManager = this.createSectionManager(options.container);
    this.restoreProfessionalState();
    this.installPatches();
    this.installToolbar(options.container);
    this.installPointerInteraction();
    this.syncSections();
    this.captureHistoryBaseline();

    this.timer = window.setInterval(() => {
      this.syncSections();
      this.syncViewLayouts();
      this.persistProfessionalState();
      this.trackHistory();
    }, 450);

    window.addEventListener("keydown", this.handleKeyDown, true);
  }

  createProfessionalSnapshot(): DrawingProfessionalSnapshot {
    return {
      version: 1,
      state: cloneProfessionalState(this.state),
    };
  }

  restoreProfessionalSnapshot(snapshot: DrawingProfessionalSnapshot): void {
    if (snapshot.version !== 1) return;
    this.state = cloneProfessionalState(snapshot.state);
    this.syncSections();
    this.syncViewLayouts();
    this.workspace.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    window.removeEventListener("keydown", this.handleKeyDown, true);
    this.workspace.svg.removeEventListener("pointerdown", this.handlePointerDown, true);
    this.workspace.svg.removeEventListener("pointermove", this.handlePointerMove, true);
    this.workspace.svg.removeEventListener("pointerup", this.handlePointerUp, true);
    this.workspace.svg.removeEventListener("pointercancel", this.handlePointerUp, true);
    this.sectionManager.remove();
    for (const control of this.controls) control.remove();
    this.exactCache.clear();
  }

  async refreshExactDrawing(sectionId?: string): Promise<void> {
    const sections = sectionId
      ? this.sectionDrawing.getSections().filter((section) => section.id === sectionId)
      : this.sectionDrawing.getSections();

    for (const section of sections) {
      const cache = await this.buildExactCache(section);
      this.exactCache.set(section.id, cache);
    }

    if (this.workspace.snapshot) {
      this.workspace.snapshot = this.workspace.buildSnapshot(this.workspace.snapshot.section);
    }
    this.workspace.render();
  }

  exportSvg(): void {
    this.workspace.render();
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${this.workspace.svg.outerHTML}`;
    downloadBlob(source, "image/svg+xml", this.currentFileName("svg"));
  }

  exportDxf(): void {
    this.workspace.render();
    const sheet = this.production.getActiveSheet();
    const size = sheet?.size ?? "A3";
    const landscape = (sheet?.orientation ?? "LANDSCAPE") === "LANDSCAPE";
    const paper = sheetMillimeters(size, landscape);
    const sx = paper.width / 1120;
    const sy = paper.height / 792;
    const lines: string[] = [
      "0", "SECTION", "2", "HEADER",
      "9", "$INSUNITS", "70", "4",
      "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES",
    ];

    for (const child of Array.from(this.workspace.svg.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "line") {
        lines.push(
          "0", "LINE", "8", "DRAWING",
          "10", String(Number(child.getAttribute("x1") ?? 0) * sx),
          "20", String((792 - Number(child.getAttribute("y1") ?? 0)) * sy),
          "30", "0",
          "11", String(Number(child.getAttribute("x2") ?? 0) * sx),
          "21", String((792 - Number(child.getAttribute("y2") ?? 0)) * sy),
          "31", "0",
        );
      }
      else if (tag === "text") {
        const value = (child.textContent ?? "").replace(/[\r\n]+/g, " ");
        if (!value) continue;
        lines.push(
          "0", "TEXT", "8", "ANNOTATION",
          "10", String(Number(child.getAttribute("x") ?? 0) * sx),
          "20", String((792 - Number(child.getAttribute("y") ?? 0)) * sy),
          "30", "0",
          "40", "2.5",
          "1", value,
        );
      }
    }

    lines.push("0", "ENDSEC", "0", "EOF");
    downloadBlob(lines.join("\n"), "application/dxf", this.currentFileName("dxf"));
  }

  /** Commit a Paper Space edit immediately, including linked-detail changes. */
  recordDrawingChange(): void {
    this.trackHistory();
  }

  undo(): void {
    const target = this.undoStack.pop();
    if (!target) return;
    this.redoStack.push(this.createHistoryBundle());
    this.restoreHistoryBundle(target);
  }

  redo(): void {
    const target = this.redoStack.pop();
    if (!target) return;
    this.undoStack.push(this.createHistoryBundle());
    this.restoreHistoryBundle(target);
  }

  private installPatches(): void {
    this.workspace.buildSnapshot = (section) => this.buildSnapshot(section);
    this.workspace.paperTransform = (section) => this.paperTransform(section);
    this.workspace.render = () => this.render();

    this.production.pickReference = (x, y) => this.pickReference(x, y);
    this.production.handleDimensionPoint = (x, y) => this.handleDimensionPoint(x, y);
    this.production.renderDimension = (annotation) => this.renderDimension(annotation);
    this.production.syncSectionLayerVisibility = () => {
      this.baseProductionSyncLayers();
      this.applySectionVisibility();
    };
    this.production.renderSecondaryViews = () => {
      // Professional viewports are rendered after the base drawing.
    };
    this.production.renderHatch = (snapshot) => this.renderHatch(snapshot);
    this.production.renderTitleBlock = (sheet, section) => this.renderTitleBlock(sheet, section);
    this.production.renderRevisionTable = (sheet) => this.renderRevisionTable(sheet);
  }

  private installToolbar(container: HTMLElement): void {
    const overlay = container.querySelector<HTMLElement>('[data-framelogic-drawing-workspace="true"]');
    const toolbar = overlay?.firstElementChild as HTMLElement | null;
    if (!toolbar) return;
    toolbar.style.flexWrap = "wrap";

    const dimensionSelect = Array.from(toolbar.querySelectorAll("select"))
      .find((element) => element.title === "Tipo de cota");
    if (dimensionSelect) {
      for (const [value, label] of [
        ["ANGULAR", "Cota angular"],
        ["ORDINATE_X", "Coordenada X"],
        ["ORDINATE_Y", "Coordenada Y"],
        ["CHAIN", "Cota cadena"],
        ["BASELINE", "Cota baseline"],
        ["LEVEL", "Nivel"],
        ["ARC_LENGTH", "Longitud arco"],
      ] as const) {
        if (dimensionSelect.querySelector(`option[value="${value}"]`)) continue;
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        dimensionSelect.append(option);
      }
      dimensionSelect.addEventListener("change", () => {
        this.state.activeDimensionMode = dimensionSelect.value as ProfessionalDimensionMode;
        this.angularReferences = [];
        if (this.state.activeDimensionMode !== "BASELINE") this.baselineReference = null;
      });
    }

    const snapSelect = this.makeSelect([
      ["AUTO", "SNAP Auto"], ["ENDPOINT", "Endpoint"], ["MIDPOINT", "Midpoint"],
      ["CENTER", "Center"], ["QUADRANT", "Quadrant"], ["INTERSECTION", "Intersection"],
      ["NEAREST", "Nearest"], ["PERPENDICULAR", "Perpendicular"], ["TANGENT", "Tangent"],
      ["EXTENSION", "Extension"],
    ]);
    snapSelect.title = "SNAP de Drawing";
    snapSelect.value = this.state.activeSnapMode;
    snapSelect.addEventListener("change", () => {
      this.state.activeSnapMode = snapSelect.value as DrawingSnapMode;
    });

    const unitSelect = this.makeSelect([
      ["MM", "mm"], ["CM", "cm"], ["M", "m"],
    ]);
    unitSelect.title = "Unidad de cotas";
    unitSelect.value = this.activeStyle().unit;
    unitSelect.addEventListener("change", () => {
      this.activeStyle().unit = unitSelect.value as DimensionStyleState["unit"];
      this.workspace.render();
    });

    const precisionSelect = this.makeSelect([
      ["0", "0"], ["1", "0.0"], ["2", "0.00"], ["3", "0.000"],
    ]);
    precisionSelect.title = "Precisión de cotas";
    precisionSelect.value = String(this.activeStyle().precision);
    precisionSelect.addEventListener("change", () => {
      this.activeStyle().precision = Number(precisionSelect.value);
      this.workspace.render();
    });

    const projectionSelect = this.makeSelect([
      ["ISO_E", "ISO E · 1.er diedro"],
      ["ISO_A", "ISO A · 3.er diedro"],
    ]);
    projectionSelect.title = "Sistema de proyección de vistas automáticas";
    projectionSelect.value = this.state.projectionStandard;
    projectionSelect.addEventListener("change", () => {
      this.state.projectionStandard = projectionSelect.value === "ISO_A" ? "ISO_A" : "ISO_E";
      const sheet = this.production.getActiveSheet();
      if (sheet && this.arrangeAutomaticSheet(sheet, true)) {
        this.workspace.setStatus("Vistas organizadas según " + this.state.projectionStandard
          + ". Revisa líneas ocultas, escala y referencias antes de fabricación.");
      }
      this.workspace.render();
    });
    const arrangeButton = this.makeButton("Organizar auto", "Recolocar cuatro vistas automáticas sin alterar la geometría, con espacio para el cajetín");
    arrangeButton.addEventListener("click", () => {
      const sheet = this.production.getActiveSheet();
      if (!sheet || !this.arrangeAutomaticSheet(sheet, true)) {
        this.workspace.setStatus("ORGANIZAR: crea primero cuatro vistas con «Vistas auto».");
        return;
      }
      this.workspace.render();
      this.workspace.setStatus("Cuatro vistas automáticas organizadas ("
        + this.state.projectionStandard + "). Las posiciones manuales existentes se reemplazaron por solicitud expresa.");
    });

    const styleButton = this.makeButton("DIMSTYLE", "Editar estilo de cotas");
    const detailButton = this.makeButton("Detalle", "Crear detalle desde dos puntos");
    const cloudButton = this.makeButton("Nube rev", "Dibujar nube de revisión");
    const managerButton = this.makeButton("Secciones", "Administrador de secciones");
    const hiddenButton = this.makeButton("Ocultas", "Mostrar/ocultar líneas ocultas en la vista activa");
    const svgButton = this.makeButton("SVG", "Exportar hoja como SVG vectorial");
    const dxfButton = this.makeButton("DXF", "Exportar hoja como DXF 2D");

    styleButton.addEventListener("click", () => this.editDimensionStyle(unitSelect, precisionSelect));
    detailButton.addEventListener("click", () => {
      this.detailCapture = { first: null };
      this.workspace.setStatus("DETALLE: selecciona centro y luego radio.");
    });
    cloudButton.addEventListener("click", () => {
      this.revisionCloudStart = null;
      this.workspace.setStatus("NUBE REV: selecciona dos esquinas.");
      cloudButton.dataset["active"] = "true";
    });
    managerButton.addEventListener("click", () => {
      this.sectionManager.style.display = this.sectionManager.style.display === "none" ? "block" : "none";
      this.renderSectionManager();
    });
    hiddenButton.addEventListener("click", () => {
      const layout = this.activeViewLayout();
      if (!layout) return;
      layout.showHidden = !layout.showHidden;
      hiddenButton.style.background = layout.showHidden ? "#3b6d87" : "#27343c";
      this.workspace.render();
    });
    svgButton.addEventListener("click", () => this.exportSvg());
    dxfButton.addEventListener("click", () => this.exportDxf());

    for (const control of [snapSelect, unitSelect, precisionSelect, projectionSelect, arrangeButton, styleButton, detailButton, cloudButton, managerButton, hiddenButton, svgButton, dxfButton]) {
      toolbar.append(control);
      this.controls.push(control);
    }
  }

  private installPointerInteraction(): void {
    this.workspace.svg.addEventListener("pointerdown", this.handlePointerDown, true);
    this.workspace.svg.addEventListener("pointermove", this.handlePointerMove, true);
    this.workspace.svg.addEventListener("pointerup", this.handlePointerUp, true);
    this.workspace.svg.addEventListener("pointercancel", this.handlePointerUp, true);
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    const viewElement = target?.closest<SVGElement>("[data-framelogic-view-id]");
    const point = this.workspace.eventToSheetPoint(event);

    if (viewElement && point) {
      const viewId = viewElement.getAttribute("data-framelogic-view-id");
      const action = viewElement.getAttribute("data-framelogic-view-action") as "MOVE" | "RESIZE" | null;
      const layout = viewId ? this.state.viewLayouts.find((entry) => entry.id === viewId) : undefined;
      if (viewId && action && layout && !layout.locked) {
        this.viewDrag = {
          viewId,
          action,
          start: point,
          initial: { ...layout },
        };
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }

    if (!point || !this.workspace.snapshot) return;

    if (this.detailCapture) {
      const local = this.workspace.paperToSection(this.workspace.snapshot.section, point.x, point.y);
      if (!this.detailCapture.first) {
        this.detailCapture = { first: local };
        this.workspace.setStatus("DETALLE: selecciona un segundo punto para definir el radio.");
      }
      else {
        const radius = this.detailCapture.first.distanceTo(local);
        if (radius > 1e-8) this.createDetailView(this.detailCapture.first, radius);
        this.detailCapture = null;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const cloudButtonActive = this.controls.some((control) => control instanceof HTMLButtonElement && control.textContent === "Nube rev" && control.dataset["active"] === "true");
    if (cloudButtonActive) {
      if (!this.revisionCloudStart) {
        this.revisionCloudStart = point;
        this.workspace.setStatus("NUBE REV: selecciona la esquina opuesta.");
      }
      else {
        this.createRevisionCloud(this.revisionCloudStart, point);
        this.revisionCloudStart = null;
        const button = this.controls.find((control) => control instanceof HTMLButtonElement && control.textContent === "Nube rev") as HTMLButtonElement | undefined;
        if (button) delete button.dataset["active"];
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.viewDrag) return;
    const point = this.workspace.eventToSheetPoint(event);
    const layout = this.state.viewLayouts.find((entry) => entry.id === this.viewDrag?.viewId);
    if (!point || !layout) return;
    const dx = point.x - this.viewDrag.start.x;
    const dy = point.y - this.viewDrag.start.y;

    if (this.viewDrag.action === "MOVE") {
      layout.x = Math.max(8, this.viewDrag.initial.x + dx);
      layout.y = Math.max(8, this.viewDrag.initial.y + dy);
    }
    else {
      layout.width = Math.max(VIEWPORT_MIN_SIZE, this.viewDrag.initial.width + dx);
      layout.height = Math.max(VIEWPORT_MIN_SIZE, this.viewDrag.initial.height + dy);
    }
    this.workspace.render();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePointerUp = (): void => {
    this.viewDrag = null;
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.workspace.overlay.style.display === "none") return;
    const command = event.ctrlKey || event.metaKey;
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.shiftKey) this.redo(); else this.undo();
      return;
    }
    if (command && event.key.toLowerCase() === "y") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.redo();
    }
  };

  private buildSnapshot(section: SectionViewDefinition): DrawingSnapshotRuntime {
    const base = this.baseBuildSnapshot(section);
    const exact = this.exactCache.get(section.id);
    if (!exact) {
      void this.refreshExactDrawing(section.id);
      return base;
    }

    const kept = base.segments.filter((segment) => {
      if (segment.cut && exact.replaceCutIds.has(segment.instanceId)) return false;
      if (!segment.cut && exact.replaceVisibleIds.has(segment.instanceId)) return false;
      return true;
    });

    return {
      section,
      segments: [...kept, ...exact.segments],
    };
  }

  private paperTransform(section: SectionViewDefinition): PaperTransformRuntime {
    const sheet = this.production.getActiveSheet();
    if (!sheet) return this.basePaperTransform(section);
    const owner = sheet.views.find((view) => view.sectionId === sheet.ownerSectionId) ?? sheet.views[0];
    if (!owner || section.id !== owner.sectionId) return this.basePaperTransform(section);
    const layout = this.ensureViewLayout(owner.id, owner.sectionId, 0);
    const originalScale = sheet.scaleDenominator;
    let base: PaperTransformRuntime;
    try {
      sheet.scaleDenominator = layout.scaleDenominator;
      base = this.basePaperTransform(section);
    } finally {
      sheet.scaleDenominator = originalScale;
    }
    const scale = layout.scaleDenominator === null
      ? Math.min(layout.width / Math.max(section.width, 1e-9),
        layout.height / Math.max(section.height, 1e-9))
      : base.scale;
    const width = section.width * scale;
    const height = section.height * scale;

    return {
      scale,
      offsetX: layout.x + Math.max(0, (layout.width - width) / 2),
      offsetY: layout.y + Math.max(0, (layout.height - height) / 2),
      height,
    };
  }

  private render(): void {
    const snapshot = this.workspace.snapshot;
    if (snapshot) {
      const all = snapshot.segments;
      snapshot.segments = all.filter((segment) => !segment.hidden);
      try {
        this.baseWorkspaceRender();
      }
      finally {
        snapshot.segments = all;
      }
    }
    else {
      this.baseWorkspaceRender();
    }

    this.renderHiddenLines();
    this.renderViewports();
    this.renderRevisionClouds();
    this.renderExactStatus();
  }

  private async buildExactCache(section: SectionViewDefinition): Promise<ExactSnapshotCache> {
    const segments: DrawingSegment[] = [];
    const replaceVisibleIds = new Set<string>();
    const replaceCutIds = new Set<string>();
    const messages: string[] = [];
    let exactCount = 0;
    const worldToSection = sectionWorldToLocalMatrix(section);

    for (const instance of this.designModel.pieceInstances.getAll()) {
      const documentId = getStepBrepDocumentId(instance.definitionId);
      const object = this.designScene.getInstanceObject(instance.id);
      if (!documentId || !object || !object.visible) continue;
      object.updateMatrixWorld(true);
      const inverse = object.matrixWorld.clone().invert();
      const localOrigin = new THREE.Vector3(section.origin.x, section.origin.y, section.origin.z).applyMatrix4(inverse);
      const localNormal = new THREE.Vector3(section.normal.x, section.normal.y, section.normal.z).transformDirection(inverse).normalize();
      const localUp = new THREE.Vector3(section.yAxis.x, section.yAxis.y, section.yAxis.z).transformDirection(inverse).normalize();

      const [sectionResult, hlrResult] = await Promise.all([
        this.ocDrawing.sectionByPlane(documentId, localOrigin, localNormal),
        this.ocDrawing.hiddenLines(documentId, localNormal.clone().multiplyScalar(-1), localUp),
      ]);

      if (sectionResult.precision === "BREP_EXACT") {
        replaceCutIds.add(instance.id);
        exactCount += 1;
        for (const segment of sectionResult.segments) {
          const converted = convertOcSegment(segment, object.matrixWorld, worldToSection, section, instance.id, true, false);
          if (converted) segments.push(converted);
        }
      }
      else if (sectionResult.reason) {
        messages.push(`SECTION ${instance.id.slice(0, 6)}: ${sectionResult.reason}`);
      }

      if (hlrResult.precision === "BREP_EXACT") {
        replaceVisibleIds.add(instance.id);
        exactCount += 1;
        for (const segment of hlrResult.visible) {
          const converted = convertOcSegment(segment, object.matrixWorld, worldToSection, section, instance.id, false, false);
          if (converted) segments.push(converted);
        }
        for (const segment of hlrResult.hidden) {
          const converted = convertOcSegment(segment, object.matrixWorld, worldToSection, section, instance.id, false, true);
          if (converted) segments.push(converted);
        }
      }
      else if (hlrResult.reason) {
        messages.push(`HLR ${instance.id.slice(0, 6)}: ${hlrResult.reason}`);
      }
    }

    return {
      replaceVisibleIds,
      replaceCutIds,
      segments,
      precision: exactCount > 0 ? "BREP_EXACT" : "FALLBACK",
      messages,
    };
  }

  private renderHiddenLines(): void {
    const snapshot = this.workspace.snapshot;
    const layout = this.activeViewLayout();
    if (!snapshot || layout?.showHidden === false) return;
    for (const segment of snapshot.segments.filter((entry) => entry.hidden)) {
      const a = this.workspace.sectionToPaper(snapshot.section, segment.x1, segment.y1);
      const b = this.workspace.sectionToPaper(snapshot.section, segment.x2, segment.y2);
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(a.x)); line.setAttribute("y1", String(a.y));
      line.setAttribute("x2", String(b.x)); line.setAttribute("y2", String(b.y));
      line.setAttribute("stroke", "#555"); line.setAttribute("stroke-width", "0.55");
      line.setAttribute("stroke-dasharray", "6 4"); line.setAttribute("vector-effect", "non-scaling-stroke");
      line.style.pointerEvents = "none";
      this.workspace.svg.append(line);
    }
  }

  private pickReference(x: number, y: number): DrawingReference | null {
    const snapshot = this.workspace.snapshot;
    if (!snapshot) return this.baseProductionPickReference(x, y);
    const mode = this.state.activeSnapMode;
    const candidates: DrawingReference[] = [];
    const push = (candidate: DrawingReference, expected: DrawingSnapMode): void => {
      if (mode === "AUTO" || mode === expected) candidates.push(candidate);
    };

    for (const segment of snapshot.segments.filter((entry) => !entry.hidden)) {
      const precision = segment.precision ?? "DERIVED_MESH";
      push({ instanceId: segment.instanceId, x: segment.x1, y: segment.y1, topologyId: segment.topologyId, snapKind: "ENDPOINT", precision }, "ENDPOINT");
      push({ instanceId: segment.instanceId, x: segment.x2, y: segment.y2, topologyId: segment.topologyId, snapKind: "ENDPOINT", precision }, "ENDPOINT");
      push({ instanceId: segment.instanceId, x: (segment.x1 + segment.x2) / 2, y: (segment.y1 + segment.y2) / 2, topologyId: segment.topologyId, snapKind: "MIDPOINT", precision }, "MIDPOINT");
      if (mode === "PERPENDICULAR" && this.workspace.pendingDimensionStart) {
        const projected = closestPointInfinite(this.workspace.pendingDimensionStart, segment);
        candidates.push({ instanceId: segment.instanceId, x: projected.x, y: projected.y, topologyId: segment.topologyId, snapKind: "PERPENDICULAR", precision });
      }
      if (mode === "EXTENSION") {
        const sectionPoint = this.workspace.paperToSection(snapshot.section, x, y);
        const projected = closestPointInfinite(sectionPoint, segment);
        if (!pointInsideSegment(projected, segment)) {
          candidates.push({ instanceId: segment.instanceId, x: projected.x, y: projected.y, topologyId: segment.topologyId, snapKind: "EXTENSION", precision });
        }
      }
    }

    if (mode === "INTERSECTION" || mode === "AUTO") {
      const visible = snapshot.segments.filter((entry) => !entry.hidden);
      if (visible.length <= 260) {
        for (let first = 0; first < visible.length; first += 1) {
          const a = visible[first]; if (!a) continue;
          for (let second = first + 1; second < visible.length; second += 1) {
            const b = visible[second]; if (!b) continue;
            const point = segmentIntersection2d(a, b);
            if (point) candidates.push({ instanceId: a.instanceId, x: point.x, y: point.y, snapKind: "INTERSECTION", precision: a.precision === "BREP_EXACT" && b.precision === "BREP_EXACT" ? "BREP_EXACT" : "DERIVED_MESH" });
          }
        }
      }
    }

    for (const circle of this.circleCandidates(snapshot.section)) {
      push(circle.center, "CENTER");
      for (const quadrant of circle.quadrants) push(quadrant, "QUADRANT");
      if ((mode === "TANGENT" || mode === "AUTO") && this.workspace.pendingDimensionStart) {
        for (const tangent of tangentPoints(this.workspace.pendingDimensionStart, circle.center, circle.radius)) {
          candidates.push({ ...circle.center, x: tangent.x, y: tangent.y, snapKind: "TANGENT" });
        }
      }
    }

    const base = this.baseProductionPickReference(x, y);
    if (base && (mode === "AUTO" || mode === "NEAREST" || mode === base.snapKind)) candidates.push(base);
    if (candidates.length < 1) return mode === "AUTO" || mode === "NEAREST" ? base : null;

    let best: DrawingReference | null = null;
    let bestDistance = 17;
    for (const candidate of candidates) {
      const paper = this.workspace.sectionToPaper(snapshot.section, candidate.x, candidate.y);
      const distance = Math.hypot(paper.x - x, paper.y - y);
      const exactBonus = candidate.precision === "BREP_EXACT" ? -1.25 : 0;
      if (distance + exactBonus < bestDistance) {
        best = candidate;
        bestDistance = distance + exactBonus;
      }
    }
    return best;
  }

  private circleCandidates(section: SectionViewDefinition): Array<{
    readonly center: DrawingReference;
    readonly quadrants: readonly DrawingReference[];
    readonly radius: number;
  }> {
    const result: Array<{ center: DrawingReference; quadrants: DrawingReference[]; radius: number }> = [];
    const kernel = getOpenCascadeBrepKernel();
    const worldToSection = sectionWorldToLocalMatrix(section);
    const sectionNormal = new THREE.Vector3(section.normal.x, section.normal.y, section.normal.z).normalize();

    for (const instance of this.designModel.pieceInstances.getAll()) {
      const documentId = getStepBrepDocumentId(instance.definitionId);
      const document = documentId ? kernel.getDocument(documentId) : undefined;
      const object = this.designScene.getInstanceObject(instance.id);
      if (!document || !object || !object.visible) continue;
      object.updateMatrixWorld(true);
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
      const worldScale = new THREE.Vector3(); object.getWorldScale(worldScale);
      const radiusScale = (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3;

      for (const edge of document.edges) {
        if (!edge.circle) continue;
        const centerWorld = new THREE.Vector3(edge.circle.center.x * document.modelScale, edge.circle.center.y * document.modelScale, edge.circle.center.z * document.modelScale).applyMatrix4(object.matrixWorld);
        const centerLocal = centerWorld.clone().applyMatrix4(worldToSection);
        if (centerLocal.z < -1e-5 || centerLocal.z > section.depth + 1e-5) continue;
        const normalWorld = new THREE.Vector3(edge.circle.normal.x, edge.circle.normal.y, edge.circle.normal.z).applyMatrix3(normalMatrix).normalize();
        const radius = edge.circle.radius * document.modelScale * radiusScale;
        const center: DrawingReference = {
          instanceId: instance.id, x: centerLocal.x, y: centerLocal.y,
          topologyId: `${edge.id}:center`, featureId: edge.id, snapKind: "CENTER", precision: "BREP_EXACT", radius,
          centerX: centerLocal.x, centerY: centerLocal.y,
        };
        const quadrants: DrawingReference[] = [];
        if (Math.abs(normalWorld.dot(sectionNormal)) >= 0.985) {
          for (const [dx, dy] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]] as const) {
            quadrants.push({ ...center, x: centerLocal.x + dx, y: centerLocal.y + dy, snapKind: "QUADRANT" });
          }
        }
        result.push({ center, quadrants, radius });
      }
    }
    return result;
  }

  private handleDimensionPoint(x: number, y: number): void {
    const mode = this.state.activeDimensionMode;
    if (["ALIGNED", "HORIZONTAL", "VERTICAL", "DIAMETER", "RADIUS"].includes(mode)) {
      this.production.dimensionMode = mode;
      this.baseProductionHandleDimension(x, y);
      return;
    }

    const reference = this.pickReference(x, y);
    if (!reference) {
      this.workspace.setStatus(`COTA ${mode}: no se encontró SNAP.`);
      return;
    }
    const documentState = this.activeDocument();
    if (!documentState) return;

    if (mode === "ORDINATE_X" || mode === "ORDINATE_Y" || mode === "LEVEL") {
      documentState.annotations.push(createDimensionAnnotation(mode, reference, reference));
      this.workspace.setTool("SELECT");
      this.workspace.render();
      return;
    }

    if (mode === "ARC_LENGTH") {
      if (!reference.radius || reference.snapKind !== "CENTER") {
        this.workspace.setStatus("LONGITUD ARCO: selecciona CENTER B-Rep de un círculo.");
        return;
      }
      const edge = { ...reference, x: reference.x + reference.radius, snapKind: "QUADRANT" };
      documentState.annotations.push(createDimensionAnnotation(mode, reference, edge));
      this.workspace.setTool("SELECT");
      this.workspace.render();
      return;
    }

    if (mode === "ANGULAR") {
      this.angularReferences.push(reference);
      if (this.angularReferences.length < 3) {
        this.workspace.setStatus(`ANGULAR: ${this.angularReferences.length}/3 puntos.`);
        return;
      }
      const [a, b, c] = this.angularReferences;
      if (a && b && c) {
        documentState.annotations.push({ ...createDimensionAnnotation(mode, a, b), c });
      }
      this.angularReferences = [];
      this.workspace.setTool("SELECT");
      this.workspace.render();
      return;
    }

    if (mode === "BASELINE") {
      if (!this.baselineReference) {
        this.baselineReference = reference;
        this.workspace.setStatus("BASELINE: origen tomado; selecciona puntos sucesivos.");
        return;
      }
      documentState.annotations.push(createDimensionAnnotation(mode, this.baselineReference, reference));
      this.workspace.render();
      return;
    }

    if (!this.workspace.pendingDimensionStart) {
      this.workspace.pendingDimensionStart = reference;
      this.workspace.setStatus(`${mode}: primer punto tomado.`);
      return;
    }
    documentState.annotations.push(createDimensionAnnotation(mode, this.workspace.pendingDimensionStart, reference));
    this.workspace.pendingDimensionStart = mode === "CHAIN" ? reference : null;
    if (mode !== "CHAIN") this.workspace.setTool("SELECT");
    this.workspace.render();
  }

  private renderDimension(annotation: Record<string, unknown>): void {
    const mode = (annotation["dimensionMode"] ?? "ALIGNED") as ProfessionalDimensionMode;
    const aRef = annotation["a"] as DrawingReference | undefined;
    const bRef = annotation["b"] as DrawingReference | undefined;
    if (!aRef || !bRef) return;
    const a = this.workspace.resolveReference(aRef);
    const b = this.workspace.resolveReference(bRef);
    const lost = a.lost || b.lost;
    const id = String(annotation["id"] ?? "");
    const offsetX = Number(annotation["offsetX"] ?? 0);
    const offsetY = Number(annotation["offsetY"] ?? -28);
    const style = this.activeStyle();
    const color = lost ? "#d33" : "#135f89";
    const font = Math.max(9, style.textHeightMm * 3.78);
    const width = this.workspace.selectedAnnotationId === id ? 2 : 1.05;
    const label = (valueMeters: number, prefix = "") => lost ? "⚠ REFERENCIA PERDIDA" : `${prefix}${formatDrawingMeasurement(valueMeters, style)}`;
    const quantity = Number(annotation["quantity"] ?? 1);

    if (mode === "DIAMETER" || mode === "RADIUS" || mode === "ARC_LENGTH") {
      const radius = aRef.radius ?? Math.hypot(bRef.x - aRef.x, bRef.y - aRef.y);
      const leader = a.point.clone().add(new THREE.Vector2(offsetX + 70, offsetY - 24));
      this.workspace.appendSvgLine(a.point.x, a.point.y, leader.x, leader.y, color, width, id);
      const value = mode === "DIAMETER" ? radius * 2 : mode === "ARC_LENGTH" ? 2 * Math.PI * radius : radius;
      const prefix = mode === "DIAMETER" ? "Ø" : mode === "RADIUS" ? "R" : "⌒";
      this.workspace.appendSvgText(leader.x + 5, leader.y - 3, lost ? label(value, prefix) : `${Number.isFinite(quantity) && quantity > 1 ? Math.trunc(quantity) + "× " : ""}${label(value, prefix)}`, font, color, "start", id);
      return;
    }

    if (mode === "ORDINATE_X" || mode === "ORDINATE_Y" || mode === "LEVEL") {
      const value = mode === "ORDINATE_X" ? aRef.x : aRef.y;
      const prefix = mode === "LEVEL" ? "NIV " : mode === "ORDINATE_X" ? "X " : "Y ";
      const end = a.point.clone().add(new THREE.Vector2(offsetX + 55, offsetY - 30));
      this.workspace.appendSvgLine(a.point.x, a.point.y, end.x, end.y, color, width, id);
      this.workspace.appendSvgText(end.x + 4, end.y - 2, label(value, prefix), font, color, "start", id);
      return;
    }

    if (mode === "ANGULAR") {
      const cRef = annotation["c"] as DrawingReference | undefined;
      if (!cRef) return;
      const c = this.workspace.resolveReference(cRef);
      const v1 = new THREE.Vector2(bRef.x - aRef.x, bRef.y - aRef.y);
      const v2 = new THREE.Vector2(cRef.x - aRef.x, cRef.y - aRef.y);
      const angle = Math.acos(THREE.MathUtils.clamp(v1.clone().normalize().dot(v2.clone().normalize()), -1, 1)) * 180 / Math.PI;
      const labelPoint = a.point.clone().add(new THREE.Vector2(offsetX + 48, offsetY - 48));
      this.workspace.appendSvgLine(a.point.x, a.point.y, b.point.x, b.point.y, color, 0.75, id);
      this.workspace.appendSvgLine(a.point.x, a.point.y, c.point.x, c.point.y, color, 0.75, id);
      this.workspace.appendSvgText(labelPoint.x, labelPoint.y, lost || c.lost ? "⚠ REFERENCIA PERDIDA" : `${angle.toFixed(Math.max(0, style.precision))}°`, font, color, "middle", id);
      return;
    }

    const horizontal = mode === "HORIZONTAL";
    const vertical = mode === "VERTICAL";
    if (horizontal) {
      const y = Math.min(a.point.y, b.point.y) + offsetY;
      this.workspace.appendSvgLine(a.point.x, a.point.y, a.point.x, y, color, 0.7, id);
      this.workspace.appendSvgLine(b.point.x, b.point.y, b.point.x, y, color, 0.7, id);
      this.workspace.appendSvgLine(a.point.x, y, b.point.x, y, color, width, id);
      this.workspace.appendSvgText((a.point.x + b.point.x) / 2, y - 6, label(Math.abs(bRef.x - aRef.x)), font, color, "middle", id);
      return;
    }
    if (vertical) {
      const x = Math.max(a.point.x, b.point.x) + (offsetX || 28);
      this.workspace.appendSvgLine(a.point.x, a.point.y, x, a.point.y, color, 0.7, id);
      this.workspace.appendSvgLine(b.point.x, b.point.y, x, b.point.y, color, 0.7, id);
      this.workspace.appendSvgLine(x, a.point.y, x, b.point.y, color, width, id);
      this.workspace.appendSvgText(x + 6, (a.point.y + b.point.y) / 2, label(Math.abs(bRef.y - aRef.y)), font, color, "start", id);
      return;
    }

    const offset = new THREE.Vector2(offsetX, offsetY);
    const da = a.point.clone().add(offset);
    const db = b.point.clone().add(offset);
    this.workspace.appendSvgLine(a.point.x, a.point.y, da.x, da.y, color, 0.7, id);
    this.workspace.appendSvgLine(b.point.x, b.point.y, db.x, db.y, color, 0.7, id);
    this.workspace.appendSvgLine(da.x, da.y, db.x, db.y, color, width, id);
    const midpoint = da.clone().add(db).multiplyScalar(0.5);
    const prefix = mode === "CHAIN" ? "" : mode === "BASELINE" ? "B " : "";
    this.workspace.appendSvgText(midpoint.x, midpoint.y - 6, label(Math.hypot(bRef.x - aRef.x, bRef.y - aRef.y), prefix), font, color, "middle", id);
  }

  private renderHatch(snapshot: DrawingSnapshotRuntime): void {
    const byInstance = new Map<string, DrawingSegment[]>();
    for (const segment of snapshot.segments.filter((entry) => entry.cut && !entry.hidden)) {
      const values = byInstance.get(segment.instanceId) ?? [];
      values.push(segment);
      byInstance.set(segment.instanceId, values);
    }

    for (const [instanceId, segments] of byInstance) {
      const loops = stitchLoops(segments);
      const material = this.materialName(instanceId).toLowerCase();
      const spacing = material.includes("concrete") || material.includes("horm") ? 12 : material.includes("wood") || material.includes("madera") ? 9 : 8;
      for (const loop of loops) {
        const paper = loop.map((point) => this.workspace.sectionToPaper(snapshot.section, point.x, point.y));
        this.hatchPolygon(paper, spacing, 1);
        if (material.includes("concrete") || material.includes("horm")) this.hatchPolygon(paper, spacing * 1.4, -1);
      }
    }
  }

  private hatchPolygon(points: readonly THREE.Vector2[], spacing: number, slope: 1 | -1): void {
    if (points.length < 3) return;
    const normal = slope === 1 ? new THREE.Vector2(1, 1).normalize() : new THREE.Vector2(1, -1).normalize();
    const direction = new THREE.Vector2(-normal.y, normal.x);
    const projections = points.map((point) => point.dot(normal));
    const min = Math.min(...projections) - spacing;
    const max = Math.max(...projections) + spacing;

    for (let level = min; level <= max; level += spacing) {
      const intersections: THREE.Vector2[] = [];
      for (let index = 0; index < points.length; index += 1) {
        const a = points[index]; const b = points[(index + 1) % points.length];
        if (!a || !b) continue;
        const da = a.dot(normal) - level;
        const db = b.dot(normal) - level;
        if (da * db > 0 || Math.abs(da - db) <= 1e-9) continue;
        const t = da / (da - db);
        if (t >= -1e-8 && t <= 1 + 1e-8) intersections.push(a.clone().lerp(b, t));
      }
      intersections.sort((first, second) => first.dot(direction) - second.dot(direction));
      for (let index = 0; index + 1 < intersections.length; index += 2) {
        const a = intersections[index]; const b = intersections[index + 1];
        if (a && b) this.workspace.appendSvgLine(a.x, a.y, b.x, b.y, "#707070", 0.45);
      }
    }
  }

  private renderViewports(): void {
    const sheet = this.production.getActiveSheet();
    if (!sheet) return;
    this.syncViewLayouts();

    for (const [index, view] of sheet.views.entries()) {
      const layout = this.ensureViewLayout(view.id, view.sectionId, index);
      const section = this.sectionDrawing.getSections().find((entry) => entry.id === view.sectionId);
      if (!section) continue;

      if (index > 0) this.renderSecondaryViewport(layout, section);
      this.renderViewportFrame(layout, section, index === 0);
    }
  }

  private renderSecondaryViewport(layout: DrawingViewLayoutState, section: SectionViewDefinition): void {
    const snapshot = this.workspace.buildSnapshot(section);
    const cropRadius = layout.kind === "DETAIL" ? layout.cropRadius : undefined;
    const centerX = layout.cropCenterX ?? section.width / 2;
    const centerY = layout.cropCenterY ?? section.height / 2;
    const modelWidth = cropRadius ? cropRadius * 2 : section.width;
    const modelHeight = cropRadius ? cropRadius * 2 : section.height;
    // Section and DETAIL viewports must honor their own 1:N denominator,
    // rather than always auto-fitting independently of the View toolbar.
    let scale = Math.min(
      (layout.width - 20) / Math.max(modelWidth, 1e-9),
      (layout.height - 28) / Math.max(modelHeight, 1e-9),
    );
    const sheet = this.production.getActiveSheet();
    if (sheet && layout.scaleDenominator !== null) {
      const old = sheet.scaleDenominator;
      try {
        sheet.scaleDenominator = layout.scaleDenominator;
        scale = this.basePaperTransform(section).scale;
      } finally {
        sheet.scaleDenominator = old;
      }
    }
    const originX = layout.x + layout.width / 2 - centerX * scale;
    const originY = layout.y + layout.height / 2 + centerY * scale;

    for (const segment of snapshot.segments) {
      if (segment.hidden && !layout.showHidden) continue;
      const midpoint = new THREE.Vector2((segment.x1 + segment.x2) / 2, (segment.y1 + segment.y2) / 2);
      if (cropRadius && midpoint.distanceTo(new THREE.Vector2(centerX, centerY)) > cropRadius * 1.08) continue;
      const cropped = clipDrawingSegmentToView({
        x1: originX + segment.x1 * scale,
        y1: originY - segment.y1 * scale,
        x2: originX + segment.x2 * scale,
        y2: originY - segment.y2 * scale,
      }, {
        x: layout.x + 2, y: layout.y + 19,
        width: layout.width - 4, height: layout.height - 39,
      });
      if (!cropped) continue;
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(cropped.x1));
      line.setAttribute("y1", String(cropped.y1));
      line.setAttribute("x2", String(cropped.x2));
      line.setAttribute("y2", String(cropped.y2));
      line.setAttribute("stroke", segment.hidden ? "#666" : "#181818");
      line.setAttribute("stroke-width", String(segment.cut ? 1.35 : 0.55));
      if (segment.hidden) line.setAttribute("stroke-dasharray", "5 4");
      line.style.pointerEvents = "none";
      this.workspace.svg.append(line);
    }
  }

  private renderViewportFrame(layout: DrawingViewLayoutState, section: SectionViewDefinition, primary: boolean): void {
    const border = document.createElementNS(SVG_NS, "rect");
    border.setAttribute("x", String(layout.x)); border.setAttribute("y", String(layout.y));
    border.setAttribute("width", String(layout.width)); border.setAttribute("height", String(layout.height));
    border.setAttribute("fill", "none"); border.setAttribute("stroke", "#7c8f99"); border.setAttribute("stroke-width", "0.7");
    border.style.pointerEvents = "none";
    this.workspace.svg.append(border);

    const move = document.createElementNS(SVG_NS, "rect");
    move.setAttribute("x", String(layout.x)); move.setAttribute("y", String(layout.y));
    move.setAttribute("width", String(layout.width)); move.setAttribute("height", "18");
    move.setAttribute("fill", "rgba(30,80,110,0.06)"); move.setAttribute("stroke", "none");
    move.setAttribute("data-framelogic-view-id", layout.id); move.setAttribute("data-framelogic-view-action", "MOVE");
    move.style.cursor = layout.locked ? "not-allowed" : "move";
    this.workspace.svg.append(move);

    const resize = document.createElementNS(SVG_NS, "rect");
    resize.setAttribute("x", String(layout.x + layout.width - 9)); resize.setAttribute("y", String(layout.y + layout.height - 9));
    resize.setAttribute("width", "9"); resize.setAttribute("height", "9"); resize.setAttribute("fill", "#5f7f90");
    resize.setAttribute("data-framelogic-view-id", layout.id); resize.setAttribute("data-framelogic-view-action", "RESIZE");
    resize.style.cursor = layout.locked ? "not-allowed" : "nwse-resize";
    this.workspace.svg.append(resize);

    const scaleText = layout.scaleDenominator === null ? "AUTO" : `1:${layout.scaleDenominator}`;
    const title = layout.title ?? `${layout.kind === "DETAIL" ? "DETALLE" : "SECCIÓN"} ${section.name.replace(/^SECCIÓN\s*/i, "")}`;
    this.workspace.appendSvgText(layout.x + 6, layout.y + layout.height - 6, `${title} · ${scaleText}${primary ? " · PRINCIPAL" : ""}`, 9, "#333", "start");
  }

  private renderRevisionClouds(): void {
    for (const cloud of this.state.revisionClouds) {
      const step = 14;
      const drawSide = (a: THREE.Vector2, b: THREE.Vector2): void => {
        const length = a.distanceTo(b);
        const count = Math.max(1, Math.ceil(length / step));
        let previous = a.clone();
        for (let index = 1; index <= count; index += 1) {
          const t = index / count;
          const current = a.clone().lerp(b, t);
          const tangent = b.clone().sub(a).normalize();
          const normal = new THREE.Vector2(-tangent.y, tangent.x);
          const bump = index % 2 === 0 ? 3 : -3;
          const mid = previous.clone().add(current).multiplyScalar(0.5).addScaledVector(normal, bump);
          this.workspace.appendSvgLine(previous.x, previous.y, mid.x, mid.y, "#9a3d20", 0.8);
          this.workspace.appendSvgLine(mid.x, mid.y, current.x, current.y, "#9a3d20", 0.8);
          previous = current;
        }
      };
      const p0 = new THREE.Vector2(cloud.x, cloud.y);
      const p1 = new THREE.Vector2(cloud.x + cloud.width, cloud.y);
      const p2 = new THREE.Vector2(cloud.x + cloud.width, cloud.y + cloud.height);
      const p3 = new THREE.Vector2(cloud.x, cloud.y + cloud.height);
      drawSide(p0, p1); drawSide(p1, p2); drawSide(p2, p3); drawSide(p3, p0);
      this.workspace.appendSvgText(cloud.x + cloud.width + 5, cloud.y + 12, `△ ${cloud.revisionCode}`, 9, "#9a3d20", "start");
    }
  }

  private renderTitleBlock(sheet: SheetState, section: SectionViewDefinition): void {
    const template = this.state.titleBlockTemplate;
    const x = 728; const y = template === "FABRICATION" ? 652 : 670; const w = 360; const h = template === "FABRICATION" ? 110 : 92;
    const revision = sheet.revisions.at(-1)?.code ?? "0";
    const allScales = new Set(sheet.views.map((view) => {
      const layout = this.state.viewLayouts.find((entry) => entry.id === view.id);
      return layout?.scaleDenominator === null || !layout ? "AUTO"
        : `1:${layout.scaleDenominator}`;
    }));
    const scale = allScales.size > 1 ? "VARIAS"
      : allScales.values().next().value
        ?? (sheet.scaleDenominator === null ? "AUTO" : `1:${sheet.scaleDenominator}`);
    const unit = this.activeStyle().unit.toLowerCase();
    this.workspace.appendSvgRect(x, y, w, h, "white", "#111", 0.9);
    this.workspace.appendSvgLine(x, y + 28, x + w, y + 28, "#111", 0.55);
    this.workspace.appendSvgLine(x + 238, y, x + 238, y + h, "#111", 0.55);
    this.workspace.appendSvgText(x + 7, y + 17, sheet.titleBlock.project || "FRAMELOGIC", 11, "#111", "start");
    this.workspace.appendSvgText(x + 7, y + 45, sheet.titleBlock.drawingTitle || section.name, 9, "#111", "start");
    this.workspace.appendSvgText(x + 7, y + 63, `PLANO ${sheet.titleBlock.drawingNumber || "P-001"}`, 8, "#333", "start");
    if (template !== "ISO_SIMPLE") this.workspace.appendSvgText(x + 7, y + 81, `AUTOR ${sheet.titleBlock.author || "-"}`, 8, "#333", "start");
    if (template === "FABRICATION") this.workspace.appendSvgText(x + 7, y + 99, `DOCUMENTO DE FABRICACIÓN`, 8, "#333", "start");
    this.workspace.appendSvgText(x + 246, y + 17, `ESC ${scale}`, 8, "#111", "start");
    this.workspace.appendSvgText(x + 246, y + 36, `${sheet.size} · ${sheet.orientation === "LANDSCAPE" ? "H" : "V"}`, 8, "#111", "start");
    this.workspace.appendSvgText(x + 246, y + 55, `UNID ${unit}`, 8, "#111", "start");
    this.workspace.appendSvgText(x + 246, y + 74, `REV ${revision}`, 8, "#111", "start");
    if (template !== "ISO_SIMPLE") this.workspace.appendSvgText(x + 246, y + 93, sheet.titleBlock.company || "FrameLogic", 8, "#111", "start");
  }

  private renderRevisionTable(sheet: SheetState): void {
    const revisions = sheet.revisions.slice(-5);
    if (revisions.length < 1) return;
    const x = 728; const row = 17; const h = 18 + revisions.length * row; const y = 640 - h;
    this.workspace.appendSvgRect(x, y, 360, h, "white", "#666", 0.55);
    this.workspace.appendSvgText(x + 5, y + 12, "REV · FECHA · DESCRIPCIÓN", 8, "#222", "start");
    revisions.forEach((revision, index) => {
      this.workspace.appendSvgText(x + 5, y + 29 + index * row, `${revision.code} · ${revision.date} · ${revision.description}`, 7.5, "#333", "start");
    });
  }

  private renderExactStatus(): void {
    const sectionId = this.workspace.activeSectionId;
    if (!sectionId) return;
    const cache = this.exactCache.get(sectionId);
    if (!cache) return;
    const existing = this.workspace.svg.querySelector('[data-framelogic-precision-status="true"]');
    existing?.remove();
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("x", "20"); text.setAttribute("y", "24"); text.setAttribute("font-size", "9");
    text.setAttribute("fill", cache.precision === "BREP_EXACT" ? "#16734a" : "#a05a00");
    text.setAttribute("data-framelogic-precision-status", "true");
    text.textContent = cache.precision === "BREP_EXACT" ? "GEOMETRÍA: OpenCascade B-Rep / HLR" : "GEOMETRÍA: fallback de malla";
    text.style.pointerEvents = "none";
    this.workspace.svg.append(text);
  }

  private createSectionManager(container: HTMLElement): HTMLDivElement {
    const panel = document.createElement("div");
    panel.dataset["framelogicSectionManager"] = "true";
    Object.assign(panel.style, {
      position: "absolute", right: "16px", top: "70px", zIndex: "120", width: "270px", maxHeight: "55vh", overflow: "auto",
      display: "none", padding: "8px", background: "rgba(18,25,30,0.96)", color: "#eef4f6", border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: "6px", font: "12px/1.3 system-ui, sans-serif", boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
    });
    container.append(panel);
    return panel;
  }

  private renderSectionManager(): void {
    if (this.sectionManager.style.display === "none") return;
    this.sectionManager.replaceChildren();
    const title = document.createElement("div"); title.textContent = "SECCIONES"; title.style.fontWeight = "700"; title.style.marginBottom = "6px";
    this.sectionManager.append(title);

    for (const section of this.sectionDrawing.getSections()) {
      const display = this.ensureSectionDisplay(section.id);
      const row = document.createElement("div"); row.style.display = "grid"; row.style.gridTemplateColumns = "28px 28px 1fr 28px 28px"; row.style.gap = "3px"; row.style.marginBottom = "4px";
      const eye = this.makeButton(display.visible ? "👁" : "○", "Mostrar/ocultar sección");
      const lock = this.makeButton(display.locked ? "🔒" : "🔓", "Bloquear/desbloquear sección");
      const name = this.makeButton(section.name, "Activar sección");
      const copy = this.makeButton("⧉", "Duplicar sección");
      const remove = this.makeButton("×", "Eliminar sección");
      eye.addEventListener("click", () => { display.visible = !display.visible; this.applySectionVisibility(); this.renderSectionManager(); });
      lock.addEventListener("click", () => { display.locked = !display.locked; this.applySectionVisibility(); this.renderSectionManager(); });
      name.addEventListener("click", () => { this.activateSection(section.id); });
      name.addEventListener("dblclick", () => this.renameSection(section));
      copy.addEventListener("click", () => this.duplicateSection(section));
      remove.addEventListener("click", () => this.removeSection(section.id));
      name.style.overflow = "hidden"; name.style.textOverflow = "ellipsis"; name.style.whiteSpace = "nowrap";
      row.append(eye, lock, name, copy, remove);
      this.sectionManager.append(row);
    }
  }

  private syncSections(): void {
    for (const section of this.sectionDrawing.getSections()) {
      this.ensureSectionDisplay(section.id);
      this.ensureSectionMarker(section);
    }
    const valid = new Set(this.sectionDrawing.getSections().map((section) => section.id));
    this.state.sectionDisplay.splice(0, this.state.sectionDisplay.length, ...this.state.sectionDisplay.filter((entry) => valid.has(entry.sectionId)));
    this.applySectionVisibility();
    this.renderSectionManager();
  }

  private applySectionVisibility(): void {
    const layer = this.designModel.layers.get("sections");
    const globalVisible = layer?.visible ?? true;
    const globalLocked = layer?.locked ?? false;
    const activeId = this.sectionDrawing.getActiveSection()?.id ?? null;
    for (const [sectionId, visual] of this.sectionRuntime.visuals) {
      const display = this.ensureSectionDisplay(sectionId);
      const visible = globalVisible && display.visible;
      visual.group.visible = visible;
      const active = sectionId === activeId;
      for (const handle of visual.handles.values()) handle.visible = visible && active && !globalLocked && !display.locked;
      visual.arrow.visible = visible && active;
    }
  }

  private ensureSectionMarker(section: SectionViewDefinition): void {
    const visual = this.sectionRuntime.visuals.get(section.id);
    if (!visual) return;
    const existing = visual.group.getObjectByName("FrameLogicSectionMarkers");
    existing?.removeFromParent();
    const markers = new THREE.Group(); markers.name = "FrameLogicSectionMarkers";
    const label = section.name.replace(/^SECCIÓN\s*/i, "");
    const size = Math.max(0.04, Math.min(section.width, section.height) * 0.09);
    const positions = [
      new THREE.Vector3(-section.width / 2, section.height / 2, -section.depth / 2),
      new THREE.Vector3(section.width / 2, section.height / 2, -section.depth / 2),
    ];
    for (const position of positions) {
      const sprite = createTextSprite(label);
      sprite.position.copy(position);
      sprite.scale.set(size * 2.2, size, 1);
      markers.add(sprite);
    }
    visual.group.add(markers);
  }

  private activateSection(sectionId: string): void {
    this.sectionRuntime.activeSectionId = sectionId;
    this.sectionRuntime.refreshUi();
    this.applySectionVisibility();
    void this.refreshExactDrawing(sectionId);
    this.renderSectionManager();
  }

  private renameSection(section: SectionViewDefinition): void {
    const next = window.prompt("Nombre de sección", section.name);
    if (!next?.trim()) return;
    const mutable = section as { name: string };
    mutable.name = next.trim();
    this.sectionRuntime.refreshUi();
    this.renderSectionManager();
  }

  private duplicateSection(section: SectionViewDefinition): void {
    const copy = JSON.parse(JSON.stringify(section)) as SectionViewDefinition;
    const mutable = copy as { id: string; name: string; origin: { x: number; y: number; z: number } };
    mutable.id = crypto.randomUUID();
    mutable.name = `${section.name} COPIA`;
    const offset = Math.max(section.width, section.height) * 0.08;
    mutable.origin.x += section.xAxis.x * offset + section.yAxis.x * offset;
    mutable.origin.y += section.xAxis.y * offset + section.yAxis.y * offset;
    mutable.origin.z += section.xAxis.z * offset + section.yAxis.z * offset;
    this.sectionRuntime.sections.push(copy);
    this.sectionRuntime.createVisual(copy);
    this.activateSection(copy.id);
  }

  private removeSection(sectionId: string): void {
    this.activateSection(sectionId);
    this.sectionDrawing.removeActiveSection();
    this.state.sectionDisplay.splice(0, this.state.sectionDisplay.length, ...this.state.sectionDisplay.filter((entry) => entry.sectionId !== sectionId));
    this.exactCache.delete(sectionId);
    this.syncSections();
  }

  private ensureSectionDisplay(sectionId: string) {
    let current = this.state.sectionDisplay.find((entry) => entry.sectionId === sectionId);
    if (!current) {
      current = { sectionId, visible: true, locked: false };
      this.state.sectionDisplay.push(current);
    }
    return current;
  }

  private syncViewLayouts(): void {
    for (const sheet of this.production.sheets.values()) {
      // Arrange newly generated automatic projections only once. After that,
      // users can move/resize viewports without the render loop undoing edits.
      if (sheet.views.length === 4
        && sheet.views.every((view) => !this.state.viewLayouts.some((layout) => layout.id === view.id))) {
        this.arrangeAutomaticSheet(sheet, false);
      }
      sheet.views.forEach((view, index) => this.ensureViewLayout(view.id, view.sectionId, index));
    }
    const valid = new Set(Array.from(this.production.sheets.values()).flatMap((sheet) => sheet.views.map((view) => view.id)));
    this.state.viewLayouts.splice(0, this.state.viewLayouts.length, ...this.state.viewLayouts.filter((entry) => valid.has(entry.id)));
  }

  private arrangeAutomaticSheet(sheet: SheetState, force: boolean): boolean {
    if (sheet.views.length !== 4) return false;
    const codes: Record<string, ProjectedViewCode> = {
      "AUTO · Alzado": "FRONT",
      "AUTO · Planta": "TOP",
      "AUTO · Lateral": "RIGHT",
      "AUTO · Isométrica": "ISO",
    };
    const available = this.sectionDrawing.getSections();
    const projected = sheet.views.map((view) => {
      const section = available.find((entry) => entry.id === view.sectionId);
      if (!section) return null;
      const code = codes[section.name];
      return code ? { id: view.id, code, width: section.width, height: section.height } : null;
    });
    if (projected.some((view) => !view)) return false;
    if (!force && sheet.views.some((view) =>
      this.state.viewLayouts.some((layout) => layout.id === view.id))) return false;
    const plans = planAutomaticSheetLayout(
      projected.filter((view): view is NonNullable<typeof view> => view !== null),
      this.state.projectionStandard,
    );
    if (plans.length !== 4) return false;
    for (const [index, plan] of plans.entries()) {
      const source = sheet.views.find((view) => view.id === plan.id);
      if (!source) continue;
      const layout = this.ensureViewLayout(source.id, source.sectionId, index);
      layout.x = plan.x;
      layout.y = plan.y;
      layout.width = plan.width;
      layout.height = plan.height;
      layout.title = ({
        FRONT: "ALZADO", TOP: "PLANTA", RIGHT: "LATERAL", ISO: "ISOMÉTRICA",
      } as const)[plan.code];
      layout.showHidden = false;
    }
    return true;
  }

  private ensureViewLayout(viewId: string, sectionId: string, index: number): DrawingViewLayoutState {
    let layout = this.state.viewLayouts.find((entry) => entry.id === viewId);
    if (!layout) {
      layout = {
        id: viewId, sectionId, kind: "SECTION",
        x: index === 0 ? 54 : 720,
        y: index === 0 ? 50 : 54 + (index - 1) * 220,
        width: index === 0 ? 620 : 350,
        height: index === 0 ? 500 : 195,
        scaleDenominator: null, showHidden: false, locked: false,
      };
      this.state.viewLayouts.push(layout);
    }
    return layout;
  }

  private activeViewLayout(): DrawingViewLayoutState | null {
    const sheet = this.production.getActiveSheet();
    const owner = sheet?.views.find((view) => view.sectionId === sheet.ownerSectionId) ?? sheet?.views[0];
    return owner ? this.ensureViewLayout(owner.id, owner.sectionId, 0) : null;
  }

  private createDetailView(center: THREE.Vector2, radius: number): void {
    const sheet = this.production.ensureActiveSheet();
    const section = this.workspace.snapshot?.section;
    if (!sheet || !section) return;
    const id = crypto.randomUUID();
    sheet.views.push({ id, sectionId: section.id });
    const index = sheet.views.length - 1;
    const layout = this.ensureViewLayout(id, section.id, index);
    layout.kind = "DETAIL";
    layout.cropCenterX = center.x;
    layout.cropCenterY = center.y;
    layout.cropRadius = radius;
    layout.title = `DETALLE ${String.fromCharCode(64 + Math.min(26, index))}`;
    layout.scaleDenominator = sheet.scaleDenominator === null ? null : Math.max(1, sheet.scaleDenominator / 2);
    this.workspace.render();
  }

  private createRevisionCloud(first: THREE.Vector2, second: THREE.Vector2): void {
    const sheet = this.production.getActiveSheet();
    if (!sheet) return;
    let revision = sheet.revisions.at(-1);
    if (!revision) {
      const code = window.prompt("Código de revisión", "1")?.trim();
      if (!code) return;
      revision = { id: crypto.randomUUID(), code, description: "Revisión", date: new Date().toISOString().slice(0, 10) };
      sheet.revisions.push(revision);
    }
    const cloud: RevisionCloudState = {
      id: crypto.randomUUID(), revisionCode: revision.code,
      x: Math.min(first.x, second.x), y: Math.min(first.y, second.y),
      width: Math.abs(second.x - first.x), height: Math.abs(second.y - first.y),
    };
    this.state.revisionClouds.push(cloud);
    this.workspace.render();
  }

  private editDimensionStyle(unitSelect: HTMLSelectElement, precisionSelect: HTMLSelectElement): void {
    const style = this.activeStyle();
    const name = window.prompt("Nombre DIMSTYLE", style.name); if (name === null) return;
    const textHeight = window.prompt("Altura texto en papel (mm)", String(style.textHeightMm)); if (textHeight === null) return;
    const arrow = window.prompt("Tamaño flecha en papel (mm)", String(style.arrowSizeMm)); if (arrow === null) return;
    const upper = window.prompt("Tolerancia superior en metros (vacío = ninguna)", style.toleranceUpper === undefined ? "" : String(style.toleranceUpper)); if (upper === null) return;
    const lower = window.prompt("Tolerancia inferior en metros (vacío = ninguna)", style.toleranceLower === undefined ? "" : String(style.toleranceLower)); if (lower === null) return;
    style.name = name.trim() || style.name;
    style.textHeightMm = finitePositive(textHeight, style.textHeightMm);
    style.arrowSizeMm = finitePositive(arrow, style.arrowSizeMm);
    style.toleranceUpper = upper.trim() ? Number(upper) : undefined;
    style.toleranceLower = lower.trim() ? Number(lower) : undefined;
    unitSelect.value = style.unit;
    precisionSelect.value = String(style.precision);
    this.workspace.render();
  }

  private activeStyle(): DimensionStyleState {
    return this.state.dimensionStyles.find((style) => style.id === this.state.activeDimensionStyleId) ?? this.state.dimensionStyles[0] ?? createDefaultProfessionalState().dimensionStyles[0]!;
  }

  private materialName(instanceId: string): string {
    const instance = this.designModel.pieceInstances.get(instanceId);
    const engineering = instance ? this.engineeringModel.pieces.get(instance.definitionId) : undefined;
    return engineering?.material?.name ?? engineering?.material?.grade ?? "steel";
  }

  private activeDocument(): DrawingDocumentRuntime | null {
    const id = this.workspace.activeSectionId;
    return id ? this.workspace.documents.get(id) ?? null : null;
  }

  private captureHistoryBaseline(): void {
    const bundle = this.createHistoryBundle();
    this.historySerialized = JSON.stringify(bundle);
  }

  private trackHistory(): void {
    if (this.restoringHistory) return;
    const bundle = this.createHistoryBundle();
    const serialized = JSON.stringify(bundle);
    if (serialized === this.historySerialized) return;
    if (this.historySerialized) {
      try {
        const previous = JSON.parse(this.historySerialized) as HistoryBundle;
        this.undoStack.push(previous);
        if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      }
      catch {
        // Ignore a transient serialization failure.
      }
    }
    this.redoStack.length = 0;
    this.historySerialized = serialized;
  }

  private createHistoryBundle(): HistoryBundle {
    return {
      documentation: this.drawingProduction.createDocumentationSnapshot(),
      professional: this.createProfessionalSnapshot(),
    };
  }

  private restoreHistoryBundle(bundle: HistoryBundle): void {
    this.restoringHistory = true;
    try {
      this.drawingProduction.restoreDocumentationSnapshot(bundle.documentation);
      this.restoreProfessionalSnapshot(bundle.professional);
      this.historySerialized = JSON.stringify(this.createHistoryBundle());
      void this.refreshExactDrawing();
    }
    finally {
      window.setTimeout(() => { this.restoringHistory = false; }, 0);
    }
  }

  private persistProfessionalState(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.createProfessionalSnapshot()));
    }
    catch {
      // Public snapshot remains available even if storage is unavailable.
    }
  }

  private restoreProfessionalState(): void {
    try {
      const serialized = window.localStorage.getItem(STORAGE_KEY);
      if (!serialized) return;
      const snapshot = JSON.parse(serialized) as DrawingProfessionalSnapshot;
      if (snapshot.version === 1) this.state = cloneProfessionalState(snapshot.state);
    }
    catch {
      this.state = createDefaultProfessionalState();
    }
  }

  private currentFileName(extension: string): string {
    const sheet = this.production.getActiveSheet();
    const base = (sheet?.titleBlock.drawingNumber || "plano_framelogic").replace(/[^A-Za-z0-9_-]+/g, "_");
    const revision = sheet?.revisions.at(-1)?.code ?? "0";
    return `${base}_R${revision}.${extension}`;
  }

  private makeSelect(values: readonly (readonly [string, string])[]): HTMLSelectElement {
    const select = document.createElement("select");
    Object.assign(select.style, { padding: "4px 5px", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "4px", background: "#11181d", color: "#eef4f6", font: "inherit" });
    for (const [value, label] of values) {
      const option = document.createElement("option"); option.value = value; option.textContent = label; select.append(option);
    }
    return select;
  }

  private makeButton(label: string, title: string): HTMLButtonElement {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label; button.title = title;
    Object.assign(button.style, { padding: "4px 7px", border: "1px solid rgba(255,255,255,0.16)", borderRadius: "4px", background: "#27343c", color: "#f3f7f9", cursor: "pointer", font: "inherit" });
    return button;
  }
}

function createDimensionAnnotation(
  mode: ProfessionalDimensionMode,
  a: DrawingReference,
  b: DrawingReference,
): Record<string, unknown> {
  return {
    id: crypto.randomUUID(), kind: "DIMENSION", a, b,
    offsetX: mode === "VERTICAL" ? 28 : 0,
    offsetY: -28,
    dimensionMode: mode,
  };
}

function convertOcSegment(
  segment: { readonly a: { readonly x: number; readonly y: number; readonly z: number }; readonly b: { readonly x: number; readonly y: number; readonly z: number }; readonly topologyId?: string },
  matrixWorld: THREE.Matrix4,
  worldToSection: THREE.Matrix4,
  section: SectionViewDefinition,
  instanceId: string,
  cut: boolean,
  hidden: boolean,
): DrawingSegment | null {
  const a = new THREE.Vector3(segment.a.x, segment.a.y, segment.a.z).applyMatrix4(matrixWorld).applyMatrix4(worldToSection);
  const b = new THREE.Vector3(segment.b.x, segment.b.y, segment.b.z).applyMatrix4(matrixWorld).applyMatrix4(worldToSection);
  const clipped = clipSegmentToBox(a, b, section);
  if (!clipped) return null;
  return {
    instanceId,
    x1: clipped[0].x, y1: clipped[0].y,
    x2: clipped[1].x, y2: clipped[1].y,
    cut, hidden, precision: "BREP_EXACT", topologyId: segment.topologyId,
  };
}

function clipSegmentToBox(
  start: THREE.Vector3,
  end: THREE.Vector3,
  section: SectionViewDefinition,
): [THREE.Vector3, THREE.Vector3] | null {
  let t0 = 0; let t1 = 1;
  const delta = end.clone().sub(start);
  const axes = [
    [start.x, delta.x, 0, section.width],
    [start.y, delta.y, 0, section.height],
    [start.z, delta.z, -1e-5, section.depth + 1e-5],
  ] as const;
  for (const [value, direction, min, max] of axes) {
    if (Math.abs(direction) <= 1e-12) {
      if (value < min || value > max) return null;
      continue;
    }
    let near = (min - value) / direction;
    let far = (max - value) / direction;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near); t1 = Math.min(t1, far);
    if (t0 > t1) return null;
  }
  return [start.clone().addScaledVector(delta, t0), start.clone().addScaledVector(delta, t1)];
}

function sectionWorldToLocalMatrix(section: SectionViewDefinition): THREE.Matrix4 {
  const matrix = new THREE.Matrix4().makeBasis(
    new THREE.Vector3(section.xAxis.x, section.xAxis.y, section.xAxis.z),
    new THREE.Vector3(section.yAxis.x, section.yAxis.y, section.yAxis.z),
    new THREE.Vector3(section.normal.x, section.normal.y, section.normal.z),
  );
  matrix.setPosition(section.origin.x, section.origin.y, section.origin.z);
  return matrix.invert();
}

function closestPointInfinite(
  point: { readonly x: number; readonly y: number },
  segment: DrawingSegment,
): THREE.Vector2 {
  const a = new THREE.Vector2(segment.x1, segment.y1);
  const b = new THREE.Vector2(segment.x2, segment.y2);
  const ab = b.clone().sub(a);
  const denominator = ab.lengthSq();
  if (denominator <= 1e-18) return a;
  const t = new THREE.Vector2(point.x, point.y).sub(a).dot(ab) / denominator;
  return a.addScaledVector(ab, t);
}

function pointInsideSegment(point: THREE.Vector2, segment: DrawingSegment): boolean {
  const a = new THREE.Vector2(segment.x1, segment.y1);
  const b = new THREE.Vector2(segment.x2, segment.y2);
  return Math.abs(a.distanceTo(point) + point.distanceTo(b) - a.distanceTo(b)) <= 1e-7 * Math.max(1, a.distanceTo(b));
}

function segmentIntersection2d(a: DrawingSegment, b: DrawingSegment): THREE.Vector2 | null {
  const x1 = a.x1; const y1 = a.y1; const x2 = a.x2; const y2 = a.y2;
  const x3 = b.x1; const y3 = b.y1; const x4 = b.x2; const y4 = b.y2;
  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) <= 1e-10) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;
  if (t < -1e-7 || t > 1 + 1e-7 || u < -1e-7 || u > 1 + 1e-7) return null;
  return new THREE.Vector2(x1 + t * (x2 - x1), y1 + t * (y2 - y1));
}

function tangentPoints(start: DrawingReference, center: DrawingReference, radius: number): THREE.Vector2[] {
  const p = new THREE.Vector2(start.x, start.y);
  const c = new THREE.Vector2(center.x, center.y);
  const vector = p.clone().sub(c);
  const distance = vector.length();
  if (distance <= radius + 1e-10) return [];
  const baseAngle = Math.atan2(vector.y, vector.x);
  const offset = Math.acos(radius / distance);
  return [
    new THREE.Vector2(c.x + radius * Math.cos(baseAngle + offset), c.y + radius * Math.sin(baseAngle + offset)),
    new THREE.Vector2(c.x + radius * Math.cos(baseAngle - offset), c.y + radius * Math.sin(baseAngle - offset)),
  ];
}

function stitchLoops(segments: readonly DrawingSegment[]): THREE.Vector2[][] {
  const unused = [...segments];
  const loops: THREE.Vector2[][] = [];
  const tolerance = 1e-5;
  while (unused.length > 0) {
    const first = unused.pop(); if (!first) break;
    const loop = [new THREE.Vector2(first.x1, first.y1), new THREE.Vector2(first.x2, first.y2)];
    let changed = true;
    while (changed && unused.length > 0) {
      changed = false;
      const end = loop.at(-1); if (!end) break;
      const index = unused.findIndex((segment) => end.distanceTo(new THREE.Vector2(segment.x1, segment.y1)) <= tolerance || end.distanceTo(new THREE.Vector2(segment.x2, segment.y2)) <= tolerance);
      if (index >= 0) {
        const next = unused.splice(index, 1)[0]; if (!next) break;
        const p1 = new THREE.Vector2(next.x1, next.y1); const p2 = new THREE.Vector2(next.x2, next.y2);
        loop.push(end.distanceTo(p1) <= tolerance ? p2 : p1); changed = true;
      }
    }
    const start = loop[0]; const end = loop.at(-1);
    if (start && end && loop.length >= 4 && start.distanceTo(end) <= tolerance) loops.push(loop.slice(0, -1));
  }
  return loops;
}

function createTextSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "rgba(15,23,42,0.88)"; context.fillRect(0, 18, 256, 92);
    context.strokeStyle = "#f5c542"; context.lineWidth = 5; context.strokeRect(3, 21, 250, 86);
    context.fillStyle = "#ffffff"; context.font = "bold 56px Arial"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(text, 128, 65);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false });
  return new THREE.Sprite(material);
}

function finitePositive(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sheetMillimeters(size: string, landscape: boolean): { width: number; height: number } {
  const value = size === "A0" ? [1189, 841] : size === "A1" ? [841, 594] : size === "A2" ? [594, 420] : size === "A4" ? [297, 210] : [420, 297];
  return landscape ? { width: value[0]!, height: value[1]! } : { width: value[1]!, height: value[0]! };
}

function downloadBlob(content: BlobPart, type: string, fileName: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName; anchor.style.display = "none";
  document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
