import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import type {
  CadLineSelectionController,
} from "../interaction/CadLineSelectionController";

import type {
  CadPointSelectionController,
} from "../interaction/CadPointSelectionController";

import type {
  UnifiedPdfNavigationController,
} from "../drawing/UnifiedPdfNavigationController";

interface PdfEntryRuntime {
  readonly key: string;
  readonly kind: "SECTION" | "ASSEMBLY";
  readonly targetId: string;
  readonly label: string;
}

interface UnifiedPdfRuntime {
  order: string[];
  getEntries(): PdfEntryRuntime[];
  syncOrder(entries: readonly PdfEntryRuntime[]): void;
  openSection(sectionId: string): boolean;
  openAssemblySheet(sheetId: string): boolean;
}

interface Options {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly lineScene: CadLineSceneController;
  readonly pointScene: CadPointSceneController;
  readonly lineSelection: CadLineSelectionController;
  readonly pointSelection: CadPointSelectionController;
  readonly unifiedPdfNavigation: UnifiedPdfNavigationController;
  readonly cancelActiveCommand: () => void;
  readonly deleteCadSelection: () => boolean;
}

/**
 * Completa INSTANCIAS como árbol general del Model Space.
 *
 * Además de piezas/ensambles/referencias/secciones, muestra:
 * - líneas CAD,
 * - puntos CAD,
 * - planos/PDF de sección y de ensamble en la secuencia global.
 *
 * La visibilidad individual de líneas/puntos vive en sus SceneController, de
 * modo que no se pierde al resincronizar geometría o cambiar capas.
 */
export class ModelSpaceInstanceTreeBridgeController {
  private readonly options: Options;
  private readonly pdfRuntime: UnifiedPdfRuntime;
  private readonly timer: number;
  private readonly unsubscribeLines: () => void;
  private readonly unsubscribePoints: () => void;
  private lastSignature = "";
  private contextMenu: HTMLDivElement | null = null;
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.pdfRuntime =
      options.unifiedPdfNavigation as unknown as UnifiedPdfRuntime;

    this.unsubscribeLines = options.lineSelection.subscribe(
      () => this.invalidate(),
    );
    this.unsubscribePoints = options.pointSelection.subscribe(
      () => this.invalidate(),
    );

    this.timer = window.setInterval(
      () => this.decorate(),
      250,
    );
    window.addEventListener(
      "pointerdown",
      this.handleGlobalPointerDown,
      true,
    );
    this.decorate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.unsubscribeLines();
    this.unsubscribePoints();
    window.removeEventListener(
      "pointerdown",
      this.handleGlobalPointerDown,
      true,
    );
    this.hideContextMenu();
    this.options.container
      .querySelector('[data-framelogic-cad-entity-tree="true"]')
      ?.remove();
    this.options.container
      .querySelector('[data-framelogic-pdf-tree="true"]')
      ?.remove();
  }

  private readonly handleGlobalPointerDown = (
    event: PointerEvent,
  ): void => {
    if (
      this.contextMenu
      && event.target instanceof Node
      && !this.contextMenu.contains(event.target)
    ) {
      this.hideContextMenu();
    }
  };

  private invalidate(): void {
    this.lastSignature = "";
    this.decorate();
  }

  private decorate(): void {
    if (this.disposed) return;
    const body = this.options.container.querySelector<HTMLElement>(
      '[data-framelogic-instance-tree-body="true"]',
    );
    if (!body) return;

    const lines = this.options.designModel.cadLines.getAll();
    const points = this.options.designModel.cadPoints.getAll();
    const pdfEntries = this.getOrderedPdfEntries();

    const signature = JSON.stringify({
      lines: lines.map((line) => [
        line.id,
        line.layerId,
        this.options.lineScene.isHidden(line.id),
        this.options.lineSelection.isSelected(line.id),
        line.start.x,
        line.start.y,
        line.start.z,
        line.end.x,
        line.end.y,
        line.end.z,
      ]),
      points: points.map((point) => [
        point.id,
        point.layerId,
        this.options.pointScene.isHidden(point.id),
        this.options.pointSelection.isSelected(point.id),
        point.position.x,
        point.position.y,
        point.position.z,
      ]),
      pdf: pdfEntries.map((entry, index) => [
        index,
        entry.key,
        entry.label,
        entry.kind,
      ]),
    });

    const cadDetails = this.ensureGroup(
      body,
      "cad-entity",
      "ENTIDADES CAD",
      "REFERENCIAS CAD",
    );
    const pdfDetails = this.ensureGroup(
      body,
      "pdf",
      "PLANOS / PDF",
      null,
    );

    if (this.lastSignature === signature) return;
    this.lastSignature = signature;

    const cadContent = cadDetails.querySelector<HTMLElement>(
      '[data-framelogic-tree-content="true"]',
    );
    const pdfContent = pdfDetails.querySelector<HTMLElement>(
      '[data-framelogic-tree-content="true"]',
    );
    if (!cadContent || !pdfContent) return;

    cadContent.replaceChildren();
    pdfContent.replaceChildren();

    this.renderCadEntities(cadContent, lines, points);
    this.renderPdfEntries(pdfContent, pdfEntries);
  }

  private ensureGroup(
    body: HTMLElement,
    key: "cad-entity" | "pdf",
    title: string,
    beforeTitle: string | null,
  ): HTMLDetailsElement {
    const attribute = key === "cad-entity"
      ? "framelogicCadEntityTree"
      : "framelogicPdfTree";
    let details = body.querySelector<HTMLDetailsElement>(
      `details[data-${this.toKebab(attribute)}="true"]`,
    );

    if (details) return details;

    details = document.createElement("details");
    if (key === "cad-entity") {
      details.dataset["framelogicCadEntityTree"] = "true";
    }
    else {
      details.dataset["framelogicPdfTree"] = "true";
    }
    details.open = true;

    const summary = document.createElement("summary");
    summary.textContent = title;
    Object.assign(summary.style, {
      padding: "6px 8px",
      cursor: "pointer",
      color: "#dce8ed",
      fontWeight: "600",
      userSelect: "none",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    });

    const content = document.createElement("div");
    content.dataset["framelogicTreeContent"] = "true";
    details.append(summary, content);

    if (beforeTitle) {
      const before = Array.from(
        body.querySelectorAll<HTMLDetailsElement>("details"),
      ).find((candidate) =>
        candidate.querySelector("summary")?.textContent === beforeTitle,
      );
      if (before) {
        body.insertBefore(details, before);
        return details;
      }
    }

    body.append(details);
    return details;
  }

  private toKebab(value: string): string {
    return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
  }

  private renderCadEntities(
    content: HTMLElement,
    lines: ReturnType<DesignModel["cadLines"]["getAll"]>,
    points: ReturnType<DesignModel["cadPoints"]["getAll"]>,
  ): void {
    if (lines.length < 1 && points.length < 1) {
      content.append(this.createEmpty("Sin líneas ni puntos"));
      return;
    }

    const lineBlock = this.createSubgroup("LÍNEAS", lines.length);
    lines.forEach((line, index) => {
      const length = Math.hypot(
        line.end.x - line.start.x,
        line.end.y - line.start.y,
        line.end.z - line.start.z,
      );
      lineBlock.content.append(
        this.createCadRow(
          "LINE",
          line.id,
          `╱ Línea ${index + 1}`,
          `${this.format(length)} m`,
          this.options.lineScene.isHidden(line.id),
          this.options.lineSelection.isSelected(line.id),
        ),
      );
    });
    content.append(lineBlock.details);

    const pointBlock = this.createSubgroup("PUNTOS", points.length);
    points.forEach((point, index) => {
      pointBlock.content.append(
        this.createCadRow(
          "POINT",
          point.id,
          `• Punto ${index + 1}`,
          `${this.format(point.position.x)}, ${this.format(point.position.y)}, ${this.format(point.position.z)}`,
          this.options.pointScene.isHidden(point.id),
          this.options.pointSelection.isSelected(point.id),
        ),
      );
    });
    content.append(pointBlock.details);
  }

  private createCadRow(
    kind: "LINE" | "POINT",
    id: string,
    label: string,
    metaText: string,
    hidden: boolean,
    selected: boolean,
  ): HTMLDivElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "22px minmax(0,1fr) auto",
      gap: "5px",
      alignItems: "center",
      padding: "4px 8px 4px 16px",
      cursor: "pointer",
      borderBottom: "1px solid rgba(255,255,255,0.03)",
      background: selected ? "rgba(88,180,220,0.20)" : "transparent",
      color: hidden ? "#71838c" : selected ? "#dff6ff" : "#c8d5db",
      userSelect: "none",
    });

    const eye = document.createElement("button");
    eye.type = "button";
    eye.textContent = hidden ? "○" : "◉";
    eye.title = hidden ? "Mostrar" : "Ocultar";
    Object.assign(eye.style, {
      width: "20px",
      height: "18px",
      padding: "0",
      border: "0",
      background: "transparent",
      color: hidden ? "#71838c" : "#cfe8f3",
      cursor: "pointer",
    });
    eye.addEventListener("pointerdown", (event) => event.stopPropagation());
    eye.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleCadVisibility(kind, id);
    });

    const name = document.createElement("span");
    name.textContent = label;
    name.style.whiteSpace = "nowrap";
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";

    const meta = document.createElement("span");
    meta.textContent = metaText;
    meta.style.color = "#7f949e";
    meta.style.fontSize = "10px";

    row.append(eye, name, meta);
    row.title = "Clic = seleccionar · Ctrl+clic = selección múltiple · clic derecho = opciones";
    row.addEventListener("click", (event) => {
      this.selectCad(kind, id, event.ctrlKey || event.metaKey);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.showCadContextMenu(
        event.clientX,
        event.clientY,
        kind,
        id,
      );
    });
    return row;
  }

  private selectCad(
    kind: "LINE" | "POINT",
    id: string,
    additive: boolean,
  ): void {
    this.options.cancelActiveCommand();
    if (kind === "LINE") {
      if (additive) this.options.lineSelection.toggle(id, true);
      else this.options.lineSelection.selectSingle(id);
    }
    else {
      if (additive) this.options.pointSelection.toggle(id, true);
      else this.options.pointSelection.selectSingle(id);
    }
    this.invalidate();
  }

  private toggleCadVisibility(kind: "LINE" | "POINT", id: string): void {
    if (kind === "LINE") {
      const hidden = !this.options.lineScene.isHidden(id);
      this.options.lineScene.setHidden(id, hidden);
      if (hidden && this.options.lineSelection.isSelected(id)) {
        this.options.lineSelection.toggle(id, true);
      }
    }
    else {
      const hidden = !this.options.pointScene.isHidden(id);
      this.options.pointScene.setHidden(id, hidden);
      if (hidden && this.options.pointSelection.isSelected(id)) {
        this.options.pointSelection.toggle(id, true);
      }
    }
    this.invalidate();
  }

  private renderPdfEntries(
    content: HTMLElement,
    entries: readonly PdfEntryRuntime[],
  ): void {
    if (entries.length < 1) {
      content.append(this.createEmpty("Sin planos PDF"));
      return;
    }

    entries.forEach((entry, index) => {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid",
        gridTemplateColumns: "26px minmax(0,1fr) auto",
        gap: "5px",
        alignItems: "center",
        padding: "5px 8px",
        cursor: "pointer",
        borderBottom: "1px solid rgba(255,255,255,0.035)",
        color: "#c8d5db",
        userSelect: "none",
      });

      const number = document.createElement("span");
      number.textContent = String(index + 1);
      number.style.color = "#79c9ea";
      number.style.fontWeight = "700";

      const name = document.createElement("span");
      name.textContent = entry.label;
      name.style.whiteSpace = "nowrap";
      name.style.overflow = "hidden";
      name.style.textOverflow = "ellipsis";

      const type = document.createElement("span");
      type.textContent = entry.kind === "SECTION" ? "SECCIÓN" : "ENSAMBLE";
      type.style.color = "#7f949e";
      type.style.fontSize = "9px";

      row.append(number, name, type);
      row.title = "Abrir plano PDF";
      row.addEventListener("click", () => this.openPdf(entry));
      row.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openPdf(entry);
      });
      content.append(row);
    });
  }

  private getOrderedPdfEntries(): PdfEntryRuntime[] {
    const entries = this.pdfRuntime.getEntries();
    this.pdfRuntime.syncOrder(entries);
    return this.pdfRuntime.order
      .map((key) => entries.find((entry) => entry.key === key))
      .filter((entry): entry is PdfEntryRuntime => Boolean(entry));
  }

  private openPdf(entry: PdfEntryRuntime): void {
    if (entry.kind === "SECTION") {
      this.pdfRuntime.openSection(entry.targetId);
    }
    else {
      this.pdfRuntime.openAssemblySheet(entry.targetId);
    }
  }

  private showCadContextMenu(
    x: number,
    y: number,
    kind: "LINE" | "POINT",
    id: string,
  ): void {
    this.hideContextMenu();
    const hidden = kind === "LINE"
      ? this.options.lineScene.isHidden(id)
      : this.options.pointScene.isHidden(id);

    const menu = document.createElement("div");
    Object.assign(menu.style, {
      position: "fixed",
      left: `${x}px`,
      top: `${y}px`,
      zIndex: "10030",
      minWidth: "180px",
      padding: "4px",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: "5px",
      background: "rgba(19,27,33,0.98)",
      boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
      font: "12px system-ui, sans-serif",
    });

    const actions: Array<[string, () => void]> = [
      ["Seleccionar", () => this.selectCad(kind, id, false)],
      [hidden ? "Mostrar" : "Ocultar", () => this.toggleCadVisibility(kind, id)],
      ["Eliminar", () => {
        this.selectCad(kind, id, false);
        this.options.deleteCadSelection();
        this.invalidate();
      }],
    ];

    actions.forEach(([label, action]) => {
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
      });
      button.addEventListener("click", () => {
        action();
        this.hideContextMenu();
      });
      menu.append(button);
    });

    document.body.append(menu);
    this.contextMenu = menu;
  }

  private createSubgroup(
    title: string,
    count: number,
  ): {
    readonly details: HTMLDetailsElement;
    readonly content: HTMLDivElement;
  } {
    const details = document.createElement("details");
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = `${title} · ${count}`;
    Object.assign(summary.style, {
      padding: "5px 10px",
      cursor: "pointer",
      color: "#9fb2bc",
      fontSize: "10px",
      fontWeight: "600",
      userSelect: "none",
    });
    const content = document.createElement("div");
    details.append(summary, content);
    return { details, content };
  }

  private createEmpty(label: string): HTMLDivElement {
    const empty = document.createElement("div");
    empty.textContent = label;
    Object.assign(empty.style, {
      padding: "5px 10px",
      color: "#70838c",
      fontSize: "11px",
    });
    return empty;
  }

  private hideContextMenu(): void {
    this.contextMenu?.remove();
    this.contextMenu = null;
  }

  private format(value: number): string {
    if (!Number.isFinite(value)) return "0";
    return Number(value.toFixed(3)).toString();
  }
}
