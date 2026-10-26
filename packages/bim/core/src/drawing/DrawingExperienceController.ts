import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";

import type * as THREE from "three";


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
  activeSectionId:
    string | null;
  readonly sections:
    SectionViewDefinition[];
  readonly visuals:
    Map<string, SectionVisualInternal>;
  refreshUi(): void;
  setStatus(
    message: string,
  ): void;
  replaceSection(
    section: SectionViewDefinition,
  ): void;
}


interface DrawingDocumentInternal {
  readonly annotations:
    readonly unknown[];
}


interface DrawingWorkspaceInternal {
  activeSectionId:
    string | null;
  zoom: number;
  readonly documents:
    Map<string, DrawingDocumentInternal>;
  setTool(
    tool: DrawingTool,
  ): void;
  setZoom(
    value: number,
  ): void;
}


export interface DrawingExperienceControllerOptions {
  readonly container:
    HTMLElement;
  readonly sectionDrawing:
    SectionDrawingController;
  readonly drawingWorkspace:
    DrawingWorkspaceController;
}


/**
 * Pulido de experiencia para planos y secciones.
 *
 * Este controlador no cambia el modelo de datos. Solo añade:
 * - selector A-A / B-B / C-C en Model Space;
 * - anterior / siguiente;
 * - renombrado de sección;
 * - atenuación de secciones inactivas;
 * - selector de sección dentro del Drawing Workspace;
 * - indicador de zoom, profundidad y cantidad de anotaciones;
 * - atajos de teclado para las herramientas del plano.
 */
export class DrawingExperienceController {
  private readonly container:
    HTMLElement;

  private readonly sectionDrawing:
    SectionDrawingController;

  private readonly drawingWorkspace:
    DrawingWorkspaceController;

  private readonly sectionInternal:
    SectionDrawingInternal;

  private readonly drawingInternal:
    DrawingWorkspaceInternal;

  private readonly sectionSelect:
    HTMLSelectElement;

  private readonly drawingSelect:
    HTMLSelectElement | null;

  private readonly drawingInfo:
    HTMLSpanElement | null;

  private readonly zoomInfo:
    HTMLSpanElement | null;

  private readonly timer:
    number;

  private disposed =
    false;


  constructor(
    options: DrawingExperienceControllerOptions,
  ) {
    this.container =
      options.container;
    this.sectionDrawing =
      options.sectionDrawing;
    this.drawingWorkspace =
      options.drawingWorkspace;
    this.sectionInternal =
      options.sectionDrawing
      as unknown
      as SectionDrawingInternal;
    this.drawingInternal =
      options.drawingWorkspace
      as unknown
      as DrawingWorkspaceInternal;

    const sectionPanel =
      this.container.querySelector<HTMLElement>(
        '[data-framelogic-section-panel="true"]',
      );

    const sectionSelect =
      document.createElement(
        "select",
      );

    sectionSelect.title =
      "Sección activa";
    this.styleSelect(
      sectionSelect,
    );
    this.sectionSelect =
      sectionSelect;

    if (sectionPanel) {
      const previousButton =
        this.makeButton(
          "‹",
          "Sección anterior",
        );
      const nextButton =
        this.makeButton(
          "›",
          "Sección siguiente",
        );
      const renameButton =
        this.makeButton(
          "Nombre",
          "Renombrar sección",
        );

      const title =
        Array.from(
          sectionPanel.children,
        ).find(
          (
            child,
          ) =>
            child.textContent
            === "SECCIÓN",
        )
        ?? sectionPanel.firstChild;

      if (title) {
        title.after(
          previousButton,
          sectionSelect,
          nextButton,
          renameButton,
        );
      }
      else {
        sectionPanel.prepend(
          previousButton,
          sectionSelect,
          nextButton,
          renameButton,
        );
      }

      sectionSelect.addEventListener(
        "change",
        this.handleSectionSelect,
      );
      previousButton.addEventListener(
        "click",
        this.handlePreviousSection,
      );
      nextButton.addEventListener(
        "click",
        this.handleNextSection,
      );
      renameButton.addEventListener(
        "click",
        this.handleRenameSection,
      );
    }

    const drawingOverlay =
      this.container.querySelector<HTMLElement>(
        '[data-framelogic-drawing-workspace="true"]',
      );
    const toolbar =
      drawingOverlay
        ?.firstElementChild
        as HTMLElement | null;

    if (toolbar) {
      const divider =
        document.createElement(
          "span",
        );
      divider.textContent =
        "Sección";
      divider.style.opacity =
        "0.7";
      divider.style.marginLeft =
        "4px";

      const drawingSelect =
        document.createElement(
          "select",
        );
      drawingSelect.title =
        "Cambiar plano de sección";
      this.styleSelect(
        drawingSelect,
      );
      drawingSelect.addEventListener(
        "change",
        this.handleDrawingSelect,
      );

      const fitButton =
        this.makeButton(
          "Ajustar",
          "Volver a zoom 100%",
        );
      fitButton.addEventListener(
        "click",
        this.handleFitDrawing,
      );

      const zoomInfo =
        document.createElement(
          "span",
        );
      zoomInfo.style.minWidth =
        "42px";
      zoomInfo.style.textAlign =
        "center";
      zoomInfo.style.opacity =
        "0.75";

      const drawingInfo =
        document.createElement(
          "span",
        );
      drawingInfo.style.padding =
        "3px 7px";
      drawingInfo.style.borderRadius =
        "999px";
      drawingInfo.style.background =
        "rgba(255,255,255,0.08)";
      drawingInfo.style.color =
        "#c9d6dc";
      drawingInfo.style.whiteSpace =
        "nowrap";

      const backButton =
        toolbar.querySelector(
          "button",
        );
      const titleElement =
        backButton
          ?.nextElementSibling
        ?? toolbar.firstElementChild;

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
        Array.from(
          toolbar.querySelectorAll(
            "button",
          ),
        ).find(
          (
            button,
          ) =>
            button.textContent
            === "Exportar PDF",
        );

      if (exportButton) {
        exportButton.before(
          fitButton,
          zoomInfo,
        );
      }
      else {
        toolbar.append(
          fitButton,
          zoomInfo,
        );
      }

      this.drawingSelect =
        drawingSelect;
      this.drawingInfo =
        drawingInfo;
      this.zoomInfo =
        zoomInfo;
    }
    else {
      this.drawingSelect =
        null;
      this.drawingInfo =
        null;
      this.zoomInfo =
        null;
    }

    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    this.sync();
    this.timer =
      window.setInterval(
        () =>
          this.sync(),
        300,
      );
  }


  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed =
      true;
    window.clearInterval(
      this.timer,
    );
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
  }


  private sync(): void {
    const sections =
      this.sectionDrawing
        .getSections();
    const active =
      this.sectionDrawing
        .getActiveSection();

    this.syncSelect(
      this.sectionSelect,
      sections,
      active?.id
      ?? null,
    );

    if (this.drawingSelect) {
      this.syncSelect(
        this.drawingSelect,
        sections,
        this.drawingInternal
          .activeSectionId,
      );
    }

    this.syncVisualState(
      active?.id
      ?? null,
    );
    this.syncDrawingInfo();
  }


  private syncSelect(
    select: HTMLSelectElement,
    sections:
      readonly SectionViewDefinition[],
    selectedId:
      string | null,
  ): void {
    const signature =
      sections
        .map(
          (
            section,
          ) =>
            `${section.id}:${section.name}:${section.depth}`,
        )
        .join(
          "|",
        );

    if (
      select.dataset["signature"]
      !== signature
    ) {
      select.replaceChildren();

      if (sections.length < 1) {
        const option =
          document.createElement(
            "option",
          );
        option.value =
          "";
        option.textContent =
          "Sin secciones";
        select.append(
          option,
        );
      }
      else {
        for (
          const section
          of sections
        ) {
          const option =
            document.createElement(
              "option",
            );
          option.value =
            section.id;
          option.textContent =
            `${this.shortSectionName(section.name)} · ${this.formatNumber(section.depth)} m`;
          select.append(
            option,
          );
        }
      }

      select.dataset["signature"] =
        signature;
    }

    select.disabled =
      sections.length < 1;

    if (
      selectedId
      && Array.from(
        select.options,
      ).some(
        (
          option,
        ) =>
          option.value
          === selectedId,
      )
    ) {
      select.value =
        selectedId;
    }
  }


  private activateSection(
    sectionId: string,
  ): boolean {
    const section =
      this.sectionDrawing
        .getSections()
        .find(
          (
            candidate,
          ) =>
            candidate.id
            === sectionId,
        );

    if (!section) {
      return false;
    }

    this.sectionInternal
      .activeSectionId =
        section.id;
    this.sectionInternal
      .refreshUi();
    this.sectionInternal
      .setStatus(
        `${section.name}: ${this.formatNumber(section.width)} × ${this.formatNumber(section.height)} × ${this.formatNumber(section.depth)} m.`,
      );
    this.syncVisualState(
      section.id,
    );
    this.sync();
    return true;
  }


  private syncVisualState(
    activeId: string | null,
  ): void {
    for (
      const [
        id,
        visual,
      ]
      of this.sectionInternal.visuals
    ) {
      const active =
        id === activeId;

      visual.fillMaterial.opacity =
        active
          ? 0.075
          : 0.018;
      visual.edgeMaterial.opacity =
        active
          ? 0.95
          : 0.24;
      visual.arrow.visible =
        active;

      for (
        const handle
        of visual.handles.values()
      ) {
        handle.visible =
          active;
      }
    }
  }


  private readonly handleSectionSelect =
    (): void => {
      if (
        this.sectionSelect.value
      ) {
        this.activateSection(
          this.sectionSelect.value,
        );
      }
    };


  private readonly handleDrawingSelect =
    (): void => {
      const id =
        this.drawingSelect?.value;

      if (
        !id
        || !this.activateSection(
          id,
        )
      ) {
        return;
      }

      this.drawingWorkspace
        .openActiveSection();
    };


  private readonly handlePreviousSection =
    (): void => {
      this.activateRelative(
        -1,
      );
    };


  private readonly handleNextSection =
    (): void => {
      this.activateRelative(
        1,
      );
    };


  private activateRelative(
    delta: number,
  ): void {
    const sections =
      this.sectionDrawing
        .getSections();

    if (sections.length < 1) {
      return;
    }

    const currentId =
      this.sectionDrawing
        .getActiveSection()
        ?.id;
    const currentIndex =
      Math.max(
        0,
        sections.findIndex(
          (
            section,
          ) =>
            section.id
            === currentId,
        ),
      );
    const nextIndex =
      (
        currentIndex
        + delta
        + sections.length
      )
      % sections.length;
    const section =
      sections[nextIndex];

    if (section) {
      this.activateSection(
        section.id,
      );
    }
  }


  private readonly handleRenameSection =
    (): void => {
      const section =
        this.sectionDrawing
          .getActiveSection();

      if (!section) {
        return;
      }

      const value =
        window.prompt(
          "Nombre de la sección",
          section.name,
        );

      if (
        value === null
        || !value.trim()
        || value.trim()
        === section.name
      ) {
        return;
      }

      this.sectionInternal
        .replaceSection({
          ...section,
          name:
            value.trim(),
        });
      this.sync();
    };


  private readonly handleFitDrawing =
    (): void => {
      this.drawingInternal
        .setZoom(
          1,
        );
      this.syncDrawingInfo();
    };


  private syncDrawingInfo(): void {
    if (
      !this.drawingInfo
      || !this.zoomInfo
    ) {
      return;
    }

    const sectionId =
      this.drawingInternal
        .activeSectionId;
    const section =
      this.sectionDrawing
        .getSections()
        .find(
          (
            candidate,
          ) =>
            candidate.id
            === sectionId,
        );
    const documentState =
      sectionId
        ? this.drawingInternal
          .documents
          .get(
            sectionId,
          )
        : null;
    const annotationCount =
      documentState
        ?.annotations.length
      ?? 0;

    this.zoomInfo.textContent =
      `${Math.round(this.drawingInternal.zoom * 100)}%`;

    if (!section) {
      this.drawingInfo.textContent =
        "Sin plano activo";
      return;
    }

    this.drawingInfo.textContent =
      `${this.shortSectionName(section.name)} · Prof. ${this.formatNumber(section.depth)} m · ${annotationCount} anot.`;
  }


  private readonly handleKeyDown =
    (
      event: KeyboardEvent,
    ): void => {
      const overlay =
        this.container.querySelector<HTMLElement>(
          '[data-framelogic-drawing-workspace="true"]',
        );

      if (
        !overlay
        || overlay.style.display
        === "none"
      ) {
        return;
      }

      const target =
        event.target;

      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
      ) {
        return;
      }

      const key =
        event.key.toLowerCase();
      const tool:
        DrawingTool | null =
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
        this.drawingInternal
          .setTool(
            tool,
          );
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
  ):
    HTMLButtonElement {
    const button =
      document.createElement(
        "button",
      );

    button.type =
      "button";
    button.textContent =
      text;
    button.title =
      title;
    button.style.padding =
      "4px 7px";
    button.style.border =
      "1px solid rgba(255,255,255,0.16)";
    button.style.borderRadius =
      "4px";
    button.style.background =
      "#26343c";
    button.style.color =
      "#f1f5f7";
    button.style.cursor =
      "pointer";

    return button;
  }


  private styleSelect(
    select: HTMLSelectElement,
  ): void {
    select.style.minWidth =
      "112px";
    select.style.maxWidth =
      "190px";
    select.style.padding =
      "4px 6px";
    select.style.border =
      "1px solid rgba(255,255,255,0.16)";
    select.style.borderRadius =
      "4px";
    select.style.background =
      "#11181d";
    select.style.color =
      "#eef4f6";
    select.style.font =
      "inherit";
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
      value.toFixed(
        3,
      ),
    ).toString();
  }
}
