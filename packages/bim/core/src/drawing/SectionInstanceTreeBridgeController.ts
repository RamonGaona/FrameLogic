import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";

interface SectionVisualRuntime {
  readonly group: {
    visible: boolean;
  };
}

interface SectionDrawingRuntime {
  activeSectionId: string | null;
  readonly visuals: Map<string, SectionVisualRuntime>;
  refreshUi(): void;
  replaceSection(section: SectionViewDefinition): void;
  removeActiveSection(): boolean;
  setStatus(message: string): void;
}

interface Options {
  readonly container: HTMLElement;
  readonly sectionDrawing: SectionDrawingController;
  readonly drawingWorkspace: DrawingWorkspaceController;
}

export class SectionInstanceTreeBridgeController {
  private readonly options: Options;
  private readonly runtime: SectionDrawingRuntime;
  private readonly hidden = new Set<string>();
  private readonly timer: number;
  private contextMenu: HTMLDivElement | null = null;
  private lastSignature = "";
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.runtime = options.sectionDrawing as unknown as SectionDrawingRuntime;
    this.decorate();
    this.timer = window.setInterval(() => this.decorate(), 300);
    window.addEventListener("pointerdown", this.handleGlobalPointerDown, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    window.removeEventListener("pointerdown", this.handleGlobalPointerDown, true);
    this.hideContextMenu();
    this.options.container
      .querySelector('[data-framelogic-section-tree="true"]')
      ?.remove();
  }

  private readonly handleGlobalPointerDown = (event: PointerEvent): void => {
    if (
      this.contextMenu
      && event.target instanceof Node
      && !this.contextMenu.contains(event.target)
    ) {
      this.hideContextMenu();
    }
  };

  private decorate(): void {
    if (this.disposed) return;
    const body = this.options.container.querySelector<HTMLElement>(
      '[data-framelogic-instance-tree-body="true"]',
    );
    if (!body) return;

    this.reapplyHiddenVisibility();

    const sections = this.options.sectionDrawing.getSections();
    const activeId = this.options.sectionDrawing.getActiveSection()?.id ?? null;
    const signature = sections
      .map((section) =>
        `${section.id}:${section.name}:${section.depth}:${this.hidden.has(section.id)}`,
      )
      .join("|") + `|active:${activeId}`;

    let details = body.querySelector<HTMLDetailsElement>(
      'details[data-framelogic-section-tree="true"]',
    );
    const created = !details;

    if (!details) {
      details = document.createElement("details");
      details.dataset["framelogicSectionTree"] = "true";
      details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = "VISTAS DE SECCIÓN";
      Object.assign(summary.style, {
        padding: "6px 8px",
        cursor: "pointer",
        color: "#dce8ed",
        fontWeight: "600",
        userSelect: "none",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      });
      const content = document.createElement("div");
      content.dataset["framelogicSectionTreeContent"] = "true";
      details.append(summary, content);

      const cad = Array.from(body.querySelectorAll<HTMLDetailsElement>("details"))
        .find((candidate) =>
          candidate.querySelector("summary")?.textContent === "REFERENCIAS CAD",
        );
      if (cad) body.insertBefore(details, cad);
      else body.append(details);
    }

    if (!created && this.lastSignature === signature) return;
    this.lastSignature = signature;

    const content = details.querySelector<HTMLElement>(
      '[data-framelogic-section-tree-content="true"]',
    );
    if (!content) return;
    content.replaceChildren();

    if (sections.length < 1) {
      const empty = document.createElement("div");
      empty.textContent = "Sin vistas de sección";
      Object.assign(empty.style, {
        padding: "5px 10px",
        color: "#70838c",
        fontSize: "11px",
      });
      content.append(empty);
      return;
    }

    for (const section of sections) {
      content.append(this.createRow(section, section.id === activeId));
    }
  }

  private createRow(
    section: SectionViewDefinition,
    selected: boolean,
  ): HTMLDivElement {
    const hidden = this.hidden.has(section.id);
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "22px 1fr auto",
      gap: "5px",
      alignItems: "center",
      padding: "4px 8px",
      cursor: "pointer",
      borderBottom: "1px solid rgba(255,255,255,0.035)",
      background: selected ? "rgba(88,180,220,0.20)" : "transparent",
      color: hidden ? "#71838c" : selected ? "#dff6ff" : "#c8d5db",
      userSelect: "none",
    });

    const eye = document.createElement("button");
    eye.type = "button";
    eye.textContent = hidden ? "○" : "◉";
    eye.title = hidden ? "Mostrar sección" : "Ocultar sección";
    Object.assign(eye.style, {
      width: "20px",
      height: "18px",
      padding: "0",
      border: "0",
      background: "transparent",
      color: hidden ? "#71838c" : "#cfe8f3",
      cursor: "pointer",
      font: "12px system-ui, sans-serif",
    });
    eye.addEventListener("pointerdown", (event) => event.stopPropagation());
    eye.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleVisibility(section.id);
    });

    const name = document.createElement("span");
    name.textContent = `▱ ${section.name}`;
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";
    name.style.whiteSpace = "nowrap";

    const meta = document.createElement("span");
    meta.textContent = `${this.format(section.depth)} m`;
    meta.style.color = "#7f949e";
    meta.style.fontSize = "10px";

    row.append(eye, name, meta);
    row.title = "Clic = activar · doble clic = abrir plano · clic derecho = opciones";
    row.addEventListener("click", () => this.activate(section.id));
    row.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openDrawing(section.id);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.activate(section.id);
      this.showContextMenu(event.clientX, event.clientY, section.id);
    });
    return row;
  }

  private activate(sectionId: string): boolean {
    const section = this.findSection(sectionId);
    if (!section) return false;
    this.runtime.activeSectionId = section.id;
    this.runtime.refreshUi();
    this.runtime.setStatus(
      `${section.name}: ${this.format(section.width)} × ${this.format(section.height)} × ${this.format(section.depth)} m.`,
    );
    this.lastSignature = "";
    this.decorate();
    return true;
  }

  private openDrawing(sectionId: string): void {
    if (!this.activate(sectionId)) return;
    this.options.drawingWorkspace.openActiveSection();
  }

  private toggleVisibility(sectionId: string): void {
    const visual = this.runtime.visuals.get(sectionId);
    if (this.hidden.has(sectionId)) {
      this.hidden.delete(sectionId);
      if (visual) visual.group.visible = true;
    }
    else {
      this.hidden.add(sectionId);
      if (visual) visual.group.visible = false;
    }
    this.lastSignature = "";
    this.decorate();
  }

  private reapplyHiddenVisibility(): void {
    const existing = new Set(
      this.options.sectionDrawing.getSections().map((section) => section.id),
    );
    for (const id of Array.from(this.hidden)) {
      if (!existing.has(id)) {
        this.hidden.delete(id);
        continue;
      }
      const visual = this.runtime.visuals.get(id);
      if (visual) visual.group.visible = false;
    }
  }

  private rename(sectionId: string): void {
    const section = this.findSection(sectionId);
    if (!section) return;
    const name = window.prompt(
      "Nuevo nombre de la vista de sección",
      section.name,
    )?.trim();
    if (!name || name === section.name) return;
    this.runtime.replaceSection({ ...section, name });
    this.lastSignature = "";
    this.decorate();
  }

  private remove(sectionId: string): void {
    const section = this.findSection(sectionId);
    if (!section) return;
    if (!window.confirm(`¿Eliminar ${section.name}?`)) return;
    this.runtime.activeSectionId = section.id;
    this.runtime.removeActiveSection();
    this.hidden.delete(section.id);
    this.lastSignature = "";
    this.decorate();
  }

  private findSection(sectionId: string): SectionViewDefinition | undefined {
    return this.options.sectionDrawing
      .getSections()
      .find((section) => section.id === sectionId);
  }

  private showContextMenu(x: number, y: number, sectionId: string): void {
    this.hideContextMenu();
    const menu = document.createElement("div");
    Object.assign(menu.style, {
      position: "fixed",
      left: `${x}px`,
      top: `${y}px`,
      zIndex: "10020",
      minWidth: "210px",
      padding: "4px",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: "5px",
      background: "rgba(19,27,33,0.98)",
      boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
      font: "12px system-ui, sans-serif",
    });

    const entries: Array<[string, () => void]> = [
      ["Abrir plano PDF", () => this.openDrawing(sectionId)],
      [this.hidden.has(sectionId) ? "Mostrar vista" : "Ocultar vista", () => this.toggleVisibility(sectionId)],
      ["Renombrar vista", () => this.rename(sectionId)],
      ["Eliminar vista", () => this.remove(sectionId)],
    ];

    for (const [label, action] of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      Object.assign(button.style, {
        display: "block",
        width: "100%",
        padding: "6px 8px",
        border: "0",
        borderRadius: "3px",
        background: "transparent",
        color: "#e7f0f4",
        textAlign: "left",
        cursor: "pointer",
        font: "12px system-ui, sans-serif",
      });
      button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(100,190,230,0.16)";
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "transparent";
      });
      button.addEventListener("click", () => {
        action();
        this.hideContextMenu();
      });
      menu.append(button);
    }

    document.body.append(menu);
    this.contextMenu = menu;
  }

  private hideContextMenu(): void {
    this.contextMenu?.remove();
    this.contextMenu = null;
  }

  private format(value: number): string {
    return Number.isFinite(value)
      ? value.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")
      : "0";
  }
}
