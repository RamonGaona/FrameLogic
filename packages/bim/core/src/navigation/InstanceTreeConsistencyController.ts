import { findInstanceTreeBody } from "./findInstanceTreeBody";

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
 * - Los ojos de ensambles y piezas pertenecen al controlador único de
 *   visibilidad del Model Space, no a este reparador de árboles/PDF.
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
    this.hideEmptyCadGroupEye();
  }


  private repairDynamicGroups(): void {
    const body = findInstanceTreeBody(this.container);
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


  private hideEmptyCadGroupEye(): void {
    const button = findInstanceTreeBody(this.container)
      ?.querySelector<HTMLButtonElement>(
        'button[data-framelogic-group-eye-key="cad"]',
      );
    if (!button) return;
    button.style.display = button.disabled ? "none" : "";
  }
}

