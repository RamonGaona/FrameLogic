import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadWorkPlaneController,
} from "../interaction/CadWorkPlaneController";

import type {
  AssemblyPdfController,
} from "./AssemblyPdfController";


interface AssemblyPdfTreeBridgeControllerOptions {
  readonly designModel: DesignModel;
  readonly workPlane: CadWorkPlaneController;
  readonly assemblyPdf: AssemblyPdfController;
}

interface AssemblyPdfViewRuntime {
  readonly id: string;
  readonly assemblyId: string;
  readonly assemblyName: string;
  readonly instanceIds: readonly string[];
}

interface AssemblyPdfSheetRuntime {
  readonly id: string;
  readonly name: string;
  readonly views: readonly AssemblyPdfViewRuntime[];
}

interface AssemblyPdfRuntime {
  readonly overlay: HTMLDivElement;
  readonly sheets: readonly AssemblyPdfSheetRuntime[];
  readonly activeSheetId: string | null;
}

interface PdfTreePanel {
  readonly panel: HTMLDivElement;
  readonly content: HTMLDivElement;
}

/**
 * Integra las hojas PDF con el árbol de INSTANCIAS.
 *
 * Ensambles y piezas individuales comparten las mismas hojas PDF y el
 * WorkPlane activo. "Enviar a PDF" vive únicamente en el menú contextual
 * para mantener limpio el árbol. Los IDs cortos de instancia permanecen como
 * dato interno y no se muestran al usuario.
 *
 * También construye un árbol VIEWS dentro de los dos espacios PDF:
 * - sección: muestra todas las PieceInstance del modelo;
 * - ensamble/pieza: cada view muestra únicamente sus instanceIds.
 *
 * En secciones no se muestra todavía un ojo de pertenencia al corte porque
 * este bridge no debe inferirlo a partir de la proyección 2D. Ese estado se
 * añadirá cuando quede enlazado directamente al resultado geométrico del corte.
 */
export class AssemblyPdfTreeBridgeController {
  private readonly options: AssemblyPdfTreeBridgeControllerOptions;
  private readonly assemblyRuntime: AssemblyPdfRuntime;
  private readonly timer: number;
  private lastSectionTreeSignature = "";
  private lastAssemblyTreeSignature = "";
  private disposed = false;

  constructor(options: AssemblyPdfTreeBridgeControllerOptions) {
    this.options = options;
    this.assemblyRuntime =
      options.assemblyPdf as unknown as AssemblyPdfRuntime;
    this.decorate();
    this.timer = window.setInterval(() => this.decorate(), 350);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    document
      .querySelectorAll<HTMLElement>(
        '[data-framelogic-pdf-view-tree]',
      )
      .forEach((element) => element.remove());
  }

  private decorate(): void {
    if (this.disposed) return;

    this.installOpenPdfButton();
    this.decoratePdfViewTrees();

    const body = document.querySelector<HTMLElement>(
      '[data-framelogic-instance-tree-body="true"]',
    );
    if (!body) return;

    for (const button of body.querySelectorAll<HTMLButtonElement>(
      'button[data-framelogic-pdf-target]',
    )) {
      button.remove();
    }

    const rows = Array.from(
      body.querySelectorAll<HTMLDivElement>("div"),
    );

    this.decorateAssemblies(rows);
    this.decoratePieces(rows);
  }

  private decoratePdfViewTrees(): void {
    this.decorateSectionPdfViewTree();
    this.decorateAssemblyPdfViewTree();
  }

  private decorateSectionPdfViewTree(): void {
    const overlay = document.querySelector<HTMLDivElement>(
      '[data-framelogic-drawing-workspace="true"]',
    );
    if (!overlay || overlay.style.display === "none") return;

    const tree = this.ensurePdfTreePanel(
      overlay,
      "SECTION",
    );
    const sectionName =
      this.readSectionPdfName(overlay)
      || "Sección";
    const pieces =
      this.options.designModel
        .pieceInstances
        .getAll();
    const signature = [
      sectionName,
      ...pieces.map((piece) =>
        `${piece.id}:${piece.name ?? ""}:${piece.definitionId}`,
      ),
    ].join("|");

    if (signature === this.lastSectionTreeSignature) return;
    this.lastSectionTreeSignature = signature;
    tree.content.replaceChildren();

    const view = this.createViewDetails(
      `▱ ${sectionName}`,
      `SECCIÓN · ${pieces.length} instancias`,
    );

    if (pieces.length < 1) {
      view.content.append(
        this.createEmptyRow("Sin instancias en el modelo"),
      );
    }
    else {
      for (const piece of pieces) {
        view.content.append(
          this.createInstanceRow(
            piece.id,
            false,
          ),
        );
      }
    }

    tree.content.append(view.details);
  }

  private decorateAssemblyPdfViewTree(): void {
    const overlay = this.assemblyRuntime.overlay;
    if (!overlay || overlay.style.display === "none") return;

    const tree = this.ensurePdfTreePanel(
      overlay,
      "ASSEMBLY",
    );
    const sheet = this.assemblyRuntime.sheets.find(
      (candidate) =>
        candidate.id === this.assemblyRuntime.activeSheetId,
    );

    const signature = sheet
      ? [
          sheet.id,
          sheet.name,
          ...sheet.views.map((view) =>
            `${view.id}:${view.assemblyId}:${view.assemblyName}:${view.instanceIds.join(",")}`,
          ),
        ].join("|")
      : "NO_ACTIVE_SHEET";

    if (signature === this.lastAssemblyTreeSignature) return;
    this.lastAssemblyTreeSignature = signature;
    tree.content.replaceChildren();

    if (!sheet) {
      tree.content.append(
        this.createEmptyRow("Sin hoja PDF activa"),
      );
      return;
    }

    if (sheet.views.length < 1) {
      tree.content.append(
        this.createEmptyRow("La hoja no contiene views"),
      );
      return;
    }

    for (const view of sheet.views) {
      const isPiece =
        view.assemblyId.startsWith("piece:");
      const kind = isPiece
        ? "PIEZA / INSTANCIA"
        : "ENSAMBLE";
      const item = this.createViewDetails(
        `▱ ${view.assemblyName}`,
        `${kind} · ${view.instanceIds.length} componente${view.instanceIds.length === 1 ? "" : "s"}`,
      );

      if (view.instanceIds.length < 1) {
        item.content.append(
          this.createEmptyRow("Sin componentes"),
        );
      }
      else {
        for (const instanceId of view.instanceIds) {
          item.content.append(
            this.createInstanceRow(
              instanceId,
              true,
            ),
          );
        }
      }

      tree.content.append(item.details);
    }
  }

  private ensurePdfTreePanel(
    overlay: HTMLDivElement,
    kind: "SECTION" | "ASSEMBLY",
  ): PdfTreePanel {
    let panel = overlay.querySelector<HTMLDivElement>(
      `div[data-framelogic-pdf-view-tree="${kind}"]`,
    );

    if (!panel) {
      panel = document.createElement("div");
      panel.dataset["framelogicPdfViewTree"] = kind;
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

      panel.append(header, content);
      overlay.append(panel);
    }

    const content = panel.querySelector<HTMLDivElement>(
      'div[data-framelogic-pdf-view-tree-content="true"]',
    );

    if (!content) {
      throw new Error("FrameLogic PDF VIEWS tree content is missing.");
    }

    return {
      panel,
      content,
    };
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
    Object.assign(details.style, {
      borderBottom: "1px solid rgba(255,255,255,0.055)",
    });

    const summary = document.createElement("summary");
    Object.assign(summary.style, {
      padding: "7px 8px",
      cursor: "pointer",
      userSelect: "none",
      color: "#dce8ed",
    });

    const labelRow = document.createElement("div");
    labelRow.textContent = label;
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

    return {
      details,
      content,
    };
  }

  private createInstanceRow(
    instanceId: string,
    showIncludedEye: boolean,
  ): HTMLDivElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: showIncludedEye
        ? "22px minmax(0, 1fr)"
        : "minmax(0, 1fr)",
      gap: "5px",
      alignItems: "center",
      minHeight: "24px",
      padding: showIncludedEye
        ? "2px 8px 2px 18px"
        : "2px 8px 2px 26px",
      color: "#c8d5db",
    });

    if (showIncludedEye) {
      const eye = document.createElement("span");
      eye.textContent = "👁";
      eye.title = "Instancia incluida en esta view";
      Object.assign(eye.style, {
        width: "20px",
        textAlign: "center",
        color: "#cfe8f3",
        fontSize: "11px",
        userSelect: "none",
      });
      row.append(eye);
    }

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

  private createEmptyRow(
    text: string,
  ): HTMLDivElement {
    const row = document.createElement("div");
    row.textContent = text;
    Object.assign(row.style, {
      padding: "7px 10px 7px 27px",
      color: "#71838c",
      fontStyle: "italic",
    });
    return row;
  }

  private readSectionPdfName(
    overlay: HTMLDivElement,
  ): string | null {
    const toolbar = overlay.firstElementChild;
    if (!(toolbar instanceof HTMLElement)) return null;

    const title = Array.from(toolbar.children).find(
      (child) =>
        child instanceof HTMLDivElement
        && child.textContent?.trim().startsWith("PLANO ·"),
    );
    if (!(title instanceof HTMLDivElement)) return null;

    const text = title.textContent?.trim() ?? "";
    return text.replace(/^PLANO\s*·\s*/, "").trim() || null;
  }

  private getPieceLabel(instanceId: string): string {
    const piece = this.options.designModel
      .pieceInstances
      .get(instanceId);
    if (!piece) {
      return `Instancia ${instanceId.slice(0, 8)}`;
    }

    const definition = this.options.designModel
      .pieceDefinitions
      .get(piece.definitionId);
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

  private decorateAssemblies(rows: readonly HTMLDivElement[]): void {
    const assemblyRows = rows.filter((row) => {
      const spans = this.directSpans(row);
      return spans[0]?.textContent?.startsWith("▦ ") ?? false;
    });
    const assemblies = this.options.designModel.assemblies.getAll();

    for (let index = 0; index < assemblies.length; index += 1) {
      const assembly = assemblies[index];
      const row = assemblyRows[index];
      if (!assembly || !row) continue;

      row.dataset["framelogicAssemblyId"] = assembly.id;
      this.installAssemblyContextMenuBridge(row, assembly.id);
    }
  }

  private decoratePieces(rows: readonly HTMLDivElement[]): void {
    const pieceRows = rows.filter((row) => {
      const spans = this.directSpans(row);
      return spans[0]?.textContent?.startsWith("◇ ") ?? false;
    });

    for (const piece of this.options.designModel.pieceInstances.getAll()) {
      const shortId = piece.id.slice(0, 8);
      const row = pieceRows.find((candidate) => {
        if (candidate.dataset["framelogicPieceId"] === piece.id) return true;
        const spans = this.directSpans(candidate);
        return spans[1]?.textContent?.trim().startsWith(shortId) ?? false;
      });
      if (!row) continue;

      row.dataset["framelogicPieceId"] = piece.id;
      this.installPieceContextMenuBridge(row, piece.id);

      const meta = this.directSpans(row)[1];
      if (meta) {
        meta.style.display = "none";
        meta.setAttribute("aria-hidden", "true");
      }
    }
  }

  private directSpans(row: HTMLElement): HTMLSpanElement[] {
    return Array.from(row.children).filter(
      (child): child is HTMLSpanElement =>
        child instanceof HTMLSpanElement,
    );
  }

  private installOpenPdfButton(): void {
    const panel = document.querySelector<HTMLElement>(
      '[data-framelogic-instance-tree="true"]',
    );
    if (!panel) return;

    const addAssembly = panel.querySelector<HTMLButtonElement>(
      '[data-framelogic-instance-tree-add-assembly="true"]',
    );
    const header = addAssembly?.parentElement;
    if (!addAssembly || !header) return;

    let button = header.querySelector<HTMLButtonElement>(
      'button[data-framelogic-open-assembly-pdf="true"]',
    );

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.dataset["framelogicOpenAssemblyPdf"] = "true";
      button.textContent = "PDF Ensambles";
      Object.assign(button.style, {
        height: "22px",
        padding: "0 6px",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "4px",
        background: "rgba(255,255,255,0.05)",
        color: "#bfe8f8",
        cursor: "pointer",
        font: "10px system-ui, sans-serif",
        whiteSpace: "nowrap",
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openExistingPdf();
      });
      header.insertBefore(button, addAssembly);
      header.style.gridTemplateColumns = "1fr auto auto auto";
    }

    const hasSheets = this.options.assemblyPdf.hasSheets();
    button.disabled = !hasSheets;
    button.style.opacity = hasSheets ? "1" : "0.45";
    button.style.cursor = hasSheets ? "pointer" : "default";
    button.title = hasSheets
      ? "Abrir las hojas PDF existentes"
      : "Aún no hay hojas PDF";
  }

  private openExistingPdf(): void {
    if (!this.options.assemblyPdf.openExisting()) {
      window.alert(
        "Aún no hay hojas PDF. Usa clic derecho → Enviar a PDF sobre un ensamble o una pieza.",
      );
    }
  }

  private installAssemblyContextMenuBridge(
    row: HTMLDivElement,
    assemblyId: string,
  ): void {
    const key = `assembly:${assemblyId}`;
    if (row.dataset["framelogicPdfContextId"] === key) return;
    row.dataset["framelogicPdfContextId"] = key;
    row.addEventListener("contextmenu", () => {
      window.setTimeout(
        () => this.decorateOpenContextMenu(
          key,
          "Renombrar ensamble · F2",
          () => this.sendAssembly(assemblyId),
        ),
        0,
      );
    });
  }

  private installPieceContextMenuBridge(
    row: HTMLDivElement,
    pieceId: string,
  ): void {
    const key = `piece:${pieceId}`;
    if (row.dataset["framelogicPdfContextId"] === key) return;
    row.dataset["framelogicPdfContextId"] = key;
    row.addEventListener("contextmenu", () => {
      window.setTimeout(
        () => this.decorateOpenContextMenu(
          key,
          null,
          () => this.sendPiece(pieceId),
        ),
        0,
      );
    });
  }

  private decorateOpenContextMenu(
    key: string,
    requiredButtonText: string | null,
    action: () => void,
  ): void {
    if (this.disposed) return;

    const menus = Array.from(
      document.body.querySelectorAll<HTMLDivElement>("div"),
    ).filter((element) => {
      const buttons = Array.from(element.children).filter(
        (child): child is HTMLButtonElement =>
          child instanceof HTMLButtonElement,
      );
      if (buttons.length < 1) return false;
      if (requiredButtonText) {
        return buttons.some((button) => button.textContent === requiredButtonText);
      }
      return buttons.some((button) =>
        button.textContent?.includes("ensamble")
        || button.textContent?.includes("Renombrar instancia"),
      );
    });

    const menu = menus.at(-1);
    if (!menu) return;

    const alreadyAdded = Array.from(
      menu.querySelectorAll<HTMLButtonElement>("button"),
    ).some((button) => button.dataset["framelogicPdfMenu"] === key);
    if (alreadyAdded) return;

    const referenceButton = menu.querySelector<HTMLButtonElement>("button");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Enviar a PDF";
    button.dataset["framelogicPdfMenu"] = key;

    if (referenceButton) {
      button.style.cssText = referenceButton.style.cssText;
    }
    else {
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
    }

    button.addEventListener("mouseenter", () => {
      button.style.background = "rgba(100,190,230,0.16)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "transparent";
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      action();
      menu.remove();
    });

    menu.prepend(button);
  }

  private sendAssembly(assemblyId: string): void {
    const current = this.options.designModel.assemblies.get(assemblyId);
    if (!current) return;

    this.options.assemblyPdf.sendAssembly({
      assemblyId: current.id,
      assemblyName: current.name,
      instanceIds: current.pieceInstanceIds,
      workPlane: this.options.workPlane.getState(),
    });
  }

  private sendPiece(pieceId: string): void {
    const piece = this.options.designModel.pieceInstances.get(pieceId);
    if (!piece) return;
    const definition = this.options.designModel.pieceDefinitions.get(
      piece.definitionId,
    );
    const name =
      piece.name?.trim()
      || definition?.code?.trim()
      || definition?.name?.trim()
      || `Pieza ${piece.id.slice(0, 8)}`;

    this.options.assemblyPdf.sendAssembly({
      assemblyId: `piece:${piece.id}`,
      assemblyName: name,
      instanceIds: [piece.id],
      workPlane: this.options.workPlane.getState(),
    });
  }
}
