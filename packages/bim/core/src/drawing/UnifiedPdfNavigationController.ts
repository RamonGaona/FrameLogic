import type {
  DrawingProductionController,
  SheetState,
} from "./DrawingProductionController";

import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionDrawingController,
} from "./SectionDrawingController";

import type {
  AssemblyPdfController,
} from "./AssemblyPdfController";


export interface UnifiedPdfNavigationSnapshot {
  readonly version: 1;
  readonly order: readonly string[];
}

interface PdfEntry {
  readonly key: string;
  readonly kind: "SECTION" | "SHEET";
  readonly targetId: string;
  readonly label: string;
}

interface ProductionRuntime {
  readonly sheets: Map<string, SheetState>;
}

interface WorkspaceRuntime {
  activeSectionId: string | null;
  readonly overlay: HTMLDivElement;
}

interface SectionRuntime {
  activeSectionId: string | null;
  refreshUi(): void;
}

interface AssemblySheetRuntime {
  readonly id: string;
  name: string;
  readonly views: readonly unknown[];
}

interface AssemblyPdfRuntime {
  readonly sheets: AssemblySheetRuntime[];
  activeSheetId: string | null;
  readonly overlay: HTMLDivElement;
  readonly sheetSelect: HTMLSelectElement;
  render(): void;
}

export interface UnifiedPdfNavigationControllerOptions {
  readonly container: HTMLElement;
  readonly sectionDrawing: SectionDrawingController;
  readonly drawingWorkspace: DrawingWorkspaceController;
  readonly drawingProduction: DrawingProductionController;
  readonly assemblyPdf: AssemblyPdfController;
}

const SECTION_PREFIX = "SECTION:";
const SHEET_PREFIX = "SHEET:";
const DOCUMENT_TABS_HEIGHT = 32;
const PDF_TREE_WIDTH = 270;

/**
 * Navegación única de documentos PDF.
 *
 * Todos los documentos se presentan como PDFs equivalentes. La procedencia
 * interna (sección o hoja con views de piezas/ensambles) solo se utiliza para
 * abrir el motor correcto.
 *
 * La barra inferior sigue el patrón CAD: MODELO siempre está disponible y cada
 * PDF existente tiene su propia pestaña.
 *
 * El árbol VIEWS se acopla como columna lateral propia: reduce el viewport del
 * papel en lugar de flotar sobre él. Así el árbol nunca tapa la hoja.
 */
export class UnifiedPdfNavigationController {
  private readonly container: HTMLElement;
  private readonly sectionDrawing: SectionDrawingController;
  private readonly drawingWorkspace: DrawingWorkspaceController;
  private readonly production: ProductionRuntime;
  private readonly workspace: WorkspaceRuntime;
  private readonly sectionRuntime: SectionRuntime;
  private readonly assemblyPdf: AssemblyPdfRuntime;
  private readonly sectionSelect: HTMLSelectElement | null;
  private readonly assemblySelect: HTMLSelectElement | null;
  private readonly tabBar: HTMLDivElement;
  private readonly timer: number;
  private order: string[] = [];
  private disposed = false;

  constructor(
    options: UnifiedPdfNavigationControllerOptions,
  ) {
    this.container = options.container;
    this.sectionDrawing = options.sectionDrawing;
    this.drawingWorkspace = options.drawingWorkspace;
    this.production = options.drawingProduction as unknown as ProductionRuntime;
    this.workspace = options.drawingWorkspace as unknown as WorkspaceRuntime;
    this.sectionRuntime = options.sectionDrawing as unknown as SectionRuntime;
    this.assemblyPdf = options.assemblyPdf as unknown as AssemblyPdfRuntime;

    this.sectionSelect =
      options.container.querySelector<HTMLSelectElement>(
        'select[title="Cambiar plano de sección"]',
      );
    this.assemblySelect =
      this.assemblyPdf.sheetSelect
      ?? options.container.querySelector<HTMLSelectElement>(
        '[data-framelogic-assembly-pdf="true"] select',
      );

    this.prepareSelect(this.sectionSelect, "SECTION_WORKSPACE");
    this.prepareSelect(this.assemblySelect, "SHEET_WORKSPACE");
    this.installLabels();
    this.tabBar = this.createTabBar();

    this.workspace.overlay.style.paddingBottom =
      `${DOCUMENT_TABS_HEIGHT}px`;
    this.workspace.overlay.style.boxSizing = "border-box";
    this.assemblyPdf.overlay.style.paddingBottom =
      `${DOCUMENT_TABS_HEIGHT}px`;
    this.assemblyPdf.overlay.style.boxSizing = "border-box";

    this.timer = window.setInterval(
      () => this.sync(),
      250,
    );
    this.sync();
  }

  createSnapshot(): UnifiedPdfNavigationSnapshot {
    this.syncOrder(this.getEntries());
    return {
      version: 1,
      order: [...this.order],
    };
  }

  restoreSnapshot(
    snapshot: UnifiedPdfNavigationSnapshot | undefined,
  ): void {
    if (
      !snapshot
      || snapshot.version !== 1
      || !Array.isArray(snapshot.order)
    ) {
      this.order = [];
    }
    else {
      this.order = snapshot.order
        .map((key) =>
          key.startsWith("ASSEMBLY:")
            ? `${SHEET_PREFIX}${key.slice("ASSEMBLY:".length)}`
            : key,
        )
        .filter(
          (key): key is string =>
            typeof key === "string"
            && (
              key.startsWith(SECTION_PREFIX)
              || key.startsWith(SHEET_PREFIX)
            ),
        );
    }
    this.sync();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.sectionSelect?.removeEventListener(
      "change",
      this.handleSelectChange,
      true,
    );
    this.assemblySelect?.removeEventListener(
      "change",
      this.handleSelectChange,
      true,
    );
    this.tabBar.remove();
    this.restorePdfTreeDock(this.workspace.overlay);
    this.restorePdfTreeDock(this.assemblyPdf.overlay);
    this.workspace.overlay.style.paddingBottom = "";
    this.assemblyPdf.overlay.style.paddingBottom = "";
  }

  private createTabBar(): HTMLDivElement {
    this.container
      .querySelector('[data-framelogic-document-tabs="true"]')
      ?.remove();

    const bar = document.createElement("div");
    bar.dataset["framelogicDocumentTabs"] = "true";
    Object.assign(bar.style, {
      position: "absolute",
      left: "0",
      right: "0",
      bottom: "0",
      zIndex: "12000",
      height: `${DOCUMENT_TABS_HEIGHT}px`,
      display: "flex",
      alignItems: "stretch",
      gap: "2px",
      padding: "3px 8px",
      boxSizing: "border-box",
      overflowX: "auto",
      overflowY: "hidden",
      background: "rgba(13,20,25,0.98)",
      borderTop: "1px solid rgba(255,255,255,0.14)",
      color: "#dce8ed",
      font: "11px system-ui, sans-serif",
    });
    this.container.append(bar);
    return bar;
  }

  private prepareSelect(
    select: HTMLSelectElement | null,
    source: string,
  ): void {
    if (!select) return;
    select.dataset["framelogicUnifiedPdf"] = source;
    select.title = "Cambiar PDF";
    select.style.minWidth = "190px";
    select.addEventListener(
      "change",
      this.handleSelectChange,
      true,
    );
  }

  private installLabels(): void {
    if (this.sectionSelect) {
      const previous = this.sectionSelect.previousElementSibling;
      if (
        previous instanceof HTMLElement
        && previous.textContent?.trim() === "Sección"
      ) {
        previous.textContent = "PDF";
        previous.dataset["framelogicUnifiedPdfLabel"] = "true";
      }
    }

    if (this.assemblySelect) {
      const existing = this.assemblySelect.previousElementSibling;
      if (
        existing instanceof HTMLElement
        && existing.dataset["framelogicUnifiedPdfLabel"] === "true"
      ) {
        existing.textContent = "PDF";
        return;
      }
      const label = document.createElement("span");
      label.textContent = "PDF";
      label.dataset["framelogicUnifiedPdfLabel"] = "true";
      label.style.opacity = "0.72";
      label.style.marginLeft = "4px";
      this.assemblySelect.before(label);
    }
  }

  private readonly handleSelectChange = (
    event: Event,
  ): void => {
    if (this.disposed) return;
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    this.openKey(select.value);

    window.setTimeout(
      () => this.sync(),
      0,
    );
  };

  private openKey(key: string): boolean {
    if (key.startsWith(SECTION_PREFIX)) {
      return this.openSection(
        key.slice(SECTION_PREFIX.length),
      );
    }
    if (key.startsWith(SHEET_PREFIX)) {
      return this.openSheet(
        key.slice(SHEET_PREFIX.length),
      );
    }
    return false;
  }

  private openModel(): void {
    this.drawingWorkspace.close();
    this.assemblyPdf.overlay.style.display = "none";
    this.sync();
  }

  private openSection(
    sectionId: string,
  ): boolean {
    const section = this.sectionDrawing
      .getSections()
      .find((candidate) => candidate.id === sectionId);
    if (!section) return false;

    this.assemblyPdf.overlay.style.display = "none";
    this.sectionRuntime.activeSectionId = section.id;
    this.sectionRuntime.refreshUi();
    return this.drawingWorkspace.openActiveSection();
  }

  private openSheet(
    sheetId: string,
  ): boolean {
    const sheet = this.assemblyPdf.sheets.find(
      (candidate) => candidate.id === sheetId,
    );
    if (!sheet) return false;

    this.drawingWorkspace.close();
    this.assemblyPdf.activeSheetId = sheet.id;
    this.assemblyPdf.overlay.style.display = "flex";
    this.assemblyPdf.render();
    return true;
  }

  private sync(): void {
    if (this.disposed) return;
    this.normalizeLegacyPdfUi();
    this.syncPdfTreeDock(
      this.workspace.overlay,
      "SECTION",
    );
    this.syncPdfTreeDock(
      this.assemblyPdf.overlay,
      "ASSEMBLY",
    );

    const entries = this.getEntries();
    this.syncOrder(entries);
    const ordered = this.order
      .map((key) => entries.find((entry) => entry.key === key))
      .filter((entry): entry is PdfEntry => Boolean(entry));
    const activeKey = this.getActiveKey();

    this.populateSelect(
      this.sectionSelect,
      ordered,
      activeKey,
    );
    this.populateSelect(
      this.assemblySelect,
      ordered,
      activeKey,
    );
    this.renderTabs(ordered, activeKey);
  }

  private normalizeLegacyPdfUi(): void {
    for (const legacyButton of this.container.querySelectorAll<HTMLButtonElement>(
      'button[data-framelogic-open-assembly-pdf="true"]',
    )) {
      const header = legacyButton.parentElement;
      legacyButton.remove();
      if (header instanceof HTMLElement) {
        header.style.gridTemplateColumns = "1fr auto auto";
      }
    }
  }

  private syncPdfTreeDock(
    overlay: HTMLDivElement,
    kind: "SECTION" | "ASSEMBLY",
  ): void {
    const panel = overlay.querySelector<HTMLDivElement>(
      `div[data-framelogic-pdf-view-tree="${kind}"]`,
    );
    const toolbar = overlay.firstElementChild;
    const stage = Array.from(overlay.children).find(
      (child): child is HTMLDivElement =>
        child instanceof HTMLDivElement
        && child !== toolbar
        && child !== panel
        && child.style.flex === "1 1 auto"
        && child.style.overflow === "auto",
    );

    if (!stage) return;
    if (!panel) {
      this.restorePdfTreeDock(overlay);
      return;
    }

    const toolbarHeight =
      toolbar instanceof HTMLElement
        ? toolbar.offsetHeight
        : 0;
    const status = kind === "SECTION"
      ? Array.from(overlay.children).find(
          (child): child is HTMLDivElement =>
            child instanceof HTMLDivElement
            && child !== toolbar
            && child !== stage
            && child !== panel
            && child.style.minHeight === "16px",
        )
      : undefined;
    const bottom =
      DOCUMENT_TABS_HEIGHT
      + (status?.offsetHeight ?? 0);

    Object.assign(panel.style, {
      position: "absolute",
      left: "0",
      top: `${toolbarHeight}px`,
      bottom: `${bottom}px`,
      width: `${PDF_TREE_WIDTH}px`,
      zIndex: "80",
      borderTop: "0",
      borderBottom: "0",
      borderLeft: "0",
      borderRight: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "0",
      boxShadow: "none",
      background: "#11191f",
    });

    stage.style.marginLeft = `${PDF_TREE_WIDTH}px`;
    stage.style.width = `calc(100% - ${PDF_TREE_WIDTH}px)`;
    stage.style.alignSelf = "flex-start";
    stage.style.boxSizing = "border-box";
  }

  private restorePdfTreeDock(
    overlay: HTMLDivElement,
  ): void {
    const toolbar = overlay.firstElementChild;
    const stage = Array.from(overlay.children).find(
      (child): child is HTMLDivElement =>
        child instanceof HTMLDivElement
        && child !== toolbar
        && child.style.flex === "1 1 auto"
        && child.style.overflow === "auto",
    );
    if (!stage) return;

    stage.style.marginLeft = "";
    stage.style.width = "";
    stage.style.alignSelf = "";
    stage.style.boxSizing = "";
  }

  private getEntries(): PdfEntry[] {
    const entries: PdfEntry[] = [];
    const sections = this.sectionDrawing.getSections();

    for (const sectionId of this.production.sheets.keys()) {
      const section = sections.find(
        (candidate) => candidate.id === sectionId,
      );
      if (!section) continue;
      entries.push({
        key: `${SECTION_PREFIX}${section.id}`,
        kind: "SECTION",
        targetId: section.id,
        label: section.name,
      });
    }

    for (const sheet of this.assemblyPdf.sheets) {
      entries.push({
        key: `${SHEET_PREFIX}${sheet.id}`,
        kind: "SHEET",
        targetId: sheet.id,
        label: sheet.name,
      });
    }

    return entries;
  }

  private syncOrder(
    entries: readonly PdfEntry[],
  ): void {
    const current = new Set(
      entries.map((entry) => entry.key),
    );
    this.order = this.order.filter(
      (key) => current.has(key),
    );

    for (const entry of entries) {
      if (!this.order.includes(entry.key)) {
        this.order.push(entry.key);
      }
    }
  }

  private getActiveKey(): string | null {
    if (
      this.assemblyPdf.overlay.style.display !== "none"
      && this.assemblyPdf.activeSheetId
    ) {
      return `${SHEET_PREFIX}${this.assemblyPdf.activeSheetId}`;
    }

    if (
      this.workspace.overlay.style.display !== "none"
      && this.workspace.activeSectionId
    ) {
      return `${SECTION_PREFIX}${this.workspace.activeSectionId}`;
    }

    return null;
  }

  private renderTabs(
    entries: readonly PdfEntry[],
    activeKey: string | null,
  ): void {
    const signature = [
      activeKey ?? "MODEL",
      ...entries.map((entry) => `${entry.key}:${entry.label}`),
    ].join("|");
    if (this.tabBar.dataset["signature"] === signature) return;
    this.tabBar.dataset["signature"] = signature;
    this.tabBar.replaceChildren();

    this.tabBar.append(
      this.createTabButton(
        "MODELO",
        activeKey === null,
        () => this.openModel(),
      ),
    );

    entries.forEach((entry, index) => {
      this.tabBar.append(
        this.createTabButton(
          `${index + 1} · ${entry.label}`,
          activeKey === entry.key,
          () => this.openKey(entry.key),
        ),
      );
    });
  }

  private createTabButton(
    label: string,
    active: boolean,
    action: () => void,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = label;
    Object.assign(button.style, {
      flex: "0 0 auto",
      maxWidth: "220px",
      minWidth: label === "MODELO" ? "74px" : "110px",
      padding: "0 10px",
      border: "1px solid rgba(255,255,255,0.14)",
      borderBottom: active
        ? "2px solid #6fc7ed"
        : "1px solid rgba(255,255,255,0.14)",
      borderRadius: "4px 4px 0 0",
      background: active
        ? "rgba(77,151,184,0.30)"
        : "rgba(255,255,255,0.045)",
      color: active ? "#effaff" : "#b9c9d0",
      cursor: "pointer",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      font: "11px system-ui, sans-serif",
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
      window.setTimeout(() => this.sync(), 0);
    });
    return button;
  }

  private populateSelect(
    select: HTMLSelectElement | null,
    entries: readonly PdfEntry[],
    activeKey: string | null,
  ): void {
    if (!select) return;

    const optionRows = entries.map((entry, index) => ({
      value: entry.key,
      label: `${index + 1} · ${entry.label}`,
    }));
    const signature = optionRows
      .map((row) => `${row.value}:${row.label}`)
      .join("|");
    const actualSignature = Array.from(select.options)
      .map((option) => `${option.value}:${option.textContent ?? ""}`)
      .join("|");

    if (
      select.dataset["framelogicUnifiedPdfSignature"] !== signature
      || actualSignature !== signature
    ) {
      select.replaceChildren();

      if (optionRows.length < 1) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Sin PDFs";
        select.append(option);
      }
      else {
        for (const row of optionRows) {
          const option = document.createElement("option");
          option.value = row.value;
          option.textContent = row.label;
          select.append(option);
        }
      }

      select.dataset["framelogicUnifiedPdfSignature"] = signature;
    }

    select.disabled = entries.length < 1;
    if (
      activeKey
      && Array.from(select.options).some(
        (option) => option.value === activeKey,
      )
    ) {
      select.value = activeKey;
    }
  }
}
