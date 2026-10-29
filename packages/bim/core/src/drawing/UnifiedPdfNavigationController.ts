import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  GeneralPdfController,
  GeneralPdfEntry,
} from "./GeneralPdfController";


export interface UnifiedPdfNavigationSnapshot {
  readonly version: 1;
  readonly order: readonly string[];
}

interface WorkspaceRuntime {
  readonly overlay: HTMLDivElement;
}

export interface UnifiedPdfNavigationControllerOptions {
  readonly container: HTMLElement;
  readonly drawingWorkspace: DrawingWorkspaceController;
  readonly generalPdf: GeneralPdfController;
}

const SECTION_PREFIX = "SECTION:";
const SHEET_PREFIX = "SHEET:";
const DOCUMENT_TABS_HEIGHT = 32;
const PDF_TREE_WIDTH = 270;

/**
 * Navegación única de documentos PDF.
 *
 * Ya no decide entre un motor de secciones y otro de ensambles. Todos los
 * documentos son hojas del GeneralPdfController y se abren en el mismo Paper
 * Space. Los prefijos SECTION:/SHEET: sólo se conservan para migrar el orden de
 * proyectos anteriores y para no romper bridges antiguos que todavía consultan
 * el origen de una hoja.
 */
export class UnifiedPdfNavigationController {
  private readonly container: HTMLElement;
  private readonly drawingWorkspace: DrawingWorkspaceController;
  private readonly workspace: WorkspaceRuntime;
  private readonly generalPdf: GeneralPdfController;
  private readonly pdfSelect: HTMLSelectElement | null;
  private readonly tabBar: HTMLDivElement;
  private readonly timer: number;
  private order: string[] = [];
  private openedKeys: string[] = [];
  private disposed = false;

  constructor(
    options: UnifiedPdfNavigationControllerOptions,
  ) {
    this.container = options.container;
    this.drawingWorkspace = options.drawingWorkspace;
    this.workspace =
      options.drawingWorkspace as unknown as WorkspaceRuntime;
    this.generalPdf = options.generalPdf;

    this.pdfSelect = options.container.querySelector<HTMLSelectElement>(
      'select[title="Cambiar plano de sección"]',
    );
    this.prepareSelect(this.pdfSelect);
    this.installLabel();
    this.tabBar = this.createTabBar();

    this.workspace.overlay.style.paddingBottom =
      `${DOCUMENT_TABS_HEIGHT}px`;
    this.workspace.overlay.style.boxSizing = "border-box";

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
        .map((key) => {
          if (key.startsWith("ASSEMBLY:")) {
            return `${SHEET_PREFIX}${key.slice("ASSEMBLY:".length)}`;
          }
          return key;
        })
        .filter(
          (key): key is string =>
            typeof key === "string"
            && (
              key.startsWith(SECTION_PREFIX)
              || key.startsWith(SHEET_PREFIX)
            ),
        );
    }

    this.openedKeys = [];
    this.drawingWorkspace.close();
    this.sync();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.pdfSelect?.removeEventListener(
      "change",
      this.handleSelectChange,
      true,
    );
    this.tabBar.remove();
    this.restorePdfTreeDock();
    this.workspace.overlay.style.paddingBottom = "";
  }

  getEntries(): GeneralPdfEntry[] {
    return this.generalPdf.getEntries();
  }

  syncOrder(entries: readonly GeneralPdfEntry[]): void {
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

  getOrderedKeys(): readonly string[] {
    const entries = this.getEntries();
    this.syncOrder(entries);
    return [...this.order];
  }

  openSection(sectionId: string): boolean {
    return this.openTarget(sectionId);
  }

  openAssemblySheet(sheetId: string): boolean {
    return this.openTarget(sheetId);
  }

  openSheet(sheetId: string): boolean {
    return this.openTarget(sheetId);
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

  private prepareSelect(select: HTMLSelectElement | null): void {
    if (!select) return;
    select.dataset["framelogicUnifiedPdf"] = "GENERAL_PDF";
    select.title = "Abrir o cambiar PDF";
    select.style.minWidth = "190px";
    select.addEventListener(
      "change",
      this.handleSelectChange,
      true,
    );
  }

  private installLabel(): void {
    if (!this.pdfSelect) return;
    const previous = this.pdfSelect.previousElementSibling;
    if (
      previous instanceof HTMLElement
      && previous.textContent?.trim() === "Sección"
    ) {
      previous.textContent = "PDF";
      previous.dataset["framelogicUnifiedPdfLabel"] = "true";
    }
  }

  private readonly handleSelectChange = (event: Event): void => {
    if (this.disposed) return;
    const select = event.currentTarget;
    if (!(select instanceof HTMLSelectElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.openKey(select.value);
    window.setTimeout(() => this.sync(), 0);
  };

  private openKey(key: string): boolean {
    const entry = this.getEntries().find(
      (candidate) => candidate.key === key,
    );
    if (!entry) return false;
    const opened = this.generalPdf.openSheet(entry.targetId);
    if (opened) this.markOpened(entry.key);
    return opened;
  }

  private openTarget(targetId: string): boolean {
    const entry = this.getEntries().find(
      (candidate) => candidate.targetId === targetId,
    );
    if (!entry) return false;
    const opened = this.generalPdf.openSheet(entry.targetId);
    if (opened) this.markOpened(entry.key);
    window.setTimeout(() => this.sync(), 0);
    return opened;
  }

  private markOpened(key: string): void {
    if (!this.openedKeys.includes(key)) {
      this.openedKeys.push(key);
    }
  }

  private closeKey(key: string): void {
    this.openedKeys = this.openedKeys.filter(
      (candidate) => candidate !== key,
    );
    if (this.getActiveKey() === key) {
      this.openModel();
      return;
    }
    this.sync();
  }

  private openModel(): void {
    this.drawingWorkspace.close();
    this.sync();
  }

  private sync(): void {
    if (this.disposed) return;
    this.normalizeLegacyPdfUi();
    this.syncPdfTreeDock();

    const entries = this.getEntries();
    this.syncOrder(entries);
    const ordered = this.order
      .map((key) => entries.find((entry) => entry.key === key))
      .filter((entry): entry is GeneralPdfEntry => Boolean(entry));
    const availableKeys = new Set(
      ordered.map((entry) => entry.key),
    );

    this.openedKeys = this.openedKeys.filter(
      (key) => availableKeys.has(key),
    );

    const activeKey = this.getActiveKey();
    if (activeKey && availableKeys.has(activeKey)) {
      this.markOpened(activeKey);
    }

    const opened = this.openedKeys
      .map((key) => ordered.find((entry) => entry.key === key))
      .filter((entry): entry is GeneralPdfEntry => Boolean(entry));

    this.populateSelect(
      this.pdfSelect,
      ordered,
      activeKey,
    );
    this.renderTabs(opened, activeKey);
  }

  private normalizeLegacyPdfUi(): void {
    for (const legacyButton of this.container.querySelectorAll<HTMLButtonElement>(
      'button[data-framelogic-open-assembly-pdf="true"]',
    )) {
      legacyButton.remove();
    }
    for (const legacyOverlay of this.container.querySelectorAll<HTMLElement>(
      '[data-framelogic-assembly-pdf="true"]',
    )) {
      legacyOverlay.remove();
    }
  }

  private syncPdfTreeDock(): void {
    const overlay = this.workspace.overlay;
    const panel = overlay.querySelector<HTMLDivElement>(
      'div[data-framelogic-pdf-view-tree="GENERAL"]',
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
      this.restorePdfTreeDock();
      return;
    }

    const toolbarHeight = toolbar instanceof HTMLElement
      ? toolbar.offsetHeight
      : 0;
    const status = Array.from(overlay.children).find(
      (child): child is HTMLDivElement =>
        child instanceof HTMLDivElement
        && child !== toolbar
        && child !== stage
        && child !== panel
        && child.style.minHeight === "16px",
    );
    const bottom = DOCUMENT_TABS_HEIGHT + (status?.offsetHeight ?? 0);

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

  private restorePdfTreeDock(): void {
    const overlay = this.workspace.overlay;
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

  private getActiveKey(): string | null {
    const activeSheetId = this.generalPdf.getActiveSheetId();
    if (!activeSheetId) return null;
    return this.getEntries().find(
      (entry) => entry.targetId === activeSheetId,
    )?.key ?? null;
  }

  private renderTabs(
    entries: readonly GeneralPdfEntry[],
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

    for (const entry of entries) {
      this.tabBar.append(
        this.createPdfTab(
          entry,
          activeKey === entry.key,
        ),
      );
    }
  }

  private createPdfTab(
    entry: GeneralPdfEntry,
    active: boolean,
  ): HTMLDivElement {
    const tab = document.createElement("div");
    tab.dataset["framelogicPdfTab"] = entry.key;
    Object.assign(tab.style, {
      flex: "0 0 auto",
      minWidth: "120px",
      maxWidth: "240px",
      display: "flex",
      alignItems: "stretch",
      border: "1px solid rgba(255,255,255,0.14)",
      borderBottom: active
        ? "2px solid #6fc7ed"
        : "1px solid rgba(255,255,255,0.14)",
      borderRadius: "4px 4px 0 0",
      background: active
        ? "rgba(77,151,184,0.30)"
        : "rgba(255,255,255,0.045)",
      overflow: "hidden",
    });

    const open = document.createElement("button");
    open.type = "button";
    open.textContent = entry.label;
    open.title = entry.label;
    Object.assign(open.style, {
      minWidth: "0",
      flex: "1 1 auto",
      padding: "0 8px",
      border: "0",
      background: "transparent",
      color: active ? "#effaff" : "#b9c9d0",
      cursor: "pointer",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      font: "11px system-ui, sans-serif",
      textAlign: "left",
    });
    open.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openKey(entry.key);
      window.setTimeout(() => this.sync(), 0);
    });

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Cerrar pestaña (no elimina el PDF)";
    close.setAttribute("aria-label", `Cerrar ${entry.label}`);
    Object.assign(close.style, {
      flex: "0 0 24px",
      width: "24px",
      padding: "0",
      border: "0",
      borderLeft: "1px solid rgba(255,255,255,0.10)",
      background: "transparent",
      color: "#9fb2bb",
      cursor: "pointer",
      font: "16px/1 system-ui, sans-serif",
    });
    close.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.closeKey(entry.key);
    });

    tab.append(open, close);
    return tab;
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
    entries: readonly GeneralPdfEntry[],
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
