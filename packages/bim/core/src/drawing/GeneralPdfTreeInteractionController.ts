const SVG_NS = "http://www.w3.org/2000/svg";


export class GeneralPdfTreeInteractionController {
  private readonly container: HTMLElement;
  private readonly timer: number;
  private selectedViewId: string | null = null;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.addEventListener(
      "click",
      this.handleClick,
      true,
    );
    this.container.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.decorate();
    this.timer = window.setInterval(
      () => this.decorate(),
      180,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.container.removeEventListener(
      "click",
      this.handleClick,
      true,
    );
    this.container.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.removeSelectionMarker();
  }

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    const target = event.target instanceof Element
      ? event.target
      : null;
    const viewElement = target?.closest<SVGElement>(
      "[data-framelogic-view-id]",
    );
    const viewId = viewElement?.getAttribute(
      "data-framelogic-view-id",
    );

    if (viewId) {
      this.selectView(viewId);
      return;
    }

    const workspaceSvg = target?.closest<SVGSVGElement>(
      '[data-framelogic-drawing-workspace="true"] svg',
    );
    if (workspaceSvg) {
      this.clearViewSelection();
    }
  };

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element
      ? event.target
      : null;

    const viewSummary = target?.closest<HTMLElement>(
      '[data-framelogic-pdf-view-tree="GENERAL"] details[data-framelogic-view-id] > summary',
    );
    if (viewSummary) {
      const details = viewSummary.parentElement;
      const viewId = details?.getAttribute(
        "data-framelogic-view-id",
      );
      if (viewId) {
        this.selectView(viewId);
      }
      return;
    }

    const row = target?.closest<HTMLDivElement>(
      'details[data-framelogic-pdf-tree="true"] [data-framelogic-tree-content="true"] > div',
    );
    if (!row) return;

    // El PDF se abre con dblclick. Bloqueamos los dos click que el navegador
    // emite antes del dblclick para evitar abrir la hoja por un clic accidental.
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private selectView(viewId: string): void {
    if (this.selectedViewId === viewId) {
      this.decorate();
      return;
    }

    this.selectedViewId = viewId;
    this.decorate();
  }

  private clearViewSelection(): void {
    if (!this.selectedViewId) return;
    this.selectedViewId = null;
    this.decorate();
  }

  private decorate(): void {
    if (this.disposed) return;

    this.decoratePdfRows();
    this.decorateViewTree();
    this.renderSelectionMarker();
  }

  private decoratePdfRows(): void {
    const rows = this.container.querySelectorAll<HTMLDivElement>(
      'details[data-framelogic-pdf-tree="true"] [data-framelogic-tree-content="true"] > div',
    );

    for (const row of rows) {
      row.title = "Doble clic = abrir PDF";
      const spans = Array.from(row.children).filter(
        (child): child is HTMLSpanElement =>
          child instanceof HTMLSpanElement,
      );
      const type = spans.at(-1);
      if (
        type
        && (
          type.textContent === "SECCIÓN"
          || type.textContent === "ENSAMBLE"
        )
      ) {
        type.textContent = "PDF";
      }
    }
  }

  private decorateViewTree(): void {
    const svg = this.getWorkspaceSvg();
    const content = this.container.querySelector<HTMLElement>(
      '[data-framelogic-pdf-view-tree="GENERAL"] [data-framelogic-pdf-view-tree-content="true"]',
    );
    if (!svg || !content) return;

    const viewIds = this.getRenderedViewIds(svg);
    if (
      this.selectedViewId
      && !viewIds.includes(this.selectedViewId)
    ) {
      this.selectedViewId = null;
    }

    const details = Array.from(
      content.querySelectorAll<HTMLDetailsElement>(
        ":scope > details",
      ),
    );

    details.forEach((detail, index) => {
      const viewId = viewIds[index];
      if (viewId) {
        detail.dataset["framelogicViewId"] = viewId;
      }
      else {
        delete detail.dataset["framelogicViewId"];
      }

      const selected = Boolean(
        viewId
        && viewId === this.selectedViewId,
      );
      const summary = detail.querySelector<HTMLElement>(
        ":scope > summary",
      );
      if (!summary) return;

      summary.style.background = selected
        ? "rgba(56,189,248,0.16)"
        : "transparent";
      summary.style.borderLeft = selected
        ? "3px solid #38bdf8"
        : "3px solid transparent";
      summary.style.paddingLeft = selected
        ? "7px"
        : "7px";
      summary.title = selected
        ? "View seleccionada"
        : "Clic = seleccionar View";
      detail.dataset["framelogicViewSelected"] = selected
        ? "true"
        : "false";
    });
  }

  private renderSelectionMarker(): void {
    this.removeSelectionMarker();

    const viewId = this.selectedViewId;
    const svg = this.getWorkspaceSvg();
    if (!viewId || !svg) return;

    const elements = Array.from(
      svg.querySelectorAll<SVGGraphicsElement>(
        `[data-framelogic-view-id="${cssEscape(viewId)}"]`,
      ),
    );
    if (elements.length < 1) return;

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const element of elements) {
      try {
        const box = element.getBBox();
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.width);
        maxY = Math.max(maxY, box.y + box.height);
      }
      catch {
        // Un elemento SVG desconectado no debe romper la selección visual.
      }
    }

    if (
      !Number.isFinite(minX)
      || !Number.isFinite(minY)
      || !Number.isFinite(maxX)
      || !Number.isFinite(maxY)
    ) {
      return;
    }

    const margin = 4;
    const x = minX - margin;
    const y = minY - margin;
    const width = Math.max(12, maxX - minX + margin * 2);
    const height = Math.max(12, maxY - minY + margin * 2);

    const group = document.createElementNS(
      SVG_NS,
      "g",
    );
    group.dataset["framelogicViewSelection"] = "true";
    group.style.pointerEvents = "none";

    const border = document.createElementNS(
      SVG_NS,
      "rect",
    );
    border.setAttribute("x", String(x));
    border.setAttribute("y", String(y));
    border.setAttribute("width", String(width));
    border.setAttribute("height", String(height));
    border.setAttribute("fill", "rgba(56,189,248,0.035)");
    border.setAttribute("stroke", "#38bdf8");
    border.setAttribute("stroke-width", "2");
    border.setAttribute("stroke-dasharray", "8 4");
    border.setAttribute("vector-effect", "non-scaling-stroke");
    group.append(border);

    const handleSize = 7;
    const corners = [
      [x, y],
      [x + width, y],
      [x, y + height],
      [x + width, y + height],
    ] as const;

    for (const [cornerX, cornerY] of corners) {
      const handle = document.createElementNS(
        SVG_NS,
        "rect",
      );
      handle.setAttribute(
        "x",
        String(cornerX - handleSize / 2),
      );
      handle.setAttribute(
        "y",
        String(cornerY - handleSize / 2),
      );
      handle.setAttribute("width", String(handleSize));
      handle.setAttribute("height", String(handleSize));
      handle.setAttribute("fill", "#ffffff");
      handle.setAttribute("stroke", "#38bdf8");
      handle.setAttribute("stroke-width", "1.5");
      handle.setAttribute("vector-effect", "non-scaling-stroke");
      group.append(handle);
    }

    const label = document.createElementNS(
      SVG_NS,
      "text",
    );
    label.setAttribute("x", String(x + 4));
    label.setAttribute("y", String(Math.max(12, y - 7)));
    label.setAttribute("fill", "#0ea5e9");
    label.setAttribute("font-size", "10");
    label.setAttribute("font-weight", "700");
    label.setAttribute("vector-effect", "non-scaling-stroke");
    label.textContent = "VIEW SELECCIONADA";
    group.append(label);

    svg.append(group);
  }

  private removeSelectionMarker(): void {
    this.container
      .querySelectorAll(
        '[data-framelogic-view-selection="true"]',
      )
      .forEach((element) => element.remove());
  }

  private getWorkspaceSvg(): SVGSVGElement | null {
    return this.container.querySelector<SVGSVGElement>(
      '[data-framelogic-drawing-workspace="true"] svg',
    );
  }

  private getRenderedViewIds(
    svg: SVGSVGElement,
  ): string[] {
    const ids: string[] = [];
    const seen = new Set<string>();

    for (const element of svg.querySelectorAll<SVGElement>(
      "[data-framelogic-view-id]",
    )) {
      const id = element.getAttribute(
        "data-framelogic-view-id",
      );
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }

    return ids;
  }
}


function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && CSS.escape) {
    return CSS.escape(value);
  }

  return value.replace(
    /["\\]/g,
    (match) => `\\${match}`,
  );
}
