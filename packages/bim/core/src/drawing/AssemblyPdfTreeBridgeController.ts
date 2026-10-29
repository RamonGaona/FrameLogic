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

/**
 * Integra las hojas PDF con el árbol de INSTANCIAS.
 *
 * Ensambles y piezas individuales comparten las mismas hojas PDF y el
 * WorkPlane activo. "Enviar a PDF" vive únicamente en el menú contextual
 * para mantener limpio el árbol. Los IDs cortos de instancia permanecen como
 * dato interno y no se muestran al usuario.
 */
export class AssemblyPdfTreeBridgeController {
  private readonly options: AssemblyPdfTreeBridgeControllerOptions;
  private readonly timer: number;
  private disposed = false;

  constructor(options: AssemblyPdfTreeBridgeControllerOptions) {
    this.options = options;
    this.decorate();
    this.timer = window.setInterval(() => this.decorate(), 700);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
  }

  private decorate(): void {
    if (this.disposed) return;

    this.installOpenPdfButton();

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
