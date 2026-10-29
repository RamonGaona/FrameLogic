import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadWorkPlaneState,
} from "../interaction/CadWorkPlaneController";

import type {
  AssemblyPdfController,
  AssemblyPdfRequest,
} from "./AssemblyPdfController";

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
} from "./SectionDrawingController";

import type {
  UnifiedPdfNavigationController,
} from "./UnifiedPdfNavigationController";


interface PlanSegmentRuntime {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

interface PlanGeometryRuntime {
  readonly width: number;
  readonly height: number;
  readonly segments: readonly PlanSegmentRuntime[];
}

interface AssemblyViewRuntime {
  readonly id: string;
  readonly assemblyId: string;
  readonly assemblyName: string;
  readonly instanceIds: readonly string[];
  readonly workPlane: CadWorkPlaneState;
  width: number;
  height: number;
  segments: readonly PlanSegmentRuntime[];
  resolved: boolean;
}

interface AssemblySheetRuntime {
  readonly id: string;
  name: string;
  readonly views: AssemblyViewRuntime[];
}

interface AssemblyPdfRuntime {
  sendAssembly(request: AssemblyPdfRequest): boolean;
  readonly sheets: AssemblySheetRuntime[];
  activeSheetId: string | null;
  readonly overlay: HTMLDivElement;
  buildPlanGeometry(
    instanceIds: readonly string[],
    state: CadWorkPlaneState,
  ): PlanGeometryRuntime | null;
  refreshSheetSelect(): void;
  render(): void;
}

interface UnifiedPdfEntryRuntime {
  readonly key: string;
  readonly kind: "SECTION" | "SHEET";
  readonly targetId: string;
  readonly label: string;
}

interface UnifiedNavigationRuntime {
  order: string[];
  getEntries(): UnifiedPdfEntryRuntime[];
  syncOrder(entries: readonly UnifiedPdfEntryRuntime[]): void;
  openKey(key: string): boolean;
}

interface MixedAssemblySheetViewRuntime {
  readonly id: string;
  readonly sectionId: string;
  readonly kind: "ASSEMBLY";
  readonly assemblyId: string;
  readonly assemblyName: string;
  readonly instanceIds: readonly string[];
  readonly workPlane: {
    readonly mode: string;
    readonly enabled: boolean;
    readonly origin: { readonly x: number; readonly y: number; readonly z: number };
    readonly xAxis: { readonly x: number; readonly y: number; readonly z: number };
    readonly yAxis: { readonly x: number; readonly y: number; readonly z: number };
    readonly normal: { readonly x: number; readonly y: number; readonly z: number };
  };
  readonly width: number;
  readonly height: number;
  readonly segments: readonly PlanSegmentRuntime[];
  readonly resolved: true;
}

interface SectionSheetRuntime extends Omit<SheetState, "views"> {
  readonly views: Array<
    | { readonly id: string; readonly sectionId: string; readonly kind?: "SECTION" }
    | MixedAssemblySheetViewRuntime
  >;
}

interface ProductionRuntime {
  readonly sheets: Map<string, SectionSheetRuntime>;
  getActiveSheet(): SectionSheetRuntime | null;
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
  readonly state: {
    readonly viewLayouts: ViewLayoutRuntime[];
  };
  ensureViewLayout(
    viewId: string,
    sectionId: string,
    index: number,
  ): ViewLayoutRuntime;
}

interface WorkspaceRuntime {
  activeSectionId: string | null;
  readonly overlay: HTMLDivElement;
  readonly svg: SVGSVGElement;
  render(): void;
}

export interface UnifiedPdfMixedViewsControllerOptions {
  readonly designModel: DesignModel;
  readonly assemblyPdf: AssemblyPdfController;
  readonly drawingProduction: DrawingProductionController;
  readonly drawingProfessional: DrawingProfessionalController;
  readonly drawingWorkspace: DrawingWorkspaceController;
  readonly sectionDrawing: SectionDrawingController;
  readonly unifiedPdfNavigation: UnifiedPdfNavigationController;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SHEET_WIDTH = 1120;
const SHEET_HEIGHT = 792;
const SHEET_MM = {
  A0: [1189, 841],
  A1: [841, 594],
  A2: [594, 420],
  A3: [420, 297],
  A4: [297, 210],
} as const;

/**
 * Capa de transición hacia un Paper Space realmente unificado.
 *
 * Un documento PDF deja de estar limitado por su origen. Si una hoja nació
 * desde una sección, "Enviar a PDF" puede insertar un ensamble en esa misma
 * hoja como una View adicional. El View de sección conserva el modelo general
 * y el View de ensamble conserva únicamente sus instanceIds.
 *
 * La capa reutiliza el layout profesional existente: los Views mixtos reciben
 * el mismo estado x/y/width/height/scaleDenominator y por eso pueden moverse y
 * escalarse sin crear un segundo sistema de edición.
 */
export class UnifiedPdfMixedViewsController {
  private readonly designModel: DesignModel;
  private readonly assemblyPdf: AssemblyPdfRuntime;
  private readonly production: ProductionRuntime;
  private readonly professional: ProfessionalRuntime;
  private readonly workspace: WorkspaceRuntime;
  private readonly sectionDrawing: SectionDrawingController;
  private readonly navigation: UnifiedNavigationRuntime;
  private readonly baseSendAssembly: (
    request: AssemblyPdfRequest,
  ) => boolean;
  private readonly baseWorkspaceRender: () => void;
  private readonly timer: number;
  private lastTreeSignature = "";
  private disposed = false;

  constructor(
    options: UnifiedPdfMixedViewsControllerOptions,
  ) {
    this.designModel = options.designModel;
    this.assemblyPdf =
      options.assemblyPdf as unknown as AssemblyPdfRuntime;
    this.production =
      options.drawingProduction as unknown as ProductionRuntime;
    this.professional =
      options.drawingProfessional as unknown as ProfessionalRuntime;
    this.workspace =
      options.drawingWorkspace as unknown as WorkspaceRuntime;
    this.sectionDrawing = options.sectionDrawing;
    this.navigation =
      options.unifiedPdfNavigation as unknown as UnifiedNavigationRuntime;

    this.baseSendAssembly =
      this.assemblyPdf.sendAssembly.bind(options.assemblyPdf);
    this.baseWorkspaceRender =
      this.workspace.render.bind(options.drawingWorkspace);

    this.assemblyPdf.sendAssembly = (
      request,
    ) => this.sendAssembly(request);

    this.workspace.render = () => {
      this.baseWorkspaceRender();
      this.renderMixedAssemblyViews();
    };

    this.timer = window.setInterval(
      () => this.decorateSectionViewTree(),
      260,
    );
    this.decorateSectionViewTree();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.assemblyPdf.sendAssembly = this.baseSendAssembly;
    this.workspace.render = this.baseWorkspaceRender;
  }

  private sendAssembly(
    request: AssemblyPdfRequest,
  ): boolean {
    if (this.disposed) return false;
    if (!request.workPlane.enabled) {
      window.alert(
        "Activa un WorkPlane antes de enviar el ensamble a PDF. La planta se orienta con los ejes X/Y de ese plano.",
      );
      return false;
    }
    if (request.instanceIds.length < 1) {
      window.alert("El ensamble no contiene piezas.");
      return false;
    }

    const geometry = this.assemblyPdf.buildPlanGeometry(
      request.instanceIds,
      request.workPlane,
    );
    if (!geometry) {
      window.alert(
        "No se encontró geometría para generar la planta del ensamble.",
      );
      return false;
    }

    const entries = this.getOrderedPdfEntries();
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

    const index = Number.parseInt(answer.trim(), 10);
    if (
      !Number.isFinite(index)
      || index < 0
      || index > entries.length
    ) {
      window.alert("Destino de hoja inválido.");
      return false;
    }

    if (index === 0) {
      return this.sendToNewAssemblySheet(request, geometry);
    }

    const destination = entries[index - 1];
    if (!destination) return false;

    if (destination.kind === "SECTION") {
      return this.sendToSectionSheet(
        destination,
        request,
        geometry,
      );
    }

    return this.sendToExistingAssemblySheet(
      destination,
      request,
      geometry,
    );
  }

  private getOrderedPdfEntries(): UnifiedPdfEntryRuntime[] {
    const entries = this.navigation.getEntries();
    this.navigation.syncOrder(entries);
    const byKey = new Map(
      entries.map((entry) => [entry.key, entry] as const),
    );
    const ordered = this.navigation.order
      .map((key) => byKey.get(key))
      .filter(
        (entry): entry is UnifiedPdfEntryRuntime => Boolean(entry),
      );

    for (const entry of entries) {
      if (!ordered.some((candidate) => candidate.key === entry.key)) {
        ordered.push(entry);
      }
    }
    return ordered;
  }

  private sendToNewAssemblySheet(
    request: AssemblyPdfRequest,
    geometry: PlanGeometryRuntime,
  ): boolean {
    const defaultName = `Hoja ${this.getOrderedPdfEntries().length + 1}`;
    const name = window.prompt(
      "Nombre de la nueva hoja",
      defaultName,
    )?.trim();
    if (!name) return false;

    const sheet: AssemblySheetRuntime = {
      id: crypto.randomUUID(),
      name,
      views: [],
    };
    this.assemblyPdf.sheets.push(sheet);
    this.appendAssemblyEngineView(sheet, request, geometry);
    this.assemblyPdf.activeSheetId = sheet.id;
    this.assemblyPdf.refreshSheetSelect();
    this.assemblyPdf.overlay.style.display = "flex";
    this.assemblyPdf.render();
    this.navigation.openKey(`SHEET:${sheet.id}`);
    return true;
  }

  private sendToExistingAssemblySheet(
    destination: UnifiedPdfEntryRuntime,
    request: AssemblyPdfRequest,
    geometry: PlanGeometryRuntime,
  ): boolean {
    const sheet = this.assemblyPdf.sheets.find(
      (candidate) => candidate.id === destination.targetId,
    );
    if (!sheet) return false;

    this.appendAssemblyEngineView(sheet, request, geometry);
    this.assemblyPdf.activeSheetId = sheet.id;
    this.assemblyPdf.refreshSheetSelect();
    this.navigation.openKey(destination.key);
    this.assemblyPdf.render();
    return true;
  }

  private appendAssemblyEngineView(
    sheet: AssemblySheetRuntime,
    request: AssemblyPdfRequest,
    geometry: PlanGeometryRuntime,
  ): void {
    sheet.views.push({
      id: crypto.randomUUID(),
      assemblyId: request.assemblyId,
      assemblyName: request.assemblyName,
      instanceIds: [...request.instanceIds],
      workPlane: cloneWorkPlaneState(request.workPlane),
      width: geometry.width,
      height: geometry.height,
      segments: geometry.segments.map((segment) => ({ ...segment })),
      resolved: true,
    });
  }

  private sendToSectionSheet(
    destination: UnifiedPdfEntryRuntime,
    request: AssemblyPdfRequest,
    geometry: PlanGeometryRuntime,
  ): boolean {
    const sheet = this.production.sheets.get(destination.targetId);
    if (!sheet) {
      window.alert("No se encontró la hoja PDF seleccionada.");
      return false;
    }

    const id = crypto.randomUUID();
    const view: MixedAssemblySheetViewRuntime = {
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
    sheet.views.push(view);

    const layout = this.professional.ensureViewLayout(
      view.id,
      view.sectionId,
      sheet.views.length - 1,
    );
    layout.kind = "ASSEMBLY";
    layout.title = request.assemblyName;

    this.lastTreeSignature = "";
    this.navigation.openKey(destination.key);
    this.workspace.render();
    return true;
  }

  private renderMixedAssemblyViews(): void {
    if (this.disposed || this.workspace.overlay.style.display === "none") {
      return;
    }
    const sheet = this.production.getActiveSheet();
    if (!sheet) return;

    sheet.views.forEach((rawView, index) => {
      const view = this.asAssemblyView(rawView);
      if (!view) return;

      const layout = this.professional.ensureViewLayout(
        view.id,
        view.sectionId,
        index,
      );
      layout.kind = "ASSEMBLY";
      layout.title = view.assemblyName;
      this.renderAssemblyView(sheet, view, layout);
    });
  }

  private renderAssemblyView(
    sheet: SectionSheetRuntime,
    view: MixedAssemblySheetViewRuntime,
    layout: ViewLayoutRuntime,
  ): void {
    const innerWidth = Math.max(1, layout.width - 20);
    const innerHeight = Math.max(1, layout.height - 34);
    const scale = layout.scaleDenominator === null
      ? Math.min(
          innerWidth / Math.max(view.width, 1e-9),
          innerHeight / Math.max(view.height, 1e-9),
        )
      : this.technicalScale(sheet, layout.scaleDenominator);
    const drawnWidth = view.width * scale;
    const drawnHeight = view.height * scale;
    const originX = layout.x + (layout.width - drawnWidth) / 2;
    const originY = layout.y + 20 + (innerHeight - drawnHeight) / 2;

    for (const segment of view.segments) {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", String(originX + segment.x1 * scale));
      line.setAttribute("y1", String(originY + drawnHeight - segment.y1 * scale));
      line.setAttribute("x2", String(originX + segment.x2 * scale));
      line.setAttribute("y2", String(originY + drawnHeight - segment.y2 * scale));
      line.setAttribute("stroke", "#181818");
      line.setAttribute("stroke-width", "0.65");
      line.setAttribute("vector-effect", "non-scaling-stroke");
      line.style.pointerEvents = "none";
      this.workspace.svg.append(line);
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
    move.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = layout.scaleDenominator === null
        ? "AUTO"
        : String(layout.scaleDenominator);
      const answer = window.prompt(
        "Escala del View (AUTO o denominador, por ejemplo 20 para 1:20)",
        current,
      );
      if (answer === null) return;
      const value = answer.trim().toUpperCase();
      if (!value || value === "AUTO") {
        layout.scaleDenominator = null;
      }
      else {
        const numeric = Number(value.replace(/^1\s*:\s*/, ""));
        if (!Number.isFinite(numeric) || numeric <= 0) {
          window.alert("Escala inválida.");
          return;
        }
        layout.scaleDenominator = numeric;
      }
      this.workspace.render();
    });
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
    this.appendSvgText(
      layout.x + 6,
      layout.y + layout.height - 6,
      `ENSAMBLE ${view.assemblyName} · ${scaleText}`,
    );
  }

  private technicalScale(
    sheet: SectionSheetRuntime,
    denominator: number,
  ): number {
    const raw = SHEET_MM[sheet.size] ?? SHEET_MM.A3;
    const landscape = sheet.orientation === "LANDSCAPE";
    const paperWidthMm = landscape ? raw[0] : raw[1];
    const paperHeightMm = landscape ? raw[1] : raw[0];
    const pixelsPerMm = Math.min(
      SHEET_WIDTH / paperWidthMm,
      SHEET_HEIGHT / paperHeightMm,
    );
    return 1000 * pixelsPerMm / Math.max(denominator, 1e-9);
  }

  private appendSvgText(
    x: number,
    y: number,
    text: string,
  ): void {
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(y));
    label.setAttribute("font-size", "9");
    label.setAttribute("fill", "#333");
    label.textContent = text;
    label.style.pointerEvents = "none";
    this.workspace.svg.append(label);
  }

  private decorateSectionViewTree(): void {
    if (
      this.disposed
      || this.workspace.overlay.style.display === "none"
      || !this.workspace.activeSectionId
    ) {
      return;
    }

    const sheet = this.production.sheets.get(
      this.workspace.activeSectionId,
    );
    const panel = this.workspace.overlay.querySelector<HTMLDivElement>(
      'div[data-framelogic-pdf-view-tree="SECTION"]',
    );
    const content = panel?.querySelector<HTMLDivElement>(
      'div[data-framelogic-pdf-view-tree-content="true"]',
    );
    if (!sheet || !content) return;

    const pieces = this.designModel.pieceInstances.getAll();
    const signature = [
      sheet.ownerSectionId,
      ...sheet.views.map((view) => {
        const assembly = this.asAssemblyView(view);
        return assembly
          ? `${view.id}:ASSEMBLY:${assembly.assemblyName}:${assembly.instanceIds.join(",")}`
          : `${view.id}:SECTION:${view.sectionId}`;
      }),
      ...pieces.map((piece) => `${piece.id}:${piece.name ?? ""}:${piece.definitionId}`),
    ].join("|");

    if (
      signature === this.lastTreeSignature
      && content.dataset["framelogicMixedSignature"] === signature
    ) {
      return;
    }
    this.lastTreeSignature = signature;
    content.dataset["framelogicMixedSignature"] = signature;
    content.replaceChildren();

    sheet.views.forEach((rawView, index) => {
      const assembly = this.asAssemblyView(rawView);
      if (assembly) {
        const item = this.createViewDetails(
          `View ${index + 1} · ◇ ${assembly.assemblyName}`,
          `ENSAMBLE · ${assembly.instanceIds.length} componente${assembly.instanceIds.length === 1 ? "" : "s"}`,
        );
        for (const instanceId of assembly.instanceIds) {
          item.content.append(
            this.createInstanceRow(instanceId, true),
          );
        }
        if (assembly.instanceIds.length < 1) {
          item.content.append(this.createEmptyRow("Sin componentes"));
        }
        content.append(item.details);
        return;
      }

      const section = this.sectionDrawing.getSections().find(
        (candidate) => candidate.id === rawView.sectionId,
      );
      const item = this.createViewDetails(
        `View ${index + 1} · ▱ ${section?.name ?? "Sección"}`,
        `SECCIÓN · ${pieces.length} instancias`,
      );
      if (pieces.length < 1) {
        item.content.append(
          this.createEmptyRow("Sin instancias en el modelo"),
        );
      }
      else {
        for (const piece of pieces) {
          item.content.append(
            this.createInstanceRow(piece.id, false),
          );
        }
      }
      content.append(item.details);
    });
  }

  private asAssemblyView(
    view: SectionSheetRuntime["views"][number],
  ): MixedAssemblySheetViewRuntime | null {
    return "kind" in view
      && view.kind === "ASSEMBLY"
      && "assemblyId" in view
        ? view as MixedAssemblySheetViewRuntime
        : null;
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
    details.style.borderBottom =
      "1px solid rgba(255,255,255,0.055)";

    const summary = document.createElement("summary");
    Object.assign(summary.style, {
      padding: "7px 8px",
      cursor: "pointer",
      userSelect: "none",
      color: "#dce8ed",
    });
    const name = document.createElement("div");
    name.textContent = label;
    Object.assign(name.style, {
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
    summary.append(name, meta);

    const body = document.createElement("div");
    body.style.paddingBottom = "4px";
    details.append(summary, body);
    return { details, content: body };
  }

  private createInstanceRow(
    instanceId: string,
    included: boolean,
  ): HTMLDivElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: included
        ? "22px minmax(0, 1fr)"
        : "minmax(0, 1fr)",
      gap: "5px",
      alignItems: "center",
      minHeight: "24px",
      padding: included
        ? "2px 8px 2px 18px"
        : "2px 8px 2px 26px",
      color: "#c8d5db",
    });

    if (included) {
      const eye = document.createElement("span");
      eye.textContent = "👁";
      eye.title = "Instancia incluida en esta View";
      eye.style.textAlign = "center";
      row.append(eye);
    }

    const text = document.createElement("span");
    text.textContent = `◇ ${this.getPieceLabel(instanceId)}`;
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
    const definition = this.designModel.pieceDefinitions.get(
      piece.definitionId,
    );
    const name =
      piece.name?.trim()
      || definition?.name?.trim()
      || definition?.code?.trim()
      || `Instancia ${piece.id.slice(0, 8)}`;
    const code = definition?.code?.trim();
    return code && code !== name
      ? `${name} · ${code}`
      : name;
  }
}

function snapshotWorkPlane(
  state: CadWorkPlaneState,
): MixedAssemblySheetViewRuntime["workPlane"] {
  return {
    mode: state.mode,
    enabled: state.enabled,
    origin: vectorSnapshot(state.origin),
    xAxis: vectorSnapshot(state.xAxis),
    yAxis: vectorSnapshot(state.yAxis),
    normal: vectorSnapshot(state.normal),
  };
}

function vectorSnapshot(
  value: { readonly x: number; readonly y: number; readonly z: number },
): { readonly x: number; readonly y: number; readonly z: number } {
  return {
    x: value.x,
    y: value.y,
    z: value.z,
  };
}

function cloneWorkPlaneState(
  state: CadWorkPlaneState,
): CadWorkPlaneState {
  return {
    mode: state.mode,
    enabled: state.enabled,
    origin: state.origin.clone(),
    xAxis: state.xAxis.clone(),
    yAxis: state.yAxis.clone(),
    normal: state.normal.clone(),
  };
}
