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
 * Integra la acción PDF con el árbol de ENSAMBLAJES sin modificar el
 * InstanceTreeController base.
 *
 * - Mantiene un acceso compacto PDF en la fila cuando hay espacio.
 * - Añade siempre "Enviar a PDF" al menú contextual del ensamble.
 *
 * La segunda vía es la principal: el usuario hace clic derecho sobre el
 * ensamble y encuentra la acción junto a Renombrar/Mover/Copiar/Eliminar.
 */
export class AssemblyPdfTreeBridgeController {
  private readonly options: AssemblyPdfTreeBridgeControllerOptions;
  private readonly timer: number;
  private disposed = false;

  constructor(
    options: AssemblyPdfTreeBridgeControllerOptions,
  ) {
    this.options = options;
    this.decorate();
    this.timer = window.setInterval(
      () => this.decorate(),
      700,
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
    ).filter((row) => {
      const spans = Array.from(row.children).filter(
        (child): child is HTMLSpanElement =>
          child instanceof HTMLSpanElement,
      );
      return spans[0]?.textContent?.startsWith("▦ ") ?? false;
    });

    for (const assembly of this.options.designModel.assemblies.getAll()) {
      const row = rows.find((candidate) => {
        const spans = Array.from(candidate.children).filter(
          (child): child is HTMLSpanElement =>
            child instanceof HTMLSpanElement,
        );
        const name = spans[0]?.textContent?.slice(2).trim();
        return name === assembly.name;
      });

      if (!row) continue;

      this.installContextMenuBridge(
        row,
        assembly.id,
      );

      const existing = row.querySelector<HTMLButtonElement>(
        `button[data-framelogic-assembly-pdf-id="${assembly.id}"]`,
      );
      if (existing) continue;

      const spans = Array.from(row.children).filter(
        (child): child is HTMLSpanElement =>
          child instanceof HTMLSpanElement,
      );
      const meta = spans[1];
      if (!meta) continue;

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "PDF";
      button.dataset["framelogicAssemblyPdfId"] = assembly.id;
      button.title = "Enviar ensamble a PDF";
      Object.assign(button.style, {
        marginLeft: "6px",
        padding: "1px 4px",
        height: "18px",
        border: "1px solid rgba(255,255,255,0.16)",
        borderRadius: "3px",
        background: "rgba(255,255,255,0.06)",
        color: "#bfe8f8",
        cursor: "pointer",
        font: "9px system-ui, sans-serif",
        verticalAlign: "middle",
      });

      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.sendAssembly(assembly.id);
      });

      meta.append(button);
    }
  }

  private installContextMenuBridge(
    row: HTMLDivElement,
    assemblyId: string,
  ): void {
    if (
      row.dataset["framelogicAssemblyPdfContextId"]
      === assemblyId
    ) {
      return;
    }

    row.dataset["framelogicAssemblyPdfContextId"] =
      assemblyId;

    row.addEventListener(
      "contextmenu",
      () => {
        window.setTimeout(
          () =>
            this.decorateOpenAssemblyContextMenu(
              assemblyId,
            ),
          0,
        );
      },
    );
  }

  private decorateOpenAssemblyContextMenu(
    assemblyId: string,
  ): void {
    if (this.disposed) return;

    const menus = Array.from(
      document.body.querySelectorAll<HTMLDivElement>(
        "div",
      ),
    ).filter((element) => {
      const buttons = Array.from(
        element.children,
      ).filter(
        (child): child is HTMLButtonElement =>
          child instanceof HTMLButtonElement,
      );

      return buttons.some(
        (button) =>
          button.textContent
          === "Renombrar ensamble · F2",
      );
    });

    const menu = menus.at(-1);
    if (!menu) return;

    const alreadyAdded = Array.from(
      menu.querySelectorAll<HTMLButtonElement>("button"),
    ).some(
      (button) =>
        button.dataset["framelogicAssemblyPdfMenu"]
        === assemblyId,
    );
    if (alreadyAdded) return;

    const referenceButton =
      menu.querySelector<HTMLButtonElement>("button");
    const button =
      document.createElement("button");

    button.type = "button";
    button.textContent = "Enviar a PDF";
    button.dataset["framelogicAssemblyPdfMenu"] =
      assemblyId;

    if (referenceButton) {
      Object.assign(
        button.style,
        {
          cssText:
            referenceButton.style.cssText,
        },
      );
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

    button.addEventListener(
      "mouseenter",
      () => {
        button.style.background =
          "rgba(100,190,230,0.16)";
      },
    );
    button.addEventListener(
      "mouseleave",
      () => {
        button.style.background =
          "transparent";
      },
    );
    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.sendAssembly(assemblyId);
        menu.remove();
      },
    );

    menu.prepend(button);
  }

  private sendAssembly(
    assemblyId: string,
  ): void {
    const current =
      this.options.designModel.assemblies.get(
        assemblyId,
      );
    if (!current) return;

    this.options.assemblyPdf.sendAssembly({
      assemblyId: current.id,
      assemblyName: current.name,
      instanceIds: current.pieceInstanceIds,
      workPlane: this.options.workPlane.getState(),
    });
  }
}
