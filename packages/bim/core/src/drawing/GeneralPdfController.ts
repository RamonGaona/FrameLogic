import * as THREE from "three";
import {
  cropProjectedDetail, nextCircularDetailLetter,
  paperCircleToProjection, projectionCircleToPaper,
  validDetailAncestry,
  type DetailCircle, type DetailPaperTransform,
} from "./DrawingDetailViewPlanner";
import { planSmartAssemblyViews, type AutomaticViewCode } from "./AutoDrawingPlanner";
import { ASSEMBLY_VIEW_ORIENTATION_OPTIONS, resolveAssemblyViewBasis,
  type AssemblyViewOrientationMode, type AssemblyViewBasis } from "./AssemblyViewOrientationControls";
import { planSelectedSheetLayout, selectAssemblyScaleDenominator } from "./AutoSheetLayoutPlanner";
import { assemblyProjectionSignature, projectAssembly, projectAssemblySection,
  type AssemblyLine, type AssemblyMarkAnchor, type AssemblyProjection } from "./AssemblyProjectionEngine";
import { planSectionStations, cropAssemblyDetail, planSectionDetailSheetSlots,
  type SectionStation, type CroppedAssemblyDetail } from "./AssemblySectionDetailPlanner";
import type { EngineeringDimensionInstruction } from "./EngineeringAutoDimensionPlanner";
import {
  DRAWING_VIEW_SCALE_PRESETS, DRAWING_VIEW_CUSTOM_SCALE,
  drawingViewScaleSelection, formatDrawingViewScale, modelToPaperScale,
  clipDrawingSegmentToView,
  parseDrawingViewScale,
} from "./DrawingViewScale";
import {
  placeProjectedViewport, projectedViewLabel, projectedViewportOverlaps,
  projectedViewportSize, projectionDirectionFromPointer,
  resolveProjectedViewBasis,
  type ProjectedViewDirection, type ProjectionStandard,
} from "./ProjectedViewPlanner";
import {
  layoutWorkshopDimensions,
  type WorkshopDimensionOverride,
} from "./WorkshopDimensionLayout";
import { buildAssemblyBom, renderAssemblyBomRow, type AssemblyBomRow } from "./AssemblyBomPlanner";
import {
  buildSheetAssemblyBom, chooseSheetBomPlacement, sheetBomOverlaps,
  planSheetBomPages,
  type SheetBomAssembly, type SheetBomPiece, type SheetBomPlacement,
  type SheetBomMode, type SheetBomResult, type SheetBomRect,
} from "./SheetAssemblyBom";

import type {
  DesignModel,
  FrameLogicEngineeringModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  CadWorkPlaneMode,
  CadWorkPlaneState,
} from "../interaction/CadWorkPlaneController";

import type {
  DrawingProductionController,
  SheetState,
} from "./DrawingProductionController";

import type {
  DrawingProfessionalController,
} from "./DrawingProfessionalController";

import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";


export interface GeneralPdfRequest {
  readonly assemblyId: string;
  readonly assemblyName: string;
  readonly instanceIds: readonly string[];
  readonly workPlane: CadWorkPlaneState;
}

export interface GeneralPdfEntry {
  readonly key: string;
  readonly kind: "SECTION" | "ASSEMBLY";
  readonly targetId: string;
  readonly label: string;
}

interface VectorSnapshot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface WorkPlaneSnapshot {
  readonly mode: CadWorkPlaneMode;
  readonly enabled: boolean;
  readonly origin: VectorSnapshot;
  readonly xAxis: VectorSnapshot;
  readonly yAxis: VectorSnapshot;
  readonly normal: VectorSnapshot;
}

interface PlanSegment extends AssemblyLine { readonly cut?: boolean; }

interface PlanGeometry {
  readonly width: number;
  readonly height: number;
  readonly segments: readonly PlanSegment[];
  readonly offsetX?: number;
  readonly offsetY?: number;
}

interface SectionSheetViewRuntime {
  readonly id: string;
  readonly sectionId: string;
  kind?: "SECTION";
}

interface AssemblySheetViewRuntime {
  readonly id: string;
  readonly sectionId: string;
  kind: "ASSEMBLY";
  readonly assemblyId: string;
  readonly assemblyName: string;
  instanceIds: string[];
  workPlane: WorkPlaneSnapshot;
  originalWorkPlane?: WorkPlaneSnapshot;
  orientationMode?: AssemblyViewOrientationMode;
  orientationLabel?: string;
  width: number;
  height: number;
  segments: readonly PlanSegment[];
  /** Plane-space offset before the padded view normalization. */
  offsetX?: number;
  offsetY?: number;
  resolved: boolean;
  /** Present only on views created by the automatic assembly drawing command. */
  automaticViewCode?: AutomaticViewCode;
  /** Persisted exact B-Rep dimension plans; manual annotations live separately. */
  automaticDimensions?: readonly EngineeringDimensionInstruction[];
  dimensionOverrides?: Record<string, WorkshopDimensionOverride>;
  automaticAnchors?: readonly AssemblyMarkAnchor[];
  exactInstances?: number;
  fallbackInstances?: number;
  /** True only when ALL B-Rep instances shared one exact OCCT HLR calculation. */
  assemblyOcclusionExact?: boolean;
  automaticWarnings?: readonly string[];
  /** True physical B-Rep section vs cropped enlargement of the source projection. */
  automaticSupplement?: "SECTION" | "DETAIL";
  automaticSectionLabel?: string;
  /** Stable source reference; cutting stations are preliminary, not confirmed connections. */
  supplementFraction?: number;
  sourceViewId?: string;
  /** Interactive vector-circle crop, in the source's LOCAL projected millimetres. */
  circularDetail?: {
    label: string;
    centerX: number; centerY: number; radius: number;
    sourceSignature: string;
    sourceWorkPlane: WorkPlaneSnapshot;
    fromSection?: boolean;
  };
  /** Relative projection from a piece/assembly parent view (not a physical STEP cut). */
  projectedDirection?: ProjectedViewDirection;
  projectedStandard?: ProjectionStandard;
  projectedSourceSignature?: string;
  /** Each view stores its own render mode, even when inherited at creation. */
  renderMode?: "BLACK_WHITE" | "VISIBLE_HIDDEN" | "WIREFRAME"
    | "SOLID" | "SOLID_EDGES" | "MONOCHROME" | "TRANSPARENT";
  cutReferences?: readonly (SectionStation & { readonly targetSheet: string })[];
  detailReferences?: readonly ({
    readonly label: string;
    readonly targetSheet: string;
    readonly window: CroppedAssemblyDetail["window"];
  })[];
  geometrySignature?: string;
}

type GeneralSheetViewRuntime =
  | SectionSheetViewRuntime
  | AssemblySheetViewRuntime;

interface GeneralSheetRuntime extends Omit<SheetState, "views"> {
  /** Persistent per-definition marks keep regeneration order independent. */
  pieceMarks?: Record<string, string>;
  /** The BOM sheet is independent of any single view and paginates large assemblies. */
  bomEntries?: AssemblyBomRow[];
  bomAssemblyId?: string;
  /** Hide generated index on one sheet when the user explicitly removes its BOM. */
  hideAutomaticBom?: boolean;
  id?: string;
  name?: string;
  readonly views: GeneralSheetViewRuntime[];
}

interface ProductionRuntime {
  readonly sheets: Map<string, GeneralSheetRuntime>;
  getActiveSheet(): GeneralSheetRuntime | null;
  syncActiveSheetToolbar(): void;
}

interface DrawingDocumentRuntime {
  readonly sectionId: string;
  readonly annotations: Array<Record<string, unknown>>;
}

interface WorkspaceRuntime {
  activeSectionId: string | null;
  snapshot: unknown | null;
  readonly documents: Map<string, DrawingDocumentRuntime>;
  readonly overlay: HTMLDivElement;
  readonly title: HTMLDivElement;
  readonly svg: SVGSVGElement;
  render(): void;
  setTool(tool: "SELECT" | "DIMENSION" | "LABEL" | "TEXT"): void;
  setStatus(message: string): void;
  eventToSheetPoint(event: PointerEvent | MouseEvent): THREE.Vector2 | null;
  buildSnapshot(section: SectionViewDefinition): { readonly segments: readonly PlanSegment[] };
  sectionToPaper(section: SectionViewDefinition, x: number, y: number): THREE.Vector2;
}

interface SectionRuntime {
  activeSectionId: string | null;
  refreshUi(): void;
}

interface ViewLayoutRuntime {
  readonly id: string;
  readonly sectionId: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleDenominator: number | null;
  cropRadius?: number;
  cropCenterX?: number;
  cropCenterY?: number;
  showHidden: boolean;
  locked: boolean;
  title?: string;
}

interface ProfessionalRuntime {
  ensureViewLayout(
    viewId: string,
    sectionId: string,
    index: number,
  ): ViewLayoutRuntime;
  createProfessionalSnapshot(): { readonly state: { readonly projectionStandard: ProjectionStandard } };
  recordDrawingChange?(): void;
}

interface LegacyAssemblyPdfViewSnapshot {
  readonly id?: string;
  readonly assemblyId?: string;
  readonly assemblyName?: string;
  readonly instanceIds?: readonly string[];
  readonly workPlane?: WorkPlaneSnapshot;
}

interface LegacyAssemblyPdfSheetSnapshot {
  readonly id?: string;
  readonly name?: string;
  readonly views?: readonly LegacyAssemblyPdfViewSnapshot[];
}

interface LegacyAssemblyPdfSnapshot {
  readonly version?: number;
  readonly sheets?: readonly LegacyAssemblyPdfSheetSnapshot[];
}

export interface GeneralPdfControllerOptions {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly engineeringModel: FrameLogicEngineeringModel;
  readonly drawingProduction: DrawingProductionController;
  readonly drawingProfessional: DrawingProfessionalController;
  readonly drawingWorkspace: DrawingWorkspaceController;
  readonly sectionDrawing: SectionDrawingController;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SHEET_WIDTH = 1120;
const SHEET_HEIGHT = 792;
const EPSILON = 1e-8;
const SECTION_PREFIX = "SECTION:";
const SHEET_PREFIX = "SHEET:";
const SHEET_MM = {
  A0: [1189, 841],
  A1: [841, 594],
  A2: [594, 420],
  A3: [420, 297],
  A4: [297, 210],
} as const;

/**
 * Motor único de Paper Space / PDF.
 *
 * DrawingProduction.sheets es la única fuente de verdad de hojas. Una hoja
 * puede contener Views de sección y de ensamble simultáneamente. Los antiguos
 * controladores AssemblyPdf* pueden permanecer en el código como compatibilidad
 * histórica, pero este controlador no crea ni mantiene un segundo almacén,
 * overlay o documento PDF.
 */
export class GeneralPdfController {
  private readonly container: HTMLElement;
  private readonly designModel: DesignModel;
  private readonly designScene: DesignSceneController;
  private readonly engineeringModel: FrameLogicEngineeringModel;
  private readonly production: ProductionRuntime;
  private readonly professional: ProfessionalRuntime;
  private readonly workspace: WorkspaceRuntime;
  private readonly sectionDrawing: SectionDrawingController;
  private readonly sectionRuntime: SectionRuntime;
  private readonly baseWorkspaceRender: () => void;
  private readonly timer: number;
  private orderProvider: (() => readonly string[]) | null = null;
  private activeSheetId: string | null = null;
  private lastTreeSignature = "";
  private disposed = false;
  private refreshInProgress = false;
  private lastAutomaticRefresh = 0;
  private selectedAssemblyViewId: string | null = null;
  private orientationChangeInProgress = false;
  private readonly viewOrientationPanel: HTMLDivElement;
  private projectionButton: HTMLButtonElement | null = null;
  private pendingProjection: {
    readonly sheetId: string;
    readonly sourceViewId: string;
    point: THREE.Vector2 | null;
    direction: ProjectedViewDirection | null;
    readonly token: number;
  } | null = null;
  private projectionToken = 0;
  private projectionInProgress = false;
  private projectionRefreshInProgress = false;
  private circularSourceRefreshInProgress = false;
  private detailButton: HTMLButtonElement | null = null;
  private pendingDetail: {
    sheetId: string; sourceViewId: string;
    phase: "CENTER" | "RADIUS" | "PLACE";
    centerPaper: THREE.Vector2 | null;
    radiusPaper: number;
    circle: DetailCircle | null;
    point: THREE.Vector2 | null;
  } | null = null;
  private detailDrag: {
    sheetId: string; detailId: string; mode: "MOVE" | "RADIUS";
    start: THREE.Vector2; original: DetailCircle;
  } | null = null;
  private activeBomDrag: {
    readonly sheetId: string;
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly originalX: number;
    readonly originalY: number;
    readonly originalWidth: number;
    readonly originalHeight: number;
    readonly action: "MOVE" | "RESIZE";
  } | null = null;
  private dimensionDrag: {
    readonly viewId: string;
    readonly key: string;
    readonly pointerId: number;
    readonly start: THREE.Vector2;
    readonly originalX: number;
    readonly originalY: number;
  } | null = null;

  constructor(options: GeneralPdfControllerOptions) {
    this.container = options.container;
    this.designModel = options.designModel;
    this.designScene = options.designScene;
    this.engineeringModel = options.engineeringModel;
    this.production =
      options.drawingProduction as unknown as ProductionRuntime;
    this.professional =
      options.drawingProfessional as unknown as ProfessionalRuntime;
    this.workspace =
      options.drawingWorkspace as unknown as WorkspaceRuntime;
    this.sectionDrawing = options.sectionDrawing;
    this.sectionRuntime =
      options.sectionDrawing as unknown as SectionRuntime;

    this.baseWorkspaceRender =
      this.workspace.render.bind(options.drawingWorkspace);
    this.workspace.render = () => {
      this.baseWorkspaceRender();
      this.renderGeneralViews();
    };

    this.viewOrientationPanel = this.createViewOrientationPanel();
    this.workspace.svg.addEventListener("pointerdown", this.onSheetBomPointerDown, true);
    this.workspace.svg.addEventListener("pointermove", this.onSheetBomPointerMove, true);
    this.workspace.svg.addEventListener("pointerup", this.onSheetBomPointerUp, true);
    this.workspace.svg.addEventListener("pointercancel", this.onSheetBomPointerUp, true);
    this.workspace.svg.addEventListener("pointerdown", this.onSelectPdfView, true);
    this.workspace.overlay.addEventListener("pointermove", this.onProjectViewPointerMove, true);
    this.workspace.overlay.addEventListener("pointerdown", this.onProjectViewPointerDown, true);
    this.workspace.overlay.addEventListener("pointermove", this.onDetailPointerMove, true);
    this.workspace.overlay.addEventListener("pointerdown", this.onDetailPointerDown, true);
    this.workspace.overlay.addEventListener("pointerup", this.onDetailPointerUp, true);
    window.addEventListener("keydown", this.onProjectedViewKeyDown, true);
    window.addEventListener("keydown", this.onDetailKeyDown, true);
    this.workspace.svg.addEventListener("pointerdown", this.onAutoDimensionDown, true);
    this.workspace.svg.addEventListener("pointermove", this.onAutoDimensionMove, true);
    this.workspace.svg.addEventListener("pointerup", this.onAutoDimensionUp, true);
    this.workspace.svg.addEventListener("pointercancel", this.onAutoDimensionUp, true);
    this.workspace.svg.addEventListener("contextmenu", this.onAutoDimensionContextMenu, true);
    this.syncSectionSheets();
    this.timer = window.setInterval(() => {
      if (this.pendingDetail && this.workspace.overlay.style.display === "none") {
        this.cancelCircularDetail(false);
      }
      if (this.pendingProjection && this.workspace.overlay.style.display === "none") {
        this.cancelProjectedView(false);
      }
      this.syncSectionSheets();
      this.decorateViewTree();
      this.normalizeModelSpacePdfRows();
      // Check source geometry occasionally, not during every render or pointer movement.
      if (Date.now() - this.lastAutomaticRefresh > 2800) {
        this.lastAutomaticRefresh = Date.now();
        void this.refreshAutomaticSheets(false);
        void this.refreshProjectedViews();
        void this.refreshCircularSourceProjections();
      }
    }, 240);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.workspace.svg.removeEventListener("pointerdown", this.onSheetBomPointerDown, true);
    this.workspace.svg.removeEventListener("pointermove", this.onSheetBomPointerMove, true);
    this.workspace.svg.removeEventListener("pointerup", this.onSheetBomPointerUp, true);
    this.workspace.svg.removeEventListener("pointercancel", this.onSheetBomPointerUp, true);
    this.workspace.svg.removeEventListener("pointerdown", this.onSelectPdfView, true);
    this.workspace.overlay.removeEventListener("pointermove", this.onProjectViewPointerMove, true);
    this.workspace.overlay.removeEventListener("pointerdown", this.onProjectViewPointerDown, true);
    this.workspace.overlay.removeEventListener("pointermove", this.onDetailPointerMove, true);
    this.workspace.overlay.removeEventListener("pointerdown", this.onDetailPointerDown, true);
    this.workspace.overlay.removeEventListener("pointerup", this.onDetailPointerUp, true);
    window.removeEventListener("keydown", this.onProjectedViewKeyDown, true);
    window.removeEventListener("keydown", this.onDetailKeyDown, true);
    this.cancelCircularDetail(false);
    this.cancelProjectedView(false);
    this.viewOrientationPanel.remove();
    this.workspace.svg.removeEventListener("pointerdown", this.onAutoDimensionDown, true);
    this.workspace.svg.removeEventListener("pointermove", this.onAutoDimensionMove, true);
    this.workspace.svg.removeEventListener("pointerup", this.onAutoDimensionUp, true);
    this.workspace.svg.removeEventListener("pointercancel", this.onAutoDimensionUp, true);
    this.workspace.svg.removeEventListener("contextmenu", this.onAutoDimensionContextMenu, true);
    this.dimensionDrag = null;
    this.workspace.render = this.baseWorkspaceRender;
    this.workspace.overlay
      .querySelector('[data-framelogic-pdf-view-tree="GENERAL"]')
      ?.remove();
  }

  setOrderProvider(provider: () => readonly string[]): void {
    this.orderProvider = provider;
  }

  getEntries(): GeneralPdfEntry[] {
    this.syncSectionSheets();
    return Array.from(this.production.sheets.entries()).map(
      ([sheetId, sheet]) => {
        const sectionView = this.getSectionViews(sheet)[0];
        return {
          key: sectionView
            ? `${SECTION_PREFIX}${sheetId}`
            : `${SHEET_PREFIX}${sheetId}`,
          kind: sectionView ? "SECTION" : "ASSEMBLY",
          targetId: sheetId,
          label: this.sheetName(sheetId, sheet),
        };
      },
    );
  }

  /** Ordered PDF document pages. Respect the user-edited Paper Space tree,
   * including BOM and detail sheets, without inferring pages from Model Space.
   */
  getExportableSheetIds(): string[] {
    this.syncSectionSheets();
    return [...new Set(this.getOrderedEntries()
      .map((entry) => entry.targetId)
      .filter((id) => this.production.sheets.has(id)))];
  }

  getActiveSheetId(): string | null {
    if (this.workspace.overlay.style.display === "none") {
      return null;
    }
    if (
      this.workspace.activeSectionId
      && this.production.sheets.has(this.workspace.activeSectionId)
    ) {
      this.activeSheetId = this.workspace.activeSectionId;
    }
    return this.activeSheetId;
  }

  openSheet(sheetId: string): boolean {
    this.syncSectionSheets();
    const sheet = this.production.sheets.get(sheetId);
    if (!sheet) return false;
    // Never complete a pending projection on an unintended destination sheet.
    if (this.pendingProjection && this.pendingProjection.sheetId !== sheetId) {
      this.cancelProjectedView(false);
    }

    this.activeSheetId = sheetId;
    const sectionView = this.getSectionViews(sheet)[0];
    if (sectionView) {
      const section = this.findSection(sectionView.sectionId);
      if (!section) return false;
      this.sectionRuntime.activeSectionId = section.id;
      this.sectionRuntime.refreshUi();
      const runtime = this.workspace as unknown as {
        activeSectionId: string | null;
      };
      runtime.activeSectionId = section.id;
      const drawingWorkspace = this.workspace as unknown as {
        openActiveSection(): boolean;
      };
      const opened = drawingWorkspace.openActiveSection();
      if (!opened) return false;
      this.workspace.title.textContent = `PDF · ${this.sheetName(sheetId, sheet)}`;
      this.production.syncActiveSheetToolbar();
      this.workspace.render();
      this.lastTreeSignature = "";
      return true;
    }

    this.openSheetWithoutSection(sheetId, sheet);
    this.production.syncActiveSheetToolbar();
    return true;
  }

  /**
   * Bounded set of transformed mesh-local box corners. Unlike the union of
   * world-aligned boxes, these retain the angle of a rotated long profile.
   * Used exclusively for proposing projection directions, never for dimensions.
   */
  private collectAutomaticViewOrientationPoints(
    instanceIds: readonly string[],
  ): Array<{ x: number; y: number; z: number }> {
    const wanted = new Set(instanceIds);
    const points: Array<{ x: number; y: number; z: number }> = [];
    const corner = new THREE.Vector3();
    for (const [instanceId, object] of this.designScene.getInstanceEntries()) {
      if (!wanted.has(instanceId)) continue;
      object.updateWorldMatrix(true, true);
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || points.length >= 8192) return;
        const geometry = child.geometry;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box || box.isEmpty()) return;
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z]) {
              corner.set(x, y, z).applyMatrix4(child.matrixWorld);
              if ([corner.x, corner.y, corner.z].every(Number.isFinite)) {
                points.push({ x: corner.x, y: corner.y, z: corner.z });
              }
            }
      });
    }
    return points;
  }

  /**
   * Creates a real, editable sheet in the existing Paper Space/PDF engine.
   * This first stage chooses projections and a common nominal scale; it does
   * not infer manufacturing dimensions from Three.js display triangles.
   */
  async generateAutomaticAssembly(request: GeneralPdfRequest): Promise<boolean> {
    if (this.disposed) return false;
    if (request.instanceIds.length < 1) {
      window.alert("El ensamble no contiene piezas.");
      return false;
    }
    const ids = new Set(request.instanceIds);
    const bounds = new THREE.Box3();
    let included = 0;
    for (const [instanceId, object] of this.designScene.getInstanceEntries()) {
      if (!ids.has(instanceId)) continue;
      object.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) continue;
      bounds.union(box);
      included += 1;
    }
    if (included === 0 || bounds.isEmpty()) {
      window.alert("No se encontró geometría 3D válida en el ensamble.");
      return false;
    }
    const planned = planSmartAssemblyViews({
      min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
      max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
    }, included, this.collectAutomaticViewOrientationPoints(request.instanceIds));
    if (!planned.length) {
      window.alert("No se pudieron calcular las vistas del ensamble.");
      return false;
    }

    const sheetId = crypto.randomUUID();
    const sheet = this.createEmptySheet(sheetId, `Plano de ensamble · ${request.assemblyName}`);
    sheet.titleBlock.drawingTitle = request.assemblyName;
    sheet.titleBlock.drawingNumber = `A-${request.assemblyId.slice(0, 8)}`;
    const marks: Record<string, string> = {};
    for (const instanceId of request.instanceIds) {
      const piece = this.designModel.pieceInstances.get(instanceId);
      if (piece && !marks[piece.definitionId]) {
        marks[piece.definitionId] = `P${Object.keys(marks).length + 1}`;
      }
    }
    sheet.pieceMarks = marks;

    const projected: Array<{ id: string; code: AutomaticViewCode; width: number; height: number }> = [];
    const projectionByView = new Map<string, AssemblyProjection>();
    for (const plannedView of planned) {
      const workPlane: CadWorkPlaneState = {
        mode: request.workPlane.mode,
        enabled: true,
        origin: new THREE.Vector3(0, 0, 0),
        xAxis: new THREE.Vector3(plannedView.xAxis.x, plannedView.xAxis.y, plannedView.xAxis.z),
        yAxis: new THREE.Vector3(plannedView.yAxis.x, plannedView.yAxis.y, plannedView.yAxis.z),
        normal: new THREE.Vector3(plannedView.normal.x, plannedView.normal.y, plannedView.normal.z),
      };
      let geometry;
      try {
        geometry = await projectAssembly({
          instanceIds: request.instanceIds, workPlane,
          designModel: this.designModel, designScene: this.designScene,
        });
      } catch (error) {
        window.alert(`Error proyectando ${plannedView.name}: ${String(error)}`);
        return false;
      }
      if (!geometry) {
        window.alert(`No se pudo proyectar ${plannedView.name}. No se creó el plano.`);
        return false;
      }
      const view = this.createAssemblyView({
        ...request,
        assemblyName: `${request.assemblyName} · ${plannedView.name.replace("AUTO · ", "")}`,
        workPlane,
      }, geometry);
      view.automaticViewCode = plannedView.code;
      view.automaticDimensions = plannedView.code === "ISO" ? [] : geometry.dimensions;
      view.automaticAnchors = geometry.anchors;
      view.exactInstances = geometry.exactInstances;
      view.fallbackInstances = geometry.fallbackInstances;
      view.assemblyOcclusionExact = geometry.assemblyOcclusionExact;
      view.automaticWarnings = geometry.warnings;
      view.geometrySignature = assemblyProjectionSignature({
        instanceIds: request.instanceIds, designModel: this.designModel, designScene: this.designScene,
      });
      sheet.views.push(view);
      projectionByView.set(view.id, geometry);
      projected.push({ id: view.id, code: plannedView.code, width: geometry.width, height: geometry.height });
    }
    const layouts = planSelectedSheetLayout(projected, "ISO_E");
    if (layouts.length !== projected.length) {
      window.alert("No fue posible distribuir las vistas en la hoja A3.");
      return false;
    }
    const scaleDenominator = selectAssemblyScaleDenominator(layouts[0]!.modelScale);
    if (scaleDenominator === null) {
      window.alert("El ensamble no cabe a una escala normalizada en A3. Revisa el tamaño del modelo.");
      return false;
    }
    sheet.scaleDenominator = scaleDenominator;
    this.production.sheets.set(sheetId, sheet);
    for (const [index, plannedLayout] of layouts.entries()) {
      const view = sheet.views.find((candidate) => candidate.id === plannedLayout.id);
      if (!view || !this.isAssemblyView(view)) continue;
      const layout = this.professional.ensureViewLayout(view.id, view.sectionId, index);
      layout.kind = "ASSEMBLY";
      layout.x = plannedLayout.x;
      layout.y = plannedLayout.y;
      layout.width = plannedLayout.width;
      layout.height = plannedLayout.height;
      layout.scaleDenominator = scaleDenominator;
      layout.title = view.assemblyName;
      layout.showHidden = false;
    }
    const mainView = sheet.views.find((candidate): candidate is AssemblySheetViewRuntime =>
      this.isAssemblyView(candidate) && Boolean(candidate.automaticViewCode)
      && candidate.automaticViewCode !== "ISO");
    const supplements = mainView && projectionByView.get(mainView.id)
      ? await this.generateAutomaticSectionDetailSheet(request, mainView,
        projectionByView.get(mainView.id)!)
      : { sections: 0, details: 0 };
    // Part and BOM sheets share DrawingProduction.sheets, never another renderer.
    const unique = new Map<string, string>();
    for (const id of request.instanceIds) {
      const piece = this.designModel.pieceInstances.get(id);
      if (piece && !unique.has(piece.definitionId)) unique.set(piece.definitionId, id);
    }
    const entries = this.buildBomRows(request.instanceIds, marks);
    // Full material index on additional A3 sheets; no guessed weight/material.
    if (entries.length > 8) {
      const chunkSize = 40;
      for (let start = 0; start < entries.length; start += chunkSize) {
        const page = this.createEmptySheet(crypto.randomUUID(),
          `Listado de piezas · ${request.assemblyName} · ${Math.floor(start / chunkSize) + 1}`);
        page.bomEntries = entries.slice(start, start + chunkSize);
        page.bomAssemblyId = request.assemblyId;
        page.titleBlock.drawingNumber = `B-${request.assemblyId.slice(0, 8)}-${Math.floor(start / chunkSize) + 1}`;
        this.production.sheets.set(page.id!, page);
      }
    }
    // Keep the initial operation responsive with a bounded number of part views.
    // Unprocessed marks are explicitly reported, never silently omitted.
    let detailCount = 0;
    for (const [definitionId, instanceId] of [...unique].slice(0, 20)) {
      const object = this.designScene.getInstanceObject(instanceId);
      if (!object) continue;
      const localBounds = new THREE.Box3().setFromObject(object);
      if (localBounds.isEmpty()) continue;
      const partViews = planSmartAssemblyViews({
        min: { x: localBounds.min.x, y: localBounds.min.y, z: localBounds.min.z },
        max: { x: localBounds.max.x, y: localBounds.max.y, z: localBounds.max.z },
      }, 1, this.collectAutomaticViewOrientationPoints([instanceId])).slice(0, 2);
      const partSheet = this.createEmptySheet(crypto.randomUUID(),
        `Pieza ${marks[definitionId]} · ${this.getPieceLabel(instanceId)}`);
      partSheet.titleBlock.drawingNumber = `${marks[definitionId]}-${request.assemblyId.slice(0, 8)}`;
      partSheet.pieceMarks = { [definitionId]: marks[definitionId]! };
      const partProjected: Array<{ id: string; code: AutomaticViewCode; width: number; height: number }> = [];
      for (const plannedPart of partViews) {
        const plane: CadWorkPlaneState = {
          mode: request.workPlane.mode, enabled: true,
          origin: new THREE.Vector3(),
          xAxis: new THREE.Vector3(plannedPart.xAxis.x, plannedPart.xAxis.y, plannedPart.xAxis.z),
          yAxis: new THREE.Vector3(plannedPart.yAxis.x, plannedPart.yAxis.y, plannedPart.yAxis.z),
          normal: new THREE.Vector3(plannedPart.normal.x, plannedPart.normal.y, plannedPart.normal.z),
        };
        let partGeometry;
        try {
          partGeometry = await projectAssembly({
            instanceIds: [instanceId], workPlane: plane,
            designModel: this.designModel, designScene: this.designScene,
          });
        } catch {
          // An individual over-complex piece must not invalidate the assembly sheet.
          continue;
        }
        if (!partGeometry) continue;
        const view = this.createAssemblyView({
          ...request, assemblyId: `piece:${instanceId}`,
          assemblyName: `${marks[definitionId]} · ${plannedPart.name.replace("AUTO · ", "")}`,
          instanceIds: [instanceId], workPlane: plane,
        }, partGeometry);
        view.automaticViewCode = plannedPart.code;
        view.automaticDimensions = partGeometry.dimensions;
        view.automaticAnchors = partGeometry.anchors;
        view.exactInstances = partGeometry.exactInstances;
        view.fallbackInstances = partGeometry.fallbackInstances;
        view.assemblyOcclusionExact = partGeometry.assemblyOcclusionExact;
        view.automaticWarnings = partGeometry.warnings;
        view.geometrySignature = assemblyProjectionSignature({
          instanceIds: [instanceId], designModel: this.designModel, designScene: this.designScene,
        });
        partSheet.views.push(view);
        partProjected.push({ id: view.id, code: plannedPart.code,
          width: partGeometry.width, height: partGeometry.height });
      }
      const arrangement = planSelectedSheetLayout(partProjected, "ISO_E");
      const denominator = arrangement.length
        ? selectAssemblyScaleDenominator(arrangement[0]!.modelScale) : null;
      if (!denominator || arrangement.length !== partProjected.length) continue;
      partSheet.scaleDenominator = denominator;
      this.production.sheets.set(partSheet.id!, partSheet);
      for (const [index, plannedLayout] of arrangement.entries()) {
        const view = partSheet.views.find((candidate) => candidate.id === plannedLayout.id);
        if (!view || !this.isAssemblyView(view)) continue;
        const layout = this.professional.ensureViewLayout(view.id, view.sectionId, index);
        layout.kind = "ASSEMBLY";
        layout.x = plannedLayout.x; layout.y = plannedLayout.y;
        layout.width = plannedLayout.width; layout.height = plannedLayout.height;
        layout.scaleDenominator = denominator; layout.title = view.assemblyName;
        layout.showHidden = false;
      }
      detailCount++;
    }
    this.activeSheetId = sheetId;
    this.lastTreeSignature = "";
    const opened = this.openSheet(sheetId);
    if (opened) {
      this.workspace.setStatus(
        `DETALLADO AUTO: ${planned.length} vistas; ${supplements.sections} cortes STEP; ${supplements.details} detalles ampliados; ${detailCount} planos de pieza; escala 1:${scaleDenominator}. `
        + `${sheet.views.some((view) => this.isAssemblyView(view) && view.assemblyOcclusionExact) ? "HLR conjunto OCCT cuando toda la geometría es STEP; " : "HLR STEP por pieza, sin ocultación entre piezas; "}${unique.size > 20 ? unique.size - 20 + " piezas sin plano individual por límite de 20. " : ""}`
        + "Cotas B-Rep en las vistas ortogonales. Revisar antes de fabricar.",
      );
    }
    return opened;
  }

  /**
   * One additional A3 sheet for physical STEP cut profiles and localized,
   * enlarged crops of the original orthographic HLR. Station choice is a
   * preliminary 20/80% sampling: NOT a verified connection detector.
   * Each section must intersect the actual placed B-Rep shapes to be emitted.
   */
  private async generateAutomaticSectionDetailSheet(
    request: GeneralPdfRequest,
    sourceView: AssemblySheetViewRuntime,
    sourceGeometry: AssemblyProjection,
  ): Promise<{ sections: number; details: number }> {
    const stations = planSectionStations(sourceGeometry.segments);
    if (!stations.length || sourceGeometry.offsetX === undefined) {
      return { sections: 0, details: 0 };
    }
    const sourcePlane = restoreWorkPlane(sourceView.workPlane);
    const sectionViews: AssemblySheetViewRuntime[] = [];
    const detailViews: AssemblySheetViewRuntime[] = [];
    const sheetNumber = `C-${request.assemblyId.slice(0, 8)}`;
    const cutReferences: Array<SectionStation & { targetSheet: string }> = [];
    const detailReferences: Array<{
      label: string; targetSheet: string;
      window: CroppedAssemblyDetail["window"];
    }> = [];
    for (const station of stations) {
      // In a right-handed orthographic workplane: (-normal, yAxis) makes
      // the cutting normal equal to the parent drawing's longitudinal X.
      const plane: CadWorkPlaneState = {
        mode: sourcePlane.mode, enabled: true,
        origin: sourcePlane.origin.clone().addScaledVector(
          sourcePlane.xAxis, station.x + sourceGeometry.offsetX,
        ),
        xAxis: sourcePlane.normal.clone().negate(),
        yAxis: sourcePlane.yAxis.clone(),
        normal: sourcePlane.xAxis.clone(),
      };
      try {
        const physical = await projectAssemblySection({
          instanceIds: request.instanceIds, workPlane: plane,
          designModel: this.designModel, designScene: this.designScene,
        }, station.label);
        if (physical) {
          const cutView = this.createAssemblyView({
            ...request, workPlane: plane,
            assemblyName: `CORTE ${station.label} · ${request.assemblyName}`,
          }, physical);
          cutView.automaticSupplement = "SECTION";
          cutView.automaticSectionLabel = station.label;
          cutView.supplementFraction = station.fraction;
          cutView.sourceViewId = sourceView.id;
          cutView.exactInstances = physical.exactInstances;
          cutView.geometrySignature = assemblyProjectionSignature({
            instanceIds: request.instanceIds,
            designModel: this.designModel, designScene: this.designScene,
          });
          sectionViews.push(cutView);
          cutReferences.push({ ...station, targetSheet: sheetNumber });
        }
      } catch {
        // A failed OCCT cut is never replaced by a misleading mesh silhouette.
      }
      // The enlargement preserves line visibility from the parent HLR.
      // Unlike the section it is a crop, not a new geometric intersection.
      const detail = this.buildAutomaticDetailCrop(sourceGeometry.segments, station);
      if (!detail) continue;
      const label = station.label[0]!;
      const detailView = this.createAssemblyView({
        ...request, workPlane: sourcePlane,
        assemblyName: `DETALLE ${label} · ${request.assemblyName}`,
      }, detail);
      detailView.automaticSupplement = "DETAIL";
      // The crop is normalized to its own local coordinates. Preserve its
      // absolute plane-space origin so the depth-buffered image uses the
      // exact same camera window as the enlarged HLR linework.
      detailView.offsetX = (sourceGeometry.offsetX ?? 0) + detail.window.x;
      detailView.offsetY = (sourceGeometry.offsetY ?? 0) + detail.window.y;
      detailView.assemblyOcclusionExact = sourceGeometry.assemblyOcclusionExact;
      detailView.automaticSectionLabel = label;
      detailView.supplementFraction = station.fraction;
      detailView.sourceViewId = sourceView.id;
      detailView.automaticWarnings = sourceGeometry.assemblyOcclusionExact
        ? [] : ["Ampliación preliminar: ocultación entre piezas no verificada."];
      detailView.geometrySignature = assemblyProjectionSignature({
        instanceIds: request.instanceIds,
        designModel: this.designModel, designScene: this.designScene,
      });
      detailViews.push(detailView);
      detailReferences.push({ label, window: detail.window, targetSheet: sheetNumber });
    }
    if (!sectionViews.length && !detailViews.length) return { sections: 0, details: 0 };
    const sheetId = crypto.randomUUID();
    const sheet = this.createEmptySheet(sheetId,
      `Cortes y detalles · ${request.assemblyName}`);
    sheet.titleBlock.drawingNumber = sheetNumber;
    sheet.titleBlock.drawingTitle = `Cortes y detalles · ${request.assemblyName}`;
    // Show exact physical cuts above their separately magnified details.
    sheet.views.push(...sectionViews, ...detailViews);
    const slots = planSectionDetailSheetSlots(sheet.views.length);
    for (const [index, view] of sheet.views.entries()) {
      if (!this.isAssemblyView(view)) continue;
      const slot = slots[index]!;
      const modelScale = Math.min(
        (slot.width - 90) / view.width, (slot.height - 100) / view.height,
      );
      const denominator = selectAssemblyScaleDenominator(modelScale);
      const layout = this.professional.ensureViewLayout(view.id, view.sectionId, index);
      layout.kind = "ASSEMBLY";
      layout.x = slot.x; layout.y = slot.y;
      layout.width = slot.width; layout.height = slot.height;
      layout.scaleDenominator = denominator;
      layout.title = view.assemblyName;
      layout.showHidden = false;
    }
    sourceView.cutReferences = cutReferences;
    sourceView.detailReferences = detailReferences;
    if (sectionViews.length < stations.length) {
      sourceView.automaticWarnings = [
        ...(sourceView.automaticWarnings ?? []),
        "Algunos cortes A-A/B-B no se generaron: falta B-Rep o el plano no intersecta el sólido.",
      ];
    }
    this.production.sheets.set(sheetId, sheet);
    return { sections: sectionViews.length, details: detailViews.length };
  }

  private buildAutomaticDetailCrop(
    segments: readonly AssemblyLine[], station: SectionStation,
  ): CroppedAssemblyDetail | null {
    let minX = Infinity, maxX = -Infinity;
    for (const segment of segments) {
      minX = Math.min(minX, segment.x1, segment.x2);
      maxX = Math.max(maxX, segment.x1, segment.x2);
    }
    const spanX = maxX - minX;
    const spanY = station.yMax - station.yMin;
    if (!Number.isFinite(spanX) || !Number.isFinite(spanY)
      || spanX <= 0 || spanY <= 0) return null;
    const width = Math.max(spanX * 0.12, spanY * 0.75);
    const height = Math.max(spanY * 0.85, width * 0.65);
    return cropAssemblyDetail(segments, station.x,
      (station.yMin + station.yMax) / 2, width, height);
  }

  /** Right-handed view basis; arbitrary origin does not alter normalized 2D linework. */
  private createOrientedWorkPlane(
    original: CadWorkPlaneState,
    basis: AssemblyViewBasis,
  ): CadWorkPlaneState {
    const vector = (p: { readonly x: number; readonly y: number; readonly z: number }) =>
      new THREE.Vector3(p.x, p.y, p.z);
    return {
      mode: original.mode, enabled: true, origin: new THREE.Vector3(),
      xAxis: vector(basis.xAxis),
      yAxis: vector(basis.yAxis),
      normal: vector(basis.normal),
    };
  }

  private orientationModeLabel(mode: AssemblyViewOrientationMode): string {
    return ASSEMBLY_VIEW_ORIENTATION_OPTIONS.find(([key]) => key === mode)?.[1] ?? mode;
  }

  sendAssembly(request: GeneralPdfRequest): boolean {
    if (this.disposed) return false;
    if (request.instanceIds.length < 1) {
      window.alert("El ensamble no contiene piezas.");
      return false;
    }

    // The old «Enviar a PDF» copied the active WorkPlane's projected camera
    // even for a long beam aligned with the world's X axis. That is why it
    // looked diagonal in Paper Space. Default to the assembly's own frame;
    // if geometry does not define a trustworthy long axis, use world FRONT.
    const samples = this.collectAutomaticViewOrientationPoints(request.instanceIds);
    const own = resolveAssemblyViewBasis("LONGITUDINAL", samples);
    const fallback = resolveAssemblyViewBasis("WORLD_FRONT", [])!;
    const orientationMode: AssemblyViewOrientationMode = own ? "LONGITUDINAL" : "WORLD_FRONT";
    const plane = this.createOrientedWorkPlane(request.workPlane, own ?? fallback);
    const geometry = this.buildPlanGeometry(
      request.instanceIds,
      plane,
    );
    if (!geometry) {
      window.alert(
        "No se encontró geometría para generar la vista del ensamble.",
      );
      return false;
    }

    const entries = this.getOrderedEntries();
    const options = [
      "0 = Nueva hoja",
      ...entries.map(
        (entry, index) => `${index + 1} = ${entry.label}`,
      ),
    ].join("\n");
    const answer = window.prompt(
      `Enviar a PDF\n${options}\n\nEscribe el número de destino:`,
      "0",
    );
    if (answer === null) return false;

    const numericIndex = Number.parseInt(answer.trim(), 10);
    if (
      !Number.isFinite(numericIndex)
      || numericIndex < 0
      || numericIndex > entries.length
    ) {
      window.alert("Destino de hoja inválido.");
      return false;
    }

    let sheetId: string;
    let sheet: GeneralSheetRuntime;
    if (numericIndex === 0) {
      sheetId = crypto.randomUUID();
      const defaultName = `Hoja ${this.production.sheets.size + 1}`;
      const name = window.prompt(
        "Nombre de la nueva hoja",
        defaultName,
      )?.trim();
      if (!name) return false;
      sheet = this.createEmptySheet(sheetId, name);
      this.production.sheets.set(sheetId, sheet);
    }
    else {
      const destination = entries[numericIndex - 1];
      if (!destination) return false;
      sheetId = destination.targetId;
      const existing = this.production.sheets.get(sheetId);
      if (!existing) return false;
      sheet = existing;
    }

    const view = this.createAssemblyView(
      { ...request, workPlane: plane },
      geometry,
    );
    view.originalWorkPlane = snapshotWorkPlane(request.workPlane.enabled
      ? request.workPlane : plane);
    view.orientationMode = orientationMode;
    view.orientationLabel = this.orientationModeLabel(orientationMode);
    sheet.views.push(view);
    this.selectedAssemblyViewId = view.id;
    const layout = this.professional.ensureViewLayout(
      view.id,
      view.sectionId,
      sheet.views.length - 1,
    );
    layout.kind = "ASSEMBLY";
    layout.title = request.assemblyName;

    this.activeSheetId = sheetId;
    this.lastTreeSignature = "";
    return this.openSheet(sheetId);
  }

  importLegacyAssemblyPdf(snapshot: unknown): void {
    const legacy = snapshot as LegacyAssemblyPdfSnapshot | undefined;
    if (
      !legacy
      || legacy.version !== 1
      || !Array.isArray(legacy.sheets)
    ) {
      return;
    }

    for (const legacySheet of legacy.sheets) {
      const sheetId =
        legacySheet.id?.trim()
        || crypto.randomUUID();
      if (this.production.sheets.has(sheetId)) continue;
      const name = legacySheet.name?.trim() || "Hoja PDF";
      const sheet = this.createEmptySheet(sheetId, name);

      for (const legacyView of legacySheet.views ?? []) {
        if (
          !legacyView.assemblyId
          || !legacyView.assemblyName
          || !legacyView.workPlane
          || !Array.isArray(legacyView.instanceIds)
        ) {
          continue;
        }
        const state = restoreWorkPlane(legacyView.workPlane);
        const geometry = this.buildPlanGeometry(
          legacyView.instanceIds,
          state,
        );
        if (!geometry) continue;
        const request: GeneralPdfRequest = {
          assemblyId: legacyView.assemblyId,
          assemblyName: legacyView.assemblyName,
          instanceIds: [...legacyView.instanceIds],
          workPlane: state,
        };
        const view = this.createAssemblyView(request, geometry);
        sheet.views.push({
          ...view,
          id: legacyView.id?.trim() || view.id,
        });
      }

      if (sheet.views.length > 0) {
        this.production.sheets.set(sheetId, sheet);
      }
    }

    this.lastTreeSignature = "";
  }

  private syncSectionSheets(): void {
    for (const section of this.sectionDrawing.getSections()) {
      let sheet = this.production.sheets.get(section.id);
      if (!sheet) {
        sheet = this.createSectionSheet(section);
        this.production.sheets.set(section.id, sheet);
      }
      sheet.id = section.id;
      if (!sheet.name?.trim()) {
        sheet.name = section.name;
      }
      const first = sheet.views[0];
      if (first && !this.isAssemblyView(first)) {
        first.kind = "SECTION";
      }
    }
  }

  private createSectionSheet(
    section: SectionViewDefinition,
  ): GeneralSheetRuntime {
    return {
      id: section.id,
      name: section.name,
      ownerSectionId: section.id,
      size: "A3",
      orientation: "LANDSCAPE",
      scaleDenominator: null,
      hatch: true,
      views: [{
        id: crypto.randomUUID(),
        sectionId: section.id,
        kind: "SECTION",
      }],
      titleBlock: {
        project: "FrameLogic",
        drawingTitle: section.name,
        drawingNumber: "P-001",
        author: "",
        company: "FrameLogic",
      },
      revisions: [],
    };
  }

  private createEmptySheet(
    id: string,
    name: string,
  ): GeneralSheetRuntime {
    return {
      id,
      name,
      ownerSectionId: id,
      size: "A3",
      orientation: "LANDSCAPE",
      scaleDenominator: null,
      hatch: true,
      views: [],
      titleBlock: {
        project: "FrameLogic",
        drawingTitle: name,
        drawingNumber: "P-001",
        author: "",
        company: "FrameLogic",
      },
      revisions: [],
    };
  }

  private createAssemblyView(
    request: GeneralPdfRequest,
    geometry: PlanGeometry,
  ): AssemblySheetViewRuntime {
    const id = crypto.randomUUID();
    return {
      id,
      sectionId: `assembly:${id}`,
      kind: "ASSEMBLY",
      assemblyId: request.assemblyId,
      assemblyName: request.assemblyName,
      instanceIds: [...request.instanceIds],
      workPlane: snapshotWorkPlane(request.workPlane),
      originalWorkPlane: snapshotWorkPlane(request.workPlane),
      width: geometry.width,
      height: geometry.height,
      offsetX: geometry.offsetX,
      offsetY: geometry.offsetY,
      segments: geometry.segments.map((segment) => ({ ...segment })),
      resolved: true,
    };
  }

  private openSheetWithoutSection(
    sheetId: string,
    sheet: GeneralSheetRuntime,
  ): void {
    this.workspace.activeSectionId = sheetId;
    this.workspace.snapshot = null;
    if (!this.workspace.documents.has(sheetId)) {
      this.workspace.documents.set(sheetId, {
        sectionId: sheetId,
        annotations: [],
      });
    }
    this.workspace.title.textContent = `PDF · ${this.sheetName(sheetId, sheet)}`;
    this.workspace.overlay.style.display = "flex";
    this.workspace.setTool("SELECT");
    this.workspace.setStatus(
      "Hoja PDF general. Cada View puede contener una sección, un ensamble o una pieza.",
    );
    this.workspace.render();
    this.lastTreeSignature = "";
  }

  private getOrderedEntries(): GeneralPdfEntry[] {
    const entries = this.getEntries();
    const requestedOrder = this.orderProvider?.() ?? [];
    if (requestedOrder.length < 1) return entries;
    const byKey = new Map(
      entries.map((entry) => [entry.key, entry] as const),
    );
    const ordered: GeneralPdfEntry[] = [];
    for (const key of requestedOrder) {
      const direct = byKey.get(key);
      if (direct) {
        ordered.push(direct);
        continue;
      }
      const target = key.includes(":")
        ? key.slice(key.indexOf(":") + 1)
        : key;
      const compatible = entries.find(
        (entry) => entry.targetId === target,
      );
      if (compatible && !ordered.includes(compatible)) {
        ordered.push(compatible);
      }
    }
    for (const entry of entries) {
      if (!ordered.includes(entry)) ordered.push(entry);
    }
    return ordered;
  }

  /**
   * Independent HTML controls stay OUTSIDE the exported SVG. A selected Paper
   * Space viewport can change projection without rotating or moving 3D parts.
   */
  private createViewOrientationPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.dataset["framelogicViewOrientationControls"] = "true";
    Object.assign(panel.style, {
      position: "absolute", top: "58px", right: "18px", zIndex: "88",
      maxWidth: "calc(100% - 305px)", minWidth: "220px",
      display: "none", alignItems: "center", flexWrap: "wrap", gap: "7px",
      padding: "7px 9px", borderRadius: "5px",
      background: "rgba(18,29,38,0.96)", color: "#e3f2f8",
      border: "1px solid #547183", boxShadow: "0 5px 16px rgba(0,0,0,0.3)",
      font: "11px system-ui,sans-serif",
    });
    const label = document.createElement("span");
    label.textContent = "VIEW seleccionada";
    label.style.fontWeight = "600";
    const viewSelect = document.createElement("select");
    viewSelect.dataset["framelogicViewSelect"] = "true";
    viewSelect.title = "Seleccionar la View del plano que se quiere orientar";
    const modeSelect = document.createElement("select");
    modeSelect.dataset["framelogicViewOrientation"] = "true";
    modeSelect.title = "Tipo de vista: ejes propios del ensamble o ejes globales";
    for (const [value, description] of ASSEMBLY_VIEW_ORIENTATION_OPTIONS) {
      const item = document.createElement("option");
      item.value = value;
      item.textContent = description;
      modeSelect.append(item);
    }
    for (const select of [viewSelect, modeSelect]) {
      Object.assign(select.style, {
        color: "#e6f1f5", background: "#1b303e",
        border: "1px solid #5e8496", borderRadius: "4px",
        padding: "5px", font: "inherit", maxWidth: "210px",
      });
    }
    viewSelect.addEventListener("change", () => {
      this.selectedAssemblyViewId = viewSelect.value;
      const sheetId = this.getActiveSheetId();
      this.updateViewOrientationPanel(sheetId ? this.production.sheets.get(sheetId) ?? null : null);
    });
    modeSelect.addEventListener("change", () => {
      void this.changeSelectedPdfViewOrientation(modeSelect.value as AssemblyViewOrientationMode);
    });
    const project = document.createElement("button");
    project.type = "button";
    project.textContent = "Proyectar View";
    project.title = "Crear una vista ortográfica o isométrica desde la pieza/ensamble de la View seleccionada. Arrastra el cursor y haz clic para colocar.";
    project.dataset["framelogicProjectView"] = "true";
    project.style.cssText = "padding:5px 9px;border:1px solid #73a8be;border-radius:4px;background:#244f65;color:#fff;font:inherit;cursor:pointer;";
    project.addEventListener("click", () => this.toggleProjectedView());
    this.projectionButton = project;
    const detail = document.createElement("button");
    detail.type = "button";
    detail.textContent = "Detalle";
    detail.title = "Selecciona una View y dibuja un círculo para crear una ampliación vectorial vinculada";
    detail.dataset["framelogicCircularDetail"] = "true";
    detail.style.cssText = project.style.cssText;
    detail.addEventListener("click", () => this.toggleCircularDetail());
    this.detailButton = detail;
    const scale = this.createViewScaleEditor();
    panel.append(label, viewSelect, modeSelect, project, detail, scale);
    this.workspace.overlay.append(panel);
    return panel;
  }


  /**
   * A scale editor exists in the selected-View toolbar and independently in
   * EVERY VIEWS tree row. The shared target is always a View ID, never a sheet.
   */
  private createViewScaleEditor(fixedViewId?: string): HTMLDivElement {
    const root = document.createElement("div");
    root.dataset["framelogicViewScaleEditor"] = "true";
    if (fixedViewId) root.dataset["framelogicScaleViewId"] = fixedViewId;
    root.style.cssText = fixedViewId
      ? "display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding:4px 8px 7px 26px;"
      : "display:flex;flex-wrap:wrap;gap:5px;align-items:center;padding-left:7px;border-left:1px solid #547183;";
    const caption = document.createElement("span");
    caption.textContent = fixedViewId ? "Escala" : "Escala de View";
    caption.title = "Escala individual de esta View; no modifica las demás Views ni la escala de la hoja";
    caption.style.cssText = "color:#bcd2dd;font-weight:600;white-space:nowrap;";
    const select = document.createElement("select");
    select.dataset["framelogicViewScale"] = "true";
    select.title = "Escala de la View individual: AUTO, normalizada o personalizada";
    const options: Array<readonly [string, string]> = [
      ["AUTO", "AUTO"],
      ...DRAWING_VIEW_SCALE_PRESETS.map((denominator) =>
        [String(denominator), formatDrawingViewScale(denominator)] as const),
      [DRAWING_VIEW_CUSTOM_SCALE, "Personalizada…"],
    ];
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.style.cssText = "padding:4px 5px;max-width:128px;border-radius:4px;"
      + "border:1px solid #5e8496;background:#1b303e;color:#f0f7fa;font:inherit;";
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.dataset["framelogicViewScaleCustom"] = "true";
    input.title = "Denominador personalizado: 15, 1:15 o 1:17,5. Pulsa Enter o Aplicar.";
    input.placeholder = "1:15";
    input.setAttribute("aria-label", "Escala personalizada de la View (1:N)");
    input.style.cssText = "display:none;width:68px;min-width:0;padding:4px;"
      + "border-radius:4px;border:1px solid #5e8496;background:#1b303e;color:#f0f7fa;font:inherit;";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.textContent = "Aplicar";
    apply.dataset["framelogicApplyViewScale"] = "true";
    apply.title = "Aplicar únicamente a esta View";
    apply.style.cssText = "display:none;padding:4px 6px;border:1px solid #73a8be;"
      + "border-radius:4px;background:#244f65;color:white;cursor:pointer;font:inherit;";
    const getViewId = (): string | null => fixedViewId ?? this.selectedAssemblyViewId;
    const commit = (value: string): void => {
      const viewId = getViewId();
      if (viewId) this.applyIndividualViewScale(viewId, value);
    };
    select.addEventListener("change", () => {
      if (select.value === DRAWING_VIEW_CUSTOM_SCALE) {
        input.style.display = "inline-block";
        apply.style.display = "inline-block";
        if (!input.value.trim() || input.value.trim() === "AUTO") {
          const viewId = getViewId();
          const sheetId = this.getActiveSheetId();
          const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
          const index = sheet?.views.findIndex((view) => view.id === viewId) ?? -1;
          const view = index >= 0 ? sheet?.views[index] : null;
          const denominator = view ? this.professional.ensureViewLayout(
            view.id, view.sectionId, index).scaleDenominator : null;
          input.value = denominator === null ? "1:15" : formatDrawingViewScale(denominator);
        }
        input.focus();
      } else {
        commit(select.value);
      }
    });
    apply.addEventListener("click", () => commit(input.value));
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        commit(input.value);
      }
    });
    root.append(caption, select, input, apply);
    return root;
  }

  private syncViewScaleEditor(
    editor: HTMLDivElement, viewId: string, sheet: GeneralSheetRuntime,
  ): void {
    const index = sheet.views.findIndex((view) => view.id === viewId);
    if (index < 0) return;
    const view = sheet.views[index]!;
    const layout = this.professional.ensureViewLayout(view.id, view.sectionId, index);
    const select = editor.querySelector<HTMLSelectElement>(
      '[data-framelogic-view-scale="true"]')!;
    const input = editor.querySelector<HTMLInputElement>(
      '[data-framelogic-view-scale-custom="true"]')!;
    const apply = editor.querySelector<HTMLButtonElement>(
      '[data-framelogic-apply-view-scale="true"]')!;
    const option = drawingViewScaleSelection(layout.scaleDenominator);
    const selectionChanged = editor.dataset["currentViewId"] !== viewId;
    editor.dataset["currentViewId"] = viewId;
    if (selectionChanged || select.value !== option) select.value = option;
    const isCustom = select.value === DRAWING_VIEW_CUSTOM_SCALE;
    input.style.display = isCustom ? "inline-block" : "none";
    apply.style.display = isCustom ? "inline-block" : "none";
    // Repeated re-renders must never discard an unfinished custom value.
    if (selectionChanged || document.activeElement !== input) {
      const current = layout.scaleDenominator;
      input.value = current === null ? "" : formatDrawingViewScale(current);
    }
    const disabled = this.orientationChangeInProgress
      || this.projectionInProgress || Boolean(this.pendingProjection)
      || Boolean(this.pendingDetail);
    select.disabled = disabled;
    input.disabled = disabled;
    apply.disabled = disabled;
  }

  private applyIndividualViewScale(viewId: string, input: string): void {
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    const index = sheet?.views.findIndex((view) => view.id === viewId) ?? -1;
    if (!sheet || index < 0) return;
    const denominator = parseDrawingViewScale(input);
    if (denominator === undefined) {
      this.workspace.setStatus(
        "ESCALA VIEW: valor inválido. Escribe AUTO, 1:20 o un denominador entre 1 y 1000000.",
      );
      return;
    }
    const view = sheet.views[index]!;
    const layout = this.professional.ensureViewLayout(view.id, view.sectionId, index);
    if (layout.scaleDenominator === denominator) return;
    layout.scaleDenominator = denominator;
    this.lastTreeSignature = "";
    // Do not mutate sheet.scaleDenominator or any other View's layout.
    this.workspace.render();
    const name = this.isAssemblyView(view) ? view.assemblyName
      : this.findSection(view.sectionId)?.name ?? "Sección";
    let warning = "";
    if (denominator !== null && this.isAssemblyView(view)) {
      const paddingX = view.automaticViewCode || view.automaticSupplement ? 90 : 20;
      const paddingY = view.automaticViewCode || view.automaticSupplement ? 100 : 34;
      const displayScale = this.technicalScale(sheet, denominator);
      if (view.width * displayScale > layout.width - paddingX
        || view.height * displayScale > layout.height - paddingY) {
        warning = " La geometría excede el marco: amplía esta View o elige una escala menor.";
      }
    }
    this.workspace.setStatus(
      `ESCALA: View ${index + 1} · ${name} → ${formatDrawingViewScale(denominator)}.`
      + " Las otras Views, las cotas reales y el modelo 3D no cambiaron." + warning,
    );
  }


  /** Two clicks define a model-space circle; the third places an independent View. */
  private toggleCircularDetail(): void {
    if (this.pendingDetail) { this.cancelCircularDetail(true); return; }
    if (this.pendingProjection || this.projectionInProgress || this.orientationChangeInProgress) return;
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    const source = sheet?.views.find((view) => view.id === this.selectedAssemblyViewId);
    if (!sheetId || !sheet || !source) {
      this.workspace.setStatus("DETALLE: selecciona primero una View en el PDF.");
      return;
    }
    if (this.isAssemblyView(source) && source.automaticSupplement === "SECTION" && !source.segments.length) {
      this.workspace.setStatus("DETALLE: el corte de origen aún no contiene geometría.");
      return;
    }
    this.workspace.setTool("SELECT");
    this.pendingDetail = {
      sheetId, sourceViewId: source.id, phase: "CENTER",
      centerPaper: null, radiusPaper: 0, circle: null, point: null,
    };
    this.workspace.svg.style.cursor = "crosshair";
    this.updateViewOrientationPanel(sheet);
    this.workspace.setStatus("DETALLE: clic en el centro del área de la View. Esc cancela.");
  }

  private cancelCircularDetail(notify: boolean): void {
    this.pendingDetail = null;
    this.detailDrag = null;
    this.workspace.svg.style.cursor = "";
    this.workspace.svg.querySelector('[data-framelogic-detail-preview="true"]')?.remove();
    if (this.disposed) return;
    const id = this.getActiveSheetId();
    this.updateViewOrientationPanel(id ? this.production.sheets.get(id) ?? null : null);
    if (notify) this.workspace.setStatus("DETALLE: comando cancelado sin crear vistas.");
  }

  private readonly onDetailKeyDown = (event: KeyboardEvent): void => {
    if (!this.pendingDetail || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelCircularDetail(true);
  };

  private getCircularSourcePlane(source: GeneralSheetViewRuntime): WorkPlaneSnapshot | null {
    if (this.isAssemblyView(source)) return source.workPlane;
    const section = this.findSection(source.sectionId);
    if (!section) return null;
    return {
      mode: "CUSTOM", enabled: true,
      origin: section.origin, xAxis: section.xAxis,
      yAxis: section.yAxis, normal: section.normal,
    };
  }

  private sourceProjectionTransform(
    sheet: GeneralSheetRuntime, source: GeneralSheetViewRuntime, index: number,
  ): DetailPaperTransform | null {
    const layout = this.professional.ensureViewLayout(source.id, source.sectionId, index);
    if (this.isAssemblyView(source)) {
      const automatic = Boolean(source.automaticViewCode || source.automaticSupplement);
      const padX = automatic ? 90 : 20;
      const padY = automatic ? 100 : 34;
      const innerWidth = Math.max(1, layout.width - padX);
      const innerHeight = Math.max(1, layout.height - padY);
      const scale = layout.scaleDenominator === null
        ? Math.min(innerWidth / Math.max(source.width, EPSILON),
          innerHeight / Math.max(source.height, EPSILON))
        : this.technicalScale(sheet, layout.scaleDenominator);
      const drawnWidth = source.width * scale;
      const drawnHeight = source.height * scale;
      if (!(scale > 0)) return null;
      return {
        originX: layout.x + (automatic ? 20 : 0) + (innerWidth - drawnWidth) / 2,
        originY: layout.y + (automatic ? 60 : 20) + (innerHeight - drawnHeight) / 2,
        drawnHeight, scale,
      };
    }
    const section = this.findSection(source.sectionId);
    if (!section) return null;
    if (index === 0) {
      const zero = this.workspace.sectionToPaper(section, 0, 0);
      const unit = this.workspace.sectionToPaper(section, 1, 0);
      const scale = unit.x - zero.x;
      if (!Number.isFinite(scale) || scale <= 0) return null;
      return {
        originX: zero.x, originY: zero.y - section.height * scale,
        drawnHeight: section.height * scale, scale,
      };
    }
    const cropRadius = layout.kind === "DETAIL" ? layout.cropRadius : undefined;
    const cx = layout.cropCenterX ?? section.width / 2;
    const cy = layout.cropCenterY ?? section.height / 2;
    const modelWidth = cropRadius ? 2 * cropRadius : section.width;
    const modelHeight = cropRadius ? 2 * cropRadius : section.height;
    const scale = layout.scaleDenominator === null
      ? Math.min((layout.width - 20) / Math.max(modelWidth, EPSILON),
        (layout.height - 28) / Math.max(modelHeight, EPSILON))
      : this.technicalScale(sheet, layout.scaleDenominator);
    if (!(scale > 0)) return null;
    return {
      originX: layout.x + layout.width / 2 - cx * scale,
      originY: layout.y + layout.height / 2 + cy * scale - section.height * scale,
      drawnHeight: section.height * scale, scale,
    };
  }

  private sourceDetailSegments(source: GeneralSheetViewRuntime): readonly PlanSegment[] {
    if (this.isAssemblyView(source)) {
      this.ensureAssemblyResolved(source);
      return source.segments;
    }
    const section = this.findSection(source.sectionId);
    return section ? this.workspace.buildSnapshot(section).segments : [];
  }

  private detailSourceFingerprint(source: GeneralSheetViewRuntime): string {
    if (this.isAssemblyView(source)) {
      return JSON.stringify([source.id, source.geometrySignature,
        source.width, source.height, source.offsetX, source.offsetY,
        source.workPlane, source.circularDetail?.centerX,
        source.circularDetail?.centerY, source.circularDetail?.radius,
        source.segments.length]);
    }
    const section = this.findSection(source.sectionId);
    const instanceIds = this.designModel.pieceInstances.getAll().map((instance) => instance.id);
    return JSON.stringify([source.id, section, assemblyProjectionSignature({
      instanceIds, designModel: this.designModel, designScene: this.designScene,
    })]);
  }

  private readonly onDetailPointerMove = (event: PointerEvent): void => {
    if (!(event.target instanceof Node) || !this.workspace.svg.contains(event.target)) return;
    const point = this.workspace.eventToSheetPoint(event);
    if (!point) return;
    if (this.detailDrag) {
      const drag = this.detailDrag;
      const sheet = this.production.sheets.get(drag.sheetId);
      const detail = sheet?.views.find((v): v is AssemblySheetViewRuntime =>
        this.isAssemblyView(v) && v.id === drag.detailId);
      const source = sheet?.views.find((v) => v.id === detail?.sourceViewId);
      const index = source ? sheet!.views.indexOf(source) : -1;
      if (!sheet || !detail?.circularDetail || !source || index < 0) {
        this.detailDrag = null; return;
      }
      const transform = this.sourceProjectionTransform(sheet, source, index);
      if (!transform) return;
      const old = drag.original;
      const next = drag.mode === "MOVE"
        ? { x: old.x + (point.x - drag.start.x) / transform.scale,
          y: old.y - (point.y - drag.start.y) / transform.scale, radius: old.radius }
        : { ...old, radius: Math.hypot(
          point.x - (transform.originX + old.x * transform.scale),
          point.y - (transform.originY + transform.drawnHeight - old.y * transform.scale),
        ) / transform.scale };
      if (next.radius < 0.001) return;
      detail.circularDetail.centerX = next.x;
      detail.circularDetail.centerY = next.y;
      detail.circularDetail.radius = next.radius;
      this.rebuildCircularDetail(detail, source);
      this.workspace.render();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const pending = this.pendingDetail;
    if (!pending) return;
    pending.point = point;
    if (pending.phase === "RADIUS" && pending.centerPaper) {
      pending.radiusPaper = point.distanceTo(pending.centerPaper);
    }
    this.drawCircularDetailPreview();
  };

  private readonly onDetailPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const reference = event.target.closest<SVGElement>('[data-framelogic-circular-ref]');
    if (!this.pendingDetail && reference) {
      const sheetId = this.getActiveSheetId();
      const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
      const detailId = reference.dataset["framelogicCircularRef"];
      const detail = sheet?.views.find((view): view is AssemblySheetViewRuntime =>
        this.isAssemblyView(view) && view.id === detailId);
      const point = this.workspace.eventToSheetPoint(event);
      if (!sheetId || !detail?.circularDetail || !point) return;
      this.detailDrag = {
        sheetId, detailId: detail.id,
        mode: reference.dataset["framelogicDetailDrag"] === "RADIUS" ? "RADIUS" : "MOVE",
        start: point.clone(),
        original: {
          x: detail.circularDetail.centerX, y: detail.circularDetail.centerY,
          radius: detail.circularDetail.radius,
        },
      };
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const pending = this.pendingDetail;
    if (!pending || !this.workspace.svg.contains(event.target)) return;
    const sheet = this.production.sheets.get(pending.sheetId);
    const sourceIndex = sheet?.views.findIndex((v) => v.id === pending.sourceViewId) ?? -1;
    const source = sourceIndex >= 0 ? sheet!.views[sourceIndex] : null;
    const point = this.workspace.eventToSheetPoint(event);
    if (!sheet || !source || !point || this.getActiveSheetId() !== pending.sheetId) {
      this.cancelCircularDetail(true); return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (pending.phase === "CENTER") {
      const layout = this.professional.ensureViewLayout(source.id, source.sectionId, sourceIndex);
      if (point.x < layout.x || point.x > layout.x + layout.width
        || point.y < layout.y || point.y > layout.y + layout.height) {
        this.workspace.setStatus("DETALLE: indica el centro dentro de la View seleccionada.");
        return;
      }
      pending.centerPaper = point.clone();
      pending.radiusPaper = 0;
      pending.phase = "RADIUS";
      this.workspace.setStatus("DETALLE: mueve el cursor y haz clic para confirmar el radio.");
    } else if (pending.phase === "RADIUS") {
      if (!pending.centerPaper) return;
      const transform = this.sourceProjectionTransform(sheet, source, sourceIndex);
      const layout = this.professional.ensureViewLayout(source.id, source.sectionId, sourceIndex);
      const radiusPaper = point.distanceTo(pending.centerPaper);
      const maxRadius = Math.min(
        pending.centerPaper.x - layout.x - 3,
        layout.x + layout.width - pending.centerPaper.x - 3,
        pending.centerPaper.y - layout.y - 3,
        layout.y + layout.height - pending.centerPaper.y - 3,
      );
      if (radiusPaper > maxRadius) {
        this.workspace.setStatus("DETALLE: mantén el círculo dentro del marco de la View origen.");
        return;
      }
      const circle = transform
        ? paperCircleToProjection(pending.centerPaper, radiusPaper, transform) : null;
      if (!circle || radiusPaper < 4
        || !cropProjectedDetail(this.sourceDetailSegments(source), circle)) {
        this.workspace.setStatus("DETALLE: el círculo debe incluir geometría vectorial y tener un radio mayor.");
        return;
      }
      pending.circle = circle;
      pending.radiusPaper = radiusPaper;
      pending.phase = "PLACE";
      pending.point = point.clone();
      this.workspace.setStatus("DETALLE: coloca la nueva View en un área libre del PDF; Esc cancela.");
    } else if (pending.circle) {
      this.placeCircularDetail(sheet, source, sourceIndex, pending.circle, point);
    }
    this.drawCircularDetailPreview();
  };

  private readonly onDetailPointerUp = (event: PointerEvent): void => {
    const drag = this.detailDrag;
    if (!drag) return;
    this.detailDrag = null;
    const sheet = this.production.sheets.get(drag.sheetId);
    const detail = sheet?.views.find((v): v is AssemblySheetViewRuntime =>
      this.isAssemblyView(v) && v.id === drag.detailId);
    const source = sheet?.views.find((v) => v.id === detail?.sourceViewId);
    if (sheet && detail?.circularDetail && source) {
      const sourceIndex = sheet.views.indexOf(source);
      const transform = this.sourceProjectionTransform(sheet, source, sourceIndex);
      const sourceLayout = this.professional.ensureViewLayout(
        source.id, source.sectionId, sourceIndex);
      const paper = transform ? projectionCircleToPaper({
        x: detail.circularDetail.centerX, y: detail.circularDetail.centerY,
        radius: detail.circularDetail.radius,
      }, transform) : null;
      const outside = !paper
        || paper.x - paper.radius < sourceLayout.x + 2
        || paper.y - paper.radius < sourceLayout.y + 2
        || paper.x + paper.radius > sourceLayout.x + sourceLayout.width - 2
        || paper.y + paper.radius > sourceLayout.y + sourceLayout.height - 2;
      if (!detail.segments.length || outside) {
        detail.circularDetail.centerX = drag.original.x;
        detail.circularDetail.centerY = drag.original.y;
        detail.circularDetail.radius = drag.original.radius;
        this.rebuildCircularDetail(detail, source);
        this.workspace.setStatus("DETALLE: el círculo debe quedar dentro de la View y contener geometría.");
      } else {
        this.professional.recordDrawingChange?.();
        this.workspace.setStatus("DETALLE " + detail.circularDetail.label + ": referencia y geometría actualizadas.");
      }
      this.workspace.render();
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private circularGhostSize(
    sheet: GeneralSheetRuntime, circle: DetailCircle,
  ): { width: number; height: number } {
    const diameter = 2 * circle.radius * this.technicalScale(sheet, 5);
    const edge = Math.min(340, Math.max(150, diameter + 44));
    return { width: edge, height: edge + 16 };
  }

  private drawCircularDetailPreview(): void {
    this.workspace.svg.querySelector('[data-framelogic-detail-preview="true"]')?.remove();
    const pending = this.pendingDetail;
    if (!pending || this.getActiveSheetId() !== pending.sheetId) return;
    const group = document.createElementNS(SVG_NS, "g");
    group.dataset["framelogicDetailPreview"] = "true";
    group.style.pointerEvents = "none";
    const stroke = "#1482ab";
    if (pending.phase === "RADIUS" && pending.centerPaper && pending.radiusPaper > 0) {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("cx", String(pending.centerPaper.x));
      circle.setAttribute("cy", String(pending.centerPaper.y));
      circle.setAttribute("r", String(pending.radiusPaper));
      circle.setAttribute("fill", "rgba(40,110,180,0.06)");
      circle.setAttribute("stroke", stroke);
      circle.setAttribute("stroke-width", "1.8");
      circle.setAttribute("stroke-dasharray", "6 4");
      group.append(circle);
    }
    if (pending.phase === "PLACE" && pending.point && pending.circle) {
      const sheet = this.production.sheets.get(pending.sheetId);
      if (sheet) {
        const size = this.circularGhostSize(sheet, pending.circle);
        const frame = document.createElementNS(SVG_NS, "rect");
        frame.setAttribute("x", String(pending.point.x - size.width / 2));
        frame.setAttribute("y", String(pending.point.y - size.height / 2));
        frame.setAttribute("width", String(size.width));
        frame.setAttribute("height", String(size.height));
        frame.setAttribute("fill", "rgba(30,140,190,0.08)");
        frame.setAttribute("stroke", stroke);
        frame.setAttribute("stroke-dasharray", "8 5");
        group.append(frame);
      }
    }
    this.workspace.svg.append(group);
  }

  private placeCircularDetail(
    sheet: GeneralSheetRuntime, source: GeneralSheetViewRuntime,
    sourceIndex: number, circle: DetailCircle, point: THREE.Vector2,
  ): void {
    const geometry = cropProjectedDetail(this.sourceDetailSegments(source), circle);
    const plane = this.getCircularSourcePlane(source);
    if (!geometry || !plane) {
      this.workspace.setStatus("DETALLE: no hay geometría proyectada en esta zona.");
      return;
    }
    const size = this.circularGhostSize(sheet, circle);
    const placement = {
      x: point.x - size.width / 2, y: point.y - size.height / 2,
      width: size.width, height: size.height,
    };
    const occupied = sheet.views.map((v, i) =>
      this.professional.ensureViewLayout(v.id, v.sectionId, i));
    if (!this.getSectionViews(sheet).length) occupied.push({
      id: "TITLE_BLOCK", sectionId: "", kind: "ASSEMBLY",
      x: 728, y: 670, width: 360, height: 92,
      scaleDenominator: null, showHidden: false, locked: true,
    });
    if (placement.x < 3 || placement.y < 3
      || placement.x + placement.width > SHEET_WIDTH - 3
      || placement.y + placement.height > SHEET_HEIGHT - 3
      || projectedViewportOverlaps(placement, occupied)) {
      this.workspace.setStatus("DETALLE: el marco se superpone o queda fuera de la hoja. Elige un espacio libre.");
      return;
    }
    const label = nextCircularDetailLetter(sheet.views.flatMap((view) =>
      this.isAssemblyView(view) && view.circularDetail ? [view.circularDetail.label] : []));
    const workPlane = restoreWorkPlane(plane);
    const sourceOffsetX = this.isAssemblyView(source) ? source.offsetX ?? 0 : 0;
    const sourceOffsetY = this.isAssemblyView(source) ? source.offsetY ?? 0 : 0;
    const instanceIds = this.isAssemblyView(source) ? source.instanceIds
      : this.designModel.pieceInstances.getAll().map((item) => item.id);
    const title = this.isAssemblyView(source) ? source.assemblyName
      : this.findSection(source.sectionId)?.name ?? "Sección";
    const view = this.createAssemblyView({
      assemblyId: this.isAssemblyView(source) ? source.assemblyId : "section:" + source.sectionId,
      assemblyName: title, instanceIds, workPlane,
    }, {
      ...geometry,
      offsetX: sourceOffsetX + geometry.offsetX,
      offsetY: sourceOffsetY + geometry.offsetY,
    });
    view.sourceViewId = source.id;
    view.circularDetail = {
      label, centerX: circle.x, centerY: circle.y, radius: circle.radius,
      sourceSignature: this.detailSourceFingerprint(source),
      sourceWorkPlane: plane,
      fromSection: !this.isAssemblyView(source),
    };
    view.renderMode = "renderMode" in source ? source.renderMode : undefined;
    view.geometrySignature = this.isAssemblyView(source) ? source.geometrySignature : undefined;
    view.assemblyOcclusionExact = this.isAssemblyView(source) ? source.assemblyOcclusionExact : false;
    view.resolved = true;
    if (!validDetailAncestry(source.id, view.id, [...sheet.views, view])) {
      this.workspace.setStatus("DETALLE: dependencia circular de Views rechazada.");
      return;
    }
    sheet.views.push(view);
    const layout = this.professional.ensureViewLayout(view.id, view.sectionId, sheet.views.length - 1);
    layout.kind = "DETAIL";
    layout.title = "DETALLE " + label;
    layout.x = placement.x;
    layout.y = placement.y;
    layout.width = placement.width;
    layout.height = placement.height;
    layout.scaleDenominator = 5;
    const sourceLayout = this.professional.ensureViewLayout(source.id, source.sectionId, sourceIndex);
    layout.showHidden = sourceLayout.showHidden;
    this.selectedAssemblyViewId = view.id;
    this.cancelCircularDetail(false);
    this.lastTreeSignature = "";
    this.professional.recordDrawingChange?.();
    this.workspace.render();
    this.workspace.setStatus("DETALLE " + label + " creado a escala 1:5. "
      + "La View padre conserva su escala; puedes editar centro/radio y cambiar la escala.");
  }

  private rebuildCircularDetail(
    detail: AssemblySheetViewRuntime, source: GeneralSheetViewRuntime,
  ): void {
    const settings = detail.circularDetail;
    if (!settings) return;
    const geometry = cropProjectedDetail(this.sourceDetailSegments(source), {
      x: settings.centerX, y: settings.centerY, radius: settings.radius,
    });
    detail.width = settings.radius * 2;
    detail.height = settings.radius * 2;
    detail.segments = geometry?.segments ?? [];
    detail.offsetX = (this.isAssemblyView(source) ? source.offsetX ?? 0 : 0)
      + settings.centerX - settings.radius;
    detail.offsetY = (this.isAssemblyView(source) ? source.offsetY ?? 0 : 0)
      + settings.centerY - settings.radius;
    detail.geometrySignature = this.isAssemblyView(source) ? source.geometrySignature : undefined;
    detail.assemblyOcclusionExact = this.isAssemblyView(source) ? source.assemblyOcclusionExact : false;
    settings.sourceSignature = this.detailSourceFingerprint(source);
    detail.resolved = true;
  }

  /** Reclip only changed dependent Details. No full-sheet OCCT call on mouse move. */
  private refreshCircularDetails(sheet: GeneralSheetRuntime): void {
    const details = sheet.views.filter((view): view is AssemblySheetViewRuntime =>
      this.isAssemblyView(view) && Boolean(view.circularDetail));
    for (const detail of details) {
      const source = sheet.views.find((view) => view.id === detail.sourceViewId);
      if (!source || !detail.circularDetail || !validDetailAncestry(
        source.id, detail.id, sheet.views)) {
        detail.segments = [];
        detail.automaticWarnings = ["DETALLE: View origen inexistente o dependencia circular."];
        continue;
      }
      const sourcePlane = this.getCircularSourcePlane(source);
      if (!sourcePlane || JSON.stringify(sourcePlane) !==
        JSON.stringify(detail.circularDetail.sourceWorkPlane)) {
        detail.segments = [];
        detail.automaticWarnings = ["DETALLE: orientación del origen modificada; crea otra referencia."];
        continue;
      }
      if (this.detailSourceFingerprint(source) !== detail.circularDetail.sourceSignature) {
        this.rebuildCircularDetail(detail, source);
      }
    }
  }

  private renderCircularReferences(sheet: GeneralSheetRuntime): void {
    for (const detail of sheet.views) {
      if (!this.isAssemblyView(detail) || !detail.circularDetail || !detail.sourceViewId) continue;
      const index = sheet.views.findIndex((view) => view.id === detail.sourceViewId);
      if (index < 0) continue;
      const parent = sheet.views[index]!;
      const transform = this.sourceProjectionTransform(sheet, parent, index);
      if (!transform) continue;
      const center = projectionCircleToPaper({
        x: detail.circularDetail.centerX, y: detail.circularDetail.centerY,
        radius: detail.circularDetail.radius,
      }, transform);
      if (![center.x, center.y, center.radius].every(Number.isFinite)) continue;
      const ring = document.createElementNS(SVG_NS, "circle");
      ring.setAttribute("cx", String(center.x));
      ring.setAttribute("cy", String(center.y));
      ring.setAttribute("r", String(center.radius));
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", "#12567c");
      ring.setAttribute("stroke-width", "1.6");
      ring.dataset["framelogicCircularRef"] = detail.id;
      ring.dataset["framelogicDetailDrag"] = "MOVE";
      ring.style.pointerEvents = "stroke";
      ring.style.cursor = "move";
      this.workspace.svg.append(ring);
      const handle = document.createElementNS(SVG_NS, "circle");
      handle.setAttribute("cx", String(center.x + center.radius));
      handle.setAttribute("cy", String(center.y));
      handle.setAttribute("r", "5");
      handle.setAttribute("fill", "#12567c");
      handle.setAttribute("data-framelogic-view-action", "DETAIL_RADIUS");
      handle.dataset["framelogicCircularRef"] = detail.id;
      handle.dataset["framelogicDetailDrag"] = "RADIUS";
      handle.style.cursor = "ew-resize";
      this.workspace.svg.append(handle);
      this.appendText(center.x + center.radius + 9, center.y - 9,
        detail.circularDetail.label, 11, "#12567c");
    }
  }

  private removeCircularDetail(detailId: string): void {
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    if (!sheet) return;
    const target = sheet.views.find((view) =>
      this.isAssemblyView(view) && view.id === detailId && Boolean(view.circularDetail));
    if (!target) return;
    const removed = new Set([detailId]);
    // A nested detail cannot outlive its parent detail.
    let changed = true;
    while (changed) {
      changed = false;
      for (const view of sheet.views) {
        if (this.isAssemblyView(view) && view.circularDetail && view.sourceViewId
          && removed.has(view.sourceViewId) && !removed.has(view.id)) {
          removed.add(view.id); changed = true;
        }
      }
    }
    sheet.views.splice(0, sheet.views.length,
      ...sheet.views.filter((view) => !removed.has(view.id)));
    if (removed.has(this.selectedAssemblyViewId ?? "")) this.selectedAssemblyViewId = null;
    this.lastTreeSignature = "";
    this.professional.recordDrawingChange?.();
    this.workspace.render();
    this.workspace.setStatus("DETALLE eliminado sin modificar la View de origen ni el modelo.");
  }

  /** Inventor/Advance Steel-style projected drawing: select the source View,
   * move outside its frame, choose a side/corner, and click to place. */
  private toggleProjectedView(): void {
    if (this.pendingProjection) {
      this.cancelProjectedView(true);
      return;
    }
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    const source = sheet?.views.find((view) => view.id === this.selectedAssemblyViewId);
    if (!sheetId || !sheet || !source || !this.isAssemblyView(source)
      || source.automaticSupplement) {
      this.workspace.setStatus("PROYECTAR: selecciona una View de pieza o ensamble (no un corte ni detalle).");
      return;
    }
    if (this.orientationChangeInProgress || this.projectionInProgress) return;
    this.workspace.setTool("SELECT");
    this.pendingProjection = {
      sheetId, sourceViewId: source.id, point: null, direction: null,
      token: ++this.projectionToken,
    };
    this.workspace.svg.style.cursor = "crosshair";
    this.updateViewOrientationPanel(sheet);
    const standard = this.professional.createProfessionalSnapshot().state.projectionStandard;
    this.workspace.setStatus("PROYECTAR VIEW · " + standard
      + ": mueve el cursor arriba/abajo/izquierda/derecha (diagonal = isométrica), "
      + "haz clic para colocar. Repite para otras vistas; Esc cancela.");
  }

  private cancelProjectedView(notify: boolean): void {
    if (!this.pendingProjection) return;
    this.pendingProjection = null;
    this.projectionToken++;
    this.workspace.svg.style.cursor = "";
    this.workspace.svg.querySelector('[data-framelogic-project-preview="true"]')?.remove();
    if (this.disposed) return;
    const sheetId = this.getActiveSheetId();
    this.updateViewOrientationPanel(sheetId ? this.production.sheets.get(sheetId) ?? null : null);
    if (notify) this.workspace.setStatus("Proyección cancelada. No se modificó el modelo.");
  }

  private readonly onProjectedViewKeyDown = (event: KeyboardEvent): void => {
    if (!this.pendingProjection || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancelProjectedView(true);
  };

  private readonly onProjectViewPointerMove = (event: PointerEvent): void => {
    const pending = this.pendingProjection;
    if (!pending || this.projectionInProgress) return;
    if (!(event.target instanceof Node) || !this.workspace.svg.contains(event.target)) return;
    const point = this.workspace.eventToSheetPoint(event);
    if (!point) return;
    const sheet = this.production.sheets.get(pending.sheetId);
    const sourceIndex = sheet?.views.findIndex((view) => view.id === pending.sourceViewId) ?? -1;
    const source = sourceIndex >= 0 ? sheet?.views[sourceIndex] : null;
    if (!source) { this.cancelProjectedView(true); return; }
    const sourceLayout = this.professional.ensureViewLayout(source.id, source.sectionId, sourceIndex);
    const direction = projectionDirectionFromPointer(sourceLayout, point);
    const changedDirection = direction !== pending.direction;
    pending.point = point;
    pending.direction = direction;
    this.drawProjectedViewPreview();
    if (changedDirection && direction) {
      this.workspace.setStatus("PROYECTAR · " + projectedViewLabel(direction,
        this.professional.createProfessionalSnapshot().state.projectionStandard)
        + " · Clic para colocar, Esc para salir.");
    }
  };

  private readonly onProjectViewPointerDown = (event: PointerEvent): void => {
    const pending = this.pendingProjection;
    if (!pending || this.projectionInProgress || event.button !== 0) return;
    if (!(event.target instanceof Node) || !this.workspace.svg.contains(event.target)) return;
    const point = this.workspace.eventToSheetPoint(event);
    if (!point) return;
    const sheet = this.production.sheets.get(pending.sheetId);
    const sourceIndex = sheet?.views.findIndex((view) => view.id === pending.sourceViewId) ?? -1;
    const source = sourceIndex >= 0 ? sheet?.views[sourceIndex] : null;
    if (!source) { this.cancelProjectedView(true); return; }
    const sourceLayout = this.professional.ensureViewLayout(source.id, source.sectionId, sourceIndex);
    const direction = projectionDirectionFromPointer(sourceLayout, point);
    // Avoid activating MOVE/RESIZE of another viewport while placing a projection.
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!direction) {
      this.workspace.setStatus("PROYECTAR: mueve el cursor fuera de la View origen para indicar una dirección.");
      return;
    }
    void this.createProjectedView(pending, point, direction);
  };

  private drawProjectedViewPreview(): void {
    this.workspace.svg.querySelector('[data-framelogic-project-preview="true"]')?.remove();
    const pending = this.pendingProjection;
    if (!pending || !pending.point || !pending.direction) return;
    const sheet = this.production.sheets.get(pending.sheetId);
    if (!sheet || this.getActiveSheetId() !== pending.sheetId) return;
    const sourceIndex = sheet.views.findIndex((view) => view.id === pending.sourceViewId);
    if (sourceIndex < 0) return;
    const source = sheet.views[sourceIndex]!;
    const layout = this.professional.ensureViewLayout(source.id, source.sectionId, sourceIndex);
    const ghostSize = { width: Math.max(100, layout.width * 0.58),
      height: Math.max(95, layout.height * 0.58) };
    const ghost = placeProjectedViewport(layout, ghostSize, pending.direction, pending.point,
      { width: SHEET_WIDTH, height: SHEET_HEIGHT });
    const group = document.createElementNS(SVG_NS, "g");
    group.dataset["framelogicProjectPreview"] = "true";
    group.style.pointerEvents = "none";
    const x = ghost?.x ?? pending.point.x - ghostSize.width / 2;
    const y = ghost?.y ?? pending.point.y - ghostSize.height / 2;
    const frame = document.createElementNS(SVG_NS, "rect");
    for (const [name, value] of Object.entries({
      x, y, width: ghostSize.width, height: ghostSize.height,
    })) frame.setAttribute(name, String(value));
    frame.setAttribute("fill", ghost ? "rgba(25,115,160,0.10)" : "rgba(172,53,41,0.12)");
    frame.setAttribute("stroke", ghost ? "#167ea5" : "#b32f25");
    frame.setAttribute("stroke-dasharray", "8 5");
    frame.setAttribute("stroke-width", "1.8");
    const caption = document.createElementNS(SVG_NS, "text");
    caption.setAttribute("x", String(x + 6));
    caption.setAttribute("y", String(y + 18));
    caption.setAttribute("font-size", "11");
    caption.setAttribute("fill", ghost ? "#12668b" : "#a42722");
    caption.textContent = projectedViewLabel(pending.direction,
      this.professional.createProfessionalSnapshot().state.projectionStandard);
    group.append(frame, caption);
    this.workspace.svg.append(group);
  }

  private projectedSourceFingerprint(
    source: AssemblySheetViewRuntime, standard: ProjectionStandard,
  ): string {
    return JSON.stringify([source.id, source.workPlane, source.instanceIds, standard]);
  }

  private projectedWorkPlane(
    source: AssemblySheetViewRuntime,
    direction: ProjectedViewDirection, standard: ProjectionStandard,
  ): CadWorkPlaneState | null {
    const basis = resolveProjectedViewBasis(source.workPlane, direction, standard);
    if (!basis) return null;
    const vector = (v: { readonly x: number; readonly y: number; readonly z: number }) =>
      new THREE.Vector3(v.x, v.y, v.z);
    return {
      mode: source.workPlane.mode, enabled: true, origin: vector(source.workPlane.origin),
      xAxis: vector(basis.xAxis), yAxis: vector(basis.yAxis), normal: vector(basis.normal),
    };
  }

  private async createProjectedView(
    pending: NonNullable<GeneralPdfController["pendingProjection"]>,
    point: THREE.Vector2, direction: ProjectedViewDirection,
  ): Promise<void> {
    if (this.projectionInProgress || this.disposed) return;
    const sheet = this.production.sheets.get(pending.sheetId);
    const sourceIndex = sheet?.views.findIndex((v) => v.id === pending.sourceViewId) ?? -1;
    const source = sourceIndex < 0 ? null : sheet?.views[sourceIndex];
    if (!sheet || !source || !this.isAssemblyView(source) || source.automaticSupplement) {
      this.cancelProjectedView(true);
      return;
    }
    const standard = this.professional.createProfessionalSnapshot().state.projectionStandard;
    const plane = this.projectedWorkPlane(source, direction, standard);
    if (!plane) {
      this.workspace.setStatus("PROYECTAR: ejes inválidos en la View origen. Selecciona una vista ortogonal.");
      return;
    }
    const initialFingerprint = this.projectedSourceFingerprint(source, standard);
    this.projectionInProgress = true;
    this.workspace.setStatus("PROYECTAR: calculando geometría STEP/HLR de la nueva vista…");
    try {
      const projection = await projectAssembly({
        instanceIds: source.instanceIds, workPlane: plane,
        designModel: this.designModel, designScene: this.designScene,
      });
      const geometry = projection ?? this.buildPlanGeometry(source.instanceIds, plane);
      if (!geometry) throw new Error("No hay geometría proyectable en esta dirección.");
      if (this.disposed || pending !== this.pendingProjection
        || this.getActiveSheetId() !== pending.sheetId
        || !sheet.views.includes(source)
        || this.projectedSourceFingerprint(source, standard) !== initialFingerprint) return;

      const parentLayout = this.professional.ensureViewLayout(source.id, source.sectionId, sourceIndex);
      const paddingX = source.automaticViewCode || source.automaticSupplement ? 90 : 20;
      const paddingY = source.automaticViewCode || source.automaticSupplement ? 100 : 34;
      const parentScale = parentLayout.scaleDenominator === null
        ? Math.min(
          Math.max(1, parentLayout.width - paddingX) / Math.max(source.width, EPSILON),
          Math.max(1, parentLayout.height - paddingY) / Math.max(source.height, EPSILON),
        ) : this.technicalScale(sheet, parentLayout.scaleDenominator);
      const size = projectedViewportSize(parentLayout, source, geometry, parentScale);
      if (!size) throw new Error("No se pudo calcular la escala de la vista.");
      const placement = placeProjectedViewport(parentLayout, size, direction, point,
        { width: SHEET_WIDTH, height: SHEET_HEIGHT });
      if (!placement) throw new Error("La proyección no cabe en esa posición. "
        + "Reorganiza la hoja o acerca el cursor a otra zona libre.");
      const usedLayouts = sheet.views.map((v, i) =>
        this.professional.ensureViewLayout(v.id, v.sectionId, i));
      if (!sheet.views.some((v) => !this.isAssemblyView(v))) {
        // The generic title block is not a View and must be treated as
        // occupied paper when validating any new projected viewport.
        usedLayouts.push({
          id: "TITLE_BLOCK", sectionId: "", kind: "ASSEMBLY",
          x: 728, y: 670, width: 360, height: 92,
          scaleDenominator: null, showHidden: false, locked: true,
        });
      }
      if (projectedViewportOverlaps(placement, usedLayouts)) {
        throw new Error("La nueva View se superpone con otra. Busca una zona libre para colocarla.");
      }

      const label = projectedViewLabel(direction, standard);
      const view = this.createAssemblyView({
        assemblyId: source.assemblyId, assemblyName: source.assemblyName,
        instanceIds: source.instanceIds, workPlane: plane,
      }, geometry);
      view.sourceViewId = source.id;
      view.projectedDirection = direction;
      view.projectedStandard = standard;
      view.projectedSourceSignature = initialFingerprint;
      view.orientationMode = "CURRENT";
      view.orientationLabel = label;
      view.renderMode = source.renderMode;
      view.automaticDimensions = direction.startsWith("ISO_") ? [] : projection?.dimensions ?? [];
      view.automaticAnchors = projection?.anchors ?? [];
      view.exactInstances = projection?.exactInstances ?? 0;
      view.fallbackInstances = projection?.fallbackInstances ?? source.instanceIds.length;
      view.assemblyOcclusionExact = projection?.assemblyOcclusionExact ?? false;
      view.automaticWarnings = projection?.warnings ?? [
        "Proyección de malla derivada: verificar aristas ocultas y dimensiones.",
      ];
      view.geometrySignature = assemblyProjectionSignature({
        instanceIds: source.instanceIds,
        designModel: this.designModel, designScene: this.designScene,
      });
      sheet.views.push(view);
      const layout = this.professional.ensureViewLayout(view.id, view.sectionId, sheet.views.length - 1);
      layout.kind = "ASSEMBLY";
      layout.title = source.assemblyName + " · " + label;
      layout.x = placement.x;
      layout.y = placement.y;
      layout.width = placement.width;
      layout.height = placement.height;
      layout.scaleDenominator = parentLayout.scaleDenominator;
      if (parentLayout.scaleDenominator === null) {
        // Preserve the parent AUTO scale even if a minimum viewport size is
        // required for selecting/dragging a very narrow end view.
        const pixelPerMmAtOneToOne = this.technicalScale(sheet, 1);
        const denominator = pixelPerMmAtOneToOne / parentScale;
        layout.scaleDenominator = denominator >= 1 ? denominator : null;
      }
      layout.showHidden = parentLayout.showHidden;
      pending.point = null;
      pending.direction = null;
      this.lastTreeSignature = "";
      this.workspace.render();
      this.workspace.setStatus("VIEW creada: " + label + " · " + standard
        + ". Vinculada a " + source.assemblyName
        + "; mueve el cursor para otra proyección o pulsa Esc para terminar.");
    } catch (error) {
      this.workspace.setStatus("PROYECTAR: " + String(error));
    } finally {
      this.projectionInProgress = false;
    }
  }

  /** Any click in a View frame also selects the corresponding toolbar target. */
  private readonly onSelectPdfView = (event: PointerEvent): void => {
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    if (!sheet) return;
    const point = this.workspace.eventToSheetPoint(event);
    if (!point) return;
    for (let index = sheet.views.length - 1; index >= 0; index--) {
      const view = sheet.views[index];
      if (!view) continue;
      const layout = this.professional.ensureViewLayout(view.id, view.sectionId, index);
      if (point.x < layout.x || point.x > layout.x + layout.width
        || point.y < layout.y || point.y > layout.y + layout.height) continue;
      if (this.selectedAssemblyViewId !== view.id) {
        this.selectedAssemblyViewId = view.id;
        this.updateViewOrientationPanel(sheet);
      }
      return;
    }
  };

  private updateViewOrientationPanel(sheet: GeneralSheetRuntime | null): void {
    const panel = this.viewOrientationPanel;
    // Render styling applies to normal, physical section and detail Views.
    // Orientation editing alone is restricted to regular assembly projections.
    const views = sheet?.views ?? [];
    if (views.length === 0) {
      panel.style.display = "none";
      return;
    }
    panel.style.display = "flex";
    const viewSelect = panel.querySelector<HTMLSelectElement>(
      '[data-framelogic-view-select="true"]')!;
    const modeSelect = panel.querySelector<HTMLSelectElement>(
      '[data-framelogic-view-orientation="true"]')!;
    const signature = views.map((view) => view.id + ":"
      + (this.isAssemblyView(view) ? view.assemblyName : view.sectionId)).join("|");
    if (viewSelect.dataset["viewSignature"] !== signature) {
      viewSelect.dataset["viewSignature"] = signature;
      viewSelect.replaceChildren();
      for (const [index, view] of views.entries()) {
        const option = document.createElement("option");
        option.value = view.id;
        option.textContent = `View ${index + 1} · ${this.isAssemblyView(view)
          ? view.assemblyName : this.findSection(view.sectionId)?.name ?? "Sección"}`;
        viewSelect.append(option);
      }
    }
    if (!views.some((view) => view.id === this.selectedAssemblyViewId)) {
      this.selectedAssemblyViewId = views[0]!.id;
    }
    viewSelect.value = this.selectedAssemblyViewId!;
    const selected = views.find((view) => view.id === this.selectedAssemblyViewId)!;
    const expected = this.isAssemblyView(selected) ? selected.orientationMode ?? "CURRENT" : "CURRENT";
    if (modeSelect.value !== expected) modeSelect.value = expected;
    viewSelect.disabled = this.orientationChangeInProgress;
    // The 3D assembly orientation choices do not apply to a section View.
    modeSelect.disabled = this.orientationChangeInProgress
      || !this.isAssemblyView(selected) || Boolean(selected.automaticSupplement)
      || Boolean(this.pendingDetail);
    if (this.detailButton) {
      this.detailButton.disabled = this.orientationChangeInProgress
        || this.projectionInProgress || Boolean(this.pendingProjection);
      this.detailButton.textContent = this.pendingDetail ? "Cancelar detalle (Esc)" : "Detalle";
      this.detailButton.style.background = this.pendingDetail ? "#775128" : "#244f65";
    }
    if (this.projectionButton) {
      this.projectionButton.disabled = !this.pendingProjection
        && (this.orientationChangeInProgress || this.projectionInProgress
          || !this.isAssemblyView(selected) || Boolean(selected.automaticSupplement));
      this.projectionButton.textContent = this.pendingProjection
        ? "Cancelar proyección (Esc)" : "Proyectar View";
      this.projectionButton.style.background = this.pendingProjection ? "#775128" : "#244f65";
    }
    viewSelect.disabled = this.orientationChangeInProgress
      || Boolean(this.pendingProjection) || Boolean(this.pendingDetail);
    const scaleEditor = panel.querySelector<HTMLDivElement>(
      '[data-framelogic-view-scale-editor="true"]',
    );
    if (scaleEditor && sheet) this.syncViewScaleEditor(scaleEditor, selected.id, sheet);
  }

  private async changeSelectedPdfViewOrientation(
    orientationMode: AssemblyViewOrientationMode,
  ): Promise<void> {
    if (this.orientationChangeInProgress) return;
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    const view = sheet?.views.find((candidate): candidate is AssemblySheetViewRuntime =>
      this.isAssemblyView(candidate) && candidate.id === this.selectedAssemblyViewId
      && !candidate.automaticSupplement);
    if (!view || !sheet) return;

    const original = restoreWorkPlane(view.originalWorkPlane ?? view.workPlane);
    let plane: CadWorkPlaneState;
    if (orientationMode === "CURRENT") {
      plane = original;
    } else {
      const basis = resolveAssemblyViewBasis(orientationMode,
        this.collectAutomaticViewOrientationPoints(view.instanceIds));
      if (!basis) {
        this.workspace.setStatus(
          "No hay un eje longitudinal fiable para esta selección. Usa una vista global "
          + "o comprueba la geometría y las instancias del ensamble.");
        this.updateViewOrientationPanel(sheet);
        return;
      }
      plane = this.createOrientedWorkPlane(original, basis);
    }

    this.orientationChangeInProgress = true;
    this.updateViewOrientationPanel(sheet);
    try {
      // Same projection path used by «Generar planos automáticamente»:
      // prefer STEP B-Rep/HLR and retain explicitly labelled mesh fallback.
      const projection = await projectAssembly({
        instanceIds: view.instanceIds, workPlane: plane,
        designModel: this.designModel, designScene: this.designScene,
      });
      const geometry = projection ?? this.buildPlanGeometry(view.instanceIds, plane);
      if (!geometry) throw new Error("No se encontró geometría 3D proyectable.");

      // Do not touch layout x/y/width/height, the original geometry, or
      // manually positioned annotations. Only the View's projection changes.
      view.workPlane = snapshotWorkPlane(plane);
      view.width = geometry.width;
      view.height = geometry.height;
      view.offsetX = geometry.offsetX;
      view.offsetY = geometry.offsetY;
      view.segments = geometry.segments;
      view.resolved = true;
      view.orientationMode = orientationMode;
      view.orientationLabel = this.orientationModeLabel(orientationMode);
      view.automaticDimensions = orientationMode.endsWith("ISO")
        ? [] : projection?.dimensions ?? [];
      view.automaticAnchors = projection?.anchors ?? [];
      view.exactInstances = projection?.exactInstances ?? 0;
      view.fallbackInstances = projection?.fallbackInstances ?? view.instanceIds.length;
      view.assemblyOcclusionExact = projection?.assemblyOcclusionExact ?? false;
      view.automaticWarnings = projection?.warnings ?? [
        "Vista de malla preliminar: líneas ocultas y cotas no verificadas.",
      ];
      view.geometrySignature = assemblyProjectionSignature({
        instanceIds: view.instanceIds,
        designModel: this.designModel, designScene: this.designScene,
      });

      // An explicitly rotated projected child becomes independent; it can
      // continue serving as a parent for projections subsequently taken from it.
      if (view.projectedDirection) {
        view.projectedDirection = undefined;
        view.projectedStandard = undefined;
        view.projectedSourceSignature = undefined;
        view.sourceViewId = undefined;
      }
      if (view.cutReferences?.length || view.detailReferences?.length) {
        view.cutReferences = [];
        view.detailReferences = [];
        // A previously generated section/detail was referred to the OLD
        // parent view. Prevent stale callouts and diagrams from surviving.
        for (const otherSheet of this.production.sheets.values()) {
          for (const candidate of otherSheet.views) {
            if (!this.isAssemblyView(candidate) || candidate.sourceViewId !== view.id
              || candidate.projectedDirection) continue;
            candidate.geometrySignature = "INVALIDATED_VIEW_ORIENTATION";
            candidate.segments = [];
            candidate.resolved = true;
            candidate.automaticWarnings = [
              "Vista principal reorientada: generar de nuevo cortes y detalles.",
            ];
          }
        }
      }
      // Reorienting the source must also regenerate all dependent projected
      // views in their own coordinate systems, preserving sheet placements.
      await this.refreshProjectedViews(true);
      this.lastTreeSignature = "";
      this.workspace.render();
      this.workspace.setStatus(
        `VIEW: ${view.orientationLabel}. Proyección actualizada sin mover las piezas; `
        + "las posiciones manuales de la hoja se conservaron.");
    } catch (error) {
      this.workspace.setStatus("No se pudo cambiar la orientación de la View: " + String(error));
    } finally {
      this.orientationChangeInProgress = false;
      const currentId = this.getActiveSheetId();
      this.updateViewOrientationPanel(currentId
        ? this.production.sheets.get(currentId) ?? null : null);
    }
  }

  private renderGeneralViews(): void {
    if (
      this.disposed
      || this.workspace.overlay.style.display === "none"
    ) {
      return;
    }

    const sheetId = this.getActiveSheetId();
    if (!sheetId) return;
    const sheet = this.production.sheets.get(sheetId);
    if (!sheet) return;

    this.refreshCircularDetails(sheet);
    const hasSectionView = this.getSectionViews(sheet).length > 0;
    if (!hasSectionView) {
      this.appendRect(
        0.5,
        0.5,
        SHEET_WIDTH - 1,
        SHEET_HEIGHT - 1,
        "none",
        "#111",
        1,
      );
    }

    sheet.views.forEach((candidate, index) => {
      if (!this.isAssemblyView(candidate)) return;
      // A supplementary cut is tied to its original STEP topology. Never
      // display stale contours after the underlying model has been edited.
      const outdated = Boolean(candidate.automaticSupplement && candidate.geometrySignature
        && candidate.geometrySignature !== assemblyProjectionSignature({
          instanceIds: candidate.instanceIds,
          designModel: this.designModel, designScene: this.designScene,
        }));
      if (outdated) {
        candidate.segments = [];
        candidate.automaticWarnings = [
          "DESACTUALIZADO: cambió el modelo. Genera nuevamente los planos automáticos.",
        ];
      } else {
        this.ensureAssemblyResolved(candidate);
      }
      const layout = this.professional.ensureViewLayout(
        candidate.id,
        candidate.sectionId,
        index,
      );
      layout.kind = candidate.circularDetail ? "DETAIL" : "ASSEMBLY";
      layout.title = candidate.circularDetail
        ? "DETALLE " + candidate.circularDetail.label
        : candidate.assemblyName
          + (candidate.orientationLabel ? " · " + candidate.orientationLabel : "");
      this.renderAssemblyView(sheet, candidate, layout, index);
    });

    this.renderCircularReferences(sheet);
    if (!hasSectionView) {
      this.renderGenericTitleBlock(sheet);
      if (!sheet.hideAutomaticBom && !sheet.bomTable) this.renderAutomaticPartIndex(sheet);
    }
    if (sheet.bomTable) this.renderInsertedBomTable(sheet);
    this.updateViewOrientationPanel(sheet);
    this.decorateViewTree();
    this.drawProjectedViewPreview();
    this.drawCircularDetailPreview();
  }

  private renderAssemblyView(
    sheet: GeneralSheetRuntime,
    view: AssemblySheetViewRuntime,
    layout: ViewLayoutRuntime,
    index: number,
  ): void {
    const automatic = Boolean(view.automaticViewCode || view.automaticSupplement);
    const padX = automatic ? 90 : 20;
    const padY = automatic ? 100 : 34;
    const innerWidth = Math.max(1, layout.width - padX);
    const innerHeight = Math.max(1, layout.height - padY);
    const scale = layout.scaleDenominator === null
      ? Math.min(
          innerWidth / Math.max(view.width, EPSILON),
          innerHeight / Math.max(view.height, EPSILON),
        )
      : this.technicalScale(sheet, layout.scaleDenominator);
    const drawnWidth = view.width * scale;
    const drawnHeight = view.height * scale;
    const originX = layout.x + (automatic ? 20 : 0) + (innerWidth - drawnWidth) / 2;
    const originY = layout.y + (automatic ? 60 : 20) + (innerHeight - drawnHeight) / 2;

    for (const [segmentIndex, segment] of view.segments.entries()) {
      // An explicitly enlarged View is cropped at its frame: one View's
      // geometry must never paint over a different View or the title block.
      const clipped = clipDrawingSegmentToView({
        x1: originX + segment.x1 * scale,
        y1: originY + drawnHeight - segment.y1 * scale,
        x2: originX + segment.x2 * scale,
        y2: originY + drawnHeight - segment.y2 * scale,
      }, {
        x: layout.x + 2, y: layout.y + 19,
        width: layout.width - 4, height: layout.height - 39,
      });
      if (!clipped) continue;
      const { x1, y1, x2, y2 } = clipped;
      if (segment.hidden) {
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", String(x1)); line.setAttribute("y1", String(y1));
        line.setAttribute("x2", String(x2)); line.setAttribute("y2", String(y2));
        line.setAttribute("stroke", "#777"); line.setAttribute("stroke-width", "0.6");
        line.setAttribute("stroke-dasharray", "4 3");
        line.style.pointerEvents = "none";
        this.workspace.svg.append(line);
      } else {
        this.appendLine(x1, y1, x2, y2);
      }
      // A View's geometry has a stable identity; dimensions and frames do not.
      const geometryLine = this.workspace.svg.lastElementChild;
      if (geometryLine instanceof SVGLineElement) {
        geometryLine.dataset["framelogicAssemblyViewLine"] = view.id;
        geometryLine.dataset["framelogicAssemblySegmentIndex"] = String(segmentIndex);
        geometryLine.dataset["framelogicAssemblyHidden"] = segment.hidden ? "true" : "false";
        geometryLine.dataset["framelogicAssemblyOriginX"] = String(originX);
        geometryLine.dataset["framelogicAssemblyOriginY"] = String(originY);
        geometryLine.dataset["framelogicAssemblyScale"] = String(scale);
        if (segment.hidden && !layout.showHidden) geometryLine.setAttribute("display", "none");
      }
    }
    if (view.circularDetail) {
      if (view.automaticWarnings?.length) {
        this.appendText(layout.x + 6, layout.y + layout.height - 23,
          view.automaticWarnings[0]!.slice(0, 76), 8, "#8a241c");
      }
      this.appendText(layout.x + 6, layout.y + 15,
        "DETALLE " + view.circularDetail.label + " — ESC "
          + formatDrawingViewScale(layout.scaleDenominator), 9, "#12567c");
    }
    if (view.automaticSupplement) {
      if (view.automaticWarnings?.length) {
        this.appendText(layout.x + 6, layout.y + layout.height - 23,
          view.automaticWarnings[0]!.slice(0, 76), 8, "#8a241c");
      }
      this.appendText(layout.x + 6, layout.y + 15,
        view.automaticSupplement === "SECTION"
          ? `CORTE ${view.automaticSectionLabel} · INTERSECCIÓN STEP (sin rayado de materiales)`
          : `DETALLE ${view.automaticSectionLabel} · AMPLIACIÓN LOCAL PRELIMINAR`,
        8, "#12567c");
    }
    if (view.cutReferences?.length || view.detailReferences?.length) {
      this.renderSectionDetailReferences(view, layout, originX, originY, drawnHeight, scale);
    }
    const showsDimensions = view.projectedDirection?.startsWith("ISO_")
      ? false : view.orientationMode
        ? !view.orientationMode.endsWith("ISO")
        : Boolean(view.automaticViewCode && view.automaticViewCode !== "ISO");
    if (showsDimensions) {
      this.renderAssemblyDimensions(view, layout, originX, originY, drawnWidth, drawnHeight, scale);
      if ((index === 0 || view.assemblyId.startsWith("piece:")) && sheet.pieceMarks) {
        this.renderAssemblyMarks(sheet, view, layout, originX, originY, drawnHeight, scale);
      }
    }

    const border = document.createElementNS(SVG_NS, "rect");
    border.setAttribute("x", String(layout.x));
    border.setAttribute("y", String(layout.y));
    border.setAttribute("width", String(layout.width));
    border.setAttribute("height", String(layout.height));
    border.setAttribute("fill", "none");
    border.setAttribute("stroke", "#7c8f99");
    border.setAttribute("stroke-width", "0.7");
    border.style.pointerEvents = "none";
    this.workspace.svg.append(border);

    const move = document.createElementNS(SVG_NS, "rect");
    move.setAttribute("x", String(layout.x));
    move.setAttribute("y", String(layout.y));
    move.setAttribute("width", String(layout.width));
    move.setAttribute("height", "18");
    move.setAttribute("fill", "rgba(30,80,110,0.06)");
    move.setAttribute("stroke", "none");
    move.setAttribute("data-framelogic-view-id", layout.id);
    move.setAttribute("data-framelogic-view-action", "MOVE");
    move.style.cursor = layout.locked ? "not-allowed" : "move";
    this.workspace.svg.append(move);

    const resize = document.createElementNS(SVG_NS, "rect");
    resize.setAttribute("x", String(layout.x + layout.width - 9));
    resize.setAttribute("y", String(layout.y + layout.height - 9));
    resize.setAttribute("width", "9");
    resize.setAttribute("height", "9");
    resize.setAttribute("fill", "#5f7f90");
    resize.setAttribute("data-framelogic-view-id", layout.id);
    resize.setAttribute("data-framelogic-view-action", "RESIZE");
    resize.style.cursor = layout.locked ? "not-allowed" : "nwse-resize";
    this.workspace.svg.append(resize);

    const scaleText = formatDrawingViewScale(layout.scaleDenominator);
    this.appendText(
      layout.x + 6,
      layout.y + layout.height - 6,
      view.circularDetail
        ? "DETALLE " + view.circularDetail.label + " — ESC " + scaleText
        : "VIEW " + (index + 1) + " · " + view.assemblyName
          + (view.orientationLabel ? " · " + view.orientationLabel : "") + " · " + scaleText,
      9,
      "#333",
    );
  }



  /**
   * Section station arrows and detail windows live in the SAME SVG as the
   * regular views, so the existing PDF exporter receives vector annotations.
   */
  private renderSectionDetailReferences(
    view: AssemblySheetViewRuntime, layout: ViewLayoutRuntime,
    originX: number, originY: number, drawnHeight: number, scale: number,
  ): void {
    const toX = (x: number) => originX + x * scale;
    const toY = (y: number) => originY + drawnHeight - y * scale;
    for (const station of view.cutReferences ?? []) {
      const x = toX(station.x), top = toY(station.yMax), bottom = toY(station.yMin);
      if (![x, top, bottom].every(Number.isFinite)) continue;
      for (let y = top; y < bottom; y += 11) this.appendDimensionLine(x, y, x, Math.min(y + 7, bottom));
      // Arrowheads point to the RIGHT of the cut trace, matching the
      // +X physical section normal in the parent orthographic projection.
      for (const y of [top, bottom]) {
        this.appendDimensionLine(x - 4, y, x + 8, y);
        this.appendDimensionLine(x + 8, y, x, y - 4);
        this.appendDimensionLine(x + 8, y, x, y + 4);
      }
      this.appendText(Math.min(x + 5, layout.x + layout.width - 100),
        Math.max(layout.y + 25, top - 10),
        `CORTE ${station.label} · ${station.targetSheet}`, 8, "#12567c");
    }
    for (const detail of view.detailReferences ?? []) {
      const x = toX(detail.window.x), y = toY(detail.window.y + detail.window.height);
      const w = detail.window.width * scale, h = detail.window.height * scale;
      if (![x, y, w, h].every(Number.isFinite) || w < 1 || h < 1) continue;
      this.appendRect(x, y, w, h, "none", "#12567c", 0.8);
      this.appendText(x + 4, Math.max(layout.y + 30, y - 3),
        `DETALLE ${detail.label} · ${detail.targetSheet}`, 8, "#12567c");
    }
  }

  private renderAssemblyDimensions(
    view: AssemblySheetViewRuntime, layout: ViewLayoutRuntime,
    originX: number, originY: number,
    drawnWidth: number, drawnHeight: number, scale: number,
  ): void {
    const dimensions = view.automaticDimensions ?? [];
    const result = layoutWorkshopDimensions(dimensions, {
      x: layout.x, y: layout.y, width: layout.width, height: layout.height,
      originX, originY, drawnWidth, drawnHeight, scale,
    }, view.dimensionOverrides);
    for (const dimension of result.placed) {
      for (const line of dimension.lines) {
        this.appendDimensionLine(line.x1, line.y1, line.x2, line.y2);
      }
      // Left-aligned text makes the SVG renderer and simple PDF export
      // agree: that exporter does not support SVG text-anchor="middle".
      const estimatedWidth = dimension.label.length * 8 * 0.59;
      const text = this.appendText(
        dimension.labelX - estimatedWidth / 2,
        dimension.labelY, dimension.label, 8, "#12567c",
      );
      text.setAttribute("data-framelogic-auto-dim-view", view.id);
      text.setAttribute("data-framelogic-auto-dim-key", dimension.key);
      text.setAttribute("aria-label", `Cota ${dimension.label} mm. Arrastra para reubicar, clic derecho para ocultar.`);
      text.style.cursor = "move";
      text.style.pointerEvents = "auto";
    }
    if (dimensions.length) {
      this.appendText(layout.x + 5, layout.y + 15,
        `COTAS STEP · mm · ${result.placed.length} visibles`, 8, "#12567c");
    }
    if (result.omitted > 0) {
      this.appendText(layout.x + 5, layout.y + layout.height - 18,
        `${result.omitted} cota(s) omitidas: falta espacio o duplicadas`, 7, "#8a241c");
    }
  }

  private appendDimensionLine(x1: number, y1: number, x2: number, y2: number): void {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x1)); line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2)); line.setAttribute("y2", String(y2));
    line.setAttribute("stroke", "#12567c"); line.setAttribute("stroke-width", "0.65");
    line.style.pointerEvents = "none";
    this.workspace.svg.append(line);
  }


  private findAutoDimensionView(viewId: string): AssemblySheetViewRuntime | null {
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    const candidate = sheet?.views.find((v) => v.id === viewId);
    return candidate && this.isAssemblyView(candidate) && candidate.automaticViewCode
      ? candidate : null;
  }

  private readonly onAutoDimensionDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.disposed) return;
    const target = event.target instanceof Element
      ? event.target.closest<SVGTextElement>("[data-framelogic-auto-dim-key]") : null;
    const viewId = target?.getAttribute("data-framelogic-auto-dim-view");
    const key = target?.getAttribute("data-framelogic-auto-dim-key");
    const start = this.workspace.eventToSheetPoint(event);
    if (!viewId || !key || !start) return;
    const view = this.findAutoDimensionView(viewId);
    if (!view) return;
    const previous = view.dimensionOverrides?.[key];
    this.dimensionDrag = {
      viewId, key, pointerId: event.pointerId, start,
      originalX: previous?.dx ?? 0, originalY: previous?.dy ?? 0,
    };
    try { this.workspace.svg.setPointerCapture(event.pointerId); } catch { /* device without capture */ }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly onAutoDimensionMove = (event: PointerEvent): void => {
    const drag = this.dimensionDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const pointer = this.workspace.eventToSheetPoint(event);
    const view = this.findAutoDimensionView(drag.viewId);
    if (!pointer || !view) return;
    view.dimensionOverrides ??= {};
    view.dimensionOverrides[drag.key] = {
      ...view.dimensionOverrides[drag.key],
      dx: Math.max(-110, Math.min(110, drag.originalX + pointer.x - drag.start.x)),
      dy: Math.max(-65, Math.min(65, drag.originalY + pointer.y - drag.start.y)),
    };
    this.workspace.render();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly onAutoDimensionUp = (event: PointerEvent): void => {
    if (this.dimensionDrag?.pointerId !== event.pointerId) return;
    this.dimensionDrag = null;
    if (this.workspace.svg.hasPointerCapture(event.pointerId))
      this.workspace.svg.releasePointerCapture(event.pointerId);
    this.workspace.setStatus("COTA STEP: posición de texto ajustada; medida geométrica intacta.");
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly onAutoDimensionContextMenu = (event: MouseEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<SVGTextElement>("[data-framelogic-auto-dim-key]") : null;
    const viewId = target?.getAttribute("data-framelogic-auto-dim-view");
    const key = target?.getAttribute("data-framelogic-auto-dim-key");
    const view = viewId ? this.findAutoDimensionView(viewId) : null;
    if (!view || !key) return;
    view.dimensionOverrides ??= {};
    view.dimensionOverrides[key] = { ...view.dimensionOverrides[key], hidden: true };
    this.workspace.render();
    this.workspace.setStatus("COTA STEP ocultada. Usa 'Restablecer cotas' para recuperarla.");
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private renderAssemblyMarks(
    sheet: GeneralSheetRuntime, view: AssemblySheetViewRuntime, layout: ViewLayoutRuntime,
    originX: number, originY: number, drawnHeight: number, scale: number,
  ): void {
    if (!sheet.pieceMarks) return;
    const seen: number[] = [];
    for (const anchor of (view.automaticAnchors ?? []).slice(0, 24)) {
      const piece = this.designModel.pieceInstances.get(anchor.instanceId);
      if (!piece) continue;
      const mark = sheet.pieceMarks[piece.definitionId];
      if (!mark) continue;
      const x = Math.max(layout.x + 8, Math.min(layout.x + layout.width - 46,
        originX + anchor.x * scale + 7));
      let y = Math.max(layout.y + 46, Math.min(layout.y + layout.height - 22,
        originY + drawnHeight - anchor.y * scale - 7));
      while (seen.some((value) => Math.abs(value - y) < 10)) y += 10;
      if (y > layout.y + layout.height - 22) continue;
      seen.push(y);
      this.appendText(x, y, mark, 9, "#8a241c");
    }
  }


  /**
   * Linked projections are regenerated from their PARENT View's current axes,
   * not from world XYZ. Geometry changes do not move the viewport, alter its
   * independent render mode or discard dimension text overrides.
   */
  private async refreshProjectedViews(force = false): Promise<void> {
    if (this.disposed || this.projectionRefreshInProgress || this.projectionInProgress) return;
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    if (!sheet || !sheet.views.some((v) =>
      this.isAssemblyView(v) && Boolean(v.projectedDirection))) return;
    this.projectionRefreshInProgress = true;
    let updated = 0;
    const checkedSources = new Set<string>();
    try {
      for (const child of sheet.views) {
        if (!this.isAssemblyView(child) || !child.projectedDirection || !child.sourceViewId) continue;
        const source = sheet.views.find((v) => v.id === child.sourceViewId);
        if (!source || !this.isAssemblyView(source) || source.automaticSupplement) {
          child.automaticWarnings = ["Proyección sin View origen: comprueba el plano."];
          continue;
        }
        const standard = child.projectedStandard ?? "ISO_E";
        const modelSignature = assemblyProjectionSignature({
          instanceIds: source.instanceIds, designModel: this.designModel,
          designScene: this.designScene,
        });
        if (!checkedSources.has(source.id)) {
          checkedSources.add(source.id);
          // A manually-created source view also needs to reflect changes in
          // its 3D model, otherwise child views update while the parent remains
          // stale on the same sheet. Automatic sources use the normal AUTO path.
          if (!source.automaticViewCode && !source.projectedDirection
            && source.geometrySignature !== modelSignature) {
            try {
              const projection = await projectAssembly({
                instanceIds: source.instanceIds, workPlane: restoreWorkPlane(source.workPlane),
                designModel: this.designModel, designScene: this.designScene,
              });
              const geometry = projection ?? this.buildPlanGeometry(
                source.instanceIds, restoreWorkPlane(source.workPlane));
              if (geometry) {
                source.width = geometry.width;
                source.height = geometry.height;
                source.offsetX = geometry.offsetX;
                source.offsetY = geometry.offsetY;
                source.segments = geometry.segments;
                source.automaticDimensions = source.orientationMode?.endsWith("ISO")
                  ? [] : projection?.dimensions ?? [];
                source.automaticAnchors = projection?.anchors ?? [];
                source.assemblyOcclusionExact = projection?.assemblyOcclusionExact ?? false;
                source.automaticWarnings = projection?.warnings ?? [
                  "Proyección de malla derivada: verificar cotas y líneas ocultas.",
                ];
                source.geometrySignature = modelSignature;
                source.resolved = true;
                updated++;
              }
            } catch (error) {
              source.automaticWarnings = ["Error actualizando View origen: " + String(error)];
            }
          }
        }
        const sourceSignature = this.projectedSourceFingerprint(source, standard);
        if (!force && child.projectedSourceSignature === sourceSignature
          && child.geometrySignature === modelSignature) continue;
        const plane = this.projectedWorkPlane(source, child.projectedDirection, standard);
        if (!plane) {
          child.automaticWarnings = ["No se puede proyectar: ejes de View origen inválidos."];
          continue;
        }
        try {
          const projection = await projectAssembly({
            instanceIds: source.instanceIds, workPlane: plane,
            designModel: this.designModel, designScene: this.designScene,
          });
          const geometry = projection ?? this.buildPlanGeometry(source.instanceIds, plane);
          if (!geometry) {
            child.automaticWarnings = ["La proyección no pudo actualizarse: falta geometría."];
            continue;
          }
          if (this.disposed || this.getActiveSheetId() !== sheetId
            || !sheet.views.includes(source) || !sheet.views.includes(child)
            || this.projectedSourceFingerprint(source, standard) !== sourceSignature) continue;
          child.instanceIds = [...source.instanceIds];
          child.workPlane = snapshotWorkPlane(plane);
          child.originalWorkPlane = snapshotWorkPlane(plane);
          child.width = geometry.width;
          child.height = geometry.height;
          child.offsetX = geometry.offsetX;
          child.offsetY = geometry.offsetY;
          child.segments = geometry.segments;
          child.resolved = true;
          child.automaticDimensions = child.projectedDirection.startsWith("ISO_")
            ? [] : projection?.dimensions ?? [];
          child.automaticAnchors = projection?.anchors ?? [];
          child.exactInstances = projection?.exactInstances ?? 0;
          child.fallbackInstances = projection?.fallbackInstances ?? child.instanceIds.length;
          child.assemblyOcclusionExact = projection?.assemblyOcclusionExact ?? false;
          child.automaticWarnings = projection?.warnings ?? [
            "Malla preliminar: comprueba aristas ocultas y medidas.",
          ];
          child.geometrySignature = modelSignature;
          child.projectedSourceSignature = sourceSignature;
          updated++;
        } catch (error) {
          child.automaticWarnings = ["Error al actualizar proyección: " + String(error)];
        }
      }
      if (updated) {
        this.lastTreeSignature = "";
        this.workspace.render();
        this.workspace.setStatus("PROYECCIONES: " + updated
          + " View(s) vinculadas actualizadas. Posiciones y estilos conservados.");
      }
    } finally {
      this.projectionRefreshInProgress = false;
    }
  }

  /** Keep a manually inserted assembly View current when it has linked details,
   * using the same STEP/HLR path as projected/automatic Views. */
  private async refreshCircularSourceProjections(): Promise<void> {
    if (this.disposed || this.circularSourceRefreshInProgress || this.orientationChangeInProgress) return;
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    if (!sheet) return;
    const sources = sheet.views.filter((source): source is AssemblySheetViewRuntime =>
      this.isAssemblyView(source) && !source.circularDetail
      && !source.automaticViewCode && !source.projectedDirection
      && sheet.views.some((detail) => this.isAssemblyView(detail)
        && Boolean(detail.circularDetail) && detail.sourceViewId === source.id));
    if (!sources.length) return;
    this.circularSourceRefreshInProgress = true;
    try {
      let updated = false;
      for (const source of sources) {
        const fingerprint = assemblyProjectionSignature({
          instanceIds: source.instanceIds,
          designModel: this.designModel, designScene: this.designScene,
        });
        if (fingerprint === source.geometrySignature) continue;
        const plane = restoreWorkPlane(source.workPlane);
        const projected = await projectAssembly({
          instanceIds: source.instanceIds, workPlane: plane,
          designModel: this.designModel, designScene: this.designScene,
        });
        const geometry = projected ?? this.buildPlanGeometry(source.instanceIds, plane);
        if (!geometry || !sheet.views.includes(source)
          || this.disposed || this.getActiveSheetId() !== sheetId) continue;
        source.width = geometry.width;
        source.height = geometry.height;
        source.offsetX = geometry.offsetX;
        source.offsetY = geometry.offsetY;
        source.segments = geometry.segments;
        source.automaticDimensions = projected?.dimensions ?? [];
        source.automaticAnchors = projected?.anchors ?? [];
        source.assemblyOcclusionExact = projected?.assemblyOcclusionExact ?? false;
        source.automaticWarnings = projected?.warnings ?? [
          "Proyección malla preliminar: comprobar aristas ocultas y cotas.",
        ];
        source.geometrySignature = fingerprint;
        source.resolved = true;
        updated = true;
      }
      if (updated) this.workspace.render();
    } finally {
      this.circularSourceRefreshInProgress = false;
    }
  }

  /** Refreshes only generated views. Manual positions, scales and annotations are untouched. */
  private async refreshAutomaticSheets(force: boolean): Promise<void> {
    if (this.disposed || this.refreshInProgress) return;
    const id = this.getActiveSheetId();
    const sheet = id ? this.production.sheets.get(id) : null;
    if (!sheet || !sheet.views.some((view) => this.isAssemblyView(view) && view.automaticViewCode)) return;
    this.refreshInProgress = true;
    let updated = 0;
    try {
      for (const candidate of sheet.views) {
        if (!this.isAssemblyView(candidate) || !candidate.automaticViewCode) continue;
        if (!candidate.assemblyId.startsWith("piece:")
          && this.designModel.assemblies.get(candidate.assemblyId)) {
          // Hierarchical membership can change independently of geometry.
          candidate.instanceIds = [...this.designModel.getAssemblyPieceIdsDeep(candidate.assemblyId)];
        }
        const signature = assemblyProjectionSignature({
          instanceIds: candidate.instanceIds, designModel: this.designModel, designScene: this.designScene,
        });
        if (!force && signature === candidate.geometrySignature) continue;
        const geometry = await projectAssembly({
          instanceIds: candidate.instanceIds, workPlane: restoreWorkPlane(candidate.workPlane),
          designModel: this.designModel, designScene: this.designScene,
        });
        if (!geometry) continue;
        candidate.width = geometry.width; candidate.height = geometry.height;
        candidate.offsetX = geometry.offsetX; candidate.offsetY = geometry.offsetY;
        candidate.segments = geometry.segments;
        candidate.automaticDimensions = candidate.automaticViewCode === "ISO" ? [] : geometry.dimensions;
        candidate.automaticAnchors = geometry.anchors;
        candidate.exactInstances = geometry.exactInstances;
        candidate.fallbackInstances = geometry.fallbackInstances;
        candidate.assemblyOcclusionExact = geometry.assemblyOcclusionExact;
        candidate.automaticWarnings = geometry.warnings;
        if (candidate.cutReferences?.length || candidate.detailReferences?.length) {
          candidate.cutReferences = [];
          candidate.detailReferences = [];
          candidate.automaticWarnings = [
            ...geometry.warnings,
            "Cortes y detalles invalidados: es necesario generar de nuevo el paquete.",
          ];
        }
        candidate.geometrySignature = signature;
        candidate.resolved = true;
        updated++;
      }
      if (updated || force) this.syncAutomaticAssemblyIndex(sheet);
      if (updated) {
        this.lastTreeSignature = "";
        this.workspace.render();
        this.workspace.setStatus(`VISTAS AUTO: ${updated} vista(s) regeneradas sin mover layouts ni cotas manuales.`);
      } else if (force) {
        this.workspace.setStatus("VISTAS AUTO: no se encontraron cambios o geometría disponible.");
      }
    } catch (error) {
      this.workspace.setStatus(`No se pudo regenerar el detallado automático: ${String(error)}`);
    } finally {
      this.refreshInProgress = false;
    }
  }

  private buildBomRows(
    instanceIds: readonly string[],
    marks: Readonly<Record<string, string>>,
  ): AssemblyBomRow[] {
    const occurrences: Array<{ definitionId: string; label: string }> = [];
    const properties: Record<string, { material?: string; grade?: string; unitMassKg?: number }> = {};
    for (const instanceId of instanceIds) {
      const piece = this.designModel.pieceInstances.get(instanceId);
      if (!piece) continue;
      occurrences.push({ definitionId: piece.definitionId, label: this.getPieceLabel(instanceId) });
      const engineering = this.engineeringModel.pieces.get(piece.definitionId);
      properties[piece.definitionId] = {
        material: engineering?.material?.name,
        grade: engineering?.material?.grade,
        unitMassKg: engineering?.physical?.massKg,
      };
    }
    return buildAssemblyBom(occurrences, marks, properties);
  }

  private syncAutomaticAssemblyIndex(sheet: GeneralSheetRuntime): void {
    const root = sheet.views.find((candidate): candidate is AssemblySheetViewRuntime =>
      this.isAssemblyView(candidate) && Boolean(candidate.automaticViewCode)
      && !candidate.assemblyId.startsWith("piece:"));
    if (!root) return;
    const marks = sheet.pieceMarks ?? {};
    let nextMark = 1 + Math.max(0, ...Object.values(marks)
      .map((value) => /^P(\d+)$/.exec(value)?.[1])
      .map((value) => Number(value ?? 0)));
    for (const instanceId of root.instanceIds) {
      const piece = this.designModel.pieceInstances.get(instanceId);
      if (piece && !marks[piece.definitionId]) marks[piece.definitionId] = `P${nextMark++}`;
    }
    sheet.pieceMarks = marks;
    const rows = this.buildBomRows(root.instanceIds, marks);
    const pages = [...this.production.sheets.values()].filter((page) =>
      page.bomAssemblyId === root.assemblyId);
    const required = rows.length > 8 ? Math.ceil(rows.length / 40) : 0;
    for (let i = 0; i < Math.max(required, pages.length); i++) {
      let page = pages[i];
      if (!page && i < required) {
        page = this.createEmptySheet(crypto.randomUUID(),
          `Listado de piezas · ${root.assemblyName} · ${i + 1}`);
        page.bomAssemblyId = root.assemblyId;
        page.titleBlock.drawingNumber = `B-${root.assemblyId.slice(0, 8)}-${i + 1}`;
        this.production.sheets.set(page.id!, page);
      }
      if (page) page.bomEntries = i < required
        ? rows.slice(i * 40, (i + 1) * 40) : [];
    }
  }

  /** Read a model-driven BOM, scoped to the selected assembly or an exact View.
   * A synthetic one-piece/selection assembly is never promoted to the whole project.
   */
  private getSheetBomRows(sheet: GeneralSheetRuntime): SheetBomResult | null {
    const selection = sheet.bomTable;
    if (!selection) return null;
    const source = (selection.sourceViewId
      ? [...this.production.sheets.values()].flatMap((page) => page.views)
        .find((view) => view.id === selection.sourceViewId && this.isAssemblyView(view))
      : undefined);
    const root = this.designModel.assemblies.get(selection.rootAssemblyId);
    const isModelSummary = selection.rootAssemblyId === "model:all";
    const assemblies: SheetBomAssembly[] = root
      ? this.designModel.assemblies.getAll().map((assembly) => ({
          id: assembly.id, name: assembly.name,
          parentAssemblyId: assembly.parentAssemblyId,
          pieceInstanceIds: assembly.pieceInstanceIds,
        }))
      : isModelSummary
        ? [{ id: "model:all", name: "Piezas del modelo",
          pieceInstanceIds: this.designModel.pieceInstances.getAll().map((p) => p.id) }]
        : source && this.isAssemblyView(source) && source.assemblyId === selection.rootAssemblyId
          ? [{
              id: selection.rootAssemblyId, name: source.assemblyName,
              pieceInstanceIds: source.instanceIds,
            }] : [];
    if (!assemblies.length) {
      return { rows: [], totalPieces: 0, missingPieces: [], rootFound: false };
    }
    let partIds: readonly string[] = [];
    try {
      partIds = root
        ? this.designModel.getAssemblyPieceIdsDeep(root.id)
        : isModelSummary
          ? this.designModel.pieceInstances.getAll().map((p) => p.id)
          : source && this.isAssemblyView(source) ? source.instanceIds : [];
    } catch {
      // A malformed legacy cycle must never take down Paper Space / PDF.
      return { rows: [], totalPieces: 0, missingPieces: [], rootFound: false };
    }
    const parts: Record<string, SheetBomPiece> = {};
    const marks = { ...(sheet.pieceMarks ?? {}) };
    for (const instanceId of partIds) {
      const part = this.designModel.pieceInstances.get(instanceId);
      if (!part) continue;
      const definition = this.designModel.pieceDefinitions.get(part.definitionId);
      const engineering = this.engineeringModel.pieces.get(part.definitionId);
      const label = definition?.name?.trim()
        || definition?.code?.trim()
        || part.name?.trim()
        || "Pieza sin nombre";
      // Preserve actual definition codes where no manual/automatic shop mark is assigned.
      if (!marks[part.definitionId] && definition?.code?.trim()) {
        marks[part.definitionId] = definition.code.trim();
      }
      parts[part.id] = {
        id: part.id, definitionId: part.definitionId, label,
        material: engineering?.material?.name, grade: engineering?.material?.grade,
        unitMassKg: engineering?.physical?.massKg,
      };
    }
    try {
      return buildSheetAssemblyBom(
        selection.rootAssemblyId, assemblies, parts, marks, selection.mode);
    } catch {
      return { rows: [], totalPieces: 0, missingPieces: [], rootFound: false };
    }
  }

  private renderInsertedBomTable(sheet: GeneralSheetRuntime): void {
    const table = sheet.bomTable;
    if (!table) return;
    const result = this.getSheetBomRows(sheet);
    const { x, y, width, height } = table;
    if (![x, y, width, height].every(Number.isFinite)
      || width < 320 || height < 110) return;
    const root = this.designModel.assemblies.get(table.rootAssemblyId);
    const source = [...this.production.sheets.values()].flatMap((page) => page.views)
      .find((view) => view.id === table.sourceViewId && this.isAssemblyView(view));
    const title = root?.name
      ?? (source && this.isAssemblyView(source) ? source.assemblyName : undefined)
      ?? (table.rootAssemblyId === "model:all" ? "Piezas del modelo" : undefined)
      ?? sheet.titleBlock.drawingTitle;
    const drawLine = (x1: number, y1: number, x2: number, y2: number): void => {
      this.appendLine(x1, y1, x2, y2);
      const element = this.workspace.svg.lastElementChild;
      if (element instanceof SVGElement) element.dataset["framelogicBomLine"] = "true";
    };
    const drawText = (tx: number, ty: number, text: string,
      size = 8, color = "#222"): void => {
      const element = this.appendText(tx, ty, text, size, color);
      element.dataset["framelogicBomText"] = "true";
    };
    this.appendRect(x, y, width, height, "#ffffff", "#1a252d", 0.95);
    drawText(x + 9, y + 15,
      `BOM · ${String(title ?? "ENSAMBLE").slice(0, 48)} · ${table.mode === "FLAT" ? "PIEZAS" : "JERÁRQUICA"}`,
      10, "#111");
    if (result) drawText(x + width - 140, y + 15,
      `${result.totalPieces} piezas`, 8, "#333");
    drawLine(x, y + 23, x + width, y + 23);
    const c = [0.02, 0.10, 0.23, 0.65, 0.73, 0.90].map((v) => x + v * width);
    drawText(c[0]!, y + 35, "ÍTEM", 8, "#111");
    drawText(c[1]!, y + 35, "MARCA", 8, "#111");
    drawText(c[2]!, y + 35, "DESCRIPCIÓN / SUBENSAMBLE", 8, "#111");
    drawText(c[3]!, y + 35, "CANT.", 8, "#111");
    drawText(c[4]!, y + 35, "MATERIAL", 8, "#111");
    drawText(c[5]!, y + 35, "MASA kg", 8, "#111");
    drawLine(x, y + 40, x + width, y + 40);
    const lineHeight = 12.5;
    const available = Math.max(0, Math.floor((height - 60) / lineHeight));
    const rows = result?.rows ?? [];
    const pageStart = Math.max(0, Math.trunc(table.pageStart ?? 0));
    const pageRows = rows.slice(pageStart);
    for (let i = 0; i < Math.min(available, pageRows.length); i++) {
      const item = pageRows[i]!;
      const baseline = y + 53 + i * lineHeight;
      if (baseline > y + height - 10) break;
      const indent = "  ".repeat(Math.min(4, item.depth));
      const label = item.kind === "ASSEMBLY"
        ? `${indent}[E] ${item.label}` : `${indent}${item.label}`;
      const material = [item.material, item.grade].filter(Boolean).join(" ");
      drawText(c[0]!, baseline, String(pageStart + i + 1), 7.8);
      drawText(c[1]!, baseline, item.mark.slice(0, 10), 7.8);
      drawText(c[2]!, baseline, label.slice(0, Math.max(10, Math.floor(width * 0.40 / 4.7))), 7.8);
      drawText(c[3]!, baseline, String(item.quantity), 7.8);
      drawText(c[4]!, baseline, (material || "Sin dato").slice(0, 18), 7.5);
      drawText(c[5]!, baseline,
        item.totalMassKg === undefined ? "—" : item.totalMassKg.toFixed(2), 7.8);
      drawLine(x + 5, baseline + 3.5, x + width - 5, baseline + 3.5);
    }
    drawLine(x, y + height - 14, x + width, y + height - 14);
    const missing = result?.missingPieces.length ?? 0;
    const extra = Math.max(0, rows.length - (pageStart + available));
    const foot = !result?.rootFound
      ? "BOM sin origen válido: selecciona otro ensamble en VIEWS"
      : table.pageCount && table.pageCount > 1
        ? `HOJA BOM ${table.pageIndex ?? 1}/${table.pageCount} · ${Math.min(available, pageRows.length)} filas · ${result.totalPieces} piezas`
        : extra > 0
          ? `MOSTRANDO ${Math.min(available, pageRows.length)}/${rows.length} filas · ${extra} sin espacio. Amplía o crea hojas BOM.`
          : missing > 0
            ? `AVISO: faltan ${missing} instancias de pieza en el modelo.`
            : "Valores de material y masa: solo datos declarados en ingeniería.";
    drawText(x + 8, y + height - 4, foot.slice(0, 105), 7, extra || missing ? "#942b1f" : "#666");
    const move = document.createElementNS(SVG_NS, "rect");
    move.setAttribute("x", String(x));
    move.setAttribute("y", String(y));
    move.setAttribute("width", String(width));
    move.setAttribute("height", "21");
    move.setAttribute("fill", "transparent");
    move.setAttribute("stroke", "none");
    move.setAttribute("data-framelogic-bom-action", "MOVE");
    move.setAttribute("data-framelogic-view-action", "BOM_MOVE");
    move.style.cursor = "move";
    this.workspace.svg.append(move);
    const resize = document.createElementNS(SVG_NS, "rect");
    resize.setAttribute("x", String(x + width - 11));
    resize.setAttribute("y", String(y + height - 11));
    resize.setAttribute("width", "11");
    resize.setAttribute("height", "11");
    resize.setAttribute("fill", "#66869b");
    resize.setAttribute("stroke", "none");
    resize.setAttribute("data-framelogic-bom-action", "RESIZE");
    resize.setAttribute("data-framelogic-view-action", "BOM_RESIZE");
    resize.style.cursor = "nwse-resize";
    this.workspace.svg.append(resize);
  }

  /** Compact marks/quantities summary, not a certified material takeoff. */
  private renderAutomaticPartIndex(sheet: GeneralSheetRuntime): void {
    if (sheet.bomEntries?.length) {
      this.appendText(54, 90, "LISTADO DE PIEZAS · CANTIDADES SEGÚN MODELO (NO CERTIFICADAS)", 12, "#111");
      for (const [i, item] of sheet.bomEntries.entries()) {
        const col = Math.floor(i / 20);
        const row = i % 20;
        const x = 54 + col * 518;
        const y = 116 + row * 24;
        this.appendText(x, y, renderAssemblyBomRow(item, 25), 8.5, "#222");
      }
      this.appendText(54, 594,
        "Material y masa: solo si constan en los datos de ingeniería. Verificar antes de fabricar.",
        8.5, "#8a241c");
      return;
    }
    const view = sheet.views.find((candidate): candidate is AssemblySheetViewRuntime =>
      this.isAssemblyView(candidate) && Boolean(candidate.automaticViewCode));
    if (!view || !sheet.pieceMarks) return;
    const rows = this.buildBomRows(view.instanceIds, sheet.pieceMarks);
    if (!rows.length) return;
    this.appendText(54, 633, "MARCAS, MATERIALES Y CANTIDADES · SEGÚN MODELO", 10, "#111");
    rows.slice(0, 8).forEach((item, index) => {
      this.appendText(54, 651 + index * 13,
        renderAssemblyBomRow(item, 31), 8.5, "#222");
    });
    if (rows.length > 8) {
      this.appendText(54, 760, `+ ${rows.length - 8} marcas adicionales (ver hoja de BOM)`, 8, "#444");
    }
    this.appendText(54, 779,
      view.assemblyOcclusionExact
        ? "PRELIMINAR: HLR conjunto STEP; cortes orientativos; requiere validación de taller."
        : view.fallbackInstances
          ? `PRELIMINAR: ${view.fallbackInstances} pieza(s) en malla; HLR entre piezas NO exacto.`
          : "PRELIMINAR: HLR por pieza STEP; sin ocultación entre piezas; comprobar cotas.", 8, "#8a241c");
  }

  private renderGenericTitleBlock(sheet: GeneralSheetRuntime): void {
    const x = 728;
    const y = 670;
    const width = 360;
    const height = 92;
    const revision = sheet.revisions.at(-1)?.code ?? "0";
    const viewScales = new Set(sheet.views.map((view, index) =>
      formatDrawingViewScale(this.professional.ensureViewLayout(
        view.id, view.sectionId, index).scaleDenominator)));
    const scale = viewScales.size > 1
      || sheet.views.some((v) => this.isAssemblyView(v) && v.automaticSupplement)
      ? "VARIAS"
      : viewScales.values().next().value
        ?? formatDrawingViewScale(sheet.scaleDenominator);
    this.appendRect(x, y, width, height, "white", "#111", 0.9);
    this.appendLine(x, y + 28, x + width, y + 28);
    this.appendLine(x + 238, y, x + 238, y + height);
    this.appendText(
      x + 7,
      y + 17,
      sheet.titleBlock.project || "FRAMELOGIC",
      11,
      "#111",
    );
    this.appendText(
      x + 7,
      y + 45,
      sheet.titleBlock.drawingTitle || sheet.name || "HOJA PDF",
      9,
      "#111",
    );
    this.appendText(
      x + 7,
      y + 63,
      `PLANO ${sheet.titleBlock.drawingNumber || "P-001"}`,
      8,
      "#333",
    );
    this.appendText(x + 246, y + 17, `ESC ${scale}`, 8, "#111");
    this.appendText(
      x + 246,
      y + 36,
      `${sheet.size} · ${sheet.orientation === "LANDSCAPE" ? "H" : "V"}`,
      8,
      "#111",
    );
    this.appendText(x + 246, y + 55, `REV ${revision}`, 8, "#111");
  }

  private ensureAssemblyResolved(view: AssemblySheetViewRuntime): void {
    // Circular crops contain only source-clipped vectors; NEVER fall back to
    // a full uncropped assembly when an empty circle is moved.
    if (view.circularDetail) return;
    if (
      view.resolved
      && view.segments.length > 0
      && view.width > 0
      && view.height > 0
    ) {
      return;
    }
    const geometry = this.buildPlanGeometry(
      view.instanceIds,
      restoreWorkPlane(view.workPlane),
    );
    if (!geometry) {
      view.width = 1;
      view.height = 1;
      view.segments = [];
      view.resolved = true;
      return;
    }
    view.width = geometry.width;
    view.height = geometry.height;
    view.offsetX = geometry.offsetX;
    view.offsetY = geometry.offsetY;
    view.segments = geometry.segments;
    view.resolved = true;
  }

  private buildPlanGeometry(
    instanceIds: readonly string[],
    state: CadWorkPlaneState,
  ): PlanGeometry | null {
    const ids = new Set(instanceIds);
    const worldToPlane = new THREE.Matrix4()
      .makeBasis(
        state.xAxis.clone().normalize(),
        state.yAxis.clone().normalize(),
        state.normal.clone().normalize(),
      );
    worldToPlane.setPosition(state.origin);
    worldToPlane.invert();

    const raw: PlanSegment[] = [];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const [instanceId, object] of this.designScene.getInstanceEntries()) {
      if (!ids.has(instanceId)) continue;
      object.updateWorldMatrix(true, true);
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const edges = new THREE.EdgesGeometry(child.geometry, 28);
        const position = edges.getAttribute("position");
        for (let index = 0; index + 1 < position.count; index += 2) {
          const a = new THREE.Vector3()
            .fromBufferAttribute(position, index)
            .applyMatrix4(child.matrixWorld)
            .applyMatrix4(worldToPlane);
          const b = new THREE.Vector3()
            .fromBufferAttribute(position, index + 1)
            .applyMatrix4(child.matrixWorld)
            .applyMatrix4(worldToPlane);
          if (a.distanceToSquared(b) <= EPSILON) continue;
          raw.push({
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
          });
          minX = Math.min(minX, a.x, b.x);
          minY = Math.min(minY, a.y, b.y);
          maxX = Math.max(maxX, a.x, b.x);
          maxY = Math.max(maxY, a.y, b.y);
        }
        edges.dispose();
      });
    }

    if (
      raw.length < 1
      || !Number.isFinite(minX)
      || !Number.isFinite(minY)
    ) {
      return null;
    }

    const sourceWidth = Math.max(maxX - minX, 0.001);
    const sourceHeight = Math.max(maxY - minY, 0.001);
    const padding = Math.max(sourceWidth, sourceHeight) * 0.04;
    const width = sourceWidth + padding * 2;
    const height = sourceHeight + padding * 2;
    const offsetX = minX - padding;
    const offsetY = minY - padding;

    return {
      width,
      height,
      segments: raw.map((segment) => ({
        x1: segment.x1 - offsetX,
        y1: segment.y1 - offsetY,
        x2: segment.x2 - offsetX,
        y2: segment.y2 - offsetY,
      })),
      offsetX,
      offsetY,
    };
  }

  private technicalScale(
    sheet: GeneralSheetRuntime,
    denominator: number,
  ): number {
    const [rawWidth, rawHeight] = SHEET_MM[sheet.size];
    const paperWidth = sheet.orientation === "LANDSCAPE"
      ? rawWidth
      : rawHeight;
    const paperHeight = sheet.orientation === "LANDSCAPE"
      ? rawHeight
      : rawWidth;
    // The PDF exporter maps the full 1120×792 SVG canvas to the
    // actual paper size. Margins affect placement, not physical scale.
    const pxPerMm = Math.max(
      SHEET_WIDTH / paperWidth,
      SHEET_HEIGHT / paperHeight,
    );
    return modelToPaperScale(denominator, pxPerMm) ?? 0;
  }

  private decorateViewTree(): void {
    if (this.workspace.overlay.style.display === "none") return;
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId
      ? this.production.sheets.get(sheetId)
      : undefined;
    const tree = this.ensureViewTreePanel();
    this.syncSheetBomToolbar(sheet ?? null);
    const regenerate = tree.parentElement?.querySelector<HTMLButtonElement>(
      '[data-framelogic-regenerate-assembly="true"]');
    if (regenerate) {
      regenerate.style.display = sheet?.views.some((view) =>
        this.isAssemblyView(view) && Boolean(view.automaticViewCode)) ? "block" : "none";
    }
    const reset = tree.parentElement?.querySelector<HTMLButtonElement>(
      '[data-framelogic-reset-auto-dimensions="true"]');
    if (reset) {
      reset.style.display = sheet?.views.some((view) =>
        this.isAssemblyView(view) && Object.keys(view.dimensionOverrides ?? {}).length > 0)
        ? "block" : "none";
    }

    const pieces = this.designModel.pieceInstances.getAll();
    const signature = sheet
      ? [
          sheetId,
          this.sheetName(sheetId ?? "", sheet),
          sheet.bomTable
            ? `BOM:${sheet.bomTable.rootAssemblyId}:${sheet.bomTable.mode}` : "NO_BOM",
          ...sheet.views.map((view, index) =>
            this.isAssemblyView(view)
              ? `${index}:${view.id}:A:${view.assemblyId}:${view.instanceIds.join(",")}:${view.orientationLabel ?? ""}:${view.projectedDirection ?? ""}:${view.sourceViewId ?? ""}:${view.circularDetail?.label ?? ""}:${this.professional.ensureViewLayout(view.id, view.sectionId, index).scaleDenominator ?? "AUTO"}`
              : `${index}:${view.id}:S:${view.sectionId}:${pieces.map((piece) => piece.id).join(",")}:${this.professional.ensureViewLayout(view.id, view.sectionId, index).scaleDenominator ?? "AUTO"}`,
          ),
        ].join("|")
      : "NO_ACTIVE_SHEET";
    if (signature === this.lastTreeSignature) return;
    this.lastTreeSignature = signature;
    const previouslyOpen = new Map(
      Array.from(tree.querySelectorAll<HTMLDetailsElement>(
        'details[data-framelogic-view-row]',
      )).map((details) => [details.dataset["framelogicViewRow"], details.open]),
    );
    const previousScroll = tree.scrollTop;
    tree.replaceChildren();

    if (!sheet) {
      tree.append(this.createEmptyRow("Sin hoja PDF activa"));
      return;
    }

    if (sheet.views.length < 1) {
      tree.append(this.createEmptyRow("La hoja no contiene Views"));
      return;
    }

    const rowById = new Map<string, HTMLDetailsElement>();
    sheet.views.forEach((view, index) => {
      if (this.isAssemblyView(view)) {
        const parentIndex = view.projectedDirection
          ? sheet.views.findIndex((candidate) => candidate.id === view.sourceViewId) : -1;
        const block = this.createViewDetails(
          `${view.circularDetail ? "DETALLE " + view.circularDetail.label : "View " + (index + 1)} · ${view.assemblyName}${view.orientationLabel
            ? " · " + view.orientationLabel : ""} · ${formatDrawingViewScale(
              this.professional.ensureViewLayout(view.id, view.sectionId, index).scaleDenominator)}`,
          view.circularDetail
            ? "DETALLE CIRCULAR · Origen: " + (view.sourceViewId ?? "?")
            : view.projectedDirection
            ? `PROYECCIÓN · origen View ${parentIndex >= 0 ? parentIndex + 1 : "?"} · ${view.projectedStandard ?? "ISO E"} · ${view.instanceIds.length} piezas`
            : `ENSAMBLE/PIEZA · ${view.instanceIds.length} instancia${view.instanceIds.length === 1 ? "" : "s"}`,
        );
        for (const instanceId of view.instanceIds) {
          block.content.append(this.createInstanceRow(instanceId));
        }
        if (view.instanceIds.length < 1) {
          block.content.append(this.createEmptyRow("Sin instancias"));
        }
        const editor = this.createViewScaleEditor(view.id);
        block.content.prepend(editor);
        this.syncViewScaleEditor(editor, view.id, sheet);
        block.details.dataset["framelogicViewRow"] = view.id;
        block.details.open = previouslyOpen.get(view.id) ?? true;
        this.bindTreeViewSelection(block.details, view.id, sheet);
        tree.append(block.details);
        rowById.set(view.id, block.details);
        if (view.circularDetail) {
          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.textContent = "Eliminar detalle";
          deleteButton.style.cssText = "margin:5px 8px 7px 26px;color:white;background:#643a3a;border:1px solid #926b6b;border-radius:4px;padding:4px;";
          deleteButton.addEventListener("click", (event) => {
            event.stopPropagation();
            this.removeCircularDetail(view.id);
          });
          block.content.append(deleteButton);
        }
        return;
      }

      const section = this.findSection(view.sectionId);
      const block = this.createViewDetails(
        `View ${index + 1} · ${section?.name ?? "Sección"} · ${formatDrawingViewScale(
          this.professional.ensureViewLayout(view.id, view.sectionId, index).scaleDenominator)}`,
        `SECCIÓN · ${pieces.length} instancias`,
      );
      for (const piece of pieces) {
        block.content.append(this.createInstanceRow(piece.id));
      }
      if (pieces.length < 1) {
        block.content.append(this.createEmptyRow("Sin instancias en el modelo"));
      }
      const editor = this.createViewScaleEditor(view.id);
      block.content.prepend(editor);
      this.syncViewScaleEditor(editor, view.id, sheet);
      block.details.dataset["framelogicViewRow"] = view.id;
      block.details.open = previouslyOpen.get(view.id) ?? true;
      this.bindTreeViewSelection(block.details, view.id, sheet);
      tree.append(block.details);
      rowById.set(view.id, block.details);
    });
    // Use actual nested HTML details, not just a visually indented flat label.
    for (const view of sheet.views) {
      if (!this.isAssemblyView(view) || !view.circularDetail || !view.sourceViewId) continue;
      const childRow = rowById.get(view.id);
      const parentRow = rowById.get(view.sourceViewId);
      if (childRow && parentRow && validDetailAncestry(view.sourceViewId, view.id, sheet.views)) {
        childRow.style.marginLeft = "13px";
        parentRow.querySelector<HTMLDivElement>(":scope > div")?.append(childRow);
      }
    }
    tree.scrollTop = previousScroll;
  }

  private bindTreeViewSelection(
    details: HTMLDetailsElement,
    viewId: string,
    sheet: GeneralSheetRuntime,
  ): void {
    // Selecting VIEWS tree rows updates the shared orientation/render toolbar.
    details.querySelector("summary")?.addEventListener("click", () => {
      this.selectedAssemblyViewId = viewId;
      this.updateViewOrientationPanel(sheet);
      const viewSelect = this.viewOrientationPanel.querySelector<HTMLSelectElement>(
        '[data-framelogic-view-select="true"]',
      );
      viewSelect?.dispatchEvent(new Event("change"));
    });
  }

  private sheetBomSourceOptions(sheet: GeneralSheetRuntime): Array<{
    readonly value: string; readonly rootAssemblyId: string;
    readonly sourceViewId: string; readonly label: string;
  }> {
    const result: Array<{
      value: string; rootAssemblyId: string; sourceViewId: string; label: string;
    }> = [];
    const seen = new Set<string>();
    const seenRootViews = new Set<string>();
    const push = (sourceViewId: string, rootAssemblyId: string, label: string): void => {
      const value = sourceViewId + "|" + rootAssemblyId;
      if (seen.has(value)) return;
      seen.add(value);
      result.push({ value, rootAssemblyId, sourceViewId, label });
    };
    for (const [index, view] of sheet.views.entries()) {
      if (!this.isAssemblyView(view) || view.automaticSupplement) continue;
      // Repeated orthographic/projected Views of one assembly represent the same
      // physical BOM scope. Show it once instead of a 4x duplicated menu.
      if (seenRootViews.has(view.assemblyId)) continue;
      seenRootViews.add(view.assemblyId);
      const root = this.designModel.assemblies.get(view.assemblyId);
      if (root) {
        push(view.id, root.id, `View ${index + 1} · ${root.name}`);
        try {
          for (const id of this.designModel.getAssemblyDescendantIds(root.id)) {
            const child = this.designModel.assemblies.get(id);
            if (child) push(view.id, child.id, `  ↳ ${child.name}`);
          }
        } catch {
          // Keep the root selectable; invalid legacy hierarchy requires repair.
        }
      } else if (view.instanceIds.length) {
        push(view.id, view.assemblyId, `View ${index + 1} · ${view.assemblyName}`);
      }
    }
    // On pure section/blank PDF sheets, the user can explicitly select a
    // project assembly as the BOM source. No automatic global inclusion.
    if (!result.length) {
      for (const assembly of this.designModel.assemblies.getAll()) {
        push("", assembly.id, `Ensamble · ${assembly.name}`);
      }
      if (!result.length && this.designModel.pieceInstances.getAll().length) {
        push("", "model:all", "Piezas del modelo (sin ensamble)");
      }
    }
    return result;
  }

  private syncSheetBomToolbar(sheet: GeneralSheetRuntime | null): void {
    const controls = this.workspace.overlay.querySelector<HTMLDivElement>(
      '[data-framelogic-sheet-bom-controls="true"]');
    if (!controls) return;
    controls.style.display = sheet ? "flex" : "none";
    if (!sheet) return;
    const sourceSelect = controls.querySelector<HTMLSelectElement>(
      '[data-framelogic-bom-source="true"]')!;
    const modeSelect = controls.querySelector<HTMLSelectElement>(
      '[data-framelogic-bom-mode="true"]')!;
    const insert = controls.querySelector<HTMLButtonElement>(
      '[data-framelogic-insert-bom="true"]')!;
    const remove = controls.querySelector<HTMLButtonElement>(
      '[data-framelogic-remove-bom="true"]')!;
    const sources = this.sheetBomSourceOptions(sheet);
    const signature = sources.map((v) => v.value + ":" + v.label).join(";");
    if (sourceSelect.dataset["bomSources"] !== signature) {
      const previous = sourceSelect.value;
      sourceSelect.dataset["bomSources"] = signature;
      sourceSelect.replaceChildren();
      for (const entry of sources) {
        const option = document.createElement("option");
        option.value = entry.value;
        option.textContent = entry.label;
        sourceSelect.append(option);
      }
      if (sources.some((v) => v.value === previous)) sourceSelect.value = previous;
    }
    const sheetKey = this.getActiveSheetId() ?? "";
    if (controls.dataset["framelogicBomSheet"] !== sheetKey) {
      controls.dataset["framelogicBomSheet"] = sheetKey;
      if (sheet.bomTable) {
        const current = sheet.bomTable.sourceViewId + "|" + sheet.bomTable.rootAssemblyId;
        if (sources.some((v) => v.value === current)) sourceSelect.value = current;
        modeSelect.value = sheet.bomTable.mode;
      } else {
        modeSelect.value = "HIERARCHY";
      }
    }
    insert.disabled = sources.length === 0;
    insert.textContent = sheet.bomTable ? "Actualizar BOM" : "Insertar BOM";
    const auto = !sheet.hideAutomaticBom
      && (Boolean(sheet.bomEntries?.length) || sheet.views.some((view) =>
        this.isAssemblyView(view) && Boolean(view.automaticViewCode)));
    remove.disabled = !sheet.bomTable && !auto;
    sourceSelect.disabled = sources.length === 0;
  }

  private insertOrUpdateSheetBom(): void {
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    if (!sheet) return;
    const controls = this.workspace.overlay.querySelector<HTMLDivElement>(
      '[data-framelogic-sheet-bom-controls="true"]');
    if (!controls) return;
    const selected = controls.querySelector<HTMLSelectElement>(
      '[data-framelogic-bom-source="true"]')!.value;
    const source = this.sheetBomSourceOptions(sheet).find((v) => v.value === selected);
    if (!source) {
      this.workspace.setStatus("BOM: selecciona un ensamble o una View que contenga piezas.");
      return;
    }
    const mode = controls.querySelector<HTMLSelectElement>(
      '[data-framelogic-bom-mode="true"]')!.value === "FLAT" ? "FLAT" : "HIERARCHY";
    const previous = sheet.bomTable;
    sheet.bomTable = {
      rootAssemblyId: source.rootAssemblyId,
      sourceViewId: source.sourceViewId,
      mode,
      x: previous?.x ?? 0, y: previous?.y ?? 0,
      width: previous?.width ?? 648, height: previous?.height ?? 152,
    };
    const result = this.getSheetBomRows(sheet);
    if (!result?.rootFound) {
      sheet.bomTable = previous;
      this.workspace.setStatus("BOM: el origen ya no existe. No se insertó ninguna tabla.");
      return;
    }
    if (!previous) {
      const placement = chooseSheetBomPlacement(
        this.sheetBomObstacles(sheet), result.rows.length);
      if (!placement) {
        sheet.bomTable = undefined;
        this.workspace.setStatus("BOM: no hay espacio libre en esta hoja. "
          + "Mueve o redimensiona las Views antes de insertar la tabla.");
        return;
      }
      Object.assign(sheet.bomTable, placement);
    }
    sheet.hideAutomaticBom = false;
    this.lastTreeSignature = "";
    this.workspace.render();
    this.workspace.setStatus(
      `BOM ${previous ? "actualizada" : "insertada"} solo en este PDF · `
      + `${result.totalPieces} piezas · ${result.rows.length} filas. `
      + "Puedes arrastrar la cabecera de la tabla, ampliarla desde su esquina o quitarla con «Eliminar BOM».",
    );
  }

  /** A crowded assembly drawing cannot hold a 40-row material list.
   * Create full BOM PDF sheets with every row, without silently truncating it.
   * The normal inline BOM on the source sheet remains independently removable.
   */
  private createFullSheetBomPages(): void {
    const sourceSheetId = this.getActiveSheetId();
    const sourceSheet = sourceSheetId ? this.production.sheets.get(sourceSheetId) : null;
    if (!sourceSheetId || !sourceSheet) return;
    const controls = this.workspace.overlay.querySelector<HTMLDivElement>(
      '[data-framelogic-sheet-bom-controls="true"]');
    const value = controls?.querySelector<HTMLSelectElement>(
      '[data-framelogic-bom-source="true"]')?.value;
    const chosen = this.sheetBomSourceOptions(sourceSheet).find((s) => s.value === value);
    if (!chosen) {
      this.workspace.setStatus("BOM COMPLETA: selecciona el ensamble de origen.");
      return;
    }
    const mode: SheetBomMode = controls?.querySelector<HTMLSelectElement>(
      '[data-framelogic-bom-mode="true"]')?.value === "FLAT" ? "FLAT" : "HIERARCHY";
    const previous = sourceSheet.bomTable;
    sourceSheet.bomTable = {
      rootAssemblyId: chosen.rootAssemblyId, sourceViewId: chosen.sourceViewId,
      mode, x: 55, y: 52, width: 1020, height: 565,
    };
    let rows: SheetBomResult | null = null;
    try { rows = this.getSheetBomRows(sourceSheet); }
    finally { sourceSheet.bomTable = previous; }
    if (!rows?.rootFound || !rows.rows.length) {
      this.workspace.setStatus("BOM COMPLETA: el ensamble no contiene piezas o su origen no es válido.");
      return;
    }
    const existing = [...this.production.sheets.entries()].find(([, page]) =>
      page.bomTable?.generatedFromSheetId === sourceSheetId
      && page.bomTable.rootAssemblyId === chosen.rootAssemblyId
      && page.bomTable.mode === mode);
    if (existing) {
      this.openSheet(existing[0]);
      this.workspace.setStatus("Ya existen hojas BOM completas para este origen. "
        + "Ábrelas desde la lista de PDFs; ninguna hoja se duplicó.");
      return;
    }
    const pages = planSheetBomPages(rows.rows.length);
    const created: string[] = [];
    const name = this.designModel.assemblies.get(chosen.rootAssemblyId)?.name
      ?? sourceSheet.titleBlock.drawingTitle
      ?? "Ensamble";
    for (const page of pages) {
      const id = crypto.randomUUID();
      const sheet = this.createEmptySheet(id,
        `BOM completa · ${name} · ${page.index}/${page.totalPages}`);
      sheet.titleBlock.drawingTitle = "BOM · " + name;
      sheet.titleBlock.drawingNumber = `B-${chosen.rootAssemblyId.slice(0, 8)}-${page.index}`;
      sheet.bomTable = {
        rootAssemblyId: chosen.rootAssemblyId,
        sourceViewId: chosen.sourceViewId,
        mode, x: 55, y: 52, width: 1020, height: 565,
        pageStart: page.start,
        pageIndex: page.index,
        pageCount: page.totalPages,
        generatedFromSheetId: sourceSheetId,
      };
      sheet.hideAutomaticBom = true;
      sheet.pieceMarks = { ...(sourceSheet.pieceMarks ?? {}) };
      this.production.sheets.set(id, sheet);
      created.push(id);
    }
    this.lastTreeSignature = "";
    if (created[0]) this.openSheet(created[0]);
    this.workspace.setStatus(
      `BOM COMPLETA: ${rows.rows.length} filas en ${pages.length} hoja(s) PDF, `
      + "sin omitir entradas. Puedes eliminar la tabla de cualquier hoja de forma independiente.",
    );
  }

  private removeSheetBom(): void {
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    if (!sheet || (!sheet.bomTable && sheet.hideAutomaticBom)) return;
    delete sheet.bomTable;
    sheet.hideAutomaticBom = true;
    this.lastTreeSignature = "";
    this.workspace.render();
    this.workspace.setStatus("BOM eliminada únicamente de este PDF. "
      + "No se borraron piezas, ensambles, cotas ni otras hojas.");
  }

  private sheetBomObstacles(sheet: GeneralSheetRuntime): SheetBomRect[] {
    const occupied = sheet.views.map((view, index) => {
      const layout = this.professional.ensureViewLayout(view.id, view.sectionId, index);
      return { x: layout.x, y: layout.y, width: layout.width, height: layout.height };
    });
    // The title block exists on both assembly and SECTION sheets.
    occupied.push({ x: 728, y: 650, width: 360, height: 112 });
    return occupied;
  }

  private readonly onSheetBomPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element
      ? event.target.closest<SVGElement>("[data-framelogic-bom-action]") : null;
    if (!target) return;
    const sheetId = this.getActiveSheetId();
    const sheet = sheetId ? this.production.sheets.get(sheetId) : null;
    const table = sheet?.bomTable;
    const point = this.workspace.eventToSheetPoint(event);
    if (!sheetId || !table || !point) return;
    this.activeBomDrag = {
      sheetId, pointerId: event.pointerId,
      action: target.dataset["framelogicBomAction"] === "RESIZE" ? "RESIZE" : "MOVE",
      startX: point.x, startY: point.y,
      originalX: table.x, originalY: table.y,
      originalWidth: table.width, originalHeight: table.height,
    };
    try { this.workspace.svg.setPointerCapture(event.pointerId); } catch { /* no capture */ }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly onSheetBomPointerMove = (event: PointerEvent): void => {
    const drag = this.activeBomDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const sheet = this.production.sheets.get(drag.sheetId);
    if (!sheet || this.getActiveSheetId() !== drag.sheetId || !sheet.bomTable) {
      this.activeBomDrag = null;
      return;
    }
    const point = this.workspace.eventToSheetPoint(event);
    if (!point) return;
    const dx = point.x - drag.startX, dy = point.y - drag.startY;
    const current = sheet.bomTable;
    const proposal = drag.action === "MOVE"
      ? { x: Math.min(1110 - current.width, Math.max(10, drag.originalX + dx)),
          y: Math.min(782 - current.height, Math.max(10, drag.originalY + dy)),
          width: current.width, height: current.height }
      : { x: current.x, y: current.y,
          width: Math.min(1100 - current.x, Math.max(400, drag.originalWidth + dx)),
          height: Math.min(772 - current.y, Math.max(118, drag.originalHeight + dy)) };
    if (this.sheetBomObstacles(sheet).some((item) =>
      sheetBomOverlaps(proposal, item))) return;
    Object.assign(current, proposal);
    this.workspace.render();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly onSheetBomPointerUp = (event: PointerEvent): void => {
    if (!this.activeBomDrag || this.activeBomDrag.pointerId !== event.pointerId) return;
    this.activeBomDrag = null;
    try { this.workspace.svg.releasePointerCapture(event.pointerId); } catch { /* no capture */ }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private ensureViewTreePanel(): HTMLDivElement {
    let panel = this.workspace.overlay.querySelector<HTMLDivElement>(
      'div[data-framelogic-pdf-view-tree="GENERAL"]',
    );
    if (!panel) {
      panel = document.createElement("div");
      panel.dataset["framelogicPdfViewTree"] = "GENERAL";
      Object.assign(panel.style, {
        position: "absolute",
        left: "10px",
        top: "54px",
        bottom: "36px",
        width: "270px",
        zIndex: "80",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: "5px",
        background: "rgba(17,25,31,0.97)",
        color: "#dce8ed",
        boxShadow: "0 8px 24px rgba(0,0,0,0.30)",
        font: "11px system-ui, sans-serif",
      });
      const header = document.createElement("div");
      header.textContent = "VIEWS";
      Object.assign(header.style, {
        padding: "8px 9px",
        flex: "0 0 auto",
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.035)",
        color: "#eef7fb",
        fontWeight: "700",
        letterSpacing: "0.04em",
      });
      const content = document.createElement("div");
      content.dataset["framelogicPdfViewTreeContent"] = "true";
      Object.assign(content.style, {
        flex: "1 1 auto",
        minHeight: "0",
        overflow: "auto",
        padding: "4px 0 8px",
      });
      const regenerate = document.createElement("button");
      regenerate.type = "button";
      regenerate.textContent = "Regenerar planos automáticos";
      regenerate.dataset["framelogicRegenerateAssembly"] = "true";
      regenerate.style.cssText = "display:none;margin:6px;padding:6px;background:#29495a;color:#fff;border:1px solid #567483;border-radius:4px;cursor:pointer;font:11px system-ui;";
      regenerate.addEventListener("click", () => { void this.refreshAutomaticSheets(true); });
      const resetDimensions = document.createElement("button");
      resetDimensions.type = "button";
      resetDimensions.textContent = "Restablecer cotas";
      resetDimensions.dataset["framelogicResetAutoDimensions"] = "true";
      resetDimensions.style.cssText = regenerate.style.cssText;
      resetDimensions.addEventListener("click", () => {
        const sheetId = this.getActiveSheetId();
        const sheet = sheetId ? this.production.sheets.get(sheetId) : undefined;
        if (!sheet) return;
        for (const candidate of sheet.views) {
          if (this.isAssemblyView(candidate)) candidate.dimensionOverrides = {};
        }
        this.lastTreeSignature = "";
        this.workspace.render();
        this.workspace.setStatus("COTAS STEP: posiciones restablecidas y etiquetas ocultas recuperadas.");
      });
      const bomControls = document.createElement("div");
      bomControls.dataset["framelogicSheetBomControls"] = "true";
      bomControls.style.cssText = "display:flex;flex-direction:column;gap:6px;padding:8px;"
        + "border-top:1px solid #365361;border-bottom:1px solid #365361;";
      const bomTitle = document.createElement("span");
      bomTitle.textContent = "BOM POR HOJA PDF";
      bomTitle.style.cssText = "color:#eaf2f7;font-size:10px;font-weight:bold;";
      const bomSource = document.createElement("select");
      bomSource.dataset["framelogicBomSource"] = "true";
      bomSource.title = "Ensamble o subensamble para la lista de materiales de esta hoja";
      const bomMode = document.createElement("select");
      bomMode.dataset["framelogicBomMode"] = "true";
      bomMode.title = "Mostrar jerarquía de ensambles o agrupar solo piezas";
      for (const [value, title] of [["HIERARCHY", "Con subensambles"],
        ["FLAT", "Solo piezas agrupadas"]] as const) {
        const option = document.createElement("option");
        option.value = value; option.textContent = title;
        bomMode.append(option);
      }
      for (const select of [bomSource, bomMode]) {
        select.style.cssText = "min-width:0;width:100%;background:#223641;color:#eef6fa;"
          + "border:1px solid #547183;border-radius:3px;padding:4px;font:11px system-ui;";
      }
      const actions = document.createElement("div");
      actions.style.cssText = "display:flex;gap:5px;";
      const insert = document.createElement("button");
      insert.type = "button";
      insert.textContent = "Insertar BOM";
      insert.dataset["framelogicInsertBom"] = "true";
      insert.style.cssText = "flex:1;background:#255a69;color:white;border:1px solid #6e9ab0;"
        + "border-radius:4px;padding:5px;cursor:pointer;font:11px system-ui;";
      insert.addEventListener("click", () => this.insertOrUpdateSheetBom());
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Eliminar BOM";
      remove.dataset["framelogicRemoveBom"] = "true";
      remove.style.cssText = "flex:1;background:#4b3034;color:white;border:1px solid #925c60;"
        + "border-radius:4px;padding:5px;cursor:pointer;font:11px system-ui;";
      remove.addEventListener("click", () => this.removeSheetBom());
      actions.append(insert, remove);
      const pages = document.createElement("button");
      pages.type = "button";
      pages.textContent = "Crear hojas BOM completas";
      pages.dataset["framelogicFullBomPages"] = "true";
      pages.title = "Genera PDFs adicionales con todas las filas si no caben en la tabla insertada";
      pages.style.cssText = "padding:5px;background:#2c4655;color:#eaf6fa;"
        + "border:1px solid #607e8d;border-radius:4px;cursor:pointer;font:11px system-ui;";
      pages.addEventListener("click", () => this.createFullSheetBomPages());
      bomControls.append(bomTitle, bomSource, bomMode, actions, pages);
      panel.append(header, regenerate, resetDimensions, bomControls, content);
      this.workspace.overlay.append(panel);
    }

    const content = panel.querySelector<HTMLDivElement>(
      'div[data-framelogic-pdf-view-tree-content="true"]',
    );
    if (!content) {
      throw new Error("FrameLogic PDF VIEWS tree content is missing.");
    }
    return content;
  }

  private createViewDetails(
    label: string,
    metaText: string,
  ): {
    readonly details: HTMLDetailsElement;
    readonly content: HTMLDivElement;
  } {
    const details = document.createElement("details");
    details.open = true;
    details.style.borderBottom = "1px solid rgba(255,255,255,0.055)";
    const summary = document.createElement("summary");
    Object.assign(summary.style, {
      padding: "7px 8px",
      cursor: "pointer",
      userSelect: "none",
      color: "#dce8ed",
    });
    const labelRow = document.createElement("div");
    labelRow.textContent = `▱ ${label}`;
    Object.assign(labelRow.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      fontWeight: "600",
    });
    const meta = document.createElement("div");
    meta.textContent = metaText;
    Object.assign(meta.style, {
      marginTop: "2px",
      color: "#7f949e",
      fontSize: "9px",
      letterSpacing: "0.025em",
    });
    summary.append(labelRow, meta);
    const content = document.createElement("div");
    content.style.paddingBottom = "4px";
    details.append(summary, content);
    return { details, content };
  }

  private createInstanceRow(instanceId: string): HTMLDivElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      minHeight: "24px",
      padding: "2px 8px 2px 26px",
      color: "#c8d5db",
      display: "flex",
      alignItems: "center",
    });
    const text = document.createElement("span");
    text.textContent = `◇ ${this.getPieceLabel(instanceId)}`;
    text.title = this.getPieceLabel(instanceId);
    Object.assign(text.style, {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    row.append(text);
    return row;
  }

  private createEmptyRow(text: string): HTMLDivElement {
    const row = document.createElement("div");
    row.textContent = text;
    Object.assign(row.style, {
      padding: "7px 10px 7px 27px",
      color: "#71838c",
      fontStyle: "italic",
    });
    return row;
  }

  private getPieceLabel(instanceId: string): string {
    const piece = this.designModel.pieceInstances.get(instanceId);
    if (!piece) return `Instancia ${instanceId.slice(0, 8)}`;
    const definition = this.designModel.pieceDefinitions.get(piece.definitionId);
    const name =
      piece.name?.trim()
      || definition?.name?.trim()
      || definition?.code?.trim()
      || `Instancia ${piece.id.slice(0, 8)}`;
    const code = definition?.code?.trim();
    return code && code !== name ? `${name} · ${code}` : name;
  }

  private normalizeModelSpacePdfRows(): void {
    const content = this.container.querySelector<HTMLElement>(
      'details[data-framelogic-pdf-tree="true"] [data-framelogic-tree-content="true"]',
    );
    if (!content) return;
    for (const row of Array.from(content.children)) {
      if (!(row instanceof HTMLDivElement)) continue;
      const spans = Array.from(row.children).filter(
        (child): child is HTMLSpanElement => child instanceof HTMLSpanElement,
      );
      const type = spans.at(-1);
      if (!type) continue;
      if (type.textContent === "SECCIÓN" || type.textContent === "ENSAMBLE") {
        type.textContent = "PDF";
      }
    }
  }

  private getSectionViews(
    sheet: GeneralSheetRuntime,
  ): SectionSheetViewRuntime[] {
    return sheet.views.filter(
      (view): view is SectionSheetViewRuntime => !this.isAssemblyView(view),
    );
  }

  private isAssemblyView(
    view: GeneralSheetViewRuntime,
  ): view is AssemblySheetViewRuntime {
    return view.kind === "ASSEMBLY";
  }

  private findSection(sectionId: string): SectionViewDefinition | null {
    return this.sectionDrawing.getSections().find(
      (section) => section.id === sectionId,
    ) ?? null;
  }

  private sheetName(
    sheetId: string,
    sheet: GeneralSheetRuntime,
  ): string {
    const section = this.findSection(sheetId);
    return sheet.name?.trim()
      || sheet.titleBlock.drawingTitle?.trim()
      || section?.name
      || "Hoja PDF";
  }

  private appendLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): void {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("stroke", "#181818");
    line.setAttribute("stroke-width", "0.65");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    line.style.pointerEvents = "none";
    this.workspace.svg.append(line);
  }

  private appendRect(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string,
    strokeWidth: number,
  ): void {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("fill", fill);
    rect.setAttribute("stroke", stroke);
    rect.setAttribute("stroke-width", String(strokeWidth));
    rect.setAttribute("vector-effect", "non-scaling-stroke");
    rect.style.pointerEvents = "none";
    this.workspace.svg.append(rect);
  }

  private appendText(
    x: number,
    y: number,
    text: string,
    size: number,
    fill: string,
  ): SVGTextElement {
    const element = document.createElementNS(SVG_NS, "text");
    element.setAttribute("x", String(x));
    element.setAttribute("y", String(y));
    element.setAttribute("font-size", String(size));
    element.setAttribute("fill", fill);
    element.textContent = text;
    element.style.pointerEvents = "none";
    this.workspace.svg.append(element);
    return element;
  }
}


function snapshotWorkPlane(
  state: CadWorkPlaneState,
): WorkPlaneSnapshot {
  return {
    mode: state.mode,
    enabled: state.enabled,
    origin: vectorSnapshot(state.origin),
    xAxis: vectorSnapshot(state.xAxis),
    yAxis: vectorSnapshot(state.yAxis),
    normal: vectorSnapshot(state.normal),
  };
}

function restoreWorkPlane(
  snapshot: WorkPlaneSnapshot,
): CadWorkPlaneState {
  return {
    mode: snapshot.mode,
    enabled: snapshot.enabled,
    origin: new THREE.Vector3(
      snapshot.origin.x,
      snapshot.origin.y,
      snapshot.origin.z,
    ),
    xAxis: new THREE.Vector3(
      snapshot.xAxis.x,
      snapshot.xAxis.y,
      snapshot.xAxis.z,
    ),
    yAxis: new THREE.Vector3(
      snapshot.yAxis.x,
      snapshot.yAxis.y,
      snapshot.yAxis.z,
    ),
    normal: new THREE.Vector3(
      snapshot.normal.x,
      snapshot.normal.y,
      snapshot.normal.z,
    ),
  };
}

function vectorSnapshot(vector: THREE.Vector3): VectorSnapshot {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  };
}
