import * as THREE from "three";

import type { DrawingProductionController } from "./DrawingProductionController";
import type { DrawingWorkspaceController } from "./DrawingWorkspaceController";
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

interface WorkPlaneSnapshotRuntime {
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly xAxis: { readonly x: number; readonly y: number; readonly z: number };
  readonly yAxis: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
}

interface AssemblyViewRuntime {
  readonly id: string;
  readonly sectionId: string;
  readonly kind?: string;
  readonly instanceIds?: readonly string[];
  width?: number;
  height?: number;
  segments?: AssemblyPlanSegmentRuntime[];
  readonly workPlane?: WorkPlaneSnapshotRuntime;
  hiddenInstanceIds?: string[];
}

interface SheetRuntime {
  readonly size: string;
  readonly orientation: string;
  readonly views: readonly AssemblyViewRuntime[];
}

interface PieceInstanceRuntime {
  readonly id: string;
}

interface DesignModelRuntime {
  readonly pieceInstances: {
    getAll(): readonly PieceInstanceRuntime[];
  };
}

interface DesignSceneRuntime {
  getInstanceEntries(): Iterable<readonly [string, THREE.Object3D]>;
}

interface DrawingSegmentRuntime {
  readonly instanceId: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly cut?: boolean;
  readonly hidden?: boolean;
}

interface DrawingSnapshotRuntime {
  readonly section: SectionViewDefinition;
  segments: DrawingSegmentRuntime[];
}

interface DrawingProductionRuntime {
  readonly sheets: Map<string, SheetRuntime>;
  readonly designModel: DesignModelRuntime;
  readonly designScene: DesignSceneRuntime;
  syncSectionLayerVisibility(): void;
  pickReference(x: number, y: number): AssemblyReferenceRuntime | null;
  resolveReference(reference: AssemblyReferenceRuntime): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  };
}

interface DrawingDocumentRuntime {
  readonly sectionId: string;
  readonly annotations: Array<Record<string, unknown>>;
}

interface DrawingWorkspaceRuntime {
  activeSectionId: string | null;
  pendingDimensionStart: AssemblyReferenceRuntime | null;
  tool: string;
  snapshot: DrawingSnapshotRuntime | null;
  readonly documents: Map<string, DrawingDocumentRuntime>;
  readonly svg: SVGSVGElement;
  readonly overlay: HTMLElement;
  render(): void;
  renderDimension(annotation: Record<string, unknown>): void;
  handleDimensionPoint(x: number, y: number): void;
  setTool(tool: "SELECT" | "DIMENSION" | "LABEL" | "TEXT"): void;
  setStatus(message: string): void;
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

interface EnrichedAssemblyGeometry {
  readonly width: number;
  readonly height: number;
  readonly segments: AssemblyPlanSegmentRuntime[];
}

type BasicDimensionMode = "ALIGNED" | "HORIZONTAL" | "VERTICAL" | "DIAMETER" | "RADIUS";

const SHEET_WIDTH = 1120;
const SHEET_HEIGHT = 792;
const SHEET_MM: Record<string, readonly [number, number]> = {
  A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841],
};
const SNAP_DISTANCE = 17;
const EPSILON = 1e-8;

/**
 * Integra las vistas de sección dentro del árbol INSTANCIAS, completa SNAP de
 * Views de ensamble y gestiona visibilidad de instancias independiente por View.
 */
export class SectionInstanceTreeBridgeController {
  private readonly options: Options;
  private readonly runtime: SectionDrawingRuntime;
  private readonly productionRuntime: DrawingProductionRuntime;
  private readonly workspaceRuntime: DrawingWorkspaceRuntime;
  private readonly hidden = new Set<string>();
  private readonly originalCreateVisual: (section: SectionViewDefinition) => void;
  private readonly originalSyncSectionLayerVisibility: () => void;
  private readonly originalPickReference: (x: number, y: number) => AssemblyReferenceRuntime | null;
  private readonly originalResolveReference: (reference: AssemblyReferenceRuntime) => {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  };
  private readonly originalWorkspaceRender: () => void;
  private readonly originalWorkspaceHandleDimensionPoint: (x: number, y: number) => void;
  private readonly timer: number;
  private contextMenu: HTMLDivElement | null = null;
  private snapMarker: SVGGElement | null = null;
  private lastSignature = "";
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.runtime = options.sectionDrawing as unknown as SectionDrawingRuntime;
    this.productionRuntime = options.drawingProduction as unknown as DrawingProductionRuntime;
    this.workspaceRuntime = options.drawingWorkspace as unknown as DrawingWorkspaceRuntime;

    this.originalSyncSectionLayerVisibility =
      this.productionRuntime.syncSectionLayerVisibility.bind(this.productionRuntime);
    this.productionRuntime.syncSectionLayerVisibility = (): void => {
      this.originalSyncSectionLayerVisibility();
      this.reapplyHiddenVisibility();
    };

    this.originalPickReference =
      this.productionRuntime.pickReference.bind(this.productionRuntime);
    this.productionRuntime.pickReference = (x, y) => this.pickDrawingReference(x, y);

    this.originalResolveReference =
      this.productionRuntime.resolveReference.bind(this.productionRuntime);
    this.productionRuntime.resolveReference = (reference) =>
      this.resolveDrawingReference(reference);

    this.originalWorkspaceHandleDimensionPoint =
      this.workspaceRuntime.handleDimensionPoint.bind(this.workspaceRuntime);
    this.workspaceRuntime.handleDimensionPoint = (x, y) =>
      this.handlePdfDimensionPoint(x, y);

    this.originalWorkspaceRender = this.workspaceRuntime.render.bind(this.workspaceRuntime);
    this.workspaceRuntime.render = () => this.renderWorkspaceWithPdfVisibility();

    this.originalCreateVisual = this.runtime.createVisual.bind(this.runtime);
    this.runtime.createVisual = (section: SectionViewDefinition): void => {
      this.originalCreateVisual(section);
      this.productionRuntime.syncSectionLayerVisibility();
    };

    this.workspaceRuntime.svg.addEventListener("pointermove", this.handlePdfSnapPointerMove, true);
    this.workspaceRuntime.svg.addEventListener("pointerleave", this.clearPdfSnapMarker, true);

    this.productionRuntime.syncSectionLayerVisibility();
    this.decorate();
    this.decoratePdfInstanceEyes();
    this.timer = window.setInterval(() => {
      this.decorate();
      this.decoratePdfInstanceEyes();
    }, 280);
    window.addEventListener("pointerdown", this.handleGlobalPointerDown, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    window.removeEventListener("pointerdown", this.handleGlobalPointerDown, true);
    this.workspaceRuntime.svg.removeEventListener("pointermove", this.handlePdfSnapPointerMove, true);
    this.workspaceRuntime.svg.removeEventListener("pointerleave", this.clearPdfSnapMarker, true);
    this.clearPdfSnapMarker();

    for (const id of this.hidden) this.setRenderLayerHidden(id, false);

    this.runtime.createVisual = this.originalCreateVisual;
    this.productionRuntime.syncSectionLayerVisibility = this.originalSyncSectionLayerVisibility;
    this.productionRuntime.pickReference = this.originalPickReference;
    this.productionRuntime.resolveReference = this.originalResolveReference;
    this.workspaceRuntime.handleDimensionPoint = this.originalWorkspaceHandleDimensionPoint;
    this.workspaceRuntime.render = this.originalWorkspaceRender;
    this.hideContextMenu();
    this.options.container.querySelector('[data-framelogic-section-tree="true"]')?.remove();
  }

  private readonly handleGlobalPointerDown = (event: PointerEvent): void => {
    if (this.contextMenu && event.target instanceof Node && !this.contextMenu.contains(event.target)) {
      this.hideContextMenu();
    }
  };

  private renderWorkspaceWithPdfVisibility(): void {
    const sheet = this.getActivePdfSheet();
    if (sheet) this.enrichAssemblyOwnership(sheet);

    const snapshot = this.workspaceRuntime.snapshot;
    const originalSegments = snapshot?.segments;
    if (sheet && snapshot && originalSegments) {
      const view = sheet.views.find(
        (candidate) => candidate.kind !== "ASSEMBLY" && candidate.sectionId === snapshot.section.id,
      );
      const hidden = view ? new Set(view.hiddenInstanceIds ?? []) : null;
      if (hidden?.size) {
        snapshot.segments = originalSegments.filter((segment) => !hidden.has(segment.instanceId));
      }
    }

    try {
      this.originalWorkspaceRender();
    }
    finally {
      if (snapshot && originalSegments) snapshot.segments = originalSegments;
    }

    this.renderAssemblyDimensionsAfterViews();
    if (sheet) this.applyAssemblyViewVisibility(sheet);
    this.decoratePdfInstanceEyes();
  }

  private renderAssemblyDimensionsAfterViews(): void {
    const documentId = this.workspaceRuntime.activeSectionId;
    if (!documentId) return;
    const documentState = this.workspaceRuntime.documents.get(documentId);
    if (!documentState) return;

    for (const annotation of documentState.annotations) {
      if (annotation["kind"] !== "DIMENSION") continue;
      const a = annotation["a"] as AssemblyReferenceRuntime | undefined;
      const b = annotation["b"] as AssemblyReferenceRuntime | undefined;
      if (!a?.framelogicPdfViewId && !b?.framelogicPdfViewId) continue;

      const id = typeof annotation["id"] === "string"
        ? annotation["id"]
        : "";
      if (id) {
        this.workspaceRuntime.svg
          .querySelectorAll(`[data-annotation-id="${cssEscape(id)}"]`)
          .forEach((element) => element.remove());
      }

      this.workspaceRuntime.renderDimension(annotation);
    }
  }

  private getActivePdfSheet(): SheetRuntime | null {
    const id = this.workspaceRuntime.activeSectionId;
    return id ? this.productionRuntime.sheets.get(id) ?? null : null;
  }

  private handlePdfDimensionPoint(paperX: number, paperY: number): void {
    const reference = this.pickDrawingReference(paperX, paperY);
    const pending = this.workspaceRuntime.pendingDimensionStart;
    const assemblyFlow = Boolean(
      reference?.framelogicPdfViewId
      || pending?.framelogicPdfViewId,
    );

    if (!assemblyFlow) {
      this.originalWorkspaceHandleDimensionPoint(paperX, paperY);
      return;
    }

    if (!reference?.framelogicPdfViewId) {
      this.workspaceRuntime.setStatus(
        "COTA: selecciona un segundo SNAP dentro de la misma View de ensamble.",
      );
      return;
    }

    if (
      pending?.framelogicPdfViewId
      && pending.framelogicPdfViewId !== reference.framelogicPdfViewId
    ) {
      this.workspaceRuntime.setStatus(
        "COTA: ambos puntos deben pertenecer a la misma View de ensamble.",
      );
      return;
    }

    const dimensionMode = this.readBasicDimensionMode();
    if (dimensionMode === "DIAMETER" || dimensionMode === "RADIUS") {
      this.workspaceRuntime.setStatus(
        "Ø/R en Views de ensamble requiere geometría circular exacta; usa cota alineada, horizontal o vertical.",
      );
      return;
    }

    const documentId = this.workspaceRuntime.activeSectionId;
    if (!documentId) return;
    let documentState = this.workspaceRuntime.documents.get(documentId);
    if (!documentState) {
      documentState = {
        sectionId: documentId,
        annotations: [],
      };
      this.workspaceRuntime.documents.set(documentId, documentState);
    }

    if (!pending) {
      this.workspaceRuntime.pendingDimensionStart = reference;
      this.workspaceRuntime.setStatus(
        `COTA ${dimensionMode}: primer punto de View tomado. Selecciona el segundo.`,
      );
      return;
    }

    documentState.annotations.push({
      id: crypto.randomUUID(),
      kind: "DIMENSION",
      a: pending,
      b: reference,
      offsetX: dimensionMode === "VERTICAL" ? 28 : 0,
      offsetY: -28,
      dimensionMode,
    });
    this.workspaceRuntime.pendingDimensionStart = null;
    this.workspaceRuntime.setTool("SELECT");
    this.clearPdfSnapMarker();
    this.workspaceRuntime.render();
  }

  private readBasicDimensionMode(): BasicDimensionMode {
    const value = this.workspaceRuntime.overlay
      .querySelector<HTMLSelectElement>('select[title="Tipo de cota"]')
      ?.value;
    if (
      value === "HORIZONTAL"
      || value === "VERTICAL"
      || value === "DIAMETER"
      || value === "RADIUS"
    ) {
      return value;
    }
    return "ALIGNED";
  }

  private pickDrawingReference(paperX: number, paperY: number): AssemblyReferenceRuntime | null {
    const assembly = this.pickAssemblyReference(paperX, paperY);
    let base = this.originalPickReference(paperX, paperY);
    if (base && this.isReferenceHiddenInActiveSectionView(base)) base = null;
    if (!assembly) return base;
    if (!base) return assembly;

    const assemblyPoint = this.resolveAssemblyReference(assembly)?.point;
    const baseResolved = this.originalResolveReference(base);
    if (!assemblyPoint || baseResolved.lost) return assembly;

    const assemblyDistance = Math.hypot(assemblyPoint.x - paperX, assemblyPoint.y - paperY);
    const baseDistance = Math.hypot(baseResolved.point.x - paperX, baseResolved.point.y - paperY);
    return assemblyDistance <= baseDistance ? assembly : base;
  }

  private isReferenceHiddenInActiveSectionView(reference: AssemblyReferenceRuntime): boolean {
    const sheet = this.getActivePdfSheet();
    const snapshot = this.workspaceRuntime.snapshot;
    if (!sheet || !snapshot) return false;
    const view = sheet.views.find(
      (candidate) => candidate.kind !== "ASSEMBLY" && candidate.sectionId === snapshot.section.id,
    );
    return Boolean(view?.hiddenInstanceIds?.includes(reference.instanceId));
  }

  private resolveDrawingReference(reference: AssemblyReferenceRuntime): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  } {
    const resolved = this.resolveAssemblyReference(reference);
    return resolved ?? this.originalResolveReference(reference);
  }

  private pickAssemblyReference(paperX: number, paperY: number): AssemblyReferenceRuntime | null {
    const activeSheetId = this.workspaceRuntime.activeSectionId;
    if (!activeSheetId) return null;
    const sheet = this.productionRuntime.sheets.get(activeSheetId);
    if (!sheet) return null;

    this.enrichAssemblyOwnership(sheet);

    const pending = this.workspaceRuntime.pendingDimensionStart;
    const pendingViewId = pending?.framelogicPdfViewId;
    if (pending && !pendingViewId) return null;

    let best: AssemblyReferenceRuntime | null = null;
    let bestDistance = SNAP_DISTANCE;

    sheet.views.forEach((view, index) => {
      if (view.kind !== "ASSEMBLY") return;
      if (pendingViewId && pendingViewId !== view.id) return;
      const transform = this.getAssemblyViewTransform(sheet, view, index);
      const segments = view.segments ?? [];
      const hidden = new Set(view.hiddenInstanceIds ?? []);
      if (!transform || segments.length < 1) return;
      const fallbackInstanceId = view.instanceIds?.[0] ?? `assembly:${view.id}`;

      const consider = (
        x: number,
        y: number,
        snapKind: "ENDPOINT" | "MIDPOINT" | "INTERSECTION" | "NEAREST",
        instanceId = fallbackInstanceId,
      ): void => {
        if (hidden.has(instanceId)) return;
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
        if (hidden.has(instanceId)) continue;
        consider(segment.x1, segment.y1, "ENDPOINT", instanceId);
        consider(segment.x2, segment.y2, "ENDPOINT", instanceId);
        consider((segment.x1 + segment.x2) / 2, (segment.y1 + segment.y2) / 2, "MIDPOINT", instanceId);

        const a = this.assemblyPointToPaper(transform, segment.x1, segment.y1);
        const b = this.assemblyPointToPaper(transform, segment.x2, segment.y2);
        const nearest = closestPointOnSegment(new THREE.Vector2(paperX, paperY), a, b);
        const distance = Math.hypot(nearest.point.x - paperX, nearest.point.y - paperY);
        if (distance < Math.min(bestDistance, 9)) {
          consider(
            segment.x1 + (segment.x2 - segment.x1) * nearest.t,
            segment.y1 + (segment.y2 - segment.y1) * nearest.t,
            "NEAREST",
            instanceId,
          );
        }
      }

      const visible = segments.filter(
        (segment) => !hidden.has(segment.instanceId ?? fallbackInstanceId),
      );
      if (visible.length <= 260) {
        for (let first = 0; first < visible.length; first += 1) {
          const a = visible[first];
          if (!a) continue;
          for (let second = first + 1; second < visible.length; second += 1) {
            const b = visible[second];
            if (!b) continue;
            const point = segmentIntersection(a, b);
            if (!point) continue;
            consider(point.x, point.y, "INTERSECTION", a.instanceId ?? fallbackInstanceId);
          }
        }
      }
    });

    return best;
  }

  private resolveAssemblyReference(reference: AssemblyReferenceRuntime): {
    readonly point: THREE.Vector2;
    readonly lost: boolean;
  } | null {
    const viewId = reference.framelogicPdfViewId;
    if (!viewId) return null;
    const activeSheetId = this.workspaceRuntime.activeSectionId;
    if (!activeSheetId) return { point: new THREE.Vector2(reference.x, reference.y), lost: true };
    const sheet = this.productionRuntime.sheets.get(activeSheetId);
    if (!sheet) return { point: new THREE.Vector2(reference.x, reference.y), lost: true };
    const index = sheet.views.findIndex((view) => view.id === viewId);
    const view = index >= 0 ? sheet.views[index] : undefined;
    if (!view || view.kind !== "ASSEMBLY" || view.hiddenInstanceIds?.includes(reference.instanceId)) {
      return { point: new THREE.Vector2(reference.x, reference.y), lost: true };
    }
    const transform = this.getAssemblyViewTransform(sheet, view, index);
    if (!transform) return { point: new THREE.Vector2(reference.x, reference.y), lost: true };
    return {
      point: this.assemblyPointToPaper(transform, reference.x, reference.y),
      lost: false,
    };
  }

  private enrichAssemblyOwnership(sheet: SheetRuntime): void {
    for (const view of sheet.views) {
      if (view.kind !== "ASSEMBLY") continue;
      const segments = view.segments ?? [];
      if (segments.length > 0 && segments.every((segment) => Boolean(segment.instanceId))) continue;
      const geometry = this.buildAssemblyGeometry(view);
      if (!geometry) continue;
      view.width = geometry.width;
      view.height = geometry.height;
      view.segments = geometry.segments;
    }
  }

  private buildAssemblyGeometry(view: AssemblyViewRuntime): EnrichedAssemblyGeometry | null {
    if (!view.workPlane || !view.instanceIds?.length) return null;
    const ids = new Set(view.instanceIds);
    const plane = view.workPlane;
    const worldToPlane = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(plane.xAxis.x, plane.xAxis.y, plane.xAxis.z).normalize(),
      new THREE.Vector3(plane.yAxis.x, plane.yAxis.y, plane.yAxis.z).normalize(),
      new THREE.Vector3(plane.normal.x, plane.normal.y, plane.normal.z).normalize(),
    );
    worldToPlane.setPosition(new THREE.Vector3(plane.origin.x, plane.origin.y, plane.origin.z));
    worldToPlane.invert();

    const raw: AssemblyPlanSegmentRuntime[] = [];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const [instanceId, object] of this.productionRuntime.designScene.getInstanceEntries()) {
      if (!ids.has(instanceId)) continue;
      object.updateWorldMatrix(true, true);
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const edges = new THREE.EdgesGeometry(child.geometry, 28);
        const position = edges.getAttribute("position");
        for (let index = 0; index + 1 < position.count; index += 2) {
          const a = new THREE.Vector3()
            .fromBufferAttribute(position, index)
            .applyMatrix4(child.matrixWorld)
            .applyMatrix4(worldToPlane);
          const b = new THREE.Vector3()
            .fromBufferAttribute(position, index + 1)
            .applyMatrix4(child.matrixWorld)
            .applyMatrix4(worldToPlane);
          if (a.distanceToSquared(b) <= EPSILON) continue;
          raw.push({ instanceId, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
          minX = Math.min(minX, a.x, b.x);
          minY = Math.min(minY, a.y, b.y);
          maxX = Math.max(maxX, a.x, b.x);
          maxY = Math.max(maxY, a.y, b.y);
        }
        edges.dispose();
      });
    }

    if (!raw.length || !Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    const sourceWidth = Math.max(maxX - minX, 0.001);
    const sourceHeight = Math.max(maxY - minY, 0.001);
    const padding = Math.max(sourceWidth, sourceHeight) * 0.04;
    const offsetX = minX - padding;
    const offsetY = minY - padding;
    return {
      width: sourceWidth + padding * 2,
      height: sourceHeight + padding * 2,
      segments: raw.map((segment) => ({
        ...segment,
        x1: segment.x1 - offsetX,
        y1: segment.y1 - offsetY,
        x2: segment.x2 - offsetX,
        y2: segment.y2 - offsetY,
      })),
    };
  }

  private applyAssemblyViewVisibility(sheet: SheetRuntime): void {
    const svg = this.workspaceRuntime.svg;
    const used = new Set<SVGLineElement>();
    sheet.views.forEach((view, index) => {
      if (view.kind !== "ASSEMBLY") return;
      const transform = this.getAssemblyViewTransform(sheet, view, index);
      if (!transform) return;
      const hidden = new Set(view.hiddenInstanceIds ?? []);
      const buckets = new Map<string, SVGLineElement[]>();
      for (const line of Array.from(svg.querySelectorAll<SVGLineElement>("line"))) {
        if (line.hasAttribute("data-annotation-id") || used.has(line)) continue;
        const x1 = Number(line.getAttribute("x1") ?? 0);
        const y1 = Number(line.getAttribute("y1") ?? 0);
        const x2 = Number(line.getAttribute("x2") ?? 0);
        const y2 = Number(line.getAttribute("y2") ?? 0);
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        if (mx < transform.x - 1 || mx > transform.x + transform.width + 1
          || my < transform.y - 1 || my > transform.y + transform.height + 1) continue;
        const key = lineKey(x1, y1, x2, y2);
        const list = buckets.get(key) ?? [];
        list.push(line);
        buckets.set(key, list);
      }

      const fallback = view.instanceIds?.[0] ?? `assembly:${view.id}`;
      for (const segment of view.segments ?? []) {
        const a = this.assemblyPointToPaper(transform, segment.x1, segment.y1);
        const b = this.assemblyPointToPaper(transform, segment.x2, segment.y2);
        const list = buckets.get(lineKey(a.x, a.y, b.x, b.y));
        const line = list?.pop();
        if (!line) continue;
        used.add(line);
        const instanceId = segment.instanceId ?? fallback;
        line.dataset["framelogicPdfViewId"] = view.id;
        line.dataset["framelogicPdfInstanceId"] = instanceId;
        if (hidden.has(instanceId)) line.style.display = "none";
      }
    });
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
    return { x, y, width, height, scale, originX, baseY: originY + drawnHeight };
  }

  private readViewScaleDenominator(
    index: number,
    x: number,
    y: number,
    width: number,
    height: number,
  ): number | null {
    const prefix = `VIEW ${index + 1} ·`;
    const labels = Array.from(this.workspaceRuntime.svg.querySelectorAll<SVGTextElement>("text"));
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
    const paperWidth = sheet.orientation === "LANDSCAPE" ? rawWidth : rawHeight;
    const paperHeight = sheet.orientation === "LANDSCAPE" ? rawHeight : rawWidth;
    const pxPerMm = Math.min((SHEET_WIDTH - 84) / paperWidth, (SHEET_HEIGHT - 84) / paperHeight);
    return (1000 / Math.max(denominator, 1)) * pxPerMm;
  }

  private assemblyPointToPaper(transform: AssemblyViewTransform, x: number, y: number): THREE.Vector2 {
    return new THREE.Vector2(
      transform.originX + x * transform.scale,
      transform.baseY - y * transform.scale,
    );
  }

  private readonly handlePdfSnapPointerMove = (event: PointerEvent): void => {
    if (this.workspaceRuntime.overlay.style.display === "none") return;
    if (this.workspaceRuntime.tool !== "DIMENSION" && this.workspaceRuntime.tool !== "LABEL") {
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

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("data-framelogic-drawing-snap", "true");
    group.setAttribute("data-framelogic-assembly-view-snap", "true");
    group.style.pointerEvents = "none";
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", String(resolved.point.x));
    circle.setAttribute("cy", String(resolved.point.y));
    circle.setAttribute("r", "5");
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", "#d58a00");
    circle.setAttribute("stroke-width", "1.5");
    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
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

  private decoratePdfInstanceEyes(): void {
    if (this.workspaceRuntime.overlay.style.display === "none") return;
    const sheet = this.getActivePdfSheet();
    if (!sheet) return;
    const panel = this.workspaceRuntime.overlay.querySelector<HTMLElement>(
      '[data-framelogic-pdf-view-tree="GENERAL"] [data-framelogic-pdf-view-tree-content="true"]',
    );
    if (!panel) return;

    const details = Array.from(panel.querySelectorAll<HTMLDetailsElement>(":scope > details"));
    details.forEach((detail, viewIndex) => {
      const view = sheet.views[viewIndex];
      if (!view) return;
      detail.dataset["framelogicViewId"] = view.id;
      const content = Array.from(detail.children).find(
        (child): child is HTMLDivElement => child instanceof HTMLDivElement,
      );
      if (!content) return;
      const instanceIds = view.kind === "ASSEMBLY"
        ? [...(view.instanceIds ?? [])]
        : this.productionRuntime.designModel.pieceInstances.getAll().map((piece) => piece.id);
      const rows = Array.from(content.children).filter(
        (child): child is HTMLDivElement => child instanceof HTMLDivElement,
      );
      instanceIds.forEach((instanceId, rowIndex) => {
        const row = rows[rowIndex];
        if (!row) return;
        row.dataset["framelogicPdfInstanceId"] = instanceId;
        row.style.paddingLeft = "8px";
        row.style.gap = "5px";
        const hidden = Boolean(view.hiddenInstanceIds?.includes(instanceId));
        row.style.opacity = hidden ? "0.5" : "1";
        let button = row.querySelector<HTMLButtonElement>(
          'button[data-framelogic-pdf-instance-eye="true"]',
        );
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.dataset["framelogicPdfInstanceEye"] = "true";
          Object.assign(button.style, {
            width: "20px",
            minWidth: "20px",
            height: "20px",
            padding: "0",
            border: "0",
            background: "transparent",
            color: "#cfe8f3",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          });
          button.addEventListener("pointerdown", (event) => event.stopPropagation());
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.togglePdfInstanceVisibility(view.id, instanceId);
          });
          row.prepend(button);
        }
        button.title = hidden ? "Mostrar instancia en esta View" : "Ocultar instancia en esta View";
        this.renderEyeIcon(button, hidden);
      });
    });
  }

  private renderEyeIcon(button: HTMLButtonElement, hidden: boolean): void {
    button.replaceChildren();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("width", "15");
    svg.setAttribute("height", "15");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M2 10c2.1-3.1 4.7-4.7 8-4.7s5.9 1.6 8 4.7c-2.1 3.1-4.7 4.7-8 4.7S4.1 13.1 2 10Z");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", hidden ? "#71838c" : "currentColor");
    path.setAttribute("stroke-width", "1.4");
    const pupil = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    pupil.setAttribute("cx", "10");
    pupil.setAttribute("cy", "10");
    pupil.setAttribute("r", "2.1");
    pupil.setAttribute("fill", hidden ? "none" : "currentColor");
    pupil.setAttribute("stroke", hidden ? "#71838c" : "currentColor");
    pupil.setAttribute("stroke-width", "1");
    svg.append(path, pupil);
    if (hidden) {
      const slash = document.createElementNS("http://www.w3.org/2000/svg", "line");
      slash.setAttribute("x1", "3");
      slash.setAttribute("y1", "3");
      slash.setAttribute("x2", "17");
      slash.setAttribute("y2", "17");
      slash.setAttribute("stroke", "#71838c");
      slash.setAttribute("stroke-width", "1.5");
      svg.append(slash);
    }
    button.append(svg);
  }

  private togglePdfInstanceVisibility(viewId: string, instanceId: string): void {
    const sheet = this.getActivePdfSheet();
    const view = sheet?.views.find((candidate) => candidate.id === viewId);
    if (!view) return;
    const hidden = new Set(view.hiddenInstanceIds ?? []);
    if (hidden.has(instanceId)) hidden.delete(instanceId);
    else hidden.add(instanceId);
    view.hiddenInstanceIds = [...hidden];
    this.clearPdfSnapMarker();
    this.workspaceRuntime.render();
  }

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
      .map((section) => `${section.id}:${section.name}:${section.depth}:${this.hidden.has(section.id)}`)
      .join("|") + `|active:${activeId}`;

    let details = body.querySelector<HTMLDetailsElement>('details[data-framelogic-section-tree="true"]');
    const created = !details;
    if (!details) {
      details = document.createElement("details");
      details.dataset["framelogicSectionTree"] = "true";
      details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = "VISTAS DE SECCIÓN";
      Object.assign(summary.style, {
        padding: "6px 8px", cursor: "pointer", color: "#dce8ed", fontWeight: "600",
        userSelect: "none", borderBottom: "1px solid rgba(255,255,255,0.05)",
      });
      const content = document.createElement("div");
      content.dataset["framelogicSectionTreeContent"] = "true";
      details.append(summary, content);
      const cad = Array.from(body.querySelectorAll<HTMLDetailsElement>("details"))
        .find((candidate) => candidate.querySelector("summary")?.textContent === "REFERENCIAS CAD");
      if (cad) body.insertBefore(details, cad);
      else body.append(details);
    }

    if (!created && this.lastSignature === signature) return;
    this.lastSignature = signature;
    const content = details.querySelector<HTMLElement>('[data-framelogic-section-tree-content="true"]');
    if (!content) return;
    content.replaceChildren();
    if (sections.length < 1) {
      const empty = document.createElement("div");
      empty.textContent = "Sin vistas de sección";
      Object.assign(empty.style, { padding: "5px 10px", color: "#70838c", fontSize: "11px" });
      content.append(empty);
      return;
    }
    for (const section of sections) content.append(this.createRow(section, section.id === activeId));
  }

  private createRow(section: SectionViewDefinition, selected: boolean): HTMLDivElement {
    const hidden = this.hidden.has(section.id);
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid", gridTemplateColumns: "22px 1fr auto", gap: "5px", alignItems: "center",
      padding: "4px 8px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.035)",
      background: selected ? "rgba(88,180,220,0.20)" : "transparent",
      color: hidden ? "#71838c" : selected ? "#dff6ff" : "#c8d5db", userSelect: "none",
    });
    const eye = document.createElement("button");
    eye.type = "button";
    eye.textContent = hidden ? "○" : "◉";
    eye.title = hidden ? "Mostrar sección" : "Ocultar sección";
    Object.assign(eye.style, {
      width: "20px", height: "18px", padding: "0", border: "0", background: "transparent",
      color: hidden ? "#71838c" : "#cfe8f3", cursor: "pointer", font: "12px system-ui, sans-serif",
    });
    eye.addEventListener("pointerdown", (event) => event.stopPropagation());
    eye.addEventListener("click", (event) => {
      event.preventDefault(); event.stopPropagation(); this.toggleVisibility(section.id);
    });
    const name = document.createElement("span");
    name.textContent = `▱ ${section.name}`;
    name.style.overflow = "hidden"; name.style.textOverflow = "ellipsis"; name.style.whiteSpace = "nowrap";
    const meta = document.createElement("span");
    meta.textContent = `${this.format(section.depth)} m`;
    meta.style.color = "#7f949e"; meta.style.fontSize = "10px";
    row.append(eye, name, meta);
    row.title = "Clic = activar · doble clic = abrir plano · clic derecho = opciones";
    row.addEventListener("click", () => this.activate(section.id));
    row.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); this.openDrawing(section.id); });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault(); event.stopPropagation(); this.activate(section.id);
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
    if (hide) this.hidden.add(sectionId);
    else this.hidden.delete(sectionId);
    this.setRenderLayerHidden(sectionId, hide);
    this.productionRuntime.syncSectionLayerVisibility();
    this.lastSignature = "";
    this.decorate();
  }

  private cleanupHiddenIds(): void {
    const existing = new Set(this.options.sectionDrawing.getSections().map((section) => section.id));
    for (const id of Array.from(this.hidden)) if (!existing.has(id)) this.hidden.delete(id);
  }

  private reapplyHiddenVisibility(): void {
    for (const id of this.hidden) this.setRenderLayerHidden(id, true);
  }

  private setRenderLayerHidden(sectionId: string, hidden: boolean): void {
    const visual = this.runtime.visuals.get(sectionId);
    if (!visual) return;
    visual.group.visible = !hidden;
    visual.group.traverse((object) => { object.layers.mask = hidden ? 0 : 1; });
  }

  private rename(sectionId: string): void {
    const section = this.findSection(sectionId);
    if (!section) return;
    const name = window.prompt("Nuevo nombre de la vista de sección", section.name)?.trim();
    if (!name || name === section.name) return;
    this.runtime.replaceSection({ ...section, name });
    this.lastSignature = "";
    this.decorate();
  }

  private remove(sectionId: string): void {
    const section = this.findSection(sectionId);
    if (!section || !window.confirm(`¿Eliminar ${section.name}?`)) return;
    this.runtime.activeSectionId = section.id;
    this.runtime.removeActiveSection();
    this.hidden.delete(section.id);
    this.productionRuntime.syncSectionLayerVisibility();
    this.lastSignature = "";
    this.decorate();
  }

  private findSection(sectionId: string): SectionViewDefinition | undefined {
    return this.options.sectionDrawing.getSections().find((section) => section.id === sectionId);
  }

  private showContextMenu(x: number, y: number, sectionId: string): void {
    this.hideContextMenu();
    const menu = document.createElement("div");
    Object.assign(menu.style, {
      position: "fixed", left: `${x}px`, top: `${y}px`, zIndex: "10020", minWidth: "210px",
      padding: "4px", border: "1px solid rgba(255,255,255,0.18)", borderRadius: "5px",
      background: "rgba(19,27,33,0.98)", boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
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
      button.type = "button"; button.textContent = label;
      Object.assign(button.style, {
        display: "block", width: "100%", padding: "6px 8px", border: "0", borderRadius: "3px",
        background: "transparent", color: "#e7f0f4", textAlign: "left", cursor: "pointer",
        font: "12px system-ui, sans-serif",
      });
      button.addEventListener("mouseenter", () => { button.style.background = "rgba(100,190,230,0.16)"; });
      button.addEventListener("mouseleave", () => { button.style.background = "transparent"; });
      button.addEventListener("click", () => { action(); this.hideContextMenu(); });
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
): { readonly point: THREE.Vector2; readonly t: number } {
  const ab = b.clone().sub(a);
  const lengthSquared = ab.lengthSq();
  if (lengthSquared <= 1e-12) return { point: a.clone(), t: 0 };
  const t = THREE.MathUtils.clamp(point.clone().sub(a).dot(ab) / lengthSquared, 0, 1);
  return { point: a.clone().addScaledVector(ab, t), t };
}

function segmentIntersection(
  a: AssemblyPlanSegmentRuntime,
  b: AssemblyPlanSegmentRuntime,
): THREE.Vector2 | null {
  const denominator =
    (a.x1 - a.x2) * (b.y1 - b.y2)
    - (a.y1 - a.y2) * (b.x1 - b.x2);
  if (Math.abs(denominator) <= 1e-9) return null;
  const t = ((a.x1 - b.x1) * (b.y1 - b.y2) - (a.y1 - b.y1) * (b.x1 - b.x2)) / denominator;
  const u = -((a.x1 - a.x2) * (a.y1 - b.y1) - (a.y1 - a.y2) * (a.x1 - b.x1)) / denominator;
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
  return new THREE.Vector2(a.x1 + t * (a.x2 - a.x1), a.y1 + t * (a.y2 - a.y1));
}

function lineKey(x1: number, y1: number, x2: number, y2: number): string {
  const a = `${x1.toFixed(3)},${y1.toFixed(3)}`;
  const b = `${x2.toFixed(3)},${y2.toFixed(3)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
