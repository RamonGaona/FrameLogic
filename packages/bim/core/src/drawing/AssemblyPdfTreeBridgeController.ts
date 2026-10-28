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
 * Añade la acción PDF a las filas de ENSAMBLAJES sin modificar el árbol base.
 * Se inserta dentro del span de metadatos para convivir con los ojos que la UI
 * web agrega a la fila sin alterar sus columnas ni la selección del ensamble.
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
        const existing = candidate.querySelector<HTMLButtonElement>(
          `button[data-framelogic-assembly-pdf-id="${assembly.id}"]`,
        );
        return name === assembly.name && !existing;
      });

      if (!row) continue;
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
        const current = this.options.designModel.assemblies.get(assembly.id);
        if (!current) return;
        this.options.assemblyPdf.sendAssembly({
          assemblyId: current.id,
          assemblyName: current.name,
          instanceIds: current.pieceInstanceIds,
          workPlane: this.options.workPlane.getState(),
        });
      });

      meta.append(button);
    }
  }
}
