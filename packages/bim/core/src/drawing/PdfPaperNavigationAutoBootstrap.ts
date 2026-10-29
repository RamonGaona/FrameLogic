interface PdfPaperState {
  readonly stage: HTMLDivElement;
  readonly svg: SVGSVGElement;
  zoom: number;
  panX: number;
  panY: number;
}

interface ActivePanState {
  readonly paper: PdfPaperState;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startPanX: number;
  readonly startPanY: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_FACTOR = 1.12;

const runtime = globalThis as typeof globalThis & {
  __framelogicPdfPaperNavigationV1?: boolean;
};

if (!runtime.__framelogicPdfPaperNavigationV1) {
  runtime.__framelogicPdfPaperNavigationV1 = true;

  const papers = new WeakMap<SVGSVGElement, PdfPaperState>();
  let activePan: ActivePanState | null = null;

  const clampZoom = (value: number): number =>
    Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));

  const parseCurrentZoom = (svg: SVGSVGElement): number => {
    const match = svg.style.transform.match(/scale\(([-+\d.eE]+)\)/);
    const parsed = match ? Number(match[1]) : 1;
    return Number.isFinite(parsed) && parsed > 0
      ? clampZoom(parsed)
      : 1;
  };

  const getPaper = (
    target: EventTarget | null,
    requireStageTarget = true,
  ): PdfPaperState | null => {
    if (!(target instanceof Element)) return null;

    const overlay = target.closest<HTMLElement>(
      '[data-framelogic-drawing-workspace="true"], [data-framelogic-assembly-pdf="true"]',
    );
    if (!overlay) return null;

    const svg = overlay.querySelector<SVGSVGElement>("svg");
    const stage = svg?.parentElement;
    if (!svg || !(stage instanceof HTMLDivElement)) return null;
    if (requireStageTarget && !stage.contains(target)) return null;

    const existing = papers.get(svg);
    if (existing) return existing;

    const state: PdfPaperState = {
      stage,
      svg,
      zoom: parseCurrentZoom(svg),
      panX: 0,
      panY: 0,
    };
    papers.set(svg, state);

    stage.style.overscrollBehavior = "contain";
    svg.style.transformOrigin = "0 0";
    svg.style.touchAction = "none";
    stage.title =
      "Rueda: zoom · botón central o Shift+arrastre: pan";
    return state;
  };

  const applyTransform = (paper: PdfPaperState): void => {
    paper.svg.style.transformOrigin = "0 0";
    paper.svg.style.transform =
      `translate(${paper.panX}px, ${paper.panY}px) scale(${paper.zoom})`;

    const viewBox = paper.svg.viewBox.baseVal;
    const width =
      Number(paper.svg.getAttribute("width"))
      || viewBox.width
      || 1120;
    const height =
      Number(paper.svg.getAttribute("height"))
      || viewBox.height
      || 792;

    paper.svg.style.marginRight =
      `${Math.max(0, width * (paper.zoom - 1) + Math.max(0, paper.panX))}px`;
    paper.svg.style.marginBottom =
      `${Math.max(0, height * (paper.zoom - 1) + Math.max(0, paper.panY))}px`;
  };

  const setZoom = (
    paper: PdfPaperState,
    value: number,
    clientX?: number,
    clientY?: number,
  ): void => {
    const previous = paper.zoom;
    const next = clampZoom(value);
    if (Math.abs(previous - next) < 1e-9) return;

    if (
      clientX !== undefined
      && clientY !== undefined
    ) {
      const rect = paper.svg.getBoundingClientRect();
      const localX =
        (clientX - rect.left)
        / Math.max(previous, 1e-9);
      const localY =
        (clientY - rect.top)
        / Math.max(previous, 1e-9);

      paper.panX += localX * (previous - next);
      paper.panY += localY * (previous - next);
    }

    paper.zoom = next;
    applyTransform(paper);
  };

  document.addEventListener(
    "wheel",
    (event) => {
      const paper = getPaper(event.target);
      if (!paper) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      if (event.deltaY === 0) return;
      setZoom(
        paper,
        paper.zoom
          * (event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR),
        event.clientX,
        event.clientY,
      );
    },
    {
      capture: true,
      passive: false,
    },
  );

  document.addEventListener(
    "pointerdown",
    (event) => {
      const panGesture =
        event.button === 1
        || (event.button === 0 && event.shiftKey);
      if (!panGesture) return;

      const paper = getPaper(event.target);
      if (!paper) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      activePan = {
        paper,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startPanX: paper.panX,
        startPanY: paper.panY,
      };

      paper.stage.style.cursor = "grabbing";
      paper.svg.style.cursor = "grabbing";
      try {
        paper.stage.setPointerCapture(event.pointerId);
      }
      catch {
        // Pointer capture is optional; document-level listeners still keep pan active.
      }
    },
    true,
  );

  document.addEventListener(
    "pointermove",
    (event) => {
      const pan = activePan;
      if (!pan || pan.pointerId !== event.pointerId) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      pan.paper.panX =
        pan.startPanX
        + event.clientX
        - pan.startClientX;
      pan.paper.panY =
        pan.startPanY
        + event.clientY
        - pan.startClientY;
      applyTransform(pan.paper);
    },
    true,
  );

  const endPan = (event: PointerEvent): void => {
    const pan = activePan;
    if (!pan || pan.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    pan.paper.stage.style.cursor = "";
    pan.paper.svg.style.cursor = "";
    try {
      pan.paper.stage.releasePointerCapture(event.pointerId);
    }
    catch {
      // Nothing to release.
    }
    activePan = null;
  };

  document.addEventListener("pointerup", endPan, true);
  document.addEventListener("pointercancel", endPan, true);

  document.addEventListener(
    "auxclick",
    (event) => {
      if (event.button !== 1) return;
      const paper = getPaper(event.target);
      if (!paper) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button) return;

      const label = button.textContent?.trim();
      if (label !== "+" && label !== "−") return;

      const overlay = button.closest<HTMLElement>(
        '[data-framelogic-drawing-workspace="true"]',
      );
      if (!overlay) return;

      const paper = getPaper(overlay, false);
      if (!paper) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      setZoom(
        paper,
        paper.zoom
          * (label === "+" ? 1.18 : 1 / 1.18),
      );
    },
    true,
  );
}

export {};
