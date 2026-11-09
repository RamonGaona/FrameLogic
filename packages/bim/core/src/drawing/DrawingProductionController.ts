import * as THREE from "three";
import { planAutomaticDimensions, planAutomaticViews, type AutomaticDimensionPoint } from "./AutoDrawingPlanner";

import type {
  DesignLayer,
  DesignModel,
} from "@framelogic/domain";

import {
  getOpenCascadeBrepKernel,
} from "@framelogic/geometry";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import {
  getStepBrepDocumentId,
} from "../step/StepEngineeringBridge";

import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";


type DimensionMode =
  | "ALIGNED"
  | "HORIZONTAL"
  | "VERTICAL"
  | "DIAMETER"
  | "RADIUS";

export type DrawingSheetSize =
  | "A4"
  | "A3"
  | "A2"
  | "A1"
  | "A0";

type SheetSize = DrawingSheetSize;

export type DrawingSheetOrientation =
  | "LANDSCAPE"
  | "PORTRAIT";

type SheetOrientation = DrawingSheetOrientation;

type DrawingPrecision =
  | "BREP_EXACT"
  | "DERIVED_MESH";

type DrawingSnapKind =
  | "ENDPOINT"
  | "MIDPOINT"
  | "CENTER"
  | "INTERSECTION"
  | "NEAREST";

interface DrawingPointReferenceRuntime {
  instanceId: string;
  x: number;
  y: number;
  featureId?: string;
  topologyId?: string;
  snapKind?: DrawingSnapKind;
  precision?: DrawingPrecision;
  radius?: number;
  centerX?: number;
  centerY?: number;
}

interface DrawingSegmentRuntime {
  readonly instanceId: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly cut: boolean;
}

interface DrawingSnapshotRuntime {
  readonly section: SectionViewDefinition;
  readonly segments: DrawingSegmentRuntime[];
}

interface DimensionAnnotationRuntime {
  readonly id: string;
  readonly kind: "DIMENSION";
  readonly a: DrawingPointReferenceRuntime;
  readonly b: DrawingPointReferenceRuntime;
  offsetX: number;
  offsetY: number;
  dimensionMode?: DimensionMode;
}

interface DrawingDocumentRuntime {
  readonly sectionId: string;
  readonly annotations: Array<
    DimensionAnnotationRuntime
    | Record<string, unknown>
  >;
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
  pendingDimensionStart: DrawingPointReferenceRuntime | null;
  selectedAnnotationId: string | null;
  tool: string;
  zoom: number;
  readonly svg: SVGSVGElement;
  readonly overlay: HTMLDivElement;
  readonly stage: HTMLDivElement;
  pickReference(x: number, y: number): DrawingPointReferenceRuntime | null;
  resolveReference(reference: DrawingPointReferenceRuntime): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  };
  handleDimensionPoint(x: number, y: number): void;
  renderDimension(annotation: DimensionAnnotationRuntime): void;
  render(): void;
  buildSnapshot(section: SectionViewDefinition): DrawingSnapshotRuntime;
  paperTransform(section: SectionViewDefinition): PaperTransformRuntime;
  sectionToPaper(section: SectionViewDefinition, x: number, y: number): THREE.Vector2;
  eventToSheetPoint(event: PointerEvent | MouseEvent): THREE.Vector2 | null;
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
  setZoom(value: number): void;
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

export interface SheetViewState {
  readonly id: string;
  readonly sectionId: string;
}

export interface TitleBlockState {
  project: string;
  drawingTitle: string;
  drawingNumber: string;
  author: string;
  company: string;
}

export interface RevisionState {
  readonly id: string;
  readonly code: string;
  readonly description: string;
  readonly date: string;
}

export interface SheetState {
  readonly ownerSectionId: string;
  size: SheetSize;
  orientation: SheetOrientation;
  scaleDenominator: number | null;
  hatch: boolean;
  readonly views: SheetViewState[];
  readonly titleBlock: TitleBlockState;
  readonly revisions: RevisionState[];
}

export interface FrameLogicDocumentationSnapshot {
  readonly version: 1;
  readonly activeSectionId: string | null;
  readonly sections: readonly SectionViewDefinition[];
  readonly documents: readonly {
    readonly sectionId: string;
    readonly annotations: readonly unknown[];
  }[];
  readonly sheets: readonly SheetState[];
}

export interface DrawingProductionControllerOptions {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly sectionDrawing: SectionDrawingController;
  readonly drawingWorkspace: DrawingWorkspaceController;
}

const SECTION_LAYER_ID = "sections";
const STORAGE_KEY = "framelogic.documentation.v1";
const CANVAS_WIDTH = 1120;
const CANVAS_HEIGHT = 792;
const PAPER_MARGIN = 42;

const SHEET_MM: Record<SheetSize, readonly [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  A0: [1189, 841],
};

export class DrawingProductionController {
  private readonly designModel: DesignModel;
  private readonly designScene: DesignSceneController;
  private readonly sectionDrawing: SectionDrawingController;
  private readonly drawingWorkspace: DrawingWorkspaceController;
  private readonly workspace: WorkspaceRuntime;
  private readonly sectionRuntime: SectionRuntime;
  private readonly sheets = new Map<string, SheetState>();
  private dimensionMode: DimensionMode = "ALIGNED";
  private readonly controls: HTMLElement[] = [];
  private readonly unsubscribeLayer: () => void;
  private readonly timer: number;
  private lastSerialized = "";
  private snapMarker: SVGElement | null = null;
  private disposed = false;

  private readonly basePickReference: WorkspaceRuntime["pickReference"];
  private readonly baseResolveReference: WorkspaceRuntime["resolveReference"];
  private readonly baseRenderDimension: WorkspaceRuntime["renderDimension"];
  private readonly baseRender: WorkspaceRuntime["render"];
  private readonly basePaperTransform: WorkspaceRuntime["paperTransform"];

  constructor(options: DrawingProductionControllerOptions) {
    this.designModel = options.designModel;
    this.designScene = options.designScene;
    this.sectionDrawing = options.sectionDrawing;
    this.drawingWorkspace = options.drawingWorkspace;
    this.workspace = (options.drawingWorkspace as unknown) as WorkspaceRuntime;
    this.sectionRuntime = (options.sectionDrawing as unknown) as SectionRuntime;

    this.basePickReference = this.workspace.pickReference.bind(options.drawingWorkspace);
    this.baseResolveReference = this.workspace.resolveReference.bind(options.drawingWorkspace);
    this.baseRenderDimension = this.workspace.renderDimension.bind(options.drawingWorkspace);
    this.baseRender = this.workspace.render.bind(options.drawingWorkspace);
    this.basePaperTransform = this.workspace.paperTransform.bind(options.drawingWorkspace);

    this.ensureSectionLayer();
    this.installWorkspacePatches();
    this.installToolbarControls(options.container);
    this.installExportInterceptor(options.container);
    this.workspace.svg.addEventListener("pointermove", this.handleSnapPointerMove, true);
    this.workspace.svg.addEventListener("pointerleave", this.clearSnapMarker, true);

    this.unsubscribeLayer = this.designModel.layers.subscribe(() => {
      this.syncSectionLayerVisibility();
    });

    this.restoreFromLocalStorage();
    this.syncSectionLayerVisibility();

    this.timer = window.setInterval(() => {
      this.ensureSectionLayer();
      this.syncSectionLayerVisibility();
      this.persistIfChanged();
    }, 700);
  }

  createDocumentationSnapshot(): FrameLogicDocumentationSnapshot {
    return {
      version: 1,
      activeSectionId: this.sectionDrawing.getActiveSection()?.id ?? null,
      sections: this.sectionDrawing.getSections().map((section) => this.cloneSection(section)),
      documents: Array.from(this.workspace.documents.values()).map((documentState) => ({
        sectionId: documentState.sectionId,
        annotations: JSON.parse(JSON.stringify(documentState.annotations)) as unknown[],
      })),
      sheets: Array.from(this.sheets.values()).map((sheet) => this.cloneSheet(sheet)),
    };
  }

  restoreDocumentationSnapshot(snapshot: FrameLogicDocumentationSnapshot): void {
    if (snapshot.version !== 1) return;

    while (this.sectionDrawing.getSections().length > 0) {
      const last = this.sectionDrawing.getSections().at(-1);
      if (!last) break;
      this.sectionRuntime.activeSectionId = last.id;
      this.sectionDrawing.removeActiveSection();
    }

    for (const section of snapshot.sections) {
      const restored = this.cloneSection(section);
      this.sectionRuntime.sections.push(restored);
      this.sectionRuntime.createVisual(restored);
    }

    this.sectionRuntime.activeSectionId =
      snapshot.activeSectionId
      && this.sectionRuntime.sections.some((section) => section.id === snapshot.activeSectionId)
        ? snapshot.activeSectionId
        : this.sectionRuntime.sections.at(-1)?.id ?? null;
    this.sectionRuntime.refreshUi();

    this.workspace.documents.clear();
    for (const documentState of snapshot.documents) {
      this.workspace.documents.set(documentState.sectionId, {
        sectionId: documentState.sectionId,
        annotations: JSON.parse(JSON.stringify(documentState.annotations)) as DrawingDocumentRuntime["annotations"],
      });
    }

    this.sheets.clear();
    for (const sheet of snapshot.sheets) {
      this.sheets.set(sheet.ownerSectionId, this.cloneSheet(sheet));
    }

    this.workspace.render();
    this.syncSectionLayerVisibility();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.unsubscribeLayer();
    this.workspace.svg.removeEventListener("pointermove", this.handleSnapPointerMove, true);
    this.workspace.svg.removeEventListener("pointerleave", this.clearSnapMarker, true);
    for (const control of this.controls) control.remove();
    this.clearSnapMarker();
  }

  private ensureSectionLayer(): DesignLayer {
    const current = this.designModel.layers.get(SECTION_LAYER_ID);
    if (current) return current;

    return this.designModel.layers.create({
      id: SECTION_LAYER_ID,
      name: "SECCIONES",
      visible: true,
      locked: false,
      snapEnabled: false,
    });
  }

  private syncSectionLayerVisibility(): void {
    const layer = this.designModel.layers.get(SECTION_LAYER_ID);
    const visible = layer?.visible ?? true;
    const locked = layer?.locked ?? false;
    const activeId = this.sectionDrawing.getActiveSection()?.id ?? null;

    for (const [id, visual] of this.sectionRuntime.visuals) {
      visual.group.visible = visible;
      const active = id === activeId;
      for (const handle of visual.handles.values()) {
        handle.visible = visible && active && !locked;
      }
      visual.arrow.visible = visible && active;
    }
  }

  private installWorkspacePatches(): void {
    this.workspace.pickReference = (x, y) => this.pickReference(x, y);
    this.workspace.resolveReference = (reference) => this.resolveReference(reference);
    this.workspace.handleDimensionPoint = (x, y) => this.handleDimensionPoint(x, y);
    this.workspace.renderDimension = (annotation) => this.renderDimension(annotation);
    this.workspace.paperTransform = (section) => this.paperTransform(section);
    this.workspace.render = () => {
      this.baseRender();
      this.renderProductionOverlay();
    };
  }

  private installToolbarControls(container: HTMLElement): void {
    const overlay = container.querySelector<HTMLElement>('[data-framelogic-drawing-workspace="true"]');
    const toolbar = overlay?.firstElementChild as HTMLElement | null;
    if (!toolbar) return;
    // Avoid a horizontal toolbar overflow when documentation features grow.
    toolbar.style.flexWrap = "wrap";
    toolbar.style.rowGap = "5px";
    toolbar.style.maxHeight = "128px";
    toolbar.style.overflowY = "auto";

    const dimensionSelect = this.makeSelect([
      ["ALIGNED", "Cota alineada"],
      ["HORIZONTAL", "Cota horizontal"],
      ["VERTICAL", "Cota vertical"],
      ["DIAMETER", "Ø Diámetro"],
      ["RADIUS", "R Radio"],
    ]);
    dimensionSelect.title = "Tipo de cota";
    dimensionSelect.addEventListener("change", () => {
      this.dimensionMode = dimensionSelect.value as DimensionMode;
      this.workspace.setTool("DIMENSION");
      this.workspace.setStatus(`COTA ${this.dimensionMode}: selecciona la referencia.`);
    });

    const sizeSelect = this.makeSelect([
      ["A4", "A4"],
      ["A3", "A3"],
      ["A2", "A2"],
      ["A1", "A1"],
      ["A0", "A0"],
    ]);
    sizeSelect.title = "Tamaño de hoja";

    const orientationSelect = this.makeSelect([
      ["LANDSCAPE", "Horizontal"],
      ["PORTRAIT", "Vertical"],
    ]);
    orientationSelect.title = "Orientación de hoja";

    const scaleSelect = this.makeSelect([
      ["AUTO", "Escala AUTO"],
      ["1", "1:1"],
      ["2", "1:2"],
      ["5", "1:5"],
      ["10", "1:10"],
      ["20", "1:20"],
      ["25", "1:25"],
      ["50", "1:50"],
      ["100", "1:100"],
    ]);
    scaleSelect.title = "Escala del plano";

    const hatchButton = this.makeButton("Hatch", "Activar/desactivar hachurado de corte");
    const addViewButton = this.makeButton("+ Vista", "Agregar otra sección a esta hoja");
    const automaticViewsButton = this.makeButton("Vistas auto", "Generar alzado, planta, lateral e isométrica del modelo actual");
    const automaticDimensionsButton = this.makeButton("Cotas auto", "Acotar vértices y círculos exactos B-Rep de la vista activa; revisar antes de fabricar");
    const titleBlockButton = this.makeButton("Cajetín", "Editar cajetín");
    const revisionButton = this.makeButton("Revisión", "Crear revisión del plano");

    const refreshControls = (): void => {
      const sheet = this.getActiveSheet();
      if (!sheet) return;
      sizeSelect.value = sheet.size;
      orientationSelect.value = sheet.orientation;
      scaleSelect.value = sheet.scaleDenominator === null ? "AUTO" : String(sheet.scaleDenominator);
      hatchButton.style.background = sheet.hatch ? "#3b6d87" : "#27343c";
    };

    sizeSelect.addEventListener("change", () => {
      const sheet = this.ensureActiveSheet();
      if (!sheet) return;
      sheet.size = sizeSelect.value as SheetSize;
      this.workspace.render();
    });
    orientationSelect.addEventListener("change", () => {
      const sheet = this.ensureActiveSheet();
      if (!sheet) return;
      sheet.orientation = orientationSelect.value as SheetOrientation;
      this.workspace.render();
    });
    scaleSelect.addEventListener("change", () => {
      const sheet = this.ensureActiveSheet();
      if (!sheet) return;
      sheet.scaleDenominator = scaleSelect.value === "AUTO" ? null : Number(scaleSelect.value);
      this.workspace.render();
    });
    hatchButton.addEventListener("click", () => {
      const sheet = this.ensureActiveSheet();
      if (!sheet) return;
      sheet.hatch = !sheet.hatch;
      refreshControls();
      this.workspace.render();
    });
    addViewButton.addEventListener("click", () => this.addView());
    automaticViewsButton.addEventListener("click", () => this.createAutomaticViews());
    automaticDimensionsButton.addEventListener("click", () => this.createAutomaticDimensions());
    titleBlockButton.addEventListener("click", () => this.editTitleBlock());
    revisionButton.addEventListener("click", () => this.addRevision());

    const marker = toolbar.querySelector("button:last-of-type");
    const controls = [dimensionSelect, sizeSelect, orientationSelect, scaleSelect, hatchButton, addViewButton, automaticViewsButton, automaticDimensionsButton, titleBlockButton, revisionButton];
    for (const control of controls) {
      if (marker) marker.before(control);
      else toolbar.append(control);
      this.controls.push(control);
    }

    const baseOpen = this.drawingWorkspace.openActiveSection.bind(this.drawingWorkspace);
    this.drawingWorkspace.openActiveSection = (): boolean => {
      const opened = baseOpen();
      if (opened) {
        this.ensureActiveSheet();
        refreshControls();
        this.workspace.render();
      }
      return opened;
    };
  }

  private installExportInterceptor(container: HTMLElement): void {
    const overlay = container.querySelector<HTMLElement>('[data-framelogic-drawing-workspace="true"]');
    const buttons = Array.from(overlay?.querySelectorAll("button") ?? []);
    const exportButton = buttons.find((button) => button.textContent === "Exportar PDF");
    if (!exportButton) return;

    exportButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.exportPdf();
    }, true);
  }

  private ensureActiveSheet(): SheetState | null {
    const section = this.sectionDrawing.getActiveSection();
    if (!section) return null;
    const current = this.sheets.get(section.id);
    if (current) return current;

    const created: SheetState = {
      ownerSectionId: section.id,
      size: "A3",
      orientation: "LANDSCAPE",
      scaleDenominator: null,
      hatch: true,
      views: [{ id: crypto.randomUUID(), sectionId: section.id }],
      titleBlock: {
        project: "FrameLogic",
        drawingTitle: section.name,
        drawingNumber: "P-001",
        author: "",
        company: "FrameLogic",
      },
      revisions: [],
    };
    this.sheets.set(section.id, created);
    return created;
  }

  private getActiveSheet(): SheetState | null {
    const id = this.workspace.activeSectionId ?? this.sectionDrawing.getActiveSection()?.id ?? null;
    if (!id) return null;
    return this.sheets.get(id) ?? this.ensureActiveSheet();
  }

  private paperTransform(section: SectionViewDefinition): PaperTransformRuntime {
    const sheet = this.getActiveSheet();
    if (!sheet || sheet.scaleDenominator === null) {
      const base = this.basePaperTransform(section);
      if (sheet && sheet.views.length > 1) {
        return {
          ...base,
          scale: base.scale * 0.62,
          offsetX: PAPER_MARGIN + 10,
          offsetY: PAPER_MARGIN + 22,
          height: section.height * base.scale * 0.62,
        };
      }
      return base;
    }

    const [rawW, rawH] = SHEET_MM[sheet.size];
    const paperW = sheet.orientation === "LANDSCAPE" ? rawW : rawH;
    const paperH = sheet.orientation === "LANDSCAPE" ? rawH : rawW;
    const pxPerMm = Math.min((CANVAS_WIDTH - 2 * PAPER_MARGIN) / paperW, (CANVAS_HEIGHT - 2 * PAPER_MARGIN) / paperH);
    const scale = (1000 / sheet.scaleDenominator) * pxPerMm;
    const width = section.width * scale;
    const height = section.height * scale;
    const maxContentWidth = sheet.views.length > 1 ? (CANVAS_WIDTH - 2 * PAPER_MARGIN) * 0.60 : CANVAS_WIDTH - 2 * PAPER_MARGIN;

    return {
      scale,
      offsetX: PAPER_MARGIN + Math.max(0, (maxContentWidth - width) / 2),
      offsetY: PAPER_MARGIN + Math.max(0, (CANVAS_HEIGHT - 2 * PAPER_MARGIN - 100 - height) / 2),
      height,
    };
  }

  private pickReference(paperX: number, paperY: number): DrawingPointReferenceRuntime | null {
    const snapshot = this.workspace.snapshot;
    if (!snapshot) return null;

    const exact = this.pickExactBrepReference(snapshot.section, paperX, paperY);
    if (exact) return exact;

    const candidates = this.meshSnapCandidates(snapshot);
    let best: DrawingPointReferenceRuntime | null = null;
    let bestDistance = 15;
    for (const candidate of candidates) {
      const point = this.workspace.sectionToPaper(snapshot.section, candidate.x, candidate.y);
      const distance = Math.hypot(point.x - paperX, point.y - paperY);
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    return best ?? this.basePickReference(paperX, paperY);
  }

  private pickExactBrepReference(
    section: SectionViewDefinition,
    paperX: number,
    paperY: number,
  ): DrawingPointReferenceRuntime | null {
    const worldToSection = this.sectionWorldToLocalMatrix(section);
    const kernel = getOpenCascadeBrepKernel();
    let best: DrawingPointReferenceRuntime | null = null;
    let bestDistance = 16;

    const consider = (
      instanceId: string,
      point: THREE.Vector3,
      topologyId: string,
      snapKind: DrawingSnapKind,
      radius?: number,
    ): void => {
      const local = point.clone().applyMatrix4(worldToSection);
      if (local.z < -1e-6 || local.z > section.depth + 1e-6) return;
      if (local.x < -1e-6 || local.y < -1e-6 || local.x > section.width + 1e-6 || local.y > section.height + 1e-6) return;
      const paper = this.workspace.sectionToPaper(section, local.x, local.y);
      const distance = Math.hypot(paper.x - paperX, paper.y - paperY);
      if (distance >= bestDistance) return;
      bestDistance = distance;
      best = {
        instanceId,
        x: local.x,
        y: local.y,
        topologyId,
        featureId: topologyId,
        snapKind,
        precision: "BREP_EXACT",
        radius,
        centerX: local.x,
        centerY: local.y,
      };
    };

    for (const instance of this.designModel.pieceInstances.getAll()) {
      const documentId = getStepBrepDocumentId(instance.definitionId);
      if (!documentId) continue;
      const document = kernel.getDocument(documentId);
      const object = this.designScene.getInstanceObject(instance.id);
      if (!document || !object || !object.visible) continue;
      object.updateMatrixWorld(true);
      const scale = document.modelScale;
      const worldScale = new THREE.Vector3();
      object.getWorldScale(worldScale);
      const radiusScale = (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3;
      const toWorld = (point: { x: number; y: number; z: number }): THREE.Vector3 =>
        new THREE.Vector3(point.x * scale, point.y * scale, point.z * scale).applyMatrix4(object.matrixWorld);

      for (const vertex of document.vertices) {
        consider(instance.id, toWorld(vertex.point), vertex.id, "ENDPOINT");
      }
      for (const edge of document.edges) {
        if (edge.midpoint) consider(instance.id, toWorld(edge.midpoint), edge.id, "MIDPOINT");
        if (edge.circle) {
          consider(
            instance.id,
            toWorld(edge.circle.center),
            `${edge.id}:center`,
            "CENTER",
            edge.circle.radius * scale * radiusScale,
          );
        }
      }
    }

    return best;
  }

  private meshSnapCandidates(snapshot: DrawingSnapshotRuntime): DrawingPointReferenceRuntime[] {
    const result: DrawingPointReferenceRuntime[] = [];
    for (const segment of snapshot.segments) {
      result.push(
        { instanceId: segment.instanceId, x: segment.x1, y: segment.y1, snapKind: "ENDPOINT", precision: "DERIVED_MESH" },
        { instanceId: segment.instanceId, x: segment.x2, y: segment.y2, snapKind: "ENDPOINT", precision: "DERIVED_MESH" },
        {
          instanceId: segment.instanceId,
          x: (segment.x1 + segment.x2) / 2,
          y: (segment.y1 + segment.y2) / 2,
          snapKind: "MIDPOINT",
          precision: "DERIVED_MESH",
        },
      );
    }

    if (snapshot.segments.length <= 220) {
      for (let i = 0; i < snapshot.segments.length; i += 1) {
        const a = snapshot.segments[i];
        if (!a) continue;
        for (let j = i + 1; j < snapshot.segments.length; j += 1) {
          const b = snapshot.segments[j];
          if (!b) continue;
          const point = this.segmentIntersection(a, b);
          if (point) {
            result.push({
              instanceId: a.instanceId,
              x: point.x,
              y: point.y,
              snapKind: "INTERSECTION",
              precision: "DERIVED_MESH",
            });
          }
        }
      }
    }
    return result;
  }

  private resolveReference(reference: DrawingPointReferenceRuntime): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  } {
    const snapshot = this.workspace.snapshot;
    if (!snapshot || reference.precision !== "BREP_EXACT" || !reference.topologyId) {
      return this.baseResolveReference(reference);
    }

    const instance = this.designModel.pieceInstances.get(reference.instanceId);
    const object = this.designScene.getInstanceObject(reference.instanceId);
    if (!instance || !object) return this.baseResolveReference(reference);
    const documentId = getStepBrepDocumentId(instance.definitionId);
    const document = documentId ? getOpenCascadeBrepKernel().getDocument(documentId) : undefined;
    if (!document) return this.baseResolveReference(reference);

    const rawTopology = reference.topologyId.replace(/:center$/, "");
    const vertex = document.vertices.find((entry) => entry.id === rawTopology);
    const edge = document.edges.find((entry) => entry.id === rawTopology);
    const point = vertex?.point ?? (reference.snapKind === "CENTER" ? edge?.circle?.center : edge?.midpoint);
    if (!point) return this.baseResolveReference(reference);

    object.updateMatrixWorld(true);
    const world = new THREE.Vector3(
      point.x * document.modelScale,
      point.y * document.modelScale,
      point.z * document.modelScale,
    ).applyMatrix4(object.matrixWorld);
    const local = world.applyMatrix4(this.sectionWorldToLocalMatrix(snapshot.section));
    return {
      point: this.workspace.sectionToPaper(snapshot.section, local.x, local.y),
      lost: false,
    };
  }

  private handleDimensionPoint(paperX: number, paperY: number): void {
    const reference = this.pickReference(paperX, paperY);
    if (!reference) {
      this.workspace.setStatus("COTA: no se encontró un SNAP de dibujo.");
      return;
    }

    const documentState = this.getActiveDocument();
    if (!documentState) return;

    if (this.dimensionMode === "DIAMETER" || this.dimensionMode === "RADIUS") {
      if (!reference.radius || reference.snapKind !== "CENTER") {
        this.workspace.setStatus("Ø/R: selecciona el CENTER exacto de un círculo B-Rep.");
        return;
      }
      const edgeReference: DrawingPointReferenceRuntime = {
        ...reference,
        x: reference.x + reference.radius,
        centerX: reference.x,
        centerY: reference.y,
        snapKind: "NEAREST",
      };
      documentState.annotations.push({
        id: crypto.randomUUID(),
        kind: "DIMENSION",
        a: reference,
        b: edgeReference,
        offsetX: 24,
        offsetY: -24,
        dimensionMode: this.dimensionMode,
      });
      this.workspace.setTool("SELECT");
      this.workspace.render();
      return;
    }

    if (!this.workspace.pendingDimensionStart) {
      this.workspace.pendingDimensionStart = reference;
      this.workspace.setStatus(`COTA ${this.dimensionMode}: primer punto. Selecciona el segundo.`);
      return;
    }

    documentState.annotations.push({
      id: crypto.randomUUID(),
      kind: "DIMENSION",
      a: this.workspace.pendingDimensionStart,
      b: reference,
      offsetX: this.dimensionMode === "VERTICAL" ? 28 : 0,
      offsetY: this.dimensionMode === "HORIZONTAL" ? -28 : -28,
      dimensionMode: this.dimensionMode,
    });
    this.workspace.pendingDimensionStart = null;
    this.workspace.setTool("SELECT");
    this.workspace.render();
  }

  private renderDimension(annotation: DimensionAnnotationRuntime): void {
    const mode = annotation.dimensionMode ?? "ALIGNED";
    if (mode === "ALIGNED") {
      this.baseRenderDimension(annotation);
      return;
    }

    const a = this.resolveReference(annotation.a);
    const b = this.resolveReference(annotation.b);
    const lost = a.lost || b.lost;
    const color = lost ? "#d33" : "#135f89";
    const selected = this.workspace.selectedAnnotationId === annotation.id;
    const width = selected ? 2 : 1.15;

    if (mode === "DIAMETER" || mode === "RADIUS") {
      const center = a.point;
      const leaderEnd = center.clone().add(new THREE.Vector2(annotation.offsetX + 72, annotation.offsetY - 30));
      this.workspace.appendSvgLine(center.x, center.y, leaderEnd.x, leaderEnd.y, color, width, annotation.id);
      const radius = annotation.a.radius ?? Math.hypot(annotation.b.x - annotation.a.x, annotation.b.y - annotation.a.y);
      const value = mode === "DIAMETER" ? radius * 2 : radius;
      const prefix = mode === "DIAMETER" ? "Ø" : "R";
      this.workspace.appendSvgText(
        leaderEnd.x + 5,
        leaderEnd.y - 3,
        lost ? "⚠ REFERENCIA PERDIDA" : `${prefix}${this.formatNumber(value)} m`,
        12,
        color,
        "start",
        annotation.id,
      );
      return;
    }

    if (mode === "HORIZONTAL") {
      const y = Math.min(a.point.y, b.point.y) + annotation.offsetY;
      this.workspace.appendSvgLine(a.point.x, a.point.y, a.point.x, y, color, 0.75, annotation.id);
      this.workspace.appendSvgLine(b.point.x, b.point.y, b.point.x, y, color, 0.75, annotation.id);
      this.workspace.appendSvgLine(a.point.x, y, b.point.x, y, color, width, annotation.id);
      const value = Math.abs(annotation.b.x - annotation.a.x);
      this.workspace.appendSvgText((a.point.x + b.point.x) / 2, y - 6, lost ? "⚠ REFERENCIA PERDIDA" : `${this.formatNumber(value)} m`, 12, color, "middle", annotation.id);
      return;
    }

    const x = Math.max(a.point.x, b.point.x) + annotation.offsetX;
    this.workspace.appendSvgLine(a.point.x, a.point.y, x, a.point.y, color, 0.75, annotation.id);
    this.workspace.appendSvgLine(b.point.x, b.point.y, x, b.point.y, color, 0.75, annotation.id);
    this.workspace.appendSvgLine(x, a.point.y, x, b.point.y, color, width, annotation.id);
    const value = Math.abs(annotation.b.y - annotation.a.y);
    this.workspace.appendSvgText(x + 7, (a.point.y + b.point.y) / 2, lost ? "⚠ REFERENCIA PERDIDA" : `${this.formatNumber(value)} m`, 12, color, "start", annotation.id);
  }

  private renderProductionOverlay(): void {
    const snapshot = this.workspace.snapshot;
    const sheet = this.getActiveSheet();
    if (!snapshot || !sheet) return;

    if (sheet.hatch) this.renderHatch(snapshot);
    this.renderSecondaryViews(sheet);
    this.renderTitleBlock(sheet, snapshot.section);
    this.renderRevisionTable(sheet);
  }

  private renderHatch(snapshot: DrawingSnapshotRuntime): void {
    for (const segment of snapshot.segments.filter((entry) => entry.cut)) {
      const a = this.workspace.sectionToPaper(snapshot.section, segment.x1, segment.y1);
      const b = this.workspace.sectionToPaper(snapshot.section, segment.x2, segment.y2);
      const length = Math.max(1, a.distanceTo(b));
      const count = Math.min(16, Math.max(2, Math.floor(length / 28)));
      for (let i = 0; i <= count; i += 1) {
        const t = i / count;
        const point = a.clone().lerp(b, t);
        this.workspace.appendSvgLine(point.x - 4, point.y + 4, point.x + 4, point.y - 4, "#666", 0.55);
      }
    }
  }

  private renderSecondaryViews(sheet: SheetState): void {
    const extras = sheet.views.filter((view) => view.sectionId !== sheet.ownerSectionId);
    if (extras.length < 1) return;
    const x = 700;
    const width = 360;
    const height = Math.min(210, 560 / extras.length);

    extras.forEach((view, index) => {
      const section = this.sectionDrawing.getSections().find((entry) => entry.id === view.sectionId);
      if (!section) return;
      const snapshot = this.workspace.buildSnapshot(section);
      const y = 55 + index * (height + 24);
      this.workspace.appendSvgRect(x, y, width, height, "none", "#777", 0.8);
      const scale = Math.min((width - 24) / Math.max(section.width, 1e-9), (height - 30) / Math.max(section.height, 1e-9));
      const ox = x + (width - section.width * scale) / 2;
      const oy = y + (height - section.height * scale) / 2;
      for (const segment of snapshot.segments) {
        const x1 = ox + segment.x1 * scale;
        const y1 = oy + section.height * scale - segment.y1 * scale;
        const x2 = ox + segment.x2 * scale;
        const y2 = oy + section.height * scale - segment.y2 * scale;
        this.workspace.appendSvgLine(x1, y1, x2, y2, "#181818", segment.cut ? 1.4 : 0.55);
      }
      this.workspace.appendSvgText(x + 8, y + height - 8, section.name, 10, "#222", "start");
    });
  }

  private renderTitleBlock(sheet: SheetState, section: SectionViewDefinition): void {
    const x = 742;
    const y = 678;
    const w = 344;
    const h = 84;
    const revision = sheet.revisions.at(-1)?.code ?? "0";
    const scaleText = sheet.scaleDenominator === null ? "AUTO" : `1:${sheet.scaleDenominator}`;
    this.workspace.appendSvgRect(x, y, w, h, "white", "#111", 0.9);
    this.workspace.appendSvgLine(x, y + 30, x + w, y + 30, "#111", 0.6);
    this.workspace.appendSvgLine(x + 220, y, x + 220, y + h, "#111", 0.6);
    this.workspace.appendSvgText(x + 8, y + 18, sheet.titleBlock.project || "FRAMELOGIC", 11, "#111", "start");
    this.workspace.appendSvgText(x + 8, y + 47, sheet.titleBlock.drawingTitle || section.name, 10, "#111", "start");
    this.workspace.appendSvgText(x + 8, y + 66, sheet.titleBlock.drawingNumber || "P-001", 9, "#333", "start");
    this.workspace.appendSvgText(x + 228, y + 18, `ESC ${scaleText}`, 9, "#111", "start");
    this.workspace.appendSvgText(x + 228, y + 38, `${sheet.size} ${sheet.orientation === "LANDSCAPE" ? "H" : "V"}`, 9, "#111", "start");
    this.workspace.appendSvgText(x + 228, y + 58, `REV ${revision}`, 9, "#111", "start");
    this.workspace.appendSvgText(x + 228, y + 76, sheet.titleBlock.company || "FrameLogic", 9, "#111", "start");
  }

  private renderRevisionTable(sheet: SheetState): void {
    const revisions = sheet.revisions.slice(-3);
    if (revisions.length < 1) return;
    const x = 742;
    const y = 600 - revisions.length * 18;
    this.workspace.appendSvgRect(x, y, 344, revisions.length * 18 + 18, "white", "#555", 0.6);
    this.workspace.appendSvgText(x + 6, y + 13, "REVISIONES", 9, "#222", "start");
    revisions.forEach((revision, index) => {
      const rowY = y + 28 + index * 18;
      this.workspace.appendSvgText(x + 6, rowY, revision.code, 8, "#333", "start");
      this.workspace.appendSvgText(x + 40, rowY, revision.date, 8, "#333", "start");
      this.workspace.appendSvgText(x + 112, rowY, revision.description, 8, "#333", "start");
    });
  }


  /** Create orthographic/isometric section definitions from the visible 3D model. */
  private createAutomaticViews(): void {
    const bounds = new THREE.Box3();
    let included = 0;
    for (const [, object] of this.designScene.getInstanceEntries()) {
      if (!object.visible) continue;
      object.updateWorldMatrix(true, true);
      const current = new THREE.Box3().setFromObject(object);
      if (current.isEmpty()) continue;
      bounds.union(current);
      included++;
    }
    if (included === 0 || bounds.isEmpty()) {
      this.workspace.setStatus("VISTAS AUTO: no hay piezas 3D visibles para proyectar.");
      return;
    }

    const generated = planAutomaticViews({
      min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
      max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
    });
    if (generated.length !== 4) {
      this.workspace.setStatus("VISTAS AUTO: no se pudieron calcular los límites del modelo.");
      return;
    }
    // Do not silently replace manual section definitions or their annotations.
    if (this.sectionDrawing.getSections().some((entry) =>
      generated.some((view) => entry.name === view.name))) {
      this.workspace.setStatus("VISTAS AUTO: ya existen vistas automáticas. Revisa las secciones antes de regenerarlas.");
      return;
    }

    const sections: SectionViewDefinition[] = generated.map((view) => ({
      id: crypto.randomUUID(),
      name: view.name,
      origin: view.origin,
      xAxis: view.xAxis,
      yAxis: view.yAxis,
      normal: view.normal,
      width: view.width,
      height: view.height,
      depth: view.depth,
    }));
    for (const section of sections) {
      this.sectionRuntime.sections.push(section);
      this.sectionRuntime.createVisual(section);
    }
    this.sectionRuntime.activeSectionId = sections[0]!.id;
    this.sectionRuntime.refreshUi();
    if (!this.drawingWorkspace.openActiveSection()) {
      this.workspace.setStatus("VISTAS AUTO: se crearon las secciones, pero no se pudo abrir el plano.");
      return;
    }
    const sheet = this.ensureActiveSheet();
    if (sheet) {
      for (const section of sections.slice(1)) {
        if (!sheet.views.some((view) => view.sectionId === section.id)) {
          sheet.views.push({ id: crypto.randomUUID(), sectionId: section.id });
        }
      }
    }
    this.workspace.render();
    this.workspace.setStatus("VISTAS AUTO: 4 vistas creadas desde el modelo. Verifica ocultación, escala y proyecciones antes de usar el plano.");
  }

  /** Auto dimensions are attached only to exact STEP B-Rep topology, never low-detail meshes. */
  private createAutomaticDimensions(): void {
    const snapshot = this.workspace.snapshot;
    const documentState = this.getActiveDocument();
    if (!snapshot || !documentState) {
      this.workspace.setStatus("COTAS AUTO: abre primero una hoja de plano.");
      return;
    }
    const section = snapshot.section;
    const worldToSection = this.sectionWorldToLocalMatrix(section);
    const normal = new THREE.Vector3(section.normal.x, section.normal.y, section.normal.z).normalize();
    const kernel = getOpenCascadeBrepKernel();
    const features: AutomaticDimensionPoint[] = [];

    for (const instance of this.designModel.pieceInstances.getAll()) {
      const documentId = getStepBrepDocumentId(instance.definitionId);
      if (!documentId) continue;
      const document = kernel.getDocument(documentId);
      const object = this.designScene.getInstanceObject(instance.id);
      if (!document || !object || !object.visible) continue;
      object.updateMatrixWorld(true);
      const worldScale = new THREE.Vector3();
      object.getWorldScale(worldScale);
      const scale = (Math.abs(worldScale.x) + Math.abs(worldScale.y) + Math.abs(worldScale.z)) / 3;
      const project = (point: { x: number; y: number; z: number }): THREE.Vector3 =>
        new THREE.Vector3(point.x, point.y, point.z)
          .multiplyScalar(document.modelScale)
          .applyMatrix4(object.matrixWorld)
          .applyMatrix4(worldToSection);
      const add = (id: string, point: { x: number; y: number; z: number },
        kind: AutomaticDimensionPoint["kind"], radius?: number): void => {
        const local = project(point);
        const tol = 1e-7;
        if (local.x < -tol || local.x > section.width + tol
          || local.y < -tol || local.y > section.height + tol
          || local.z < -tol || local.z > section.depth + tol) return;
        features.push({ instanceId: instance.id, topologyId: id, kind, x: local.x, y: local.y, radius });
      };
      for (const vertex of document.vertices) add(vertex.id, vertex.point, "VERTEX");
      for (const edge of document.edges) {
        if (!edge.circle) continue;
        const circleNormal = new THREE.Vector3(
          edge.circle.normal.x, edge.circle.normal.y, edge.circle.normal.z,
        ).transformDirection(object.matrixWorld);
        // A tilted circle appears elliptic; do not mislabel it with a diameter on paper.
        if (Math.abs(circleNormal.dot(normal)) < 0.995) continue;
        add(edge.id + ":center", edge.circle.center, "CIRCLE",
          edge.circle.radius * document.modelScale * scale);
      }
    }
    const planned = planAutomaticDimensions(features);
    if (!planned.length) {
      this.workspace.setStatus("COTAS AUTO: no hay vértices STEP B-Rep exactos en esta sección. No se acotará desde una malla.");
      return;
    }
    const reference = (point: AutomaticDimensionPoint): DrawingPointReferenceRuntime => ({
      instanceId: point.instanceId,
      x: point.x,
      y: point.y,
      topologyId: point.topologyId,
      featureId: point.topologyId,
      snapKind: point.kind === "CIRCLE" ? "CENTER" : "ENDPOINT",
      precision: "BREP_EXACT",
      radius: point.radius,
      centerX: point.kind === "CIRCLE" ? point.x : undefined,
      centerY: point.kind === "CIRCLE" ? point.y : undefined,
    });
    // Regeneration is idempotent and preserves every manual annotation.
    const manual = documentState.annotations.filter((entry) =>
      (entry as Record<string, unknown>)["autoSource"] !== "FRAMELOGIC_AUTODIM_V1");
    const auto = planned.map((plan) => ({
      id: crypto.randomUUID(),
      kind: "DIMENSION" as const,
      a: reference(plan.a),
      b: reference(plan.b),
      offsetX: plan.offsetX,
      offsetY: plan.offsetY,
      dimensionMode: plan.mode,
      autoSource: "FRAMELOGIC_AUTODIM_V1",
    }));
    documentState.annotations.splice(0, documentState.annotations.length, ...manual, ...auto);
    this.workspace.pendingDimensionStart = null;
    this.workspace.setTool("SELECT");
    this.workspace.render();
    this.workspace.setStatus("COTAS AUTO: " + auto.length
      + " cotas desde topología STEP exacta. Los extremos curvos no se infieren de las mallas; revisa la documentación antes de fabricar.");
  }

  private addView(): void {
    const sheet = this.ensureActiveSheet();
    if (!sheet) return;
    const sections = this.sectionDrawing.getSections();
    if (sections.length < 2) {
      this.workspace.setStatus("Crea otra sección antes de agregar una vista.");
      return;
    }
    const choices = sections.map((section, index) => `${index + 1}: ${section.name}`).join("\n");
    const value = window.prompt(`Agregar vista de sección:\n${choices}`, "2");
    if (!value) return;
    const numericIndex = Number(value) - 1;
    const section = Number.isInteger(numericIndex)
      ? sections[numericIndex]
      : sections.find((entry) => entry.name.toLowerCase().includes(value.toLowerCase()));
    if (!section) return;
    if (sheet.views.some((view) => view.sectionId === section.id)) return;
    sheet.views.push({ id: crypto.randomUUID(), sectionId: section.id });
    this.workspace.render();
  }

  private editTitleBlock(): void {
    const sheet = this.ensureActiveSheet();
    if (!sheet) return;
    const project = window.prompt("Proyecto", sheet.titleBlock.project);
    if (project === null) return;
    const title = window.prompt("Título del plano", sheet.titleBlock.drawingTitle);
    if (title === null) return;
    const number = window.prompt("Número de plano", sheet.titleBlock.drawingNumber);
    if (number === null) return;
    const author = window.prompt("Autor", sheet.titleBlock.author);
    if (author === null) return;
    sheet.titleBlock.project = project.trim();
    sheet.titleBlock.drawingTitle = title.trim();
    sheet.titleBlock.drawingNumber = number.trim();
    sheet.titleBlock.author = author.trim();
    this.workspace.render();
  }

  private addRevision(): void {
    const sheet = this.ensureActiveSheet();
    if (!sheet) return;
    const nextCode = String(sheet.revisions.length + 1);
    const code = window.prompt("Código de revisión", nextCode);
    if (!code) return;
    const description = window.prompt("Descripción de revisión", "Actualización de plano");
    if (description === null) return;
    sheet.revisions.push({
      id: crypto.randomUUID(),
      code: code.trim(),
      description: description.trim(),
      date: new Date().toISOString().slice(0, 10),
    });
    this.workspace.render();
  }

  private readonly handleSnapPointerMove = (event: PointerEvent): void => {
    if (this.workspace.overlay.style.display === "none") return;
    if (this.workspace.tool !== "DIMENSION" && this.workspace.tool !== "LABEL") {
      this.clearSnapMarker();
      return;
    }
    const point = this.workspace.eventToSheetPoint(event);
    if (!point) return;
    const reference = this.pickReference(point.x, point.y);
    if (!reference || !this.workspace.snapshot) {
      this.clearSnapMarker();
      return;
    }
    this.clearSnapMarker();
    const paper = this.workspace.sectionToPaper(this.workspace.snapshot.section, reference.x, reference.y);
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-framelogic-drawing-snap", "true");
    group.style.pointerEvents = "none";
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(paper.x));
    circle.setAttribute("cy", String(paper.y));
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", reference.precision === "BREP_EXACT" ? "#00a76f" : "#d58a00");
    circle.setAttribute("stroke-width", "1.5");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute("x", String(paper.x + 8));
    text.setAttribute("y", String(paper.y - 8));
    text.setAttribute("font-size", "9");
    text.setAttribute("fill", "#333");
    text.textContent = `${reference.snapKind ?? "SNAP"}${reference.precision === "BREP_EXACT" ? " · B-Rep" : ""}`;
    group.append(circle, text);
    this.workspace.svg.append(group);
    this.snapMarker = group;
  };

  private readonly clearSnapMarker = (): void => {
    this.snapMarker?.remove();
    this.snapMarker = null;
  };

  private exportPdf(): void {
    this.workspace.render();
    const sheet = this.getActiveSheet();
    if (!sheet) return;
    const [rawW, rawH] = SHEET_MM[sheet.size];
    const widthMm = sheet.orientation === "LANDSCAPE" ? rawW : rawH;
    const heightMm = sheet.orientation === "LANDSCAPE" ? rawH : rawW;
    const widthPt = widthMm * 72 / 25.4;
    const heightPt = heightMm * 72 / 25.4;
    const sx = widthPt / CANVAS_WIDTH;
    const sy = heightPt / CANVAS_HEIGHT;
    const commands: string[] = ["q", "1 J 1 j", "0 G"];

    for (const child of Array.from(this.workspace.svg.children)) {
      if (child.hasAttribute("data-framelogic-drawing-snap")) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === "line") {
        const x1 = Number(child.getAttribute("x1") ?? 0) * sx;
        const y1 = heightPt - Number(child.getAttribute("y1") ?? 0) * sy;
        const x2 = Number(child.getAttribute("x2") ?? 0) * sx;
        const y2 = heightPt - Number(child.getAttribute("y2") ?? 0) * sy;
        const width = Math.max(0.2, Number(child.getAttribute("stroke-width") ?? 1) * Math.min(sx, sy));
        commands.push(`${this.pdfNumber(width)} w ${this.pdfNumber(x1)} ${this.pdfNumber(y1)} m ${this.pdfNumber(x2)} ${this.pdfNumber(y2)} l S`);
      }
      else if (tag === "rect") {
        const x = Number(child.getAttribute("x") ?? 0) * sx;
        const yTop = Number(child.getAttribute("y") ?? 0);
        const w = Number(child.getAttribute("width") ?? 0) * sx;
        const h = Number(child.getAttribute("height") ?? 0) * sy;
        const y = heightPt - yTop * sy - h;
        const width = Math.max(0.2, Number(child.getAttribute("stroke-width") ?? 1) * Math.min(sx, sy));
        commands.push(`${this.pdfNumber(width)} w ${this.pdfNumber(x)} ${this.pdfNumber(y)} ${this.pdfNumber(w)} ${this.pdfNumber(h)} re S`);
      }
      else if (tag === "text") {
        const text = this.pdfText(child.textContent ?? "");
        if (!text) continue;
        const x = Number(child.getAttribute("x") ?? 0) * sx;
        const y = heightPt - Number(child.getAttribute("y") ?? 0) * sy;
        const size = Math.max(5, Number(child.getAttribute("font-size") ?? 10) * Math.min(sx, sy));
        commands.push(`BT /F1 ${this.pdfNumber(size)} Tf ${this.pdfNumber(x)} ${this.pdfNumber(y)} Td (${text}) Tj ET`);
      }
    }
    commands.push("Q");

    const bytes = this.buildPdf(widthPt, heightPt, commands.join("\n"));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const revision = sheet.revisions.at(-1)?.code ?? "0";
    anchor.href = url;
    anchor.download = `${this.fileSafeName(sheet.titleBlock.drawingNumber || "plano")}_R${revision}.pdf`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private persistIfChanged(): void {
    try {
      const serialized = JSON.stringify(this.createDocumentationSnapshot());
      if (serialized === this.lastSerialized) return;
      this.lastSerialized = serialized;
      window.localStorage.setItem(STORAGE_KEY, serialized);
    }
    catch {
      // Persistencia local es best-effort; el snapshot público sigue disponible.
    }
  }

  private restoreFromLocalStorage(): void {
    try {
      const serialized = window.localStorage.getItem(STORAGE_KEY);
      if (!serialized) return;
      const snapshot = JSON.parse(serialized) as FrameLogicDocumentationSnapshot;
      if (snapshot.version !== 1) return;
      this.restoreDocumentationSnapshot(snapshot);
      this.lastSerialized = serialized;
    }
    catch {
      // Un snapshot inválido no debe impedir abrir FrameLogic.
    }
  }

  private getActiveDocument(): DrawingDocumentRuntime | null {
    const id = this.workspace.activeSectionId;
    return id ? this.workspace.documents.get(id) ?? null : null;
  }

  private segmentIntersection(a: DrawingSegmentRuntime, b: DrawingSegmentRuntime): THREE.Vector2 | null {
    const x1 = a.x1; const y1 = a.y1; const x2 = a.x2; const y2 = a.y2;
    const x3 = b.x1; const y3 = b.y1; const x4 = b.x2; const y4 = b.y2;
    const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denominator) <= 1e-9) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denominator;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denominator;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
    return new THREE.Vector2(x1 + t * (x2 - x1), y1 + t * (y2 - y1));
  }

  private sectionWorldToLocalMatrix(section: SectionViewDefinition): THREE.Matrix4 {
    const matrix = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(section.xAxis.x, section.xAxis.y, section.xAxis.z),
      new THREE.Vector3(section.yAxis.x, section.yAxis.y, section.yAxis.z),
      new THREE.Vector3(section.normal.x, section.normal.y, section.normal.z),
    );
    matrix.setPosition(section.origin.x, section.origin.y, section.origin.z);
    return matrix.invert();
  }

  private makeSelect(options: readonly (readonly [string, string])[]): HTMLSelectElement {
    const select = document.createElement("select");
    select.style.padding = "4px 5px";
    select.style.border = "1px solid rgba(255,255,255,0.16)";
    select.style.borderRadius = "4px";
    select.style.background = "#11181d";
    select.style.color = "#eef4f6";
    select.style.font = "inherit";
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    return select;
  }

  private makeButton(label: string, title: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.style.padding = "4px 7px";
    button.style.border = "1px solid rgba(255,255,255,0.16)";
    button.style.borderRadius = "4px";
    button.style.background = "#27343c";
    button.style.color = "#f3f7f9";
    button.style.cursor = "pointer";
    return button;
  }

  private cloneSection(section: SectionViewDefinition): SectionViewDefinition {
    return JSON.parse(JSON.stringify(section)) as SectionViewDefinition;
  }

  private cloneSheet(sheet: SheetState): SheetState {
    return JSON.parse(JSON.stringify(sheet)) as SheetState;
  }

  private formatNumber(value: number): string {
    return Number(value.toFixed(4)).toString();
  }

  private pdfNumber(value: number): string {
    return value.toFixed(3);
  }

  private pdfText(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  private fileSafeName(value: string): string {
    return this.pdfText(value).replace(/[^A-Za-z0-9_-]+/g, "_");
  }

  private buildPdf(width: number, height: number, stream: string): Uint8Array<ArrayBuffer> {
    const encoder = new TextEncoder();
    const streamLength = encoder.encode(stream).length;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pdfNumber(width)} ${this.pdfNumber(height)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(encoder.encode(pdf).length);
      pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }
    const xrefOffset = encoder.encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return encoder.encode(pdf);
  }
}
