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
  readonly kind: "SECTION" | "ASSEMBLY";
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
const ASSEMBLY_PREFIX = "ASSEMBLY:";

/**
 * Navegador único de planos/PDF de FrameLogic.
 *
 * El número mostrado (1, 2, 3...) es una secuencia interna de navegación y no
 * modifica drawingNumber, nombre de hoja ni ningún código que defina el usuario
 * en el cajetín. Secciones y hojas de ensamble conservan sus motores de dibujo,
 * pero aparecen en una única lista y pueden abrirse desde cualquiera de los dos
 * espacios PDF.
 */
export class UnifiedPdfNavigationController {
  private readonly sectionDrawing: SectionDrawingController;
  private readonly drawingWorkspace: DrawingWorkspaceController;
  private readonly production: ProductionRuntime;
  private readonly workspace: WorkspaceRuntime;
  private readonly sectionRuntime: SectionRuntime;
  private readonly assemblyPdf: AssemblyPdfRuntime;
  private readonly sectionSelect: HTMLSelectElement | null;
  private readonly assemblySelect: HTMLSelectElement | null;
  private readonly timer: number;
  private order: string[] = [];
  private disposed = false;

  constructor(
    options: UnifiedPdfNavigationControllerOptions,
  ) {
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
    this.prepareSelect(this.assemblySelect, "ASSEMBLY_WORKSPACE");
    this.installLabels();

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
      this.order = snapshot.order.filter(
        (key): key is string =>
          typeof key === "string"
          && (
            key.startsWith(SECTION_PREFIX)
            || key.startsWith(ASSEMBLY_PREFIX)
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
  }

  private prepareSelect(
    select: HTMLSelectElement | null,
    source: string,
  ): void {
    if (!select) return;
    select.dataset["framelogicUnifiedPdf"] = source;
    select.title = "Cambiar plano PDF";
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
        previous.textContent = "Plano";
        previous.dataset["framelogicUnifiedPdfLabel"] = "true";
      }
    }

    if (this.assemblySelect) {
      const existing = this.assemblySelect.previousElementSibling;
      if (
        existing instanceof HTMLElement
        && existing.dataset["framelogicUnifiedPdfLabel"] === "true"
      ) {
        return;
      }
      const label = document.createElement("span");
      label.textContent = "Plano";
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

    const key = select.value;
    if (key.startsWith(SECTION_PREFIX)) {
      this.openSection(
        key.slice(SECTION_PREFIX.length),
      );
    }
    else if (key.startsWith(ASSEMBLY_PREFIX)) {
      this.openAssemblySheet(
        key.slice(ASSEMBLY_PREFIX.length),
      );
    }

    window.setTimeout(
      () => this.sync(),
      0,
    );
  };

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

  private openAssemblySheet(
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
        key: `${ASSEMBLY_PREFIX}${sheet.id}`,
        kind: "ASSEMBLY",
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
      return `${ASSEMBLY_PREFIX}${this.assemblyPdf.activeSheetId}`;
    }

    if (
      this.workspace.overlay.style.display !== "none"
      && this.workspace.activeSectionId
    ) {
      return `${SECTION_PREFIX}${this.workspace.activeSectionId}`;
    }

    return null;
  }

  private populateSelect(
    select: HTMLSelectElement | null,
    entries: readonly PdfEntry[],
    activeKey: string | null,
  ): void {
    if (!select) return;

    const optionRows = entries.map((entry, index) => ({
      value: entry.key,
      label: entry.kind === "SECTION"
        ? `${index + 1} · ${entry.label} · SECCIÓN`
        : `${index + 1} · ${entry.label} · ENSAMBLE`,
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
        option.textContent = "Sin planos PDF";
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
