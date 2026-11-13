import * as THREE from "three";
import { planSmartAssemblyViews, type AutomaticViewCode } from "./AutoDrawingPlanner";
import { planSelectedSheetLayout, selectAssemblyScaleDenominator } from "./AutoSheetLayoutPlanner";
import { assemblyProjectionSignature, projectAssembly, type AssemblyLine, type AssemblyMarkAnchor } from "./AssemblyProjectionEngine";
import type { EngineeringDimensionInstruction } from "./EngineeringAutoDimensionPlanner";
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
  readonly workPlane: WorkPlaneSnapshot;
  width: number;
  height: number;
  segments: readonly PlanSegment[];
  resolved: boolean;
  /** Present only on views created by the automatic assembly drawing command. */
  automaticViewCode?: AutomaticViewCode;
  /** Persisted exact B-Rep dimension plans; manual annotations live separately. */
  automaticDimensions?: readonly EngineeringDimensionInstruction[];
  dimensionOverrides?: Record<string, WorkshopDimensionOverride>;
  automaticAnchors?: readonly AssemblyMarkAnchor[];
  exactInstances?: number;
  fallbackInstances?: number;
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

    this.workspace.svg.addEventListener("pointerdown", this.onAutoDimensionDown, true);
    this.workspace.svg.addEventListener("pointermove", this.onAutoDimensionMove, true);
    this.workspace.svg.addEventListener("pointerup", this.onAutoDimensionUp, true);
    this.workspace.svg.addEventListener("pointercancel", this.onAutoDimensionUp, true);
    this.workspace.svg.addEventListener("contextmenu", this.onAutoDimensionContextMenu, true);
    this.syncSectionSheets();
    this.timer = window.setInterval(() => {
      this.syncSectionSheets();
      this.decorateViewTree();
      this.normalizeModelSpacePdfRows();
      // Check source geometry occasionally, not during every render or pointer movement.
      if (Date.now() - this.lastAutomaticRefresh > 2800) {
        this.lastAutomaticRefresh = Date.now();
        void this.refreshAutomaticSheets(false);
      }
    }, 240);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
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
      view.geometrySignature = assemblyProjectionSignature({
        instanceIds: request.instanceIds, designModel: this.designModel, designScene: this.designScene,
      });
      sheet.views.push(view);
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
        `DETALLADO AUTO: ${planned.length} vistas; ${detailCount} planos de pieza; escala 1:${scaleDenominator}. `
        + `STEP HLR por pieza donde esté disponible; ${unique.size > 20 ? unique.size - 20 + " piezas sin plano individual por límite de 20. " : ""}`
        + "Cotas B-Rep en las vistas ortogonales. Revisar antes de fabricar.",
      );
    }
    return opened;
  }

  sendAssembly(request: GeneralPdfRequest): boolean {
    if (this.disposed) return false;
    if (!request.workPlane.enabled) {
      window.alert(
        "Activa un WorkPlane antes de enviar el ensamble a PDF. La vista se orienta con los ejes X/Y de ese plano.",
      );
      return false;
    }
    if (request.instanceIds.length < 1) {
      window.alert("El ensamble no contiene piezas.");
      return false;
    }

    const geometry = this.buildPlanGeometry(
      request.instanceIds,
      request.workPlane,
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
      request,
      geometry,
    );
    sheet.views.push(view);
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
      width: geometry.width,
      height: geometry.height,
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
      this.ensureAssemblyResolved(candidate);
      const layout = this.professional.ensureViewLayout(
        candidate.id,
        candidate.sectionId,
        index,
      );
      layout.kind = "ASSEMBLY";
      layout.title = candidate.assemblyName;
      this.renderAssemblyView(sheet, candidate, layout, index);
    });

    if (!hasSectionView) {
      this.renderGenericTitleBlock(sheet);
      this.renderAutomaticPartIndex(sheet);
    }
    this.decorateViewTree();
  }

  private renderAssemblyView(
    sheet: GeneralSheetRuntime,
    view: AssemblySheetViewRuntime,
    layout: ViewLayoutRuntime,
    index: number,
  ): void {
    const automatic = Boolean(view.automaticViewCode);
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

    for (const segment of view.segments) {
      if (segment.hidden && !layout.showHidden) continue;
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
    }
    if (automatic && view.automaticViewCode !== "ISO") {
      this.renderAssemblyDimensions(view, layout, originX, originY, drawnWidth, drawnHeight, scale);
      if (index === 0 || view.assemblyId.startsWith("piece:")) {
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
      `VIEW ${index + 1} · ${view.assemblyName} · ${scaleText}`,
      9,
      "#333",
    );
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
        candidate.segments = geometry.segments;
        candidate.automaticDimensions = candidate.automaticViewCode === "ISO" ? [] : geometry.dimensions;
        candidate.automaticAnchors = geometry.anchors;
        candidate.exactInstances = geometry.exactInstances;
        candidate.fallbackInstances = geometry.fallbackInstances;
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
      view.fallbackInstances
        ? `PRELIMINAR: ${view.fallbackInstances} pieza(s) en malla; HLR solo por pieza B-Rep; comprobar cotas.`
        : "PRELIMINAR: HLR por pieza STEP; sin ocultación entre piezas; comprobar cotas.", 8, "#8a241c");
  }

  private renderGenericTitleBlock(sheet: GeneralSheetRuntime): void {
    const x = 728;
    const y = 670;
    const width = 360;
    const height = 92;
    const revision = sheet.revisions.at(-1)?.code ?? "0";
    const scale = sheet.scaleDenominator === null
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
    return (1000 / Math.max(denominator, 1)) * pxPerMm;
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
              ? `${index}:${view.id}:A:${view.assemblyId}:${view.instanceIds.join(",")}`
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
        const block = this.createViewDetails(
          `View ${index + 1} · ${view.assemblyName}`,
          `ENSAMBLE · ${view.instanceIds.length} instancia${view.instanceIds.length === 1 ? "" : "s"}`,
        );
        for (const instanceId of view.instanceIds) {
          block.content.append(this.createInstanceRow(instanceId));
        }
        if (view.instanceIds.length < 1) {
          block.content.append(this.createEmptyRow("Sin instancias"));
        }
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
      tree.append(block.details);
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
