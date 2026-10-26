import * as THREE from "three";

import type {
  DrawingFinishingController,
} from "./DrawingFinishingController";

import type {
  DrawingProfessionalController,
} from "./DrawingProfessionalController";

import type {
  DrawingViewLayoutState,
} from "./DrawingProfessionalModel";

import type {
  DrawingProductionController,
  SheetState,
} from "./DrawingProductionController";

import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";

interface DrawingReference {
  instanceId: string;
  x: number;
  y: number;
  featureId?: string;
  topologyId?: string;
  snapKind?: string;
  precision?: "BREP_EXACT" | "DERIVED_MESH";
  radius?: number;
  centerX?: number;
  centerY?: number;
  viewId?: string;
  sectionId?: string;
}

interface DrawingSegment {
  readonly instanceId: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly cut: boolean;
  readonly hidden?: boolean;
  readonly topologyId?: string;
}

interface DrawingSnapshotRuntime {
  readonly section: SectionViewDefinition;
  segments: DrawingSegment[];
}

interface AnnotationRuntime {
  id: string;
  kind: string;
  a?: DrawingReference;
  b?: DrawingReference;
  c?: DrawingReference;
  target?: DrawingReference;
  offsetX?: number;
  offsetY?: number;
  x?: number;
  y?: number;
  [key: string]: unknown;
}

interface DrawingDocumentRuntime {
  readonly sectionId: string;
  readonly annotations: AnnotationRuntime[];
}

interface AnnotationDragRuntime {
  readonly annotationId: string;
  readonly startX: number;
  readonly startY: number;
  readonly startOffsetX: number;
  readonly startOffsetY: number;
}

interface WorkspaceRuntime {
  documents: Map<string, DrawingDocumentRuntime>;
  activeSectionId: string | null;
  snapshot: DrawingSnapshotRuntime | null;
  pendingDimensionStart: DrawingReference | null;
  selectedAnnotationId: string | null;
  tool: string;
  dragState: AnnotationDragRuntime | null;
  zoom: number;
  readonly svg: SVGSVGElement;
  readonly overlay: HTMLDivElement;
  readonly stage: HTMLDivElement;
  render(): void;
  buildSnapshot(section: SectionViewDefinition): DrawingSnapshotRuntime;
  sectionToPaper(section: SectionViewDefinition, x: number, y: number): THREE.Vector2;
  paperToSection(section: SectionViewDefinition, x: number, y: number): THREE.Vector2;
  eventToSheetPoint(event: PointerEvent | MouseEvent): THREE.Vector2 | null;
  resolveReference(reference: DrawingReference): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  };
  setZoom(value: number): void;
  setStatus(message: string): void;
}

interface ProductionRuntime {
  getActiveSheet(): SheetState | null;
  handleDimensionPoint(x: number, y: number): void;
}

interface ProfessionalRuntime {
  angularReferences: DrawingReference[];
  baselineReference: DrawingReference | null;
}

interface ViewContext {
  readonly viewId: string;
  readonly section: SectionViewDefinition;
  readonly snapshot: DrawingSnapshotRuntime;
  readonly layout: DrawingViewLayoutState;
  readonly primary: boolean;
  readonly toPaper: (x: number, y: number) => THREE.Vector2;
  readonly toSection: (x: number, y: number) => THREE.Vector2;
}

interface PanState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly scrollLeft: number;
  readonly scrollTop: number;
}

export interface DrawingUsabilityControllerOptions {
  readonly container: HTMLElement;
  readonly sectionDrawing: SectionDrawingController;
  readonly drawingWorkspace: DrawingWorkspaceController;
  readonly drawingProduction: DrawingProductionController;
  readonly drawingProfessional: DrawingProfessionalController;
  readonly drawingFinishing: DrawingFinishingController;
}

const SHEET_WIDTH = 1120;
const SHEET_HEIGHT = 792;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 16;

/**
 * Ajustes de interacción sobre Drawing sin duplicar el motor de documentación:
 * ORTHO al mover cotas, zoom/pan 2D, cotas en viewports secundarios y
 * regeneración exacta automática cuando se vuelve desde Model Space.
 */
export class DrawingUsabilityController {
  private readonly sectionDrawing: SectionDrawingController;
  private readonly drawingWorkspace: DrawingWorkspaceController;
  private readonly drawingProfessional: DrawingProfessionalController;
  private readonly drawingFinishing: DrawingFinishingController;
  private readonly workspace: WorkspaceRuntime;
  private readonly production: ProductionRuntime;
  private readonly professionalRuntime: ProfessionalRuntime;
  private readonly baseResolveReference: WorkspaceRuntime["resolveReference"];
  private readonly baseOpenActiveSection: () => boolean;
  private readonly orthoButton: HTMLButtonElement | null;
  private readonly refreshButton: HTMLButtonElement | null;
  private orthoEnabled = false;
  private panState: PanState | null = null;
  private refreshPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(
    options: DrawingUsabilityControllerOptions,
  ) {
    this.sectionDrawing = options.sectionDrawing;
    this.drawingWorkspace = options.drawingWorkspace;
    this.drawingProfessional = options.drawingProfessional;
    this.drawingFinishing = options.drawingFinishing;
    this.workspace = options.drawingWorkspace as unknown as WorkspaceRuntime;
    this.production = options.drawingProduction as unknown as ProductionRuntime;
    this.professionalRuntime = options.drawingProfessional as unknown as ProfessionalRuntime;
    this.baseResolveReference = this.workspace.resolveReference.bind(options.drawingWorkspace);
    this.baseOpenActiveSection = options.drawingWorkspace.openActiveSection.bind(options.drawingWorkspace);

    this.orthoButton = this.installOrthoButton(options.container);
    this.refreshButton = this.findToolbarButton(options.container, "Actualizar");
    this.installZoomAndPan();
    this.installMultiViewDimensions();
    this.installAutomaticRefresh();

    window.addEventListener("keydown", this.handleKeyDown, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("keydown", this.handleKeyDown, true);
    this.workspace.svg.removeEventListener("pointermove", this.handleOrthoPointerMove, true);
    this.workspace.svg.removeEventListener("pointerdown", this.handleSecondaryDimensionPointerDown, true);
    this.workspace.stage.removeEventListener("wheel", this.handleZoomWheel, true);
    this.workspace.stage.removeEventListener("pointerdown", this.handlePanPointerDown, true);
    this.workspace.stage.removeEventListener("pointermove", this.handlePanPointerMove, true);
    this.workspace.stage.removeEventListener("pointerup", this.handlePanPointerUp, true);
    this.workspace.stage.removeEventListener("pointercancel", this.handlePanPointerUp, true);
    this.refreshButton?.removeEventListener("click", this.handleRefreshClick);
    this.orthoButton?.remove();
    this.workspace.resolveReference = this.baseResolveReference;
    this.drawingWorkspace.openActiveSection = this.baseOpenActiveSection;
  }

  private installOrthoButton(
    container: HTMLElement,
  ): HTMLButtonElement | null {
    const overlay = container.querySelector<HTMLElement>('[data-framelogic-drawing-workspace="true"]');
    const toolbar = overlay?.firstElementChild as HTMLElement | null;
    if (!toolbar) return null;

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "ORTHO F8";
    button.title = "Restringir movimiento de cotas a horizontal/vertical (F8)";
    button.style.padding = "5px 8px";
    button.style.border = "1px solid rgba(255,255,255,0.16)";
    button.style.borderRadius = "4px";
    button.style.background = "#27343c";
    button.style.color = "#f3f7f9";
    button.style.cursor = "pointer";
    button.addEventListener("click", () => this.toggleOrtho());

    const exportButton = Array.from(toolbar.querySelectorAll("button"))
      .find((candidate) => candidate.textContent === "Exportar PDF");
    if (exportButton) exportButton.before(button);
    else toolbar.append(button);
    return button;
  }

  private installZoomAndPan(): void {
    this.workspace.setZoom = (value) => {
      const zoom = THREE.MathUtils.clamp(value, MIN_ZOOM, MAX_ZOOM);
      this.workspace.zoom = zoom;
      this.workspace.svg.style.transform = `scale(${zoom})`;
      this.workspace.svg.style.marginRight = `${SHEET_WIDTH * (zoom - 1)}px`;
      this.workspace.svg.style.marginBottom = `${SHEET_HEIGHT * (zoom - 1)}px`;
    };

    this.workspace.stage.addEventListener("wheel", this.handleZoomWheel, {
      capture: true,
      passive: false,
    });
    this.workspace.stage.addEventListener("pointerdown", this.handlePanPointerDown, true);
    this.workspace.stage.addEventListener("pointermove", this.handlePanPointerMove, true);
    this.workspace.stage.addEventListener("pointerup", this.handlePanPointerUp, true);
    this.workspace.stage.addEventListener("pointercancel", this.handlePanPointerUp, true);
  }

  private installMultiViewDimensions(): void {
    this.workspace.resolveReference = (reference) => this.resolveReference(reference);
    this.workspace.svg.addEventListener("pointerdown", this.handleSecondaryDimensionPointerDown, true);
    this.workspace.svg.addEventListener("pointermove", this.handleOrthoPointerMove, true);
  }

  private installAutomaticRefresh(): void {
    this.drawingWorkspace.openActiveSection = (): boolean => {
      const opened = this.baseOpenActiveSection();
      if (opened) void this.refreshExactFromModel();
      return opened;
    };
    this.refreshButton?.addEventListener("click", this.handleRefreshClick);
  }

  private readonly handleRefreshClick = (): void => {
    void this.refreshExactFromModel();
  };

  private async refreshExactFromModel(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.drawingProfessional
      .refreshExactDrawing()
      .then(() => {
        this.drawingFinishing.markCurrentDrawingUpdated();
        this.workspace.render();
        this.workspace.setStatus(
          "Vista actualizada automáticamente desde Model Space / OpenCascade.",
        );
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.workspace.overlay.style.display === "none") return;
    if (event.key === "F8") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.toggleOrtho();
    }
  };

  private toggleOrtho(): void {
    this.orthoEnabled = !this.orthoEnabled;
    if (this.orthoButton) {
      this.orthoButton.style.background = this.orthoEnabled ? "#3b6d87" : "#27343c";
    }
    this.workspace.setStatus(
      this.orthoEnabled
        ? "ORTHO activado (F8): las cotas se mueven solo horizontal o vertical."
        : "ORTHO desactivado (F8).",
    );
  }

  private readonly handleOrthoPointerMove = (event: PointerEvent): void => {
    if (!this.orthoEnabled || !this.workspace.dragState) return;
    const drag = this.workspace.dragState;
    const documentState = this.activeDocument();
    const annotation = documentState?.annotations.find((entry) => entry.id === drag.annotationId);
    if (!annotation || annotation.kind !== "DIMENSION") return;
    const point = this.workspace.eventToSheetPoint(event);
    if (!point) return;

    let dx = point.x - drag.startX;
    let dy = point.y - drag.startY;
    if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
    else dx = 0;

    annotation.offsetX = drag.startOffsetX + dx;
    annotation.offsetY = drag.startOffsetY + dy;
    this.workspace.render();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handleZoomWheel = (event: WheelEvent): void => {
    if (this.workspace.overlay.style.display === "none") return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const oldZoom = this.workspace.zoom || 1;
    const nextZoom = THREE.MathUtils.clamp(
      oldZoom * (event.deltaY < 0 ? 1.16 : 1 / 1.16),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    const rect = this.workspace.stage.getBoundingClientRect();
    const viewportX = event.clientX - rect.left;
    const viewportY = event.clientY - rect.top;
    const contentX = this.workspace.stage.scrollLeft + viewportX;
    const contentY = this.workspace.stage.scrollTop + viewportY;
    const ratio = nextZoom / oldZoom;

    this.workspace.setZoom(nextZoom);
    this.workspace.stage.scrollLeft = contentX * ratio - viewportX;
    this.workspace.stage.scrollTop = contentY * ratio - viewportY;
    this.workspace.setStatus(
      `Zoom 2D ${Math.round(nextZoom * 100)}% · rueda = zoom · botón central = pan.`,
    );
  };

  private readonly handlePanPointerDown = (event: PointerEvent): void => {
    if (this.workspace.overlay.style.display === "none" || event.button !== 1) return;
    this.panState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: this.workspace.stage.scrollLeft,
      scrollTop: this.workspace.stage.scrollTop,
    };
    this.workspace.stage.setPointerCapture(event.pointerId);
    this.workspace.stage.style.cursor = "grabbing";
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePanPointerMove = (event: PointerEvent): void => {
    const pan = this.panState;
    if (!pan || pan.pointerId !== event.pointerId) return;
    this.workspace.stage.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    this.workspace.stage.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handlePanPointerUp = (event: PointerEvent): void => {
    if (!this.panState || this.panState.pointerId !== event.pointerId) return;
    if (this.workspace.stage.hasPointerCapture(event.pointerId)) {
      this.workspace.stage.releasePointerCapture(event.pointerId);
    }
    this.panState = null;
    this.workspace.stage.style.cursor = "";
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handleSecondaryDimensionPointerDown = (event: PointerEvent): void => {
    if (this.workspace.overlay.style.display === "none" || this.workspace.tool !== "DIMENSION") return;
    const point = this.workspace.eventToSheetPoint(event);
    if (!point) return;
    const context = this.findViewAt(point.x, point.y);
    if (!context || context.primary) return;

    const pending = this.workspace.pendingDimensionStart;
    if (pending && pending.viewId !== context.viewId) {
      this.workspace.pendingDimensionStart = null;
      this.workspace.setStatus("COTA: las referencias deben pertenecer a la misma vista. Toma el primer punto otra vez.");
    }

    this.handleDimensionInsideView(context, point.x, point.y);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private handleDimensionInsideView(
    context: ViewContext,
    paperX: number,
    paperY: number,
  ): void {
    const previousSnapshot = this.workspace.snapshot;
    const previousSectionToPaper = this.workspace.sectionToPaper;
    const previousPaperToSection = this.workspace.paperToSection;
    const documentState = this.activeDocument();
    const beforeLength = documentState?.annotations.length ?? 0;

    this.workspace.snapshot = context.snapshot;
    this.workspace.sectionToPaper = (section, x, y) =>
      section.id === context.section.id
        ? context.toPaper(x, y)
        : previousSectionToPaper.call(this.drawingWorkspace, section, x, y);
    this.workspace.paperToSection = (section, x, y) =>
      section.id === context.section.id
        ? context.toSection(x, y)
        : previousPaperToSection.call(this.drawingWorkspace, section, x, y);

    try {
      this.production.handleDimensionPoint(paperX, paperY);
      this.decoratePendingReferences(context);
      if (documentState) {
        for (const annotation of documentState.annotations.slice(beforeLength)) {
          this.decorateAnnotationReferences(annotation, context);
        }
      }
    }
    finally {
      this.workspace.snapshot = previousSnapshot;
      this.workspace.sectionToPaper = previousSectionToPaper;
      this.workspace.paperToSection = previousPaperToSection;
      this.workspace.render();
    }
  }

  private decoratePendingReferences(context: ViewContext): void {
    if (this.workspace.pendingDimensionStart) {
      this.decorateReference(this.workspace.pendingDimensionStart, context);
    }
    const lastAngular = this.professionalRuntime.angularReferences.at(-1);
    if (lastAngular) this.decorateReference(lastAngular, context);
    if (this.professionalRuntime.baselineReference) {
      this.decorateReference(this.professionalRuntime.baselineReference, context);
    }
  }

  private decorateAnnotationReferences(
    annotation: AnnotationRuntime,
    context: ViewContext,
  ): void {
    for (const reference of [annotation.a, annotation.b, annotation.c, annotation.target]) {
      if (reference) this.decorateReference(reference, context);
    }
  }

  private decorateReference(reference: DrawingReference, context: ViewContext): void {
    if (reference.viewId) return;
    reference.viewId = context.viewId;
    reference.sectionId = context.section.id;
  }

  private resolveReference(reference: DrawingReference): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  } {
    if (!reference.viewId) return this.baseResolveReference(reference);
    const context = this.getViewContext(reference.viewId);
    if (!context) {
      return {
        point: new THREE.Vector2(reference.x, reference.y),
        lost: true,
      };
    }

    if (reference.snapKind === "CENTER" && reference.centerX !== undefined && reference.centerY !== undefined) {
      reference.x = reference.centerX;
      reference.y = reference.centerY;
      return {
        point: context.toPaper(reference.x, reference.y),
        lost: false,
      };
    }

    let candidates = context.snapshot.segments.filter(
      (segment) => !segment.hidden && segment.instanceId === reference.instanceId,
    );
    if (reference.topologyId) {
      const topologyMatches = candidates.filter((segment) => segment.topologyId === reference.topologyId);
      if (topologyMatches.length > 0) candidates = topologyMatches;
    }
    if (candidates.length < 1) {
      return {
        point: context.toPaper(reference.x, reference.y),
        lost: true,
      };
    }

    const stored = new THREE.Vector2(reference.x, reference.y);
    let best = stored.clone();
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const segment of candidates) {
      const candidate = this.referencePointOnSegment(reference.snapKind, stored, segment);
      const distance = candidate.distanceToSquared(stored);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    reference.x = best.x;
    reference.y = best.y;
    return {
      point: context.toPaper(best.x, best.y),
      lost: false,
    };
  }

  private referencePointOnSegment(
    snapKind: string | undefined,
    stored: THREE.Vector2,
    segment: DrawingSegment,
  ): THREE.Vector2 {
    const a = new THREE.Vector2(segment.x1, segment.y1);
    const b = new THREE.Vector2(segment.x2, segment.y2);
    if (snapKind === "MIDPOINT") return a.clone().add(b).multiplyScalar(0.5);
    if (snapKind === "ENDPOINT") {
      return a.distanceToSquared(stored) <= b.distanceToSquared(stored) ? a : b;
    }
    return closestPointOnSegment(stored, a, b);
  }

  private findViewAt(x: number, y: number): ViewContext | null {
    const sheet = this.production.getActiveSheet();
    if (!sheet) return null;
    const layouts = this.drawingProfessional.createProfessionalSnapshot().state.viewLayouts;
    for (let index = sheet.views.length - 1; index >= 0; index -= 1) {
      const view = sheet.views[index];
      if (!view) continue;
      const layout = layouts.find((entry) => entry.id === view.id);
      if (!layout) continue;
      if (x < layout.x || x > layout.x + layout.width || y < layout.y || y > layout.y + layout.height) continue;
      return this.createViewContext(sheet, view.id, view.sectionId, layout, index === 0);
    }
    return null;
  }

  private getViewContext(viewId: string): ViewContext | null {
    const sheet = this.production.getActiveSheet();
    if (!sheet) return null;
    const viewIndex = sheet.views.findIndex((view) => view.id === viewId);
    const view = sheet.views[viewIndex];
    if (!view) return null;
    const layout = this.drawingProfessional
      .createProfessionalSnapshot()
      .state
      .viewLayouts
      .find((entry) => entry.id === viewId);
    if (!layout) return null;
    return this.createViewContext(sheet, view.id, view.sectionId, layout, viewIndex === 0);
  }

  private createViewContext(
    _sheet: SheetState,
    viewId: string,
    sectionId: string,
    layout: DrawingViewLayoutState,
    primary: boolean,
  ): ViewContext | null {
    const section = this.sectionDrawing.getSections().find((entry) => entry.id === sectionId);
    if (!section) return null;
    const snapshot = this.workspace.buildSnapshot(section);

    if (primary) {
      return {
        viewId,
        section,
        snapshot,
        layout,
        primary: true,
        toPaper: (x, y) => this.workspace.sectionToPaper(section, x, y),
        toSection: (x, y) => this.workspace.paperToSection(section, x, y),
      };
    }

    const cropRadius = layout.kind === "DETAIL" ? layout.cropRadius : undefined;
    const centerX = layout.cropCenterX ?? section.width / 2;
    const centerY = layout.cropCenterY ?? section.height / 2;
    const modelWidth = cropRadius ? cropRadius * 2 : section.width;
    const modelHeight = cropRadius ? cropRadius * 2 : section.height;
    const scale = Math.max(
      1e-9,
      Math.min(
        Math.max(1, layout.width - 20) / Math.max(modelWidth, 1e-9),
        Math.max(1, layout.height - 28) / Math.max(modelHeight, 1e-9),
      ),
    );
    const originX = layout.x + layout.width / 2 - centerX * scale;
    const originY = layout.y + layout.height / 2 + centerY * scale;

    return {
      viewId,
      section,
      snapshot,
      layout,
      primary: false,
      toPaper: (x, y) => new THREE.Vector2(originX + x * scale, originY - y * scale),
      toSection: (x, y) => new THREE.Vector2((x - originX) / scale, (originY - y) / scale),
    };
  }

  private activeDocument(): DrawingDocumentRuntime | null {
    const id = this.workspace.activeSectionId;
    return id ? this.workspace.documents.get(id) ?? null : null;
  }

  private findToolbarButton(container: HTMLElement, text: string): HTMLButtonElement | null {
    const overlay = container.querySelector<HTMLElement>('[data-framelogic-drawing-workspace="true"]');
    return Array.from(overlay?.querySelectorAll("button") ?? [])
      .find((button) => button.textContent === text)
      ?? null;
  }
}

function closestPointOnSegment(
  point: THREE.Vector2,
  start: THREE.Vector2,
  end: THREE.Vector2,
): THREE.Vector2 {
  const direction = end.clone().sub(start);
  const lengthSq = direction.lengthSq();
  if (lengthSq <= 1e-18) return start.clone();
  const t = THREE.MathUtils.clamp(
    point.clone().sub(start).dot(direction) / lengthSq,
    0,
    1,
  );
  return start.clone().addScaledVector(direction, t);
}
