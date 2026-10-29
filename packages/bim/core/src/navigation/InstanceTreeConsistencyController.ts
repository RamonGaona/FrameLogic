import type {
  SectionDrawingController,
} from "../drawing/SectionDrawingController";

import type {
  UnifiedPdfNavigationController,
} from "../drawing/UnifiedPdfNavigationController";

import type {
  ModelSpaceInstanceTreeBridgeController,
} from "./ModelSpaceInstanceTreeBridgeController";


interface PdfEntryRuntime {
  readonly key: string;
  readonly kind: "SECTION" | "ASSEMBLY";
  readonly targetId: string;
  readonly label: string;
}


interface UnifiedPdfRuntime {
  getEntries(): PdfEntryRuntime[];
}


interface ModelSpaceTreeRuntime {
  lastSignature: string;
  decorate(): void;
}


interface Options {
  readonly container: HTMLElement;
  readonly sectionDrawing: SectionDrawingController;
  readonly unifiedPdfNavigation: UnifiedPdfNavigationController;
  readonly modelSpaceTree: ModelSpaceInstanceTreeBridgeController;
}


/**
 * Mantiene coherente el árbol INSTANCIAS cuando distintos controladores
 * regeneran su contenido.
 *
 * - PLANOS / PDF incluye todas las vistas de sección, incluso si su hoja aún
 *   no fue abierta una primera vez.
 * - Si InstanceTreeController reconstruye el body, fuerza a los grupos
 *   dinámicos CAD/PDF a repoblarse aunque sus datos no hayan cambiado.
 * - Añade ojos masivos a ENSAMBLAJES y PIEZAS SUELTAS reutilizando los ojos
 *   individuales que ya controla BimViewport, evitando un segundo estado de
 *   visibilidad. El ojo permanece visible aunque el grupo esté vacío.
 */
export class InstanceTreeConsistencyController {
  private readonly container: HTMLElement;
  private readonly sectionDrawing: SectionDrawingController;
  private readonly pdfRuntime: UnifiedPdfRuntime;
  private readonly treeRuntime: ModelSpaceTreeRuntime;
  private readonly baseGetEntries: () => PdfEntryRuntime[];
  private readonly timer: number;
  private disposed = false;


  constructor(options: Options) {
    this.container = options.container;
    this.sectionDrawing = options.sectionDrawing;
    this.pdfRuntime =
      options.unifiedPdfNavigation as unknown as UnifiedPdfRuntime;
    this.treeRuntime =
      options.modelSpaceTree as unknown as ModelSpaceTreeRuntime;
    this.baseGetEntries =
      this.pdfRuntime.getEntries.bind(options.unifiedPdfNavigation);

    this.pdfRuntime.getEntries = (): PdfEntryRuntime[] =>
      this.getCompletePdfEntries();

    this.sync();
    this.timer = window.setInterval(
      () => this.sync(),
      180,
    );
  }


  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.pdfRuntime.getEntries = this.baseGetEntries;

    this.container
      .querySelectorAll('[data-framelogic-piece-group-eye="true"]')
      .forEach((element) => element.remove());
  }


  private getCompletePdfEntries(): PdfEntryRuntime[] {
    const entries = [
      ...this.baseGetEntries(),
    ];
    const keys = new Set(
      entries.map((entry) => entry.key),
    );

    for (const section of this.sectionDrawing.getSections()) {
      const key = `SECTION:${section.id}`;
      if (keys.has(key)) continue;

      entries.push({
        key,
        kind: "SECTION",
        targetId: section.id,
        label: section.name,
      });
      keys.add(key);
    }

    return entries;
  }


  private sync(): void {
    if (this.disposed) return;

    this.repairDynamicGroups();
    this.decoratePieceGroup(
      "ENSAMBLAJES",
      "assemblies",
      "ensambles",
    );
    this.decoratePieceGroup(
      "PIEZAS SUELTAS",
      "loose",
      "piezas sueltas",
    );
    this.hideEmptyCadGroupEye();
  }


  private repairDynamicGroups(): void {
    const body = this.container.querySelector<HTMLElement>(
      '[data-framelogic-instance-tree-body="true"]',
    );
    if (!body) return;

    const cadContent = body.querySelector<HTMLElement>(
      'details[data-framelogic-cad-entity-tree="true"] [data-framelogic-tree-content="true"]',
    );
    const pdfContent = body.querySelector<HTMLElement>(
      'details[data-framelogic-pdf-tree="true"] [data-framelogic-tree-content="true"]',
    );

    if (
      (cadContent && cadContent.childElementCount === 0)
      || (pdfContent && pdfContent.childElementCount === 0)
    ) {
      this.treeRuntime.lastSignature = "";
      this.treeRuntime.decorate();
    }
  }


  private decoratePieceGroup(
    title: string,
    key: string,
    label: string,
  ): void {
    const details = this.findGroup(title);
    if (!details) return;

    const summary = details.querySelector<HTMLElement>(":scope > summary");
    if (!summary) return;

    const pieceEyes = this.getPieceEyes(details);
    let button = summary.querySelector<HTMLButtonElement>(
      `button[data-framelogic-piece-group-eye-key="${key}"]`,
    );

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.dataset["framelogicPieceGroupEye"] = "true";
      button.dataset["framelogicPieceGroupEyeKey"] = key;
      Object.assign(button.style, {
        float: "right",
        width: "22px",
        height: "18px",
        margin: "-1px 0 0 6px",
        padding: "0",
        border: "0",
        background: "transparent",
        color: "#cfe8f3",
        cursor: "pointer",
      });
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.togglePieceGroup(title);
      });
      summary.append(button);
    }

    if (pieceEyes.length < 1) {
      button.style.display = "";
      button.disabled = true;
      button.innerHTML = eyeSvg(false);
      button.style.opacity = "0.35";
      button.style.cursor = "default";
      button.title = `Sin ${label}`;
      button.setAttribute("aria-label", button.title);
      return;
    }

    button.disabled = false;
    button.style.display = "";
    button.style.cursor = "pointer";
    const visibleCount = pieceEyes.filter(
      (eye) => this.isPieceEyeVisible(eye),
    ).length;
    const allVisible = visibleCount === pieceEyes.length;
    const allHidden = visibleCount === 0;

    button.innerHTML = eyeSvg(allHidden);
    button.style.opacity = allVisible || allHidden ? "1" : "0.72";
    button.title = allVisible
      ? `Ocultar ${label}`
      : `Mostrar ${label}`;
    button.setAttribute("aria-label", button.title);
  }


  private togglePieceGroup(title: string): void {
    const details = this.findGroup(title);
    if (!details) return;

    const eyes = this.getPieceEyes(details);
    if (eyes.length < 1) return;

    const allVisible = eyes.every(
      (eye) => this.isPieceEyeVisible(eye),
    );
    const targetVisible = !allVisible;

    for (const eye of eyes) {
      if (this.isPieceEyeVisible(eye) === targetVisible) continue;
      eye.click();
    }

    window.setTimeout(
      () => this.sync(),
      0,
    );
  }


  private getPieceEyes(
    details: HTMLDetailsElement,
  ): HTMLButtonElement[] {
    return Array.from(
      details.querySelectorAll<HTMLButtonElement>(
        'button[data-framelogic-piece-visibility-eye]',
      ),
    );
  }


  private isPieceEyeVisible(
    eye: HTMLButtonElement,
  ): boolean {
    return eye.dataset["framelogicPieceVisible"] !== "false";
  }


  private findGroup(
    title: string,
  ): HTMLDetailsElement | null {
    const body = this.container.querySelector<HTMLElement>(
      '[data-framelogic-instance-tree-body="true"]',
    );
    if (!body) return null;

    return Array.from(
      body.querySelectorAll<HTMLDetailsElement>(":scope > details"),
    ).find((details) => {
      const summary = details.querySelector<HTMLElement>(":scope > summary");
      if (!summary) return false;
      const text = Array.from(summary.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim();
      return text === title;
    }) ?? null;
  }


  private hideEmptyCadGroupEye(): void {
    const button = this.container.querySelector<HTMLButtonElement>(
      'button[data-framelogic-group-eye-key="cad"]',
    );
    if (!button) return;
    button.style.display = button.disabled ? "none" : "";
  }
}


function eyeSvg(hidden: boolean): string {
  if (hidden) {
    return [
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">',
      '<path d="M3 3l18 18" fill="none" stroke="currentColor" stroke-width="1.8"/>',
      '<path d="M2.5 12s3.5-6 9.5-6c2.1 0 3.9.7 5.4 1.7M21.5 12s-3.5 6-9.5 6c-2.1 0-3.9-.7-5.4-1.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      '</svg>',
    ].join("");
  }

  return [
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">',
    '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    '<circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
    '</svg>',
  ].join("");
}
