import * as THREE from "three";
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

interface PlanSegment extends AssemblyLine {}

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
  id?: string;
  name?: string;
  readonly views: GeneralSheetViewRuntime[];
}

interface ProductionRuntime {
  readonly sheets: Map<string, GeneralSheetRuntime>;
  getActiveSheet(): GeneralSheetRuntime | null;
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
    this.workspace.svg.addEventListener("pointerdown", this.onSelectPdfView, true);
    this.workspace.overlay.addEventListener("pointermove", this.onProjectViewPointerMove, true);
    this.workspace.overlay.addEventListener("pointerdown", this.onProjectViewPointerDown, true);
    window.addEventListener("keydown", this.onProjectedViewKeyDown, true);
    this.workspace.svg.addEventListener("pointerdown", this.onAutoDimensionDown, true);
    this.workspace.svg.addEventListener("pointermove", this.onAutoDimensionMove, true);
    this.workspace.svg.addEventListener("pointerup", this.onAutoDimensionUp, true);
    this.workspace.svg.addEventListener("pointercancel", this.onAutoDimensionUp, true);
    this.workspace.svg.addEventListener("contextmenu", this.onAutoDimensionContextMenu, true);
    this.syncSectionSheets();
    this.timer = window.setInterval(() => {
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
      }
    }, 240);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.workspace.svg.removeEventListener("pointerdown", this.onSelectPdfView, true);
    this.workspace.overlay.removeEventListener("pointermove", this.onProjectViewPointerMove, true);
    this.workspace.overlay.removeEventListener("pointerdown", this.onProjectViewPointerDown, true);
    window.removeEventListener("keydown", this.onProjectedViewKeyDown, true);
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
      this.workspace.render();
      this.lastTreeSignature = "";
      return true;
    }

    this.openSheetWithoutSection(sheetId, sheet);
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
    const scale = this.createViewScaleEditor();
    panel.append(label, viewSelect, modeSelect, project, scale);
    this.workspace.overlay.append(panel);
    return panel;
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
      || !this.isAssemblyView(selected) || Boolean(selected.automaticSupplement);
    if (this.projectionButton) {
      this.projectionButton.disabled = !this.pendingProjection
        && (this.orientationChangeInProgress || this.projectionInProgress
          || !this.isAssemblyView(selected) || Boolean(selected.automaticSupplement));
      this.projectionButton.textContent = this.pendingProjection
        ? "Cancelar proyección (Esc)" : "Proyectar View";
      this.projectionButton.style.background = this.pendingProjection ? "#775128" : "#244f65";
    }
    viewSelect.disabled = this.orientationChangeInProgress || Boolean(this.pendingProjection);
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
      layout.kind = "ASSEMBLY";
      layout.title = candidate.assemblyName
        + (candidate.orientationLabel ? ` · ${candidate.orientationLabel}` : "");
      this.renderAssemblyView(sheet, candidate, layout, index);
    });

    if (!hasSectionView) {
      this.renderGenericTitleBlock(sheet);
      this.renderAutomaticPartIndex(sheet);
    }
    this.updateViewOrientationPanel(sheet);
    this.decorateViewTree();
    this.drawProjectedViewPreview();
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
      const x1 = originX + segment.x1 * scale;
      const y1 = originY + drawnHeight - segment.y1 * scale;
      const x2 = originX + segment.x2 * scale;
      const y2 = originY + drawnHeight - segment.y2 * scale;
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

    const scaleText = layout.scaleDenominator === null
      ? "AUTO"
      : `1:${layout.scaleDenominator}`;
    this.appendText(
      layout.x + 6,
      layout.y + layout.height - 6,
      `VIEW ${index + 1} · ${view.assemblyName}${view.orientationLabel ? " · " + view.orientationLabel : ""} · ${scaleText}`,
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
    const scale = sheet.views.some((v) => this.isAssemblyView(v) && v.automaticSupplement)
      ? "VARIAS"
      : sheet.scaleDenominator === null
      ? "AUTO"
      : `1:${sheet.scaleDenominator}`;
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
    const pxPerMm = Math.min(
      (SHEET_WIDTH - 84) / paperWidth,
      (SHEET_HEIGHT - 84) / paperHeight,
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
          ...sheet.views.map((view, index) =>
            this.isAssemblyView(view)
              ? `${index}:${view.id}:A:${view.assemblyId}:${view.instanceIds.join(",")}:${view.orientationLabel ?? ""}:${view.projectedDirection ?? ""}:${view.sourceViewId ?? ""}`
              : `${index}:${view.id}:S:${view.sectionId}:${pieces.map((piece) => piece.id).join(",")}`,
          ),
        ].join("|")
      : "NO_ACTIVE_SHEET";
    if (signature === this.lastTreeSignature) return;
    this.lastTreeSignature = signature;
    tree.replaceChildren();

    if (!sheet) {
      tree.append(this.createEmptyRow("Sin hoja PDF activa"));
      return;
    }

    if (sheet.views.length < 1) {
      tree.append(this.createEmptyRow("La hoja no contiene Views"));
      return;
    }

    sheet.views.forEach((view, index) => {
      if (this.isAssemblyView(view)) {
        const parentIndex = view.projectedDirection
          ? sheet.views.findIndex((candidate) => candidate.id === view.sourceViewId) : -1;
        const block = this.createViewDetails(
          `View ${index + 1} · ${view.assemblyName}${view.orientationLabel
            ? " · " + view.orientationLabel : ""}`,
          view.projectedDirection
            ? `PROYECCIÓN · origen View ${parentIndex >= 0 ? parentIndex + 1 : "?"} · ${view.projectedStandard ?? "ISO E"} · ${view.instanceIds.length} piezas`
            : `ENSAMBLE/PIEZA · ${view.instanceIds.length} instancia${view.instanceIds.length === 1 ? "" : "s"}`,
        );
        for (const instanceId of view.instanceIds) {
          block.content.append(this.createInstanceRow(instanceId));
        }
        if (view.instanceIds.length < 1) {
          block.content.append(this.createEmptyRow("Sin instancias"));
        }
        this.bindTreeViewSelection(block.details, view.id, sheet);
        tree.append(block.details);
        return;
      }

      const section = this.findSection(view.sectionId);
      const block = this.createViewDetails(
        `View ${index + 1} · ${section?.name ?? "Sección"}`,
        `SECCIÓN · ${pieces.length} instancias`,
      );
      for (const piece of pieces) {
        block.content.append(this.createInstanceRow(piece.id));
      }
      if (pieces.length < 1) {
        block.content.append(this.createEmptyRow("Sin instancias en el modelo"));
      }
      this.bindTreeViewSelection(block.details, view.id, sheet);
      tree.append(block.details);
    });
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
      panel.append(header, regenerate, resetDimensions, content);
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
