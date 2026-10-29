import * as THREE from "three";

import type {
  DrawingProductionController,
} from "./DrawingProductionController";

import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionDrawingController,
  SectionViewDefinition,
} from "./SectionDrawingController";

interface SectionVisualRuntime {
  readonly group: THREE.Group;
}

interface SectionDrawingRuntime {
  activeSectionId: string | null;
  readonly visuals: Map<string, SectionVisualRuntime>;
  createVisual(section: SectionViewDefinition): void;
  refreshUi(): void;
  replaceSection(section: SectionViewDefinition): void;
  removeActiveSection(): boolean;
  setStatus(message: string): void;
}

interface AssemblyReferenceRuntime {
  instanceId: string;
  x: number;
  y: number;
  snapKind?: string;
  precision?: "DERIVED_MESH" | "BREP_EXACT";
  framelogicPdfViewId?: string;
}

interface AssemblyPlanSegmentRuntime {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly instanceId?: string;
}

interface AssemblyViewRuntime {
  readonly id: string;
  readonly sectionId: string;
  readonly kind?: string;
  readonly instanceIds?: readonly string[];
  readonly width?: number;
  readonly height?: number;
  readonly segments?: readonly AssemblyPlanSegmentRuntime[];
}

interface SheetRuntime {
  readonly size: string;
  readonly orientation: string;
  readonly views: readonly AssemblyViewRuntime[];
}

interface DrawingProductionRuntime {
  readonly sheets: Map<string, SheetRuntime>;
  syncSectionLayerVisibility(): void;
  pickReference(
    x: number,
    y: number,
  ): AssemblyReferenceRuntime | null;
  resolveReference(reference: AssemblyReferenceRuntime): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  };
}

interface DrawingWorkspaceRuntime {
  activeSectionId: string | null;
  pendingDimensionStart: AssemblyReferenceRuntime | null;
  tool: string;
  readonly svg: SVGSVGElement;
  readonly overlay: HTMLElement;
  eventToSheetPoint(event: PointerEvent | MouseEvent): THREE.Vector2 | null;
}

interface Options {
  readonly container: HTMLElement;
  readonly sectionDrawing: SectionDrawingController;
  readonly drawingWorkspace: DrawingWorkspaceController;
  readonly drawingProduction: DrawingProductionController;
}

interface AssemblyViewTransform {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly originX: number;
  readonly baseY: number;
}

const SHEET_WIDTH = 1120;
const SHEET_HEIGHT = 792;
const SHEET_MM: Record<string, readonly [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  A0: [1189, 841],
};
const SNAP_DISTANCE = 17;

/**
 * Integra las vistas de sección dentro del árbol INSTANCIAS y completa el
 * sistema de SNAP 2D para Views de ensamble dentro del motor PDF general.
 *
 * Las Views de ensamble se dibujan como segmentos SVG, pero no forman parte
 * del snapshot de sección. Este bridge registra ENDPOINT, MIDPOINT e
 * INTERSECTION sobre esos segmentos y resuelve las referencias usando la
 * posición/escala actual de la View, de forma que una cota siga anclada aunque
 * la View se mueva o cambie de escala.
 */
export class SectionInstanceTreeBridgeController {
  private readonly options: Options;
  private readonly runtime: SectionDrawingRuntime;
  private readonly productionRuntime: DrawingProductionRuntime;
  private readonly workspaceRuntime: DrawingWorkspaceRuntime;
  private readonly hidden = new Set<string>();
  private readonly originalCreateVisual: (
    section: SectionViewDefinition,
  ) => void;
  private readonly originalSyncSectionLayerVisibility: () => void;
  private readonly originalPickReference: (
    x: number,
    y: number,
  ) => AssemblyReferenceRuntime | null;
  private readonly originalResolveReference: (
    reference: AssemblyReferenceRuntime,
  ) => {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  };
  private readonly timer: number;
  private contextMenu: HTMLDivElement | null = null;
  private snapMarker: SVGGElement | null = null;
  private lastSignature = "";
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.runtime = options.sectionDrawing as unknown as SectionDrawingRuntime;
    this.productionRuntime =
      options.drawingProduction as unknown as DrawingProductionRuntime;
    this.workspaceRuntime =
      options.drawingWorkspace as unknown as DrawingWorkspaceRuntime;

    this.originalSyncSectionLayerVisibility =
      this.productionRuntime.syncSectionLayerVisibility.bind(
        this.productionRuntime,
      );
    this.productionRuntime.syncSectionLayerVisibility = (): void => {
      this.originalSyncSectionLayerVisibility();
      this.reapplyHiddenVisibility();
    };

    this.originalPickReference =
      this.productionRuntime.pickReference.bind(this.productionRuntime);
    this.productionRuntime.pickReference = (x, y) =>
      this.pickDrawingReference(x, y);

    this.originalResolveReference =
      this.productionRuntime.resolveReference.bind(this.productionRuntime);
    this.productionRuntime.resolveReference = (reference) =>
      this.resolveDrawingReference(reference);

    this.originalCreateVisual =
      this.runtime.createVisual.bind(this.runtime);
    this.runtime.createVisual = (
      section: SectionViewDefinition,
    ): void => {
      this.originalCreateVisual(section);
      this.productionRuntime.syncSectionLayerVisibility();
    };

    this.workspaceRuntime.svg.addEventListener(
      "pointermove",
      this.handlePdfSnapPointerMove,
      true,
    );
    this.workspaceRuntime.svg.addEventListener(
      "pointerleave",
      this.clearPdfSnapMarker,
      true,
    );

    this.productionRuntime.syncSectionLayerVisibility();
    this.decorate();
    this.timer = window.setInterval(() => this.decorate(), 300);
    window.addEventListener("pointerdown", this.handleGlobalPointerDown, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    window.removeEventListener("pointerdown", this.handleGlobalPointerDown, true);
    this.workspaceRuntime.svg.removeEventListener(
      "pointermove",
      this.handlePdfSnapPointerMove,
      true,
    );
    this.workspaceRuntime.svg.removeEventListener(
      "pointerleave",
      this.clearPdfSnapMarker,
      true,
    );
    this.clearPdfSnapMarker();

    for (const id of this.hidden) {
      this.setRenderLayerHidden(id, false);
    }

    this.runtime.createVisual = this.originalCreateVisual;
    this.productionRuntime.syncSectionLayerVisibility =
      this.originalSyncSectionLayerVisibility;
    this.productionRuntime.pickReference = this.originalPickReference;
    this.productionRuntime.resolveReference = this.originalResolveReference;
    this.hideContextMenu();
    this.options.container
      .querySelector('[data-framelogic-section-tree="true"]')
      ?.remove();
  }

  private readonly handleGlobalPointerDown = (event: PointerEvent): void => {
    if (
      this.contextMenu
      && event.target instanceof Node
      && !this.contextMenu.contains(event.target)
    ) {
      this.hideContextMenu();
    }
  };

  private pickDrawingReference(
    paperX: number,
    paperY: number,
  ): AssemblyReferenceRuntime | null {
    const assembly = this.pickAssemblyReference(paperX, paperY);
    const base = this.originalPickReference(paperX, paperY);
    if (!assembly) return base;
    if (!base) return assembly;

    const assemblyPoint = this.resolveAssemblyReference(assembly)?.point;
    const baseResolved = this.originalResolveReference(base);
    if (!assemblyPoint || baseResolved.lost) return assembly;

    const assemblyDistance = Math.hypot(
      assemblyPoint.x - paperX,
      assemblyPoint.y - paperY,
    );
    const baseDistance = Math.hypot(
      baseResolved.point.x - paperX,
      baseResolved.point.y - paperY,
    );
    return assemblyDistance <= baseDistance ? assembly : base;
  }

  private resolveDrawingReference(reference: AssemblyReferenceRuntime): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  } {
    const resolved = this.resolveAssemblyReference(reference);
    return resolved ?? this.originalResolveReference(reference);
  }

  private pickAssemblyReference(
    paperX: number,
    paperY: number,
  ): AssemblyReferenceRuntime | null {
    const activeSheetId = this.workspaceRuntime.activeSectionId;
    if (!activeSheetId) return null;
    const sheet = this.productionRuntime.sheets.get(activeSheetId);
    if (!sheet) return null;

    const pending = this.workspaceRuntime.pendingDimensionStart;
    const pendingViewId = pending?.framelogicPdfViewId;
    if (pending && !pendingViewId) {
      return null;
    }

    let best: AssemblyReferenceRuntime | null = null;
    let bestDistance = SNAP_DISTANCE;

    sheet.views.forEach((view, index) => {
      if (view.kind !== "ASSEMBLY") return;
      if (pendingViewId && pendingViewId !== view.id) return;
      const transform = this.getAssemblyViewTransform(sheet, view, index);
      const segments = view.segments ?? [];
      if (!transform || segments.length < 1) return;
      const fallbackInstanceId = view.instanceIds?.[0] ?? `assembly:${view.id}`;

      const consider = (
        x: number,
        y: number,
        snapKind: "ENDPOINT" | "MIDPOINT" | "INTERSECTION" | "NEAREST",
        instanceId = fallbackInstanceId,
      ): void => {
        const point = this.assemblyPointToPaper(transform, x, y);
        const distance = Math.hypot(point.x - paperX, point.y - paperY);
        if (distance >= bestDistance) return;
        bestDistance = distance;
        best = {
          instanceId,
          x,
          y,
          snapKind,
          precision: "DERIVED_MESH",
          framelogicPdfViewId: view.id,
        };
      };

      for (const segment of segments) {
        const instanceId = segment.instanceId ?? fallbackInstanceId;
        consider(segment.x1, segment.y1, "ENDPOINT", instanceId);
        consider(segment.x2, segment.y2, "ENDPOINT", instanceId);
        consider(
          (segment.x1 + segment.x2) / 2,
          (segment.y1 + segment.y2) / 2,
          "MIDPOINT",
          instanceId,
        );

        const a = this.assemblyPointToPaper(
          transform,
          segment.x1,
          segment.y1,
        );
        const b = this.assemblyPointToPaper(
          transform,
          segment.x2,
          segment.y2,
        );
        const nearest = closestPointOnSegment(
          new THREE.Vector2(paperX, paperY),
          a,
          b,
        );
        const distance = Math.hypot(
          nearest.point.x - paperX,
          nearest.point.y - paperY,
        );
        if (distance < Math.min(bestDistance, 9)) {
          const localX = segment.x1
            + (segment.x2 - segment.x1) * nearest.t;
          const localY = segment.y1
            + (segment.y2 - segment.y1) * nearest.t;
          consider(localX, localY, "NEAREST", instanceId);
        }
      }

      if (segments.length <= 260) {
        for (let first = 0; first < segments.length; first += 1) {
          const a = segments[first];
          if (!a) continue;
          for (let second = first + 1; second < segments.length; second += 1) {
            const b = segments[second];
            if (!b) continue;
            const point = segmentIntersection(a, b);
            if (!point) continue;
            consider(
              point.x,
              point.y,
              "INTERSECTION",
              a.instanceId ?? fallbackInstanceId,
            );
          }
        }
      }
    });

    return best;
  }

  private resolveAssemblyReference(
    reference: AssemblyReferenceRuntime,
  ): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  } | null {
    const viewId = reference.framelogicPdfViewId;
    if (!viewId) return null;
    const activeSheetId = this.workspaceRuntime.activeSectionId;
    if (!activeSheetId) {
      return { point: new THREE.Vector2(reference.x, reference.y), lost: true };
    }
    const sheet = this.productionRuntime.sheets.get(activeSheetId);
    if (!sheet) {
      return { point: new THREE.Vector2(reference.x, reference.y), lost: true };
    }
    const index = sheet.views.findIndex((view) => view.id === viewId);
    const view = index >= 0 ? sheet.views[index] : undefined;
    if (!view || view.kind !== "ASSEMBLY") {
      return { point: new THREE.Vector2(reference.x, reference.y), lost: true };
    }
    const transform = this.getAssemblyViewTransform(sheet, view, index);
    if (!transform) {
      return { point: new THREE.Vector2(reference.x, reference.y), lost: true };
    }
    return {
      point: this.assemblyPointToPaper(
        transform,
        reference.x,
        reference.y,
      ),
      lost: false,
    };
  }

  private getAssemblyViewTransform(
    sheet: SheetRuntime,
    view: AssemblyViewRuntime,
    index: number,
  ): AssemblyViewTransform | null {
    const move = this.workspaceRuntime.svg.querySelector<SVGRectElement>(
      `[data-framelogic-view-id="${cssEscape(view.id)}"][data-framelogic-view-action="MOVE"]`,
    );
    const resize = this.workspaceRuntime.svg.querySelector<SVGRectElement>(
      `[data-framelogic-view-id="${cssEscape(view.id)}"][data-framelogic-view-action="RESIZE"]`,
    );
    if (!move || !resize) return null;

    const x = Number(move.getAttribute("x") ?? 0);
    const y = Number(move.getAttribute("y") ?? 0);
    const width = Number(move.getAttribute("width") ?? 0);
    const resizeY = Number(resize.getAttribute("y") ?? y);
    const height = Math.max(1, resizeY + 9 - y);
    const modelWidth = Math.max(view.width ?? 0, 1e-9);
    const modelHeight = Math.max(view.height ?? 0, 1e-9);

    const denominator = this.readViewScaleDenominator(index, x, y, width, height);
    const innerWidth = Math.max(1, width - 20);
    const innerHeight = Math.max(1, height - 34);
    const scale = denominator === null
      ? Math.min(innerWidth / modelWidth, innerHeight / modelHeight)
      : this.technicalScale(sheet, denominator);
    const drawnWidth = modelWidth * scale;
    const drawnHeight = modelHeight * scale;
    const originX = x + (width - drawnWidth) / 2;
    const originY = y + 20 + (innerHeight - drawnHeight) / 2;

    return {
      x,
      y,
      width,
      height,
      scale,
      originX,
      baseY: originY + drawnHeight,
    };
  }

  private readViewScaleDenominator(
    index: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): number | null {
    const prefix = `VIEW ${index + 1} ·`;
    const labels = Array.from(
      this.workspaceRuntime.svg.querySelectorAll<SVGTextElement>("text"),
    );
    for (const label of labels) {
      if (!(label.textContent ?? "").startsWith(prefix)) continue;
      const lx = Number(label.getAttribute("x") ?? 0);
      const ly = Number(label.getAttribute("y") ?? 0);
      if (lx < x || lx > x + width || ly < y || ly > y + height) continue;
      const match = label.textContent?.match(/1:(\d+(?:\.\d+)?)/);
      return match?.[1] ? Number(match[1]) : null;
    }
    return null;
  }

  private technicalScale(sheet: SheetRuntime, denominator: number): number {
    const [rawWidth, rawHeight] = SHEET_MM[sheet.size] ?? SHEET_MM["A3"]!;
    const paperWidth = sheet.orientation === "LANDSCAPE"
      ? rawWidth
      : rawHeight;
    const paperHeight = sheet.orientation === "LANDSCAPE"
      ? rawHeight
      : rawWidth;
    const pxPerMm = Math.min(
      (SHEET_WIDTH - 84) / paperWidth,
      (SHEET_HEIGHT - 84) / paperHeight,
    );
    return (1000 / Math.max(denominator, 1)) * pxPerMm;
  }

  private assemblyPointToPaper(
    transform: AssemblyViewTransform,
    x: number,
    y: number,
  ): THREE.Vector2 {
    return new THREE.Vector2(
      transform.originX + x * transform.scale,
      transform.baseY - y * transform.scale,
    );
  }

  private readonly handlePdfSnapPointerMove = (
    event: PointerEvent,
  ): void => {
    if (this.workspaceRuntime.overlay.style.display === "none") return;
    if (
      this.workspaceRuntime.tool !== "DIMENSION"
      && this.workspaceRuntime.tool !== "LABEL"
    ) {
      this.clearPdfSnapMarker();
      return;
    }
    const point = this.workspaceRuntime.eventToSheetPoint(event);
    if (!point) return;
    const reference = this.productionRuntime.pickReference(point.x, point.y);
    if (!reference?.framelogicPdfViewId) {
      this.clearPdfSnapMarker();
      return;
    }
    const resolved = this.resolveAssemblyReference(reference);
    if (!resolved || resolved.lost) {
      this.clearPdfSnapMarker();
      return;
    }

    this.workspaceRuntime.svg
      .querySelectorAll('[data-framelogic-drawing-snap="true"]')
      .forEach((element) => element.remove());
    this.clearPdfSnapMarker();

    const group = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "g",
    );
    group.setAttribute("data-framelogic-drawing-snap", "true");
    group.setAttribute("data-framelogic-assembly-view-snap", "true");
    group.style.pointerEvents = "none";

    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    circle.setAttribute("cx", String(resolved.point.x));
    circle.setAttribute("cy", String(resolved.point.y));
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "#d58a00");
    circle.setAttribute("stroke-width", "1.5");

    const text = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "text",
    );
    text.setAttribute("x", String(resolved.point.x + 8));
    text.setAttribute("y", String(resolved.point.y - 8));
    text.setAttribute("font-size", "9");
    text.setAttribute("fill", "#333");
    text.textContent = `${reference.snapKind ?? "SNAP"} · VIEW`;

    group.append(circle, text);
    this.workspaceRuntime.svg.append(group);
    this.snapMarker = group;
  };

  private readonly clearPdfSnapMarker = (): void => {
    this.snapMarker?.remove();
    this.snapMarker = null;
  };

  private decorate(): void {
    if (this.disposed) return;
    const body = this.options.container.querySelector<HTMLElement>(
      '[data-framelogic-instance-tree-body="true"]',
    );
    if (!body) return;

    this.cleanupHiddenIds();
    this.reapplyHiddenVisibility();

    const sections = this.options.sectionDrawing.getSections();
    const activeId = this.options.sectionDrawing.getActiveSection()?.id ?? null;
    const signature = sections
      .map((section) =>
        `${section.id}:${section.name}:${section.depth}:${this.hidden.has(section.id)}`,
      )
      .join("|") + `|active:${activeId}`;

    let details = body.querySelector<HTMLDetailsElement>(
      'details[data-framelogic-section-tree="true"]',
    );
    const created = !details;

    if (!details) {
      details = document.createElement("details");
      details.dataset["framelogicSectionTree"] = "true";
      details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = "VISTAS DE SECCIÓN";
      Object.assign(summary.style, {
        padding: "6px 8px",
        cursor: "pointer",
        color: "#dce8ed",
        fontWeight: "600",
        userSelect: "none",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      });
      const content = document.createElement("div");
      content.dataset["framelogicSectionTreeContent"] = "true";
      details.append(summary, content);

      const cad = Array.from(body.querySelectorAll<HTMLDetailsElement>("details"))
        .find((candidate) =>
          candidate.querySelector("summary")?.textContent === "REFERENCIAS CAD",
        );
      if (cad) body.insertBefore(details, cad);
      else body.append(details);
    }

    if (!created && this.lastSignature === signature) return;
    this.lastSignature = signature;

    const content = details.querySelector<HTMLElement>(
      '[data-framelogic-section-tree-content="true"]',
    );
    if (!content) return;
    content.replaceChildren();

    if (sections.length < 1) {
      const empty = document.createElement("div");
      empty.textContent = "Sin vistas de sección";
      Object.assign(empty.style, {
        padding: "5px 10px",
        color: "#70838c",
        fontSize: "11px",
      });
      content.append(empty);
      return;
    }

    for (const section of sections) {
      content.append(this.createRow(section, section.id === activeId));
    }
  }

  private createRow(
    section: SectionViewDefinition,
    selected: boolean,
  ): HTMLDivElement {
    const hidden = this.hidden.has(section.id);
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "22px 1fr auto",
      gap: "5px",
      alignItems: "center",
      padding: "4px 8px",
      cursor: "pointer",
      borderBottom: "1px solid rgba(255,255,255,0.035)",
      background: selected ? "rgba(88,180,220,0.20)" : "transparent",
      color: hidden ? "#71838c" : selected ? "#dff6ff" : "#c8d5db",
      userSelect: "none",
    });

    const eye = document.createElement("button");
    eye.type = "button";
    eye.textContent = hidden ? "○" : "◉";
    eye.title = hidden ? "Mostrar sección" : "Ocultar sección";
    Object.assign(eye.style, {
      width: "20px",
      height: "18px",
      padding: "0",
      border: "0",
      background: "transparent",
      color: hidden ? "#71838c" : "#cfe8f3",
      cursor: "pointer",
      font: "12px system-ui, sans-serif",
    });
    eye.addEventListener("pointerdown", (event) => event.stopPropagation());
    eye.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleVisibility(section.id);
    });

    const name = document.createElement("span");
    name.textContent = `▱ ${section.name}`;
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";
    name.style.whiteSpace = "nowrap";

    const meta = document.createElement("span");
    meta.textContent = `${this.format(section.depth)} m`;
    meta.style.color = "#7f949e";
    meta.style.fontSize = "10px";

    row.append(eye, name, meta);
    row.title = "Clic = activar · doble clic = abrir plano · clic derecho = opciones";
    row.addEventListener("click", () => this.activate(section.id));
    row.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.openDrawing(section.id);
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.activate(section.id);
      this.showContextMenu(event.clientX, event.clientY, section.id);
    });
    return row;
  }

  private activate(sectionId: string): boolean {
    const section = this.findSection(sectionId);
    if (!section) return false;
    this.runtime.activeSectionId = section.id;
    this.runtime.refreshUi();
    this.productionRuntime.syncSectionLayerVisibility();
    this.runtime.setStatus(
      `${section.name}: ${this.format(section.width)} × ${this.format(section.height)} × ${this.format(section.depth)} m.`,
    );
    this.lastSignature = "";
    this.decorate();
    return true;
  }

  private openDrawing(sectionId: string): void {
    if (!this.activate(sectionId)) return;
    this.options.drawingWorkspace.openActiveSection();
  }

  private toggleVisibility(sectionId: string): void {
    const hide = !this.hidden.has(sectionId);

    if (hide) {
      this.hidden.add(sectionId);
    }
    else {
      this.hidden.delete(sectionId);
    }

    this.setRenderLayerHidden(sectionId, hide);
    this.productionRuntime.syncSectionLayerVisibility();
    this.lastSignature = "";
    this.decorate();
  }

  private cleanupHiddenIds(): void {
    const existing = new Set(
      this.options.sectionDrawing.getSections().map((section) => section.id),
    );
    for (const id of Array.from(this.hidden)) {
      if (!existing.has(id)) {
        this.hidden.delete(id);
      }
    }
  }

  private reapplyHiddenVisibility(): void {
    for (const id of this.hidden) {
      this.setRenderLayerHidden(id, true);
    }
  }

  private setRenderLayerHidden(sectionId: string, hidden: boolean): void {
    const visual = this.runtime.visuals.get(sectionId);
    if (!visual) return;

    visual.group.visible = !hidden;
    visual.group.traverse((object) => {
      object.layers.mask = hidden ? 0 : 1;
    });
  }

  private rename(sectionId: string): void {
    const section = this.findSection(sectionId);
    if (!section) return;
    const name = window.prompt(
      "Nuevo nombre de la vista de sección",
      section.name,
    )?.trim();
    if (!name || name === section.name) return;
    this.runtime.replaceSection({ ...section, name });
    this.lastSignature = "";
    this.decorate();
  }

  private remove(sectionId: string): void {
    const section = this.findSection(sectionId);
    if (!section) return;
    if (!window.confirm(`¿Eliminar ${section.name}?`)) return;
    this.runtime.activeSectionId = section.id;
    this.runtime.removeActiveSection();
    this.hidden.delete(section.id);
    this.productionRuntime.syncSectionLayerVisibility();
    this.lastSignature = "";
    this.decorate();
  }

  private findSection(sectionId: string): SectionViewDefinition | undefined {
    return this.options.sectionDrawing
      .getSections()
      .find((section) => section.id === sectionId);
  }

  private showContextMenu(x: number, y: number, sectionId: string): void {
    this.hideContextMenu();
    const menu = document.createElement("div");
    Object.assign(menu.style, {
      position: "fixed",
      left: `${x}px`,
      top: `${y}px`,
      zIndex: "10020",
      minWidth: "210px",
      padding: "4px",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: "5px",
      background: "rgba(19,27,33,0.98)",
      boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
      font: "12px system-ui, sans-serif",
    });

    const entries: Array<[string, () => void]> = [
      ["Abrir plano PDF", () => this.openDrawing(sectionId)],
      [this.hidden.has(sectionId) ? "Mostrar vista" : "Ocultar vista", () => this.toggleVisibility(sectionId)],
      ["Renombrar vista", () => this.rename(sectionId)],
      ["Eliminar vista", () => this.remove(sectionId)],
    ];

    for (const [label, action] of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
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
      button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(100,190,230,0.16)";
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "transparent";
      });
      button.addEventListener("click", () => {
        action();
        this.hideContextMenu();
      });
      menu.append(button);
    }

    document.body.append(menu);
    this.contextMenu = menu;
  }

  private hideContextMenu(): void {
    this.contextMenu?.remove();
    this.contextMenu = null;
  }

  private format(value: number): string {
    return Number.isFinite(value)
      ? value.toFixed(3).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")
      : "0";
  }
}

function closestPointOnSegment(
  point: THREE.Vector2,
  a: THREE.Vector2,
  b: THREE.Vector2,
): {
  readonly point: THREE.Vector2;
  readonly t: number;
} {
  const ab = b.clone().sub(a);
  const lengthSquared = ab.lengthSq();
  if (lengthSquared <= 1e-12) {
    return { point: a.clone(), t: 0 };
  }
  const t = THREE.MathUtils.clamp(
    point.clone().sub(a).dot(ab) / lengthSquared,
    0,
    1,
  );
  return {
    point: a.clone().addScaledVector(ab, t),
    t,
  };
}

function segmentIntersection(
  a: AssemblyPlanSegmentRuntime,
  b: AssemblyPlanSegmentRuntime,
): THREE.Vector2 | null {
  const denominator =
    (a.x1 - a.x2) * (b.y1 - b.y2)
    - (a.y1 - a.y2) * (b.x1 - b.x2);
  if (Math.abs(denominator) <= 1e-9) return null;
  const t =
    ((a.x1 - b.x1) * (b.y1 - b.y2)
      - (a.y1 - b.y1) * (b.x1 - b.x2))
    / denominator;
  const u =
    -((a.x1 - a.x2) * (a.y1 - b.y1)
      - (a.y1 - a.y2) * (a.x1 - b.x1))
    / denominator;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) {
    return null;
  }
  return new THREE.Vector2(
    a.x1 + t * (a.x2 - a.x1),
    a.y1 + t * (a.y2 - a.y1),
  );
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
