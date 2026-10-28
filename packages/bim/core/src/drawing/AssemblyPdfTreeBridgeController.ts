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
 * Integra las hojas PDF de ensambles con el árbol de INSTANCIAS.
 *
 * - "PDF Ensambles" en el encabezado reabre las hojas ya creadas sin añadir
 *   ninguna vista nueva.
 * - "PDF" en la fila permite enviar rápidamente un ensamble.
 * - "Enviar a PDF" aparece en el menú contextual del ensamble.
 *
 * Las hojas permanecen en memoria durante la sesión aunque el usuario vuelva
 * al Model Space. El acceso del encabezado permite regresar a ellas.
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

    this.installOpenPdfButton();

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
      header.style.gridTemplateColumns =
        "1fr auto auto auto";
    }

    const hasSheets =
      this.hasAssemblyPdfSheets();
    button.disabled = !hasSheets;
    button.style.opacity = hasSheets
      ? "1"
      : "0.45";
    button.style.cursor = hasSheets
      ? "pointer"
      : "default";
    button.title = hasSheets
      ? "Abrir las hojas PDF de ensambles existentes"
      : "Aún no hay hojas PDF de ensambles";
  }

  private hasAssemblyPdfSheets(): boolean {
    const overlay = document.querySelector<HTMLElement>(
      '[data-framelogic-assembly-pdf="true"]',
    );
    const select = overlay?.querySelector<HTMLSelectElement>(
      "select",
    );
    return Boolean(
      select
      && select.options.length > 0,
    );
  }

  private openExistingPdf(): void {
    const overlay = document.querySelector<HTMLElement>(
      '[data-framelogic-assembly-pdf="true"]',
    );
    const select = overlay?.querySelector<HTMLSelectElement>(
      "select",
    );

    if (
      !overlay
      || !select
      || select.options.length < 1
    ) {
      window.alert(
        "Aún no hay hojas PDF de ensambles. Usa clic derecho sobre un ensamble → Enviar a PDF.",
      );
      return;
    }

    overlay.style.display = "flex";
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
      button.style.cssText =
        referenceButton.style.cssText;
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
