import type * as THREE from "three";

import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";


type DrawingTool =
  | "SELECT"
  | "DIMENSION"
  | "LABEL"
  | "TEXT";


interface SectionVisualInternal {
  readonly group: THREE.Group;
  readonly fillMaterial: THREE.MeshBasicMaterial;
  readonly edgeMaterial: THREE.LineBasicMaterial;
  readonly arrow: THREE.ArrowHelper;
  readonly handles: Map<string, THREE.Object3D>;
}


interface SectionDrawingInternal {
  activeSectionId: string | null;
  readonly visuals: Map<string, SectionVisualInternal>;
  refreshUi(): void;
  setStatus(message: string): void;
  replaceSection(section: SectionViewDefinition): void;
}


interface DrawingDocumentInternal {
  readonly annotations: readonly unknown[];
}


interface DrawingWorkspaceInternal {
  activeSectionId: string | null;
  zoom: number;
  readonly documents: Map<string, DrawingDocumentInternal>;
  setTool(tool: DrawingTool): void;
  setZoom(value: number): void;
}


export interface DrawingExperienceControllerOptions {
  readonly container: HTMLElement;
  readonly sectionDrawing: SectionDrawingController;
  readonly drawingWorkspace: DrawingWorkspaceController;
}


/**
 * Mejora la experiencia de uso de secciones y planos sin cambiar
 * SectionViewDefinition ni el formato de anotaciones.
 */
export class DrawingExperienceController {
  private readonly container: HTMLElement;
  private readonly sectionDrawing: SectionDrawingController;
  private readonly drawingWorkspace: DrawingWorkspaceController;
  private readonly sectionInternal: SectionDrawingInternal;
  private readonly drawingInternal: DrawingWorkspaceInternal;

  private readonly sectionSelect: HTMLSelectElement;
  private readonly previousButton: HTMLButtonElement | null;
  private readonly nextButton: HTMLButtonElement | null;
  private readonly renameButton: HTMLButtonElement | null;

  private readonly drawingSelect: HTMLSelectElement | null;
  private readonly drawingInfo: HTMLSpanElement | null;
  private readonly zoomInfo: HTMLSpanElement | null;
  private readonly fitButton: HTMLButtonElement | null;

  private readonly timer: number;
  private disposed = false;


  constructor(
    options: DrawingExperienceControllerOptions,
  ) {
    this.container = options.container;
    this.sectionDrawing = options.sectionDrawing;
    this.drawingWorkspace = options.drawingWorkspace;

    this.sectionInternal = (
      options.sectionDrawing as unknown
    ) as SectionDrawingInternal;

    this.drawingInternal = (
      options.drawingWorkspace as unknown
    ) as DrawingWorkspaceInternal;

    const sectionPanel =
      this.container.querySelector<HTMLElement>(
        '[data-framelogic-section-panel="true"]',
      );

    this.sectionSelect = document.createElement("select");
    this.sectionSelect.title = "Sección activa";
    this.styleSelect(this.sectionSelect);

    if (sectionPanel) {
      this.previousButton = this.makeButton("‹", "Sección anterior");
      this.nextButton = this.makeButton("›", "Sección siguiente");
      this.renameButton = this.makeButton("Nombre", "Renombrar sección");

      const title =
        Array.from(sectionPanel.children).find(
          (child) => child.textContent === "SECCIÓN",
        ) ?? sectionPanel.firstChild;

      if (title) {
        title.after(
          this.previousButton,
          this.sectionSelect,
          this.nextButton,
          this.renameButton,
        );
      }
      else {
        sectionPanel.prepend(
          this.previousButton,
          this.sectionSelect,
          this.nextButton,
          this.renameButton,
        );
      }

      this.sectionSelect.addEventListener(
        "change",
        this.handleSectionSelect,
      );
      this.previousButton.addEventListener(
        "click",
        this.handlePreviousSection,
      );
      this.nextButton.addEventListener(
        "click",
        this.handleNextSection,
      );
      this.renameButton.addEventListener(
        "click",
        this.handleRenameSection,
      );
    }
    else {
      this.previousButton = null;
      this.nextButton = null;
      this.renameButton = null;
    }

    const drawingOverlay =
      this.container.querySelector<HTMLElement>(
        '[data-framelogic-drawing-workspace="true"]',
      );

    const toolbar = (
      drawingOverlay?.firstElementChild ?? null
    ) as HTMLElement | null;

    if (toolbar) {
      const divider = document.createElement("span");
      divider.textContent = "Sección";
      divider.style.opacity = "0.7";
      divider.style.marginLeft = "4px";

      const drawingSelect = document.createElement("select");
      drawingSelect.title = "Cambiar plano de sección";
      this.styleSelect(drawingSelect);
      drawingSelect.addEventListener(
        "change",
        this.handleDrawingSelect,
      );

      const drawingInfo = document.createElement("span");
      drawingInfo.style.padding = "3px 7px";
      drawingInfo.style.borderRadius = "999px";
      drawingInfo.style.background = "rgba(255,255,255,0.08)";
      drawingInfo.style.color = "#c9d6dc";
      drawingInfo.style.whiteSpace = "nowrap";

      const fitButton = this.makeButton(
        "Ajustar",
        "Volver a zoom 100%",
      );
      fitButton.addEventListener(
        "click",
        this.handleFitDrawing,
      );

      const zoomInfo = document.createElement("span");
      zoomInfo.style.minWidth = "42px";
      zoomInfo.style.textAlign = "center";
      zoomInfo.style.opacity = "0.75";

      const firstButton = toolbar.querySelector("button");
      const titleElement =
        firstButton?.nextElementSibling ?? toolbar.firstElementChild;

      if (titleElement) {
        titleElement.after(
          divider,
          drawingSelect,
          drawingInfo,
        );
      }
      else {
        toolbar.prepend(
          divider,
          drawingSelect,
          drawingInfo,
        );
      }

      const exportButton =
        Array.from(toolbar.querySelectorAll("button")).find(
          (button) => button.textContent === "Exportar PDF",
        ) ?? null;

      if (exportButton) {
        exportButton.before(fitButton, zoomInfo);
      }
      else {
        toolbar.append(fitButton, zoomInfo);
      }

      this.drawingSelect = drawingSelect;
      this.drawingInfo = drawingInfo;
      this.zoomInfo = zoomInfo;
      this.fitButton = fitButton;
    }
    else {
      this.drawingSelect = null;
      this.drawingInfo = null;
      this.zoomInfo = null;
      this.fitButton = null;
    }

    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    this.sync();
    this.timer = window.setInterval(
      () => this.sync(),
      300,
    );
  }


  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    window.clearInterval(this.timer);

    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    this.sectionSelect.removeEventListener(
      "change",
      this.handleSectionSelect,
    );
    this.previousButton?.removeEventListener(
      "click",
      this.handlePreviousSection,
    );
    this.nextButton?.removeEventListener(
      "click",
      this.handleNextSection,
    );
    this.renameButton?.removeEventListener(
      "click",
      this.handleRenameSection,
    );
    this.drawingSelect?.removeEventListener(
      "change",
      this.handleDrawingSelect,
    );
    this.fitButton?.removeEventListener(
      "click",
      this.handleFitDrawing,
    );
  }


  private sync(): void {
    const sections = this.sectionDrawing.getSections();
    const active = this.sectionDrawing.getActiveSection();

    this.syncSelect(
      this.sectionSelect,
      sections,
      active?.id ?? null,
    );

    // UnifiedPdfNavigationController is the sole owner of the PDF selector.
    // The legacy section-only updater otherwise replaces its options every
    // 300 ms, and the unified controller restores them 250 ms later (flicker).
    if (this.drawingSelect && shouldSyncLegacyDrawingSelect(this.drawingSelect)) {
      this.syncSelect(
        this.drawingSelect,
        sections,
        this.drawingInternal.activeSectionId,
      );
    }

    this.syncVisualState(active?.id ?? null);
    this.syncDrawingInfo();
  }


  private syncSelect(
    select: HTMLSelectElement,
    sections: readonly SectionViewDefinition[],
    selectedId: string | null,
  ): void {
    const signature = sections
      .map(
        (section) =>
          `${section.id}:${section.name}:${section.depth}`,
      )
      .join("|");

    if (select.dataset["signature"] !== signature) {
      select.replaceChildren();

      if (sections.length < 1) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Sin secciones";
        select.append(option);
      }
      else {
        for (const section of sections) {
          const option = document.createElement("option");
          option.value = section.id;
          option.textContent =
            `${this.shortSectionName(section.name)} · ${this.formatNumber(section.depth)} m`;
          select.append(option);
        }
      }

      select.dataset["signature"] = signature;
    }

    select.disabled = sections.length < 1;

    if (
      selectedId
      && Array.from(select.options).some(
        (option) => option.value === selectedId,
      )
    ) {
      select.value = selectedId;
    }
  }


  private activateSection(
    sectionId: string,
  ): boolean {
    const section = this.sectionDrawing
      .getSections()
      .find(
        (candidate) => candidate.id === sectionId,
      );

    if (!section) {
      return false;
    }

    this.sectionInternal.activeSectionId = section.id;
    this.sectionInternal.refreshUi();
    this.sectionInternal.setStatus(
      `${section.name}: ${this.formatNumber(section.width)} × ${this.formatNumber(section.height)} × ${this.formatNumber(section.depth)} m.`,
    );

    this.syncVisualState(section.id);
    this.sync();
    return true;
  }


  private syncVisualState(
    activeId: string | null,
  ): void {
    for (const [id, visual] of this.sectionInternal.visuals) {
      const active = id === activeId;

      visual.fillMaterial.opacity = active
        ? 0.075
        : 0.018;
      visual.edgeMaterial.opacity = active
        ? 0.95
        : 0.24;
      visual.arrow.visible = active;

      for (const handle of visual.handles.values()) {
        handle.visible = active;
      }
    }
  }


  private readonly handleSectionSelect =
    (): void => {
      const id = this.sectionSelect.value;

      if (id) {
        this.activateSection(id);
      }
    };


  private readonly handleDrawingSelect =
    (): void => {
      if (this.drawingSelect && !shouldSyncLegacyDrawingSelect(this.drawingSelect)) return;
      const id = this.drawingSelect?.value;

      if (!id || !this.activateSection(id)) {
        return;
      }

      this.drawingWorkspace.openActiveSection();
    };


  private readonly handlePreviousSection =
    (): void => {
      this.activateRelative(-1);
    };


  private readonly handleNextSection =
    (): void => {
      this.activateRelative(1);
    };


  private activateRelative(
    delta: number,
  ): void {
    const sections = this.sectionDrawing.getSections();

    if (sections.length < 1) {
      return;
    }

    const currentId = this.sectionDrawing
      .getActiveSection()
      ?.id;

    const foundIndex = sections.findIndex(
      (section) => section.id === currentId,
    );
    const currentIndex = foundIndex >= 0
      ? foundIndex
      : 0;
    const nextIndex = (
      currentIndex
      + delta
      + sections.length
    ) % sections.length;
    const section = sections[nextIndex];

    if (section) {
      this.activateSection(section.id);
    }
  }


  private readonly handleRenameSection =
    (): void => {
      const section = this.sectionDrawing.getActiveSection();

      if (!section) {
        return;
      }

      const value = window.prompt(
        "Nombre de la sección",
        section.name,
      );

      if (
        value === null
        || !value.trim()
        || value.trim() === section.name
      ) {
        return;
      }

      this.sectionInternal.replaceSection({
        ...section,
        name: value.trim(),
      });

      this.sync();
    };


  private readonly handleFitDrawing =
    (): void => {
      this.drawingInternal.setZoom(1);
      this.syncDrawingInfo();
    };


  private syncDrawingInfo(): void {
    if (!this.drawingInfo || !this.zoomInfo) {
      return;
    }

    const sectionId = this.drawingInternal.activeSectionId;
    const section = this.sectionDrawing
      .getSections()
      .find(
        (candidate) => candidate.id === sectionId,
      );

    const documentState = sectionId
      ? this.drawingInternal.documents.get(sectionId)
      : null;

    const annotationCount =
      documentState?.annotations.length ?? 0;

    this.zoomInfo.textContent =
      `${Math.round(this.drawingInternal.zoom * 100)}%`;

    if (!section) {
      this.drawingInfo.textContent = "Sin plano activo";
      return;
    }

    this.drawingInfo.textContent =
      `${this.shortSectionName(section.name)} · Prof. ${this.formatNumber(section.depth)} m · ${annotationCount} anot.`;
  }


  private readonly handleKeyDown =
    (
      event: KeyboardEvent,
    ): void => {
      const overlay = this.container.querySelector<HTMLElement>(
        '[data-framelogic-drawing-workspace="true"]',
      );

      if (!overlay || overlay.style.display === "none") {
        return;
      }

      const target = event.target;

      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      const tool: DrawingTool | null =
        key === "v"
          ? "SELECT"
          : key === "d"
            ? "DIMENSION"
            : key === "l"
              ? "LABEL"
              : key === "t"
                ? "TEXT"
                : null;

      if (tool) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.drawingInternal.setTool(tool);
        return;
      }

      if (key === "f") {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.handleFitDrawing();
      }
    };


  private makeButton(
    text: string,
    title: string,
  ): HTMLButtonElement {
    const button = document.createElement("button");

    button.type = "button";
    button.textContent = text;
    button.title = title;
    button.style.padding = "4px 7px";
    button.style.border =
      "1px solid rgba(255,255,255,0.16)";
    button.style.borderRadius = "4px";
    button.style.background = "#26343c";
    button.style.color = "#f1f5f7";
    button.style.cursor = "pointer";

    return button;
  }


  private styleSelect(
    select: HTMLSelectElement,
  ): void {
    select.style.minWidth = "112px";
    select.style.maxWidth = "190px";
    select.style.padding = "4px 6px";
    select.style.border =
      "1px solid rgba(255,255,255,0.16)";
    select.style.borderRadius = "4px";
    select.style.background = "#11181d";
    select.style.color = "#eef4f6";
    select.style.font = "inherit";
  }


  private shortSectionName(
    name: string,
  ): string {
    return name
      .replace(
        /^SECCI[ÓO]N\s+/i,
        "",
      )
      .trim()
      || name;
  }


  private formatNumber(
    value: number,
  ): string {
    return Number(
      value.toFixed(3),
    ).toString();
  }
}

/** Never let legacy section navigation overwrite the unified PDF dropdown. */
export function shouldSyncLegacyDrawingSelect(
  select: Pick<HTMLSelectElement, "dataset">,
): boolean {
  return select.dataset["framelogicUnifiedPdf"] !== "GENERAL_PDF";
}
