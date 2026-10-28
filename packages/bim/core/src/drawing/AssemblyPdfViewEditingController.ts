import type {
  AssemblyPdfController,
} from "./AssemblyPdfController";

interface AssemblyPdfViewRuntime {
  readonly id: string;
  readonly assemblyName: string;
  readonly workPlane: {
    readonly mode: string;
  };
  resolved: boolean;
}

interface AssemblyPdfSheetRuntime {
  readonly id: string;
  readonly name: string;
  readonly views: AssemblyPdfViewRuntime[];
}

interface PaperLayoutRuntime {
  readonly frames: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
}

interface AssemblyPdfRuntime {
  readonly overlay: HTMLDivElement;
  readonly svg: SVGSVGElement;
  readonly sheets: AssemblyPdfSheetRuntime[];
  activeSheetId: string | null;
  render(): void;
  layout(sheet: AssemblyPdfSheetRuntime): PaperLayoutRuntime;
  getActiveSheet(): AssemblyPdfSheetRuntime | null;
  refreshSheetSelect(): void;
}

interface AssemblyPdfViewEditingControllerOptions {
  readonly assemblyPdf: AssemblyPdfController;
}

/**
 * Selección y edición de vistas dentro de una hoja PDF de ensambles.
 *
 * Cada marco funciona como un objeto seleccionable. La geometría de la vista
 * sigue siendo responsabilidad de AssemblyPdfController; este controlador solo
 * opera sobre el orden/estado de las vistas de la hoja activa.
 */
export class AssemblyPdfViewEditingController {
  private readonly runtime: AssemblyPdfRuntime;
  private readonly baseRender: () => void;
  private readonly controls: HTMLElement[] = [];
  private selectedViewId: string | null = null;
  private disposed = false;

  constructor(
    options: AssemblyPdfViewEditingControllerOptions,
  ) {
    this.runtime = options.assemblyPdf as unknown as AssemblyPdfRuntime;
    this.baseRender = this.runtime.render.bind(options.assemblyPdf);

    this.installToolbarControls();

    this.runtime.render = (): void => {
      this.baseRender();
      this.decorateSelectableViews();
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime.render = this.baseRender;
    delete this.runtime.overlay.dataset[
      "framelogicSelectedAssemblyPdfViewId"
    ];
    for (const control of this.controls) {
      control.remove();
    }
  }

  private installToolbarControls(): void {
    const toolbar = this.runtime.overlay.firstElementChild as HTMLElement | null;
    if (!toolbar) return;

    const info = document.createElement("span");
    info.dataset["framelogicAssemblyPdfViewInfo"] = "true";
    Object.assign(info.style, {
      minWidth: "96px",
      padding: "3px 7px",
      borderRadius: "999px",
      background: "rgba(255,255,255,0.07)",
      color: "#c9d6dc",
      whiteSpace: "nowrap",
    });

    const update = this.makeButton("Actualizar vista");
    const previous = this.makeButton("← Vista");
    const next = this.makeButton("Vista →");
    const remove = this.makeButton("Eliminar vista");

    update.addEventListener("click", () => this.updateSelectedView());
    previous.addEventListener("click", () => this.moveSelectedView(-1));
    next.addEventListener("click", () => this.moveSelectedView(1));
    remove.addEventListener("click", () => this.deleteSelectedView());

    const exportButton = Array.from(toolbar.querySelectorAll("button"))
      .find((button) => button.textContent === "Exportar PDF");

    const elements: HTMLElement[] = [
      info,
      update,
      previous,
      next,
      remove,
    ];

    for (const element of elements) {
      if (exportButton) {
        toolbar.insertBefore(element, exportButton);
      }
      else {
        toolbar.append(element);
      }
      this.controls.push(element);
    }

    this.updateControls();
  }

  private decorateSelectableViews(): void {
    if (this.disposed) return;

    this.runtime.svg
      .querySelectorAll('[data-framelogic-assembly-pdf-view-hit="true"]')
      .forEach((element) => element.remove());

    const sheet = this.runtime.getActiveSheet();
    if (!sheet) {
      this.selectedViewId = null;
      this.updateControls();
      return;
    }

    if (
      this.selectedViewId
      && !sheet.views.some((view) => view.id === this.selectedViewId)
    ) {
      this.selectedViewId = null;
    }

    const layout = this.runtime.layout(sheet);

    sheet.views.forEach((view, index) => {
      const frame = layout.frames[index];
      if (!frame) return;

      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      rect.dataset["framelogicAssemblyPdfViewHit"] = "true";
      rect.dataset["viewId"] = view.id;
      rect.setAttribute("x", String(frame.x));
      rect.setAttribute("y", String(frame.y));
      rect.setAttribute("width", String(frame.width));
      rect.setAttribute("height", String(frame.height));
      rect.setAttribute("fill", "rgba(0,0,0,0)");
      rect.setAttribute(
        "stroke",
        view.id === this.selectedViewId
          ? "#209ed3"
          : "transparent",
      );
      rect.setAttribute(
        "stroke-width",
        view.id === this.selectedViewId ? "2.5" : "1",
      );
      rect.setAttribute("vector-effect", "non-scaling-stroke");
      rect.style.cursor = "pointer";
      rect.style.pointerEvents = "all";

      rect.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      rect.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.selectedViewId = view.id;
        this.runtime.render();
      });

      this.runtime.svg.append(rect);
    });

    this.updateControls();
  }

  private getSelected(): {
    readonly sheet: AssemblyPdfSheetRuntime;
    readonly view: AssemblyPdfViewRuntime;
    readonly index: number;
  } | null {
    const sheet = this.runtime.getActiveSheet();
    if (!sheet || !this.selectedViewId) return null;
    const index = sheet.views.findIndex((view) => view.id === this.selectedViewId);
    if (index < 0) return null;
    const view = sheet.views[index];
    if (!view) return null;
    return { sheet, view, index };
  }

  private updateSelectedView(): void {
    const selected = this.getSelected();
    if (!selected) return;
    selected.view.resolved = false;
    this.runtime.render();
  }

  private moveSelectedView(delta: number): void {
    const selected = this.getSelected();
    if (!selected) return;
    const target = selected.index + delta;
    if (target < 0 || target >= selected.sheet.views.length) return;

    const [view] = selected.sheet.views.splice(selected.index, 1);
    if (!view) return;
    selected.sheet.views.splice(target, 0, view);
    this.runtime.render();
  }

  private deleteSelectedView(): void {
    const selected = this.getSelected();
    if (!selected) return;

    const confirmed = window.confirm(
      `¿Eliminar la vista ${selected.view.assemblyName} de esta hoja?`,
    );
    if (!confirmed) return;

    selected.sheet.views.splice(selected.index, 1);
    const next = selected.sheet.views[
      Math.min(selected.index, selected.sheet.views.length - 1)
    ];
    this.selectedViewId = next?.id ?? null;
    this.runtime.refreshSheetSelect();
    this.runtime.render();
  }

  private updateControls(): void {
    const selected = this.getSelected();
    this.runtime.overlay.dataset[
      "framelogicSelectedAssemblyPdfViewId"
    ] = this.selectedViewId ?? "";

    const info = this.runtime.overlay.querySelector<HTMLElement>(
      '[data-framelogic-assembly-pdf-view-info="true"]',
    );
    if (info) {
      info.textContent = selected
        ? `Vista ${selected.index + 1}/${selected.sheet.views.length}`
        : "Vista: ninguna";
    }

    const buttons = this.controls.filter(
      (control): control is HTMLButtonElement =>
        control instanceof HTMLButtonElement,
    );
    for (const button of buttons) {
      button.disabled = !selected;
      button.style.opacity = selected ? "1" : "0.45";
      button.style.cursor = selected ? "pointer" : "default";
    }
  }

  private makeButton(label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    Object.assign(button.style, {
      padding: "5px 8px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#27343c",
      color: "#f3f7f9",
      cursor: "pointer",
      whiteSpace: "nowrap",
    });
    return button;
  }
}
