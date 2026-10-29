import type {
  AssemblyPdfController,
} from "./AssemblyPdfController";

interface AssemblyPdfSegmentRuntime {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

interface AssemblyPdfViewRuntime {
  readonly id: string;
  readonly assemblyName: string;
  readonly workPlane: {
    readonly mode: string;
  };
  readonly width: number;
  readonly height: number;
  readonly segments: readonly AssemblyPdfSegmentRuntime[];
  resolved: boolean;
  paperOffsetX?: number;
  paperOffsetY?: number;
  scaleDenominator?: number | null;
}

interface AssemblyPdfSheetRuntime {
  readonly id: string;
  readonly name: string;
  readonly views: AssemblyPdfViewRuntime[];
}

interface PaperLayoutRuntime {
  readonly lines: readonly {
    readonly x1: number;
    readonly y1: number;
    readonly x2: number;
    readonly y2: number;
  }[];
  readonly labels: readonly {
    readonly x: number;
    readonly y: number;
    readonly text: string;
    readonly size: number;
  }[];
  readonly frames: readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }[];
}

interface AssemblyPdfSnapshotViewRuntime {
  readonly id: string;
  paperOffsetX?: number;
  paperOffsetY?: number;
  scaleDenominator?: number | null;
}

interface AssemblyPdfSnapshotRuntime {
  readonly sheets: readonly {
    readonly id: string;
    readonly views: readonly AssemblyPdfSnapshotViewRuntime[];
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
  createSnapshot(): unknown;
  restoreSnapshot(snapshot: unknown): void;
}

interface AssemblyPdfViewEditingControllerOptions {
  readonly assemblyPdf: AssemblyPdfController;
}

interface DragState {
  readonly viewId: string;
  readonly startX: number;
  readonly startY: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const SHEET_WIDTH = 1120;
const SHEET_HEIGHT = 792;
const LEFT = 42;
const RIGHT = 42;
const TOP = 42;
const BOTTOM = 70;
const VIEW_GAP = 18;
const EPSILON = 1e-8;
const DRAWING_UNITS_PER_METER = SHEET_WIDTH / 0.42;

/**
 * Edición independiente de views dentro de una hoja PDF.
 *
 * Cada view conserva su propia posición y escala. La escala puede quedar en
 * AUTO o fijarse como denominador técnico 1:N. Estos datos se incorporan al
 * snapshot existente sin romper proyectos anteriores.
 */
export class AssemblyPdfViewEditingController {
  private readonly runtime: AssemblyPdfRuntime;
  private readonly baseRender: () => void;
  private readonly baseLayout: (
    sheet: AssemblyPdfSheetRuntime,
  ) => PaperLayoutRuntime;
  private readonly baseCreateSnapshot: () => unknown;
  private readonly baseRestoreSnapshot: (
    snapshot: unknown,
  ) => void;
  private readonly controls: HTMLElement[] = [];
  private readonly scaleInput: HTMLInputElement;
  private selectedViewId: string | null = null;
  private drag: DragState | null = null;
  private disposed = false;

  constructor(
    options: AssemblyPdfViewEditingControllerOptions,
  ) {
    this.runtime = options.assemblyPdf as unknown as AssemblyPdfRuntime;
    this.baseRender = this.runtime.render.bind(options.assemblyPdf);
    this.baseLayout = this.runtime.layout.bind(options.assemblyPdf);
    this.baseCreateSnapshot =
      this.runtime.createSnapshot.bind(options.assemblyPdf);
    this.baseRestoreSnapshot =
      this.runtime.restoreSnapshot.bind(options.assemblyPdf);

    this.scaleInput = document.createElement("input");
    this.installToolbarControls();

    this.runtime.layout = (sheet) => this.layout(sheet);
    this.runtime.createSnapshot = () => this.createSnapshot();
    this.runtime.restoreSnapshot = (snapshot) =>
      this.restoreSnapshot(snapshot);
    this.runtime.render = (): void => {
      this.baseRender();
      this.decorateSelectableViews();
    };

    window.addEventListener("pointermove", this.handlePointerMove, true);
    window.addEventListener("pointerup", this.handlePointerUp, true);
    window.addEventListener("pointercancel", this.handlePointerUp, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime.render = this.baseRender;
    this.runtime.layout = this.baseLayout;
    this.runtime.createSnapshot = this.baseCreateSnapshot;
    this.runtime.restoreSnapshot = this.baseRestoreSnapshot;
    window.removeEventListener("pointermove", this.handlePointerMove, true);
    window.removeEventListener("pointerup", this.handlePointerUp, true);
    window.removeEventListener("pointercancel", this.handlePointerUp, true);
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
    toolbar.style.flexWrap = "wrap";

    const info = document.createElement("span");
    info.dataset["framelogicAssemblyPdfViewInfo"] = "true";
    Object.assign(info.style, {
      minWidth: "104px",
      padding: "3px 7px",
      borderRadius: "999px",
      background: "rgba(255,255,255,0.07)",
      color: "#c9d6dc",
      whiteSpace: "nowrap",
    });

    const update = this.makeButton("Actualizar vista");
    const left = this.makeButton("←");
    const right = this.makeButton("→");
    const up = this.makeButton("↑");
    const down = this.makeButton("↓");
    left.title = "Mover view a la izquierda";
    right.title = "Mover view a la derecha";
    up.title = "Mover view hacia arriba";
    down.title = "Mover view hacia abajo";

    const scaleLabel = document.createElement("span");
    scaleLabel.textContent = "Escala 1:";
    scaleLabel.style.whiteSpace = "nowrap";

    this.scaleInput.type = "number";
    this.scaleInput.min = "1";
    this.scaleInput.step = "1";
    this.scaleInput.placeholder = "AUTO";
    this.scaleInput.title = "Escala independiente de la view. Vacío = AUTO";
    Object.assign(this.scaleInput.style, {
      width: "72px",
      padding: "4px 6px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#10171c",
      color: "#edf2f5",
    });

    const autoScale = this.makeButton("Auto");
    const remove = this.makeButton("Eliminar vista");

    update.addEventListener("click", () => this.updateSelectedView());
    left.addEventListener("click", () => this.nudgeSelectedView(-10, 0));
    right.addEventListener("click", () => this.nudgeSelectedView(10, 0));
    up.addEventListener("click", () => this.nudgeSelectedView(0, -10));
    down.addEventListener("click", () => this.nudgeSelectedView(0, 10));
    this.scaleInput.addEventListener("change", () => this.applyScaleInput());
    autoScale.addEventListener("click", () => {
      const selected = this.getSelected();
      if (!selected) return;
      selected.view.scaleDenominator = null;
      this.scaleInput.value = "";
      this.runtime.render();
    });
    remove.addEventListener("click", () => this.deleteSelectedView());

    const exportButton = Array.from(toolbar.querySelectorAll("button"))
      .find((button) => button.textContent === "Exportar PDF");

    const elements: HTMLElement[] = [
      info,
      update,
      left,
      right,
      up,
      down,
      scaleLabel,
      this.scaleInput,
      autoScale,
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
      rect.style.cursor = "move";
      rect.style.pointerEvents = "all";

      rect.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.selectedViewId = view.id;
        const point = this.svgPoint(event);
        if (!point) {
          this.runtime.render();
          return;
        }
        this.drag = {
          viewId: view.id,
          startX: point.x,
          startY: point.y,
          offsetX: view.paperOffsetX ?? 0,
          offsetY: view.paperOffsetY ?? 0,
        };
        this.updateControls();
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

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    if (!this.drag || this.disposed) return;
    const sheet = this.runtime.getActiveSheet();
    if (!sheet) return;
    const index = sheet.views.findIndex((view) => view.id === this.drag?.viewId);
    const view = index >= 0 ? sheet.views[index] : undefined;
    const point = this.svgPoint(event);
    if (!view || !point) return;

    view.paperOffsetX = this.drag.offsetX + point.x - this.drag.startX;
    view.paperOffsetY = this.drag.offsetY + point.y - this.drag.startY;
    this.clampViewOffset(view, index, sheet.views.length);
    this.runtime.render();
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly handlePointerUp = (): void => {
    this.drag = null;
  };

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

  private nudgeSelectedView(
    dx: number,
    dy: number,
  ): void {
    const selected = this.getSelected();
    if (!selected) return;
    selected.view.paperOffsetX =
      (selected.view.paperOffsetX ?? 0) + dx;
    selected.view.paperOffsetY =
      (selected.view.paperOffsetY ?? 0) + dy;
    this.clampViewOffset(
      selected.view,
      selected.index,
      selected.sheet.views.length,
    );
    this.runtime.render();
  }

  private applyScaleInput(): void {
    const selected = this.getSelected();
    if (!selected) return;
    const raw = this.scaleInput.value.trim();
    if (!raw) {
      selected.view.scaleDenominator = null;
      this.runtime.render();
      return;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    selected.view.scaleDenominator = Math.max(1, Math.min(10000, value));
    this.scaleInput.value = String(selected.view.scaleDenominator);
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
      const scale = selected?.view.scaleDenominator;
      info.textContent = selected
        ? `Vista ${selected.index + 1}/${selected.sheet.views.length} · ${scale ? `1:${scale}` : "AUTO"}`
        : "Vista: ninguna";
    }

    this.scaleInput.disabled = !selected;
    this.scaleInput.value = selected?.view.scaleDenominator
      ? String(selected.view.scaleDenominator)
      : "";

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

  private layout(
    sheet: AssemblyPdfSheetRuntime,
  ): PaperLayoutRuntime {
    const count = Math.max(sheet.views.length, 1);
    const lines: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }> = [];
    const labels: Array<{
      x: number;
      y: number;
      text: string;
      size: number;
    }> = [];
    const frames: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];

    sheet.views.forEach((view, index) => {
      const base = this.getBaseFrame(index, count);
      this.clampViewOffset(view, index, count);
      const cellX = base.x + (view.paperOffsetX ?? 0);
      const cellY = base.y + (view.paperOffsetY ?? 0);
      const titleHeight = 26;
      const innerWidth = Math.max(base.width - 20, 1);
      const innerHeight = Math.max(base.height - titleHeight - 18, 1);
      const autoScale = Math.min(
        innerWidth / Math.max(view.width, EPSILON),
        innerHeight / Math.max(view.height, EPSILON),
      );
      const denominator = view.scaleDenominator;
      const scale = denominator && denominator > 0
        ? DRAWING_UNITS_PER_METER / denominator
        : autoScale;
      const drawnWidth = view.width * scale;
      const drawnHeight = view.height * scale;
      const originX = cellX + (base.width - drawnWidth) / 2;
      const originY =
        cellY + titleHeight + (innerHeight - drawnHeight) / 2;

      frames.push({
        x: cellX,
        y: cellY,
        width: base.width,
        height: base.height,
      });
      labels.push({
        x: cellX + 8,
        y: cellY + 17,
        text: `${view.assemblyName} · ${denominator ? `1:${denominator}` : "AUTO"}`,
        size: 11,
      });

      for (const segment of view.segments) {
        lines.push({
          x1: originX + segment.x1 * scale,
          y1: originY + drawnHeight - segment.y1 * scale,
          x2: originX + segment.x2 * scale,
          y2: originY + drawnHeight - segment.y2 * scale,
        });
      }
    });

    labels.push({
      x: 34,
      y: SHEET_HEIGHT - 30,
      text: sheet.name,
      size: 15,
    });

    return {
      lines,
      labels,
      frames,
    };
  }

  private getBaseFrame(
    index: number,
    count: number,
  ): {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } {
    const columns = Math.ceil(Math.sqrt(Math.max(count, 1)));
    const rows = Math.ceil(Math.max(count, 1) / columns);
    const availableWidth = SHEET_WIDTH - LEFT - RIGHT;
    const availableHeight = SHEET_HEIGHT - TOP - BOTTOM;
    const width =
      (availableWidth - VIEW_GAP * (columns - 1)) / columns;
    const height =
      (availableHeight - VIEW_GAP * (rows - 1)) / rows;
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: LEFT + column * (width + VIEW_GAP),
      y: TOP + row * (height + VIEW_GAP),
      width,
      height,
    };
  }

  private clampViewOffset(
    view: AssemblyPdfViewRuntime,
    index: number,
    count: number,
  ): void {
    const base = this.getBaseFrame(index, count);
    const minX = 8 - base.x;
    const maxX = SHEET_WIDTH - base.width - 8 - base.x;
    const minY = 8 - base.y;
    const maxY = SHEET_HEIGHT - base.height - 8 - base.y;
    view.paperOffsetX = Math.max(
      minX,
      Math.min(maxX, view.paperOffsetX ?? 0),
    );
    view.paperOffsetY = Math.max(
      minY,
      Math.min(maxY, view.paperOffsetY ?? 0),
    );
  }

  private svgPoint(
    event: PointerEvent,
  ): {
    readonly x: number;
    readonly y: number;
  } | null {
    const rect = this.runtime.svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: (event.clientX - rect.left) * SHEET_WIDTH / rect.width,
      y: (event.clientY - rect.top) * SHEET_HEIGHT / rect.height,
    };
  }

  private createSnapshot(): unknown {
    const snapshot =
      this.baseCreateSnapshot() as AssemblyPdfSnapshotRuntime;

    for (const snapshotSheet of snapshot.sheets ?? []) {
      const runtimeSheet = this.runtime.sheets.find(
        (sheet) => sheet.id === snapshotSheet.id,
      );
      if (!runtimeSheet) continue;

      for (const snapshotView of snapshotSheet.views) {
        const runtimeView = runtimeSheet.views.find(
          (view) => view.id === snapshotView.id,
        );
        if (!runtimeView) continue;
        snapshotView.paperOffsetX = runtimeView.paperOffsetX ?? 0;
        snapshotView.paperOffsetY = runtimeView.paperOffsetY ?? 0;
        snapshotView.scaleDenominator =
          runtimeView.scaleDenominator ?? null;
      }
    }

    return snapshot;
  }

  private restoreSnapshot(
    snapshot: unknown,
  ): void {
    this.baseRestoreSnapshot(snapshot);
    const saved = snapshot as Partial<AssemblyPdfSnapshotRuntime> | undefined;
    if (!saved?.sheets) return;

    for (const snapshotSheet of saved.sheets) {
      const runtimeSheet = this.runtime.sheets.find(
        (sheet) => sheet.id === snapshotSheet.id,
      );
      if (!runtimeSheet) continue;

      for (const snapshotView of snapshotSheet.views) {
        const runtimeView = runtimeSheet.views.find(
          (view) => view.id === snapshotView.id,
        );
        if (!runtimeView) continue;
        runtimeView.paperOffsetX =
          Number.isFinite(snapshotView.paperOffsetX)
            ? snapshotView.paperOffsetX
            : 0;
        runtimeView.paperOffsetY =
          Number.isFinite(snapshotView.paperOffsetY)
            ? snapshotView.paperOffsetY
            : 0;
        runtimeView.scaleDenominator =
          Number.isFinite(snapshotView.scaleDenominator)
          && (snapshotView.scaleDenominator ?? 0) > 0
            ? snapshotView.scaleDenominator
            : null;
      }
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
