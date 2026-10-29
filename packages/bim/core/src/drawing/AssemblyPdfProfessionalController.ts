import type {
  AssemblyPdfController,
} from "./AssemblyPdfController";


type SheetSize =
  | "A4"
  | "A3"
  | "A2"
  | "A1"
  | "A0";


type SheetOrientation =
  | "LANDSCAPE"
  | "PORTRAIT";


type TitleBlockTemplate =
  | "ISO_SIMPLE"
  | "STRUCTURAL"
  | "FABRICATION";


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


interface AssemblyViewRuntime {
  readonly id: string;
  readonly assemblyId: string;
  readonly assemblyName: string;
  readonly instanceIds: readonly string[];
  readonly workPlane: unknown;
  width: number;
  height: number;
  segments: readonly PaperLineRuntime[];
  resolved: boolean;
}


interface AssemblySheetRuntime {
  readonly id: string;
  name: string;
  readonly views: AssemblyViewRuntime[];
}


interface AssemblyPdfRuntime {
  readonly overlay: HTMLDivElement;
  readonly svg: SVGSVGElement;
  readonly title: HTMLDivElement;
  readonly sheets: AssemblySheetRuntime[];
  activeSheetId: string | null;
  render(): void;
  layout(sheet: AssemblySheetRuntime): PaperLayoutRuntime;
  getActiveSheet(): AssemblySheetRuntime | null;
  refreshSheetSelect(): void;
  createSnapshot(): unknown;
  restoreSnapshot(snapshot: unknown): void;
  openExisting(): boolean;
  createPdf(sheet: AssemblySheetRuntime): Uint8Array;
}


interface TitleBlockState {
  project: string;
  drawingTitle: string;
  drawingNumber: string;
  author: string;
  company: string;
}


interface RevisionState {
  readonly id: string;
  code: string;
  description: string;
  date: string;
  frozen: boolean;
}


interface SheetProfessionalState {
  readonly sheetId: string;
  size: SheetSize;
  orientation: SheetOrientation;
  scaleDenominator: number | null;
  template: TitleBlockTemplate;
  readonly titleBlock: TitleBlockState;
  readonly revisions: RevisionState[];
  readonly lockedViewIds: Set<string>;
}


interface ProfessionalSnapshotExtension {
  readonly assemblyPdfProfessional?: {
    readonly version: 1;
    readonly sheets: readonly {
      readonly sheetId: string;
      readonly size: SheetSize;
      readonly orientation: SheetOrientation;
      readonly scaleDenominator: number | null;
      readonly template: TitleBlockTemplate;
      readonly titleBlock: TitleBlockState;
      readonly revisions: readonly RevisionState[];
      readonly lockedViewIds: readonly string[];
    }[];
  };
}


const LANDSCAPE_WIDTH = 1120;
const LANDSCAPE_HEIGHT = 792;

const SHEET_MM: Record<SheetSize, readonly [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  A0: [1189, 841],
};


/**
 * Lleva el PDF de ensambles al mismo lenguaje de trabajo del plano de sección.
 *
 * Las herramientas compartidas son funcionales (formato/orientación de PDF,
 * cajetín, revisión, zoom, SVG/DXF, bloqueo, alineación y actualización). Las
 * herramientas que dependen semánticamente de un corte HLR se muestran en la
 * misma posición pero deshabilitadas para no fingir resultados de sección.
 */
export class AssemblyPdfProfessionalController {
  private readonly runtime: AssemblyPdfRuntime;
  private readonly baseRender: () => void;
  private readonly baseLayout:
    (sheet: AssemblySheetRuntime) => PaperLayoutRuntime;
  private readonly baseCreateSnapshot: () => unknown;
  private readonly baseRestoreSnapshot: (snapshot: unknown) => void;
  private readonly baseCreatePdf:
    (sheet: AssemblySheetRuntime) => Uint8Array;
  private readonly states =
    new Map<string, SheetProfessionalState>();
  private readonly controls: HTMLElement[] = [];
  private zoom = 1;
  private zoomInfo: HTMLSpanElement | null = null;
  private lockButton: HTMLButtonElement | null = null;
  private sizeSelect: HTMLSelectElement | null = null;
  private orientationSelect: HTMLSelectElement | null = null;
  private scaleSelect: HTMLSelectElement | null = null;
  private templateSelect: HTMLSelectElement | null = null;
  private disposed = false;

  constructor(
    assemblyPdf: AssemblyPdfController,
  ) {
    this.runtime =
      assemblyPdf as unknown as AssemblyPdfRuntime;
    this.baseRender =
      this.runtime.render.bind(assemblyPdf);
    this.baseLayout =
      this.runtime.layout.bind(assemblyPdf);
    this.baseCreateSnapshot =
      this.runtime.createSnapshot.bind(assemblyPdf);
    this.baseRestoreSnapshot =
      this.runtime.restoreSnapshot.bind(assemblyPdf);
    this.baseCreatePdf =
      this.runtime.createPdf.bind(assemblyPdf);

    this.installPatches();
    this.installToolbar();
    this.runtime.overlay.addEventListener(
      "pointerdown",
      this.handleLockedPointerDown,
      true,
    );
    this.runtime.overlay.addEventListener(
      "click",
      this.handleLockedToolbarClick,
      true,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime.overlay.removeEventListener(
      "pointerdown",
      this.handleLockedPointerDown,
      true,
    );
    this.runtime.overlay.removeEventListener(
      "click",
      this.handleLockedToolbarClick,
      true,
    );
    this.runtime.render = this.baseRender;
    this.runtime.layout = this.baseLayout;
    this.runtime.createSnapshot = this.baseCreateSnapshot;
    this.runtime.restoreSnapshot = this.baseRestoreSnapshot;
    this.runtime.createPdf = this.baseCreatePdf;
    for (const control of this.controls) {
      control.remove();
    }
    this.states.clear();
  }

  private installPatches(): void {
    this.runtime.layout = (
      sheet: AssemblySheetRuntime,
    ): PaperLayoutRuntime => {
      const base = this.baseLayout(sheet);
      return this.decorateLayout(
        sheet,
        base,
      );
    };

    this.runtime.render = (): void => {
      this.cleanupStates();
      this.baseRender();
      const sheet = this.runtime.getActiveSheet();
      if (sheet) {
        this.runtime.title.textContent =
          `PLANO · ${sheet.name}`;
        this.applyPaperOrientation(
          this.ensureState(sheet.id).orientation,
        );
      }
      this.applyZoom();
      this.syncToolbar();
    };

    this.runtime.createSnapshot = (): unknown => {
      const base = this.baseCreateSnapshot();
      const object =
        base && typeof base === "object"
          ? base as Record<string, unknown>
          : {};
      return {
        ...object,
        assemblyPdfProfessional: {
          version: 1,
          sheets: Array.from(this.states.values()).map(
            (state) => ({
              sheetId: state.sheetId,
              size: state.size,
              orientation: state.orientation,
              scaleDenominator: state.scaleDenominator,
              template: state.template,
              titleBlock: {
                ...state.titleBlock,
              },
              revisions: state.revisions.map(
                (revision) => ({
                  ...revision,
                }),
              ),
              lockedViewIds: [
                ...state.lockedViewIds,
              ],
            }),
          ),
        },
      };
    };

    this.runtime.restoreSnapshot = (
      snapshot: unknown,
    ): void => {
      this.baseRestoreSnapshot(snapshot);
      this.restoreProfessionalSnapshot(snapshot);
      this.runtime.render();
    };

    this.runtime.createPdf = (
      sheet: AssemblySheetRuntime,
    ): Uint8Array =>
      this.createPdf(sheet);
  }

  private installToolbar(): void {
    const toolbar =
      this.runtime.overlay.firstElementChild as HTMLElement | null;
    if (!toolbar) return;
    toolbar.style.flexWrap = "wrap";
    toolbar.style.alignItems = "center";

    const exportButton =
      Array.from(toolbar.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "Exportar PDF");
    if (!exportButton) return;
    exportButton.style.marginLeft = "0";

    const minus = this.makeButton("−", "Alejar plano");
    const plus = this.makeButton("+", "Acercar plano");
    minus.addEventListener("click", () => this.setZoom(this.zoom - 0.1));
    plus.addEventListener("click", () => this.setZoom(this.zoom + 0.1));

    const sizeSelect = this.makeSelect([
      ["A4", "A4"],
      ["A3", "A3"],
      ["A2", "A2"],
      ["A1", "A1"],
      ["A0", "A0"],
    ]);
    sizeSelect.title = "Tamaño de hoja";
    sizeSelect.addEventListener("change", () => {
      const state = this.activeState();
      if (!state) return;
      state.size = sizeSelect.value as SheetSize;
      this.runtime.render();
    });
    this.sizeSelect = sizeSelect;

    const orientationSelect = this.makeSelect([
      ["LANDSCAPE", "Horizontal"],
      ["PORTRAIT", "Vertical"],
    ]);
    orientationSelect.title = "Orientación de hoja";
    orientationSelect.addEventListener("change", () => {
      const state = this.activeState();
      if (!state) return;
      state.orientation =
        orientationSelect.value as SheetOrientation;
      this.runtime.render();
    });
    this.orientationSelect = orientationSelect;

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
    scaleSelect.title =
      "Escala declarada del plano. La vista de ensamble conserva ajuste geométrico automático.";
    scaleSelect.addEventListener("change", () => {
      const state = this.activeState();
      if (!state) return;
      state.scaleDenominator =
        scaleSelect.value === "AUTO"
          ? null
          : Number(scaleSelect.value);
      this.runtime.render();
    });
    this.scaleSelect = scaleSelect;

    const hatch = this.makeButton(
      "Hatch",
      "Hatch de material cortado: disponible en vistas de sección.",
    );
    this.disableContextOnly(hatch);

    const addView = this.makeButton(
      "+ Vista",
      "Duplicar la vista seleccionada en esta hoja",
    );
    addView.addEventListener("click", () => this.addView());

    const titleBlock = this.makeButton(
      "Cajetín",
      "Editar cajetín de la hoja",
    );
    titleBlock.addEventListener("click", () => this.editTitleBlock());

    const revision = this.makeButton(
      "Revisión",
      "Añadir revisión al plano",
    );
    revision.addEventListener("click", () => this.addRevision());

    const fit = this.makeButton("Ajustar", "Ajustar hoja al espacio disponible");
    fit.addEventListener("click", () => this.fit());

    const zoomInfo = document.createElement("span");
    zoomInfo.style.minWidth = "38px";
    zoomInfo.style.textAlign = "center";
    zoomInfo.style.opacity = "0.75";
    zoomInfo.textContent = "100%";
    this.zoomInfo = zoomInfo;

    const firstRow: HTMLElement[] = [
      minus,
      plus,
      sizeSelect,
      orientationSelect,
      scaleSelect,
      hatch,
      addView,
      titleBlock,
      revision,
      fit,
      zoomInfo,
    ];
    for (const control of firstRow) {
      toolbar.insertBefore(control, exportButton);
      this.controls.push(control);
    }

    const breakElement = document.createElement("span");
    Object.assign(breakElement.style, {
      flexBasis: "100%",
      width: "0",
      height: "0",
    });
    toolbar.insertBefore(breakElement, exportButton);
    this.controls.push(breakElement);

    const snapSelect = this.makeSelect([
      ["AUTO", "SNAP Auto"],
    ]);
    snapSelect.title =
      "Las anotaciones de ensamble usan SNAP automático sobre la geometría de la vista.";

    const sections = this.makeButton(
      "Secciones",
      "Administrador de secciones: disponible en planos de sección.",
    );
    this.disableContextOnly(sections);

    const hidden = this.makeButton(
      "Ocultas",
      "Líneas ocultas HLR: disponible en planos de sección.",
    );
    this.disableContextOnly(hidden);

    const svgButton = this.makeButton("SVG", "Exportar hoja como SVG vectorial");
    svgButton.addEventListener("click", () => this.exportSvg());

    const dxfButton = this.makeButton("DXF", "Exportar hoja como DXF 2D");
    dxfButton.addEventListener("click", () => this.exportDxf());

    const lockButton = this.makeButton(
      "Bloquear",
      "Bloquear/desbloquear la vista seleccionada",
    );
    lockButton.addEventListener("click", () => this.toggleLock());
    this.lockButton = lockButton;

    const align = this.makeButton("Alinear cotas", "Ordenar offsets de cotas de la vista seleccionada");
    align.addEventListener("click", () => this.alignDimensions());

    const freeze = this.makeButton("Congelar rev", "Marcar la revisión actual como congelada");
    freeze.addEventListener("click", () => this.freezeRevision());

    const exact = this.makeButton(
      "Actualizar exacto",
      "Regenerar las vistas desde Model Space. HLR B-Rep exacto de ensambles se incorporará al mismo motor de documentación.",
    );
    exact.addEventListener("click", () => this.refreshViews());

    const template = this.makeSelect([
      ["ISO_SIMPLE", "Cajetín ISO"],
      ["STRUCTURAL", "Cajetín estructural"],
      ["FABRICATION", "Cajetín fabricación"],
    ]);
    template.title = "Plantilla de cajetín";
    template.addEventListener("change", () => {
      const state = this.activeState();
      if (!state) return;
      state.template = template.value as TitleBlockTemplate;
      this.runtime.render();
    });
    this.templateSelect = template;

    let anchor: Element = exportButton;
    for (const control of [
      snapSelect,
      sections,
      hidden,
      svgButton,
      dxfButton,
      lockButton,
      align,
      freeze,
      exact,
      template,
    ]) {
      anchor.after(control);
      anchor = control;
      this.controls.push(control);
    }

    this.moveExistingSecondRowControls(toolbar, snapSelect);
  }

  private moveExistingSecondRowControls(
    toolbar: HTMLElement,
    snapSelect: HTMLSelectElement,
  ): void {
    const candidates = Array.from(toolbar.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const wanted = candidates.filter((element) => {
      if (element instanceof HTMLSelectElement) {
        return element.title === "Unidad de cotas"
          || element.title === "Decimales";
      }
      return element instanceof HTMLButtonElement
        && ["DIMSTYLE", "Detalle", "Nube rev"].includes(element.textContent ?? "");
    });

    let anchor: Element = snapSelect;
    for (const element of wanted) {
      anchor.after(element);
      anchor = element;
    }
  }

  private decorateLayout(
    sheet: AssemblySheetRuntime,
    base: PaperLayoutRuntime,
  ): PaperLayoutRuntime {
    const state = this.ensureState(sheet.id);
    const oriented =
      state.orientation === "PORTRAIT"
        ? this.rotateLayoutPortrait(base)
        : {
            lines: [...base.lines],
            labels: [...base.labels],
            frames: [...base.frames],
          };
    const dimensions = this.paperPixels(state.orientation);
    const labels = oriented.labels.filter(
      (label) =>
        !(label.text === sheet.name
          && label.y > dimensions.height - 100),
    );
    const lines = [...oriented.lines];

    this.appendTitleBlockGraphics(
      state,
      dimensions.width,
      dimensions.height,
      lines,
      labels,
    );

    labels.push({
      x: 34,
      y: dimensions.height - 28,
      text: sheet.name,
      size: 15,
    });

    return {
      lines,
      labels,
      frames: oriented.frames,
    };
  }

  private rotateLayoutPortrait(
    layout: PaperLayoutRuntime,
  ): {
    lines: PaperLineRuntime[];
    labels: PaperLabelRuntime[];
    frames: PaperFrameRuntime[];
  } {
    return {
      lines: layout.lines.map((line) => ({
        x1: line.y1,
        y1: LANDSCAPE_WIDTH - line.x1,
        x2: line.y2,
        y2: LANDSCAPE_WIDTH - line.x2,
      })),
      labels: layout.labels.map((label) => ({
        x: label.y,
        y: LANDSCAPE_WIDTH - label.x,
        text: label.text,
        size: label.size,
      })),
      frames: layout.frames.map((frame) => ({
        x: frame.y,
        y: LANDSCAPE_WIDTH - frame.x - frame.width,
        width: frame.height,
        height: frame.width,
      })),
    };
  }

  private appendTitleBlockGraphics(
    state: SheetProfessionalState,
    width: number,
    height: number,
    lines: PaperLineRuntime[],
    labels: PaperLabelRuntime[],
  ): void {
    const blockWidth = Math.min(360, width * 0.42);
    const blockHeight = state.revisions.length > 0 ? 92 : 70;
    const x = width - blockWidth - 28;
    const y = height - blockHeight - 20;
    const mid = x + blockWidth * 0.68;

    lines.push(
      { x1: x, y1: y, x2: x + blockWidth, y2: y },
      { x1: x + blockWidth, y1: y, x2: x + blockWidth, y2: y + blockHeight },
      { x1: x + blockWidth, y1: y + blockHeight, x2: x, y2: y + blockHeight },
      { x1: x, y1: y + blockHeight, x2: x, y2: y },
      { x1: mid, y1: y, x2: mid, y2: y + blockHeight },
      { x1: x, y1: y + 24, x2: x + blockWidth, y2: y + 24 },
      { x1: x, y1: y + 47, x2: x + blockWidth, y2: y + 47 },
    );

    const scale = state.scaleDenominator === null
      ? "ESC AUTO"
      : `ESC 1:${state.scaleDenominator}`;
    labels.push(
      { x: x + 8, y: y + 16, text: state.titleBlock.company || "FrameLogic", size: 9 },
      { x: x + 8, y: y + 40, text: state.titleBlock.drawingTitle, size: 8 },
      { x: x + 8, y: y + 62, text: state.titleBlock.drawingNumber, size: 7 },
      { x: mid + 8, y: y + 16, text: scale, size: 7 },
      { x: mid + 8, y: y + 40, text: state.size, size: 7 },
      { x: mid + 8, y: y + 62, text: this.templateLabel(state.template), size: 7 },
    );

    const revision = state.revisions.at(-1);
    if (revision) {
      labels.push({
        x: x + 8,
        y: y + blockHeight - 8,
        text: `REV ${revision.code}${revision.frozen ? " · CONGELADA" : ""} · ${revision.description}`,
        size: 6.5,
      });
    }
  }

  private applyPaperOrientation(
    orientation: SheetOrientation,
  ): void {
    const dimensions = this.paperPixels(orientation);
    this.runtime.svg.setAttribute(
      "viewBox",
      `0 0 ${dimensions.width} ${dimensions.height}`,
    );
    this.runtime.svg.setAttribute("width", String(dimensions.width));
    this.runtime.svg.setAttribute("height", String(dimensions.height));
    const border = this.runtime.svg.querySelector("rect");
    if (border) {
      border.setAttribute("width", String(dimensions.width - 1));
      border.setAttribute("height", String(dimensions.height - 1));
    }
  }

  private setZoom(value: number): void {
    this.zoom = Math.max(0.25, Math.min(2.5, value));
    this.applyZoom();
  }

  private fit(): void {
    const stage = this.runtime.svg.parentElement;
    const state = this.activeState();
    if (!stage || !state) return;
    const dimensions = this.paperPixels(state.orientation);
    const width = Math.max(100, stage.clientWidth - 56);
    const height = Math.max(100, stage.clientHeight - 56);
    this.zoom = Math.max(
      0.25,
      Math.min(1.5, width / dimensions.width, height / dimensions.height),
    );
    this.applyZoom();
  }

  private applyZoom(): void {
    const sheet = this.runtime.getActiveSheet();
    if (!sheet) return;
    const dimensions = this.paperPixels(
      this.ensureState(sheet.id).orientation,
    );
    this.runtime.svg.style.width =
      `${dimensions.width * this.zoom}px`;
    this.runtime.svg.style.height =
      `${dimensions.height * this.zoom}px`;
    if (this.zoomInfo) {
      this.zoomInfo.textContent =
        `${Math.round(this.zoom * 100)}%`;
    }
  }

  private addView(): void {
    const sheet = this.runtime.getActiveSheet();
    if (!sheet) return;
    const selectedId = this.selectedViewId();
    const source =
      sheet.views.find((view) => view.id === selectedId)
      ?? sheet.views[0];
    if (!source) return;
    sheet.views.push({
      ...source,
      id: crypto.randomUUID(),
      instanceIds: [...source.instanceIds],
      segments: source.segments.map((segment) => ({ ...segment })),
      resolved: source.resolved,
    });
    this.runtime.refreshSheetSelect();
    this.runtime.render();
  }

  private editTitleBlock(): void {
    const sheet = this.runtime.getActiveSheet();
    const state = sheet ? this.ensureState(sheet.id) : null;
    if (!sheet || !state) return;

    const title = window.prompt(
      "Título del plano",
      state.titleBlock.drawingTitle || sheet.name,
    );
    if (title === null) return;
    const number = window.prompt(
      "Número de plano",
      state.titleBlock.drawingNumber,
    );
    if (number === null) return;
    const project = window.prompt(
      "Proyecto",
      state.titleBlock.project,
    );
    if (project === null) return;

    state.titleBlock.drawingTitle = title.trim() || sheet.name;
    state.titleBlock.drawingNumber = number.trim() || "P-001";
    state.titleBlock.project = project.trim() || "FrameLogic";
    this.runtime.render();
  }

  private addRevision(): void {
    const state = this.activeState();
    if (!state) return;
    const code = window.prompt(
      "Código de revisión",
      String(state.revisions.length),
    )?.trim();
    if (!code) return;
    const description = window.prompt(
      "Descripción de revisión",
      "Revisión de plano",
    )?.trim();
    if (description === undefined) return;
    state.revisions.push({
      id: crypto.randomUUID(),
      code,
      description: description || "Revisión de plano",
      date: new Date().toISOString().slice(0, 10),
      frozen: false,
    });
    this.runtime.render();
  }

  private toggleLock(): void {
    const state = this.activeState();
    const viewId = this.selectedViewId();
    if (!state || !viewId) {
      window.alert("Selecciona primero una vista.");
      return;
    }
    if (state.lockedViewIds.has(viewId)) {
      state.lockedViewIds.delete(viewId);
    }
    else {
      state.lockedViewIds.add(viewId);
    }
    this.syncToolbar();
  }

  private alignDimensions(): void {
    const selectedViewId = this.selectedViewId();
    if (!selectedViewId) {
      window.alert("Selecciona primero una vista.");
      return;
    }
    const snapshot =
      this.runtime.createSnapshot() as ProfessionalSnapshotExtension
      & Record<string, unknown>;
    const annotationGroups = snapshot["assemblyAnnotations"];
    if (!Array.isArray(annotationGroups)) return;
    const group = annotationGroups.find(
      (entry) =>
        entry
        && typeof entry === "object"
        && (entry as Record<string, unknown>)["viewId"] === selectedViewId,
    ) as Record<string, unknown> | undefined;
    if (!group || !Array.isArray(group["annotations"])) return;

    let horizontal = 0;
    let vertical = 0;
    let generic = 0;
    for (const raw of group["annotations"]) {
      if (!raw || typeof raw !== "object") continue;
      const annotation = raw as Record<string, unknown>;
      if (annotation["kind"] !== "DIMENSION") continue;
      const mode = String(annotation["mode"] ?? "ALIGNED");
      if (mode === "HORIZONTAL") {
        annotation["offsetY"] = -28 - horizontal * 18;
        horizontal += 1;
      }
      else if (mode === "VERTICAL") {
        annotation["offsetX"] = 28 + vertical * 18;
        vertical += 1;
      }
      else {
        annotation["offsetY"] = -28 - generic * 16;
        generic += 1;
      }
    }

    this.runtime.restoreSnapshot(snapshot);
    this.runtime.openExisting();
  }

  private freezeRevision(): void {
    const state = this.activeState();
    if (!state) return;
    let revision = state.revisions.at(-1);
    if (!revision) {
      this.addRevision();
      revision = state.revisions.at(-1);
    }
    if (!revision) return;
    revision.frozen = true;
    this.runtime.render();
  }

  private refreshViews(): void {
    const sheet = this.runtime.getActiveSheet();
    if (!sheet) return;
    for (const view of sheet.views) {
      view.resolved = false;
    }
    this.runtime.render();
  }

  private exportSvg(): void {
    this.runtime.render();
    const source =
      `<?xml version="1.0" encoding="UTF-8"?>\n${this.runtime.svg.outerHTML}`;
    this.download(
      source,
      "image/svg+xml",
      `${this.fileSafeName(this.runtime.getActiveSheet()?.name ?? "plano")}.svg`,
    );
  }

  private exportDxf(): void {
    this.runtime.render();
    const state = this.activeState();
    if (!state) return;
    const [rawW, rawH] = SHEET_MM[state.size];
    const widthMm = state.orientation === "LANDSCAPE" ? rawW : rawH;
    const heightMm = state.orientation === "LANDSCAPE" ? rawH : rawW;
    const pixels = this.paperPixels(state.orientation);
    const sx = widthMm / pixels.width;
    const sy = heightMm / pixels.height;
    const lines: string[] = [
      "0", "SECTION", "2", "HEADER",
      "9", "$INSUNITS", "70", "4",
      "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES",
    ];

    for (const child of Array.from(this.runtime.svg.children)) {
      const tag = child.tagName.toLowerCase();
      if (tag === "line") {
        lines.push(
          "0", "LINE", "8", "DRAWING",
          "10", String(Number(child.getAttribute("x1") ?? 0) * sx),
          "20", String((pixels.height - Number(child.getAttribute("y1") ?? 0)) * sy),
          "30", "0",
          "11", String(Number(child.getAttribute("x2") ?? 0) * sx),
          "21", String((pixels.height - Number(child.getAttribute("y2") ?? 0)) * sy),
          "31", "0",
        );
      }
      else if (tag === "text") {
        const text = (child.textContent ?? "").replace(/[\r\n]+/g, " ");
        if (!text) continue;
        lines.push(
          "0", "TEXT", "8", "ANNOTATION",
          "10", String(Number(child.getAttribute("x") ?? 0) * sx),
          "20", String((pixels.height - Number(child.getAttribute("y") ?? 0)) * sy),
          "30", "0", "40", "2.5", "1", text,
        );
      }
    }

    lines.push("0", "ENDSEC", "0", "EOF");
    this.download(
      lines.join("\n"),
      "application/dxf",
      `${this.fileSafeName(this.runtime.getActiveSheet()?.name ?? "plano")}.dxf`,
    );
  }

  private createPdf(
    sheet: AssemblySheetRuntime,
  ): Uint8Array {
    const state = this.ensureState(sheet.id);
    const [rawW, rawH] = SHEET_MM[state.size];
    const widthMm = state.orientation === "LANDSCAPE" ? rawW : rawH;
    const heightMm = state.orientation === "LANDSCAPE" ? rawH : rawW;
    const pageWidth = widthMm * 72 / 25.4;
    const pageHeight = heightMm * 72 / 25.4;
    const pixels = this.paperPixels(state.orientation);
    const sx = pageWidth / pixels.width;
    const sy = pageHeight / pixels.height;
    const toX = (value: number): number => value * sx;
    const toY = (value: number): number => pageHeight - value * sy;
    const layout = this.runtime.layout(sheet);
    const commands: string[] = ["q", "1 J 1 j", "0 G 0.45 w"];

    for (const frame of layout.frames) {
      const x = toX(frame.x);
      const y = toY(frame.y + frame.height);
      commands.push(
        `${this.n(x)} ${this.n(y)} ${this.n(frame.width * sx)} ${this.n(frame.height * sy)} re S`,
      );
    }
    for (const line of layout.lines) {
      commands.push(
        `${this.n(toX(line.x1))} ${this.n(toY(line.y1))} m ${this.n(toX(line.x2))} ${this.n(toY(line.y2))} l S`,
      );
    }
    for (const label of layout.labels) {
      commands.push(
        `BT /F1 ${this.n(label.size)} Tf ${this.n(toX(label.x))} ${this.n(toY(label.y))} Td (${this.pdfText(label.text)}) Tj ET`,
      );
    }
    commands.push("Q");

    const stream = commands.join("\n");
    const encoder = new TextEncoder();
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.n(pageWidth)} ${this.n(pageHeight)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(encoder.encode(pdf).length);
      pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }
    const xrefOffset = encoder.encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return encoder.encode(pdf);
  }

  private readonly handleLockedPointerDown = (
    event: PointerEvent,
  ): void => {
    const state = this.activeState();
    const selected = this.selectedViewId();
    if (!state || !selected || !state.lockedViewIds.has(selected)) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest('[data-framelogic-assembly-pdf-view-hit="true"], [data-annotation-id]')) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handleLockedToolbarClick = (
    event: MouseEvent,
  ): void => {
    const state = this.activeState();
    const selected = this.selectedViewId();
    if (!state || !selected || !state.lockedViewIds.has(selected)) return;
    const target = event.target instanceof HTMLButtonElement
      ? event.target
      : null;
    if (!target) return;
    if (!["Actualizar vista", "← Vista", "Vista →", "Eliminar vista"].includes(target.textContent ?? "")) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private syncToolbar(): void {
    const state = this.activeState();
    if (!state) return;
    if (this.sizeSelect) this.sizeSelect.value = state.size;
    if (this.orientationSelect) this.orientationSelect.value = state.orientation;
    if (this.scaleSelect) {
      this.scaleSelect.value = state.scaleDenominator === null
        ? "AUTO"
        : String(state.scaleDenominator);
    }
    if (this.templateSelect) this.templateSelect.value = state.template;
    if (this.lockButton) {
      const selected = this.selectedViewId();
      const locked = Boolean(selected && state.lockedViewIds.has(selected));
      this.lockButton.textContent = locked ? "Desbloquear" : "Bloquear";
    }
  }

  private activeState(): SheetProfessionalState | null {
    const sheet = this.runtime.getActiveSheet();
    return sheet ? this.ensureState(sheet.id) : null;
  }

  private ensureState(sheetId: string): SheetProfessionalState {
    const existing = this.states.get(sheetId);
    if (existing) return existing;
    const sheet = this.runtime.sheets.find((entry) => entry.id === sheetId);
    const created: SheetProfessionalState = {
      sheetId,
      size: "A3",
      orientation: "LANDSCAPE",
      scaleDenominator: null,
      template: "ISO_SIMPLE",
      titleBlock: {
        project: "FrameLogic",
        drawingTitle: sheet?.name ?? "Plano",
        drawingNumber: "P-001",
        author: "",
        company: "FrameLogic",
      },
      revisions: [],
      lockedViewIds: new Set<string>(),
    };
    this.states.set(sheetId, created);
    return created;
  }

  private cleanupStates(): void {
    const ids = new Set(this.runtime.sheets.map((sheet) => sheet.id));
    for (const id of this.states.keys()) {
      if (!ids.has(id)) this.states.delete(id);
    }
  }

  private restoreProfessionalSnapshot(snapshot: unknown): void {
    this.states.clear();
    if (!snapshot || typeof snapshot !== "object") return;
    const extension =
      (snapshot as ProfessionalSnapshotExtension).assemblyPdfProfessional;
    if (!extension || extension.version !== 1) return;
    for (const state of extension.sheets) {
      this.states.set(state.sheetId, {
        sheetId: state.sheetId,
        size: state.size,
        orientation: state.orientation,
        scaleDenominator: state.scaleDenominator,
        template: state.template,
        titleBlock: { ...state.titleBlock },
        revisions: state.revisions.map((revision) => ({ ...revision })),
        lockedViewIds: new Set(state.lockedViewIds),
      });
    }
  }

  private selectedViewId(): string | null {
    return this.runtime.overlay.dataset[
      "framelogicSelectedAssemblyPdfViewId"
    ] || null;
  }

  private paperPixels(
    orientation: SheetOrientation,
  ): { readonly width: number; readonly height: number } {
    return orientation === "LANDSCAPE"
      ? { width: LANDSCAPE_WIDTH, height: LANDSCAPE_HEIGHT }
      : { width: LANDSCAPE_HEIGHT, height: LANDSCAPE_WIDTH };
  }

  private templateLabel(template: TitleBlockTemplate): string {
    if (template === "STRUCTURAL") return "ESTRUCTURAL";
    if (template === "FABRICATION") return "FABRICACIÓN";
    return "ISO";
  }

  private disableContextOnly(button: HTMLButtonElement): void {
    button.disabled = true;
    button.style.opacity = "0.45";
    button.style.cursor = "default";
  }

  private makeButton(
    label: string,
    title: string,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
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
    const select = document.createElement("select");
    Object.assign(select.style, {
      padding: "5px 7px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#10171c",
      color: "#edf2f5",
    });
    for (const [value, label] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    return select;
  }

  private download(
    content: string,
    type: string,
    fileName: string,
  ): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private n(value: number): string {
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
}
