import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadWorkPlaneController,
} from "../interaction/CadWorkPlaneController";

import type {
  GeneralPdfController,
} from "./GeneralPdfController";


interface GeneralPdfTreeBridgeControllerOptions {
  readonly designModel: DesignModel;
  readonly workPlane: CadWorkPlaneController;
  readonly generalPdf: GeneralPdfController;
}

/**
 * Añade "Enviar a PDF" al árbol de INSTANCIAS sin crear un motor de hojas
 * paralelo. Todas las acciones terminan en GeneralPdfController.
 */
export class GeneralPdfTreeBridgeController {
  private readonly options: GeneralPdfTreeBridgeControllerOptions;
  private readonly timer: number;
  private disposed = false;

  constructor(options: GeneralPdfTreeBridgeControllerOptions) {
    this.options = options;
    this.decorate();
    this.timer = window.setInterval(
      () => this.decorate(),
      320,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
  }

  private decorate(): void {
    if (this.disposed) return;
    const body = document.querySelector<HTMLElement>(
      '[data-framelogic-instance-tree-body="true"]',
    );
    if (!body) return;

    const rows = Array.from(
      body.querySelectorAll<HTMLDivElement>("div"),
    );
    this.decorateAssemblies(rows);
    this.decoratePieces(rows);
  }

  private decorateAssemblies(rows: readonly HTMLDivElement[]): void {
    // The tree is now depth-first rather than registry order. Resolve each
    // row by its stable assembly ID, never by an index or displayed name.
    const assemblyRows = rows.filter((row) =>
      Boolean(row.dataset["framelogicAssemblyId"]),
    );
    const assemblies = this.options.designModel.assemblies.getAll();

    for (const assembly of assemblies) {
      const row = assemblyRows.find(
        (candidate) => candidate.dataset["framelogicAssemblyId"] === assembly.id,
      );
      if (!assembly || !row) continue;
      const key = `assembly:${assembly.id}`;
      if (row.dataset["framelogicGeneralPdfContextId"] === key) continue;
      row.dataset["framelogicGeneralPdfContextId"] = key;
      row.addEventListener("contextmenu", () => {
        window.setTimeout(
          () => this.decorateOpenContextMenu(
            key,
            "Renombrar ensamble · F2",
            () => this.sendAssembly(assembly.id),
            () => this.generateAutomaticAssembly(assembly.id),
          ),
          0,
        );
      });
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
      const key = `piece:${piece.id}`;
      if (row.dataset["framelogicGeneralPdfContextId"] === key) continue;
      row.dataset["framelogicGeneralPdfContextId"] = key;
      row.addEventListener("contextmenu", () => {
        window.setTimeout(
          () => this.decorateOpenContextMenu(
            key,
            null,
            () => this.sendPiece(piece.id),
          ),
          0,
        );
      });
    }
  }

  private directSpans(row: HTMLElement): HTMLSpanElement[] {
    return Array.from(row.children).filter(
      (child): child is HTMLSpanElement =>
        child instanceof HTMLSpanElement,
    );
  }

  private decorateOpenContextMenu(
    key: string,
    requiredButtonText: string | null,
    action: () => void,
    automaticAction?: () => void,
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
        return buttons.some(
          (button) => button.textContent === requiredButtonText,
        );
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
    ).some(
      (button) => button.dataset["framelogicGeneralPdfMenu"] === key,
    );
    if (alreadyAdded) return;

    const referenceButton = menu.querySelector<HTMLButtonElement>("button");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Enviar a PDF";
    button.dataset["framelogicGeneralPdfMenu"] = key;
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
    if (automaticAction) {
      const automaticButton = button.cloneNode(true) as HTMLButtonElement;
      automaticButton.textContent = "Generar planos automáticamente";
      automaticButton.dataset["framelogicAutomaticDrawingMenu"] = key;
      automaticButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        automaticAction();
        menu.remove();
      });
      menu.prepend(automaticButton);
    }
  }

  private sendAssembly(assemblyId: string): void {
    const assembly = this.options.designModel.assemblies.get(assemblyId);
    if (!assembly) return;
    this.options.generalPdf.sendAssembly({
      assemblyId: assembly.id,
      assemblyName: assembly.name,
      instanceIds: this.options.designModel.getAssemblyPieceIdsDeep(assembly.id),
      workPlane: this.options.workPlane.getState(),
    });
  }

  private generateAutomaticAssembly(assemblyId: string): void {
    const assembly = this.options.designModel.assemblies.get(assemblyId);
    if (!assembly) return;
    this.options.generalPdf.generateAutomaticAssembly({
      assemblyId: assembly.id,
      assemblyName: assembly.name,
      instanceIds: this.options.designModel.getAssemblyPieceIdsDeep(assembly.id),
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
    this.options.generalPdf.sendAssembly({
      assemblyId: `piece:${piece.id}`,
      assemblyName: name,
      instanceIds: [piece.id],
      workPlane: this.options.workPlane.getState(),
    });
  }
}
