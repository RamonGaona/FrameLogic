import * as THREE from "three";
import type { DesignSceneController } from "../design/DesignSceneController";
import {
  AssemblyViewShadingRenderer,
  type DrawingPlaneSnapshot,
} from "./AssemblyViewShadingRenderer";

import type {
  DrawingProfessionalController,
} from "./DrawingProfessionalController";

import type {
  DrawingProfessionalSnapshot,
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


export type DrawingViewRenderMode =
  | "BLACK_WHITE"
  | "VISIBLE_HIDDEN"
  | "WIREFRAME"
  | "SOLID"
  | "SOLID_EDGES"
  | "MONOCHROME"
  | "TRANSPARENT";


interface DrawingSegmentRuntime {
  readonly instanceId: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly cut: boolean;
  readonly hidden?: boolean;
}


interface AssemblyViewRuntime {
  readonly id: string;
  readonly kind: "ASSEMBLY";
  readonly instanceIds: readonly string[];
  readonly workPlane: DrawingPlaneSnapshot;
  readonly width: number;
  readonly height: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly geometrySignature?: string;
  readonly assemblyOcclusionExact?: boolean;
  readonly automaticSupplement?: "SECTION" | "DETAIL";
}

interface DrawingSnapshotRuntime {
  readonly section: SectionViewDefinition;
  readonly segments: DrawingSegmentRuntime[];
}


interface WorkspaceRuntime {
  readonly svg: SVGSVGElement;
  readonly overlay: HTMLDivElement;
  snapshot: DrawingSnapshotRuntime | null;
  render(): void;
  buildSnapshot(section: SectionViewDefinition): DrawingSnapshotRuntime;
  sectionToPaper(
    section: SectionViewDefinition,
    x: number,
    y: number,
  ): THREE.Vector2;
}


interface ProductionRuntime {
  getActiveSheet(): SheetState | null;
  exportPdf(): void;
}


interface ProfessionalRuntime {
  createProfessionalSnapshot(): DrawingProfessionalSnapshot;
  restoreProfessionalSnapshot(snapshot: DrawingProfessionalSnapshot): void;
}


interface ExtendedProfessionalSnapshot extends DrawingProfessionalSnapshot {
  readonly drawingViewRenderStyles?: {
    readonly version: 1;
    readonly styles: readonly {
      readonly viewId: string;
      readonly mode: DrawingViewRenderMode;
    }[];
  };
}


interface Options {
  readonly drawingWorkspace: DrawingWorkspaceController;
  readonly drawingProduction: DrawingProductionController;
  readonly drawingProfessional: DrawingProfessionalController;
  readonly sectionDrawing: SectionDrawingController;
  readonly designScene: DesignSceneController;
}


const SVG_NS = "http://www.w3.org/2000/svg";
const CANVAS_WIDTH = 1120;
const CANVAS_HEIGHT = 792;
const SHEET_MM: Record<string, readonly [number, number]> = {
  A4: [297, 210],
  A3: [420, 297],
  A2: [594, 420],
  A1: [841, 594],
  A0: [1189, 841],
};


/**
 * Estilo de render por viewport para planos de sección/detalle.
 *
 * Each View retains its own style in the project snapshot. For standard
 * assembly views, shaded faces are rendered from 3D geometry with a z-buffer
 * rather than inventing surfaces from HLR lines. Edges remain vectorial.
 */
export class DrawingViewRenderStyleController {
  private readonly workspace: WorkspaceRuntime;
  private readonly production: ProductionRuntime;
  private readonly professional: ProfessionalRuntime;
  private readonly sectionDrawing: SectionDrawingController;
  private readonly baseRender: () => void;
  private readonly baseExportPdf: () => void;
  private readonly baseCreateSnapshot: () => DrawingProfessionalSnapshot;
  private readonly baseRestoreSnapshot:
    (snapshot: DrawingProfessionalSnapshot) => void;
  private readonly styles = new Map<string, DrawingViewRenderMode>();
  private readonly shading: AssemblyViewShadingRenderer;
  private readonly toolbarLabel: HTMLSpanElement;
  private readonly viewSelect: HTMLSelectElement | null;
  private readonly select: HTMLSelectElement;
  private selectedViewId: string | null = null;
  private disposed = false;

  constructor(options: Options) {
    this.workspace = options.drawingWorkspace as unknown as WorkspaceRuntime;
    this.production = options.drawingProduction as unknown as ProductionRuntime;
    this.professional = options.drawingProfessional as unknown as ProfessionalRuntime;
    this.sectionDrawing = options.sectionDrawing;
    this.shading = new AssemblyViewShadingRenderer(options.designScene);
    this.viewSelect = this.workspace.overlay.querySelector<HTMLSelectElement>(
      '[data-framelogic-view-select="true"]',
    );

    this.baseRender = this.workspace.render.bind(options.drawingWorkspace);
    this.baseExportPdf = this.production.exportPdf.bind(options.drawingProduction);
    this.baseCreateSnapshot =
      this.professional.createProfessionalSnapshot.bind(options.drawingProfessional);
    this.baseRestoreSnapshot =
      this.professional.restoreProfessionalSnapshot.bind(options.drawingProfessional);

    const toolbarControls = this.installToolbar();
    this.toolbarLabel = toolbarControls.label;
    this.select = toolbarControls.select;
    this.viewSelect?.addEventListener("change", this.handleViewSelectionChange);
    this.installPatches();
    this.workspace.svg.addEventListener("pointerdown", this.handlePointerDown, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.workspace.svg.removeEventListener("pointerdown", this.handlePointerDown, true);
    this.viewSelect?.removeEventListener("change", this.handleViewSelectionChange);
    this.shading.dispose();
    this.workspace.render = this.baseRender;
    this.production.exportPdf = this.baseExportPdf;
    this.professional.createProfessionalSnapshot = this.baseCreateSnapshot;
    this.professional.restoreProfessionalSnapshot = this.baseRestoreSnapshot;
    this.toolbarLabel.remove();
    this.select.remove();
    this.styles.clear();
  }

  private installPatches(): void {
    this.workspace.render = (): void => {
      this.baseRender();
      this.decorate();
    };

    this.professional.createProfessionalSnapshot = (): DrawingProfessionalSnapshot => {
      const base = this.baseCreateSnapshot();
      return {
        ...base,
        drawingViewRenderStyles: {
          version: 1,
          styles: [...this.styles.entries()].map(([viewId, mode]) => ({
            viewId,
            mode,
          })),
        },
      } as ExtendedProfessionalSnapshot;
    };

    this.professional.restoreProfessionalSnapshot = (
      snapshot: DrawingProfessionalSnapshot,
    ): void => {
      this.baseRestoreSnapshot(snapshot);
      this.styles.clear();
      const extension =
        (snapshot as ExtendedProfessionalSnapshot).drawingViewRenderStyles;
      if (extension?.version === 1) {
        for (const [viewId, mode] of restoreDrawingViewModes(extension.styles)) {
          this.styles.set(viewId, mode);
        }
      }
      this.workspace.render();
    };

    this.production.exportPdf = (): void => {
      this.exportStyledPdf();
    };
  }

  private installToolbar(): { label: HTMLSpanElement; select: HTMLSelectElement } {
    const toolbar = this.workspace.overlay.querySelector<HTMLElement>(
      '[data-framelogic-view-orientation-controls="true"]',
    ) ?? this.workspace.overlay.firstElementChild as HTMLElement | null;
    const label = document.createElement("span");
    label.textContent = "Render vista";
    label.style.opacity = "0.72";

    const select = document.createElement("select");
    select.title = "Estilo de render de la vista seleccionada";
    Object.assign(select.style, {
      padding: "4px 5px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#11181d",
      color: "#eef4f6",
      font: "inherit",
    });
    for (const [value, text] of [
      ["BLACK_WHITE", "Líneas visibles"],
      ["VISIBLE_HIDDEN", "Visibles y ocultas"],
      ["WIREFRAME", "Alámbrico"],
      ["SOLID", "Sólido a color"],
      ["SOLID_EDGES", "Sólido con aristas"],
      ["MONOCHROME", "Sombreado gris"],
      ["TRANSPARENT", "Transparente (sección)"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.addEventListener("change", () => {
      const viewId = this.activeViewId();
      if (!viewId) return;
      this.styles.set(viewId, select.value as DrawingViewRenderMode);
      this.workspace.render();
    });

    if (toolbar) {
      const exportButton = Array.from(toolbar.querySelectorAll("button"))
        .find((button) => button.textContent === "Exportar PDF");
      if (exportButton) {
        exportButton.before(label, select);
      }
      else {
        toolbar.append(label, select);
      }
    }
    return { label, select };
  }

  private readonly handleViewSelectionChange = (): void => {
    this.selectedViewId = this.viewSelect?.value || null;
    this.syncSelect();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const target = event.target instanceof Element
      ? event.target.closest<SVGElement>("[data-framelogic-view-id]")
      : null;
    const viewId = this.viewSelect?.value
      || target?.getAttribute("data-framelogic-view-id");
    if (!viewId) return;
    this.selectedViewId = viewId;
    this.syncSelect();
  };

  private activeViewId(): string | null {
    const sheet = this.production.getActiveSheet();
    if (!sheet) return null;
    const fromOrientation = this.viewSelect?.value;
    if (fromOrientation && sheet.views.some((view) => view.id === fromOrientation)) {
      this.selectedViewId = fromOrientation;
      return fromOrientation;
    }
    if (this.selectedViewId && sheet.views.some((view) => view.id === this.selectedViewId)) {
      return this.selectedViewId;
    }
    const primary =
      sheet.views.find((view) => view.sectionId === sheet.ownerSectionId)
      ?? sheet.views[0];
    this.selectedViewId = primary?.id ?? null;
    return this.selectedViewId;
  }

  private decorate(): void {
    if (this.disposed) return;
    const sheet = this.production.getActiveSheet();
    if (!sheet) {
      this.select.disabled = true;
      return;
    }

    this.workspace.svg
      .querySelectorAll('[data-framelogic-render-style-fill="true"]')
      .forEach((element) => element.remove());

    const professionalSnapshot = this.baseCreateSnapshot();
    const layouts = professionalSnapshot.state.viewLayouts;

    for (const [index, view] of sheet.views.entries()) {
      const layout = layouts.find((entry) => entry.id === view.id);
      if (!layout) continue;
      const mode = this.styles.get(view.id) ?? "BLACK_WHITE";
      if ("kind" in view && view.kind === "ASSEMBLY") {
        const assembly = view as unknown as AssemblyViewRuntime;
        const shaded = (mode === "SOLID" || mode === "SOLID_EDGES" || mode === "MONOCHROME")
          ? this.renderAssemblyShading(assembly, layout, mode === "MONOCHROME",
            mode === "SOLID_EDGES" && !assembly.assemblyOcclusionExact)
          : false;
        this.styleViewportLines(layout, mode, view.id, shaded,
          Boolean(assembly.assemblyOcclusionExact));
        continue;
      }

      const section = this.sectionDrawing.getSections()
        .find((entry) => entry.id === view.sectionId);
      if (!section) continue;
      if (mode === "SOLID" || mode === "TRANSPARENT") {
        const snapshot = index === 0 && this.workspace.snapshot?.section.id === section.id
          ? this.workspace.snapshot : this.workspace.buildSnapshot(section);
        this.renderCutFills(snapshot, layout, index === 0,
          mode === "SOLID" ? "SOLID" : "TRANSPARENT");
      }
      this.styleViewportLines(layout, mode, view.id, false);
    }

    this.syncSelect();
  }

  private renderCutFills(
    snapshot: DrawingSnapshotRuntime,
    layout: DrawingViewLayoutState,
    primary: boolean,
    mode: "SOLID" | "TRANSPARENT",
  ): void {
    const byInstance = new Map<string, DrawingSegmentRuntime[]>();
    for (const segment of snapshot.segments) {
      if (!segment.cut || segment.hidden) continue;
      const list = byInstance.get(segment.instanceId) ?? [];
      list.push(segment);
      byInstance.set(segment.instanceId, list);
    }

    const anchor = this.firstGeometryLine(layout);
    const fragment = document.createDocumentFragment();
    for (const [instanceId, segments] of byInstance) {
      for (const loop of stitchLoops(segments)) {
        if (loop.length < 3) continue;
        const points = loop.map((point) =>
          primary
            ? this.workspace.sectionToPaper(snapshot.section, point.x, point.y)
            : this.secondaryPaperPoint(snapshot.section, layout, point),
        );
        if (layout.kind === "DETAIL" && !this.loopInsideDetail(points, layout)) {
          continue;
        }
        const polygon = document.createElementNS(SVG_NS, "polygon");
        polygon.dataset["framelogicRenderStyleFill"] = "true";
        polygon.setAttribute(
          "points",
          points.map((point) => `${point.x},${point.y}`).join(" "),
        );
        const base = pastelColor(instanceId);
        polygon.setAttribute(
          "fill",
          mode === "SOLID"
            ? base
            : blendHex(base, "#ffffff", 0.72),
        );
        polygon.setAttribute("stroke", "none");
        polygon.style.pointerEvents = "none";
        fragment.append(polygon);
      }
    }

    if (!fragment.childNodes.length) return;
    if (anchor) this.workspace.svg.insertBefore(fragment, anchor);
    else this.workspace.svg.append(fragment);
  }

  private secondaryPaperPoint(
    section: SectionViewDefinition,
    layout: DrawingViewLayoutState,
    point: THREE.Vector2,
  ): THREE.Vector2 {
    const cropRadius = layout.kind === "DETAIL" ? layout.cropRadius : undefined;
    const centerX = layout.cropCenterX ?? section.width / 2;
    const centerY = layout.cropCenterY ?? section.height / 2;
    const modelWidth = cropRadius ? cropRadius * 2 : section.width;
    const modelHeight = cropRadius ? cropRadius * 2 : section.height;
    const scale = Math.min(
      (layout.width - 20) / Math.max(modelWidth, 1e-9),
      (layout.height - 28) / Math.max(modelHeight, 1e-9),
    );
    const originX = layout.x + layout.width / 2 - centerX * scale;
    const originY = layout.y + layout.height / 2 + centerY * scale;
    return new THREE.Vector2(
      originX + point.x * scale,
      originY - point.y * scale,
    );
  }

  private loopInsideDetail(
    points: readonly THREE.Vector2[],
    layout: DrawingViewLayoutState,
  ): boolean {
    const cx = layout.x + layout.width / 2;
    const cy = layout.y + layout.height / 2;
    const radius = Math.min(layout.width, layout.height) * 0.58;
    return points.some((point) => Math.hypot(point.x - cx, point.y - cy) <= radius);
  }

  private renderAssemblyShading(
    view: AssemblyViewRuntime,
    layout: DrawingViewLayoutState,
    monochrome: boolean,
    rasterEdges: boolean,
  ): boolean {
    // A physical STEP cut or a cropped detail is not a regular 3D projection.
    // Never invent section faces by rendering the uncut assembly behind it.
    if (view.automaticSupplement || !view.workPlane || !view.instanceIds?.length) return false;
    const line = this.workspace.svg.querySelector<SVGLineElement>(
      'line[data-framelogic-assembly-view-line="' + view.id + '"]',
    );
    if (!line) return false;
    const originX = Number(line.dataset["framelogicAssemblyOriginX"]);
    const originY = Number(line.dataset["framelogicAssemblyOriginY"]);
    const scale = Number(line.dataset["framelogicAssemblyScale"]);
    if (![originX, originY, scale].every(Number.isFinite) || !(scale > 0)) return false;
    const imageWidth = view.width * scale;
    const imageHeight = view.height * scale;
    if (!(imageWidth > 0 && imageHeight > 0)) return false;

    const shaded = this.shading.render({
      viewId: view.id,
      instanceIds: view.instanceIds,
      plane: view.workPlane,
      modelWidth: view.width,
      modelHeight: view.height,
      offsetX: view.offsetX,
      offsetY: view.offsetY,
      geometrySignature: view.geometrySignature,
      pixelWidth: imageWidth * 3,
      pixelHeight: imageHeight * 3,
      monochrome,
      rasterEdges,
    });
    if (!shaded) return false;

    const clipId = "framelogic-render-clip-" + view.id.replace(/[^a-zA-Z0-9_-]/g, "");
    const definitions = document.createElementNS(SVG_NS, "defs");
    definitions.dataset["framelogicRenderStyleFill"] = "true";
    const clip = document.createElementNS(SVG_NS, "clipPath");
    clip.id = clipId;
    const clipRect = document.createElementNS(SVG_NS, "rect");
    clipRect.setAttribute("x", String(layout.x));
    clipRect.setAttribute("y", String(layout.y));
    clipRect.setAttribute("width", String(layout.width));
    clipRect.setAttribute("height", String(layout.height));
    clip.append(clipRect);
    definitions.append(clip);

    const image = document.createElementNS(SVG_NS, "image");
    image.dataset["framelogicRenderStyleFill"] = "true";
    image.dataset["framelogicViewRaster"] = "true";
    image.dataset["framelogicImageWidth"] = String(shaded.pixelWidth);
    image.dataset["framelogicImageHeight"] = String(shaded.pixelHeight);
    image.setAttribute("href", shaded.jpegDataUrl);
    image.setAttribute("x", String(originX));
    image.setAttribute("y", String(originY));
    image.setAttribute("width", String(imageWidth));
    image.setAttribute("height", String(imageHeight));
    image.setAttribute("preserveAspectRatio", "none");
    image.setAttribute("clip-path", "url(#" + clipId + ")");
    image.dataset["framelogicClipX"] = String(layout.x);
    image.dataset["framelogicClipY"] = String(layout.y);
    image.dataset["framelogicClipWidth"] = String(layout.width);
    image.dataset["framelogicClipHeight"] = String(layout.height);
    image.style.pointerEvents = "none";
    this.workspace.svg.insertBefore(definitions, line);
    this.workspace.svg.insertBefore(image, line);
    return true;
  }

  private styleViewportLines(
    layout: DrawingViewLayoutState,
    mode: DrawingViewRenderMode,
    viewId: string,
    shaded: boolean,
    exactAssemblyOcclusion = false,
  ): void {
    for (const line of Array.from(this.workspace.svg.querySelectorAll<SVGLineElement>("line"))) {
      if (line.hasAttribute("data-annotation-id")) continue;
      const owner = line.dataset["framelogicAssemblyViewLine"];
      if (owner && owner !== viewId) continue;
      if (!owner) {
        // Section-only legacy geometry has no View tag. Never recolor generic
        // lines, dimension guides or frames on a mixed assembly sheet.
        if (this.workspace.svg.querySelector('[data-framelogic-assembly-view-line]')) continue;
        const x1 = Number(line.getAttribute("x1") ?? 0);
        const y1 = Number(line.getAttribute("y1") ?? 0);
        const x2 = Number(line.getAttribute("x2") ?? 0);
        const y2 = Number(line.getAttribute("y2") ?? 0);
        if (!inside((x1 + x2) / 2, (y1 + y2) / 2, layout)) continue;
      }
      const hidden = line.dataset["framelogicAssemblyHidden"] === "true";
      // The explicit View render mode overrides legacy sheet-wide showHidden.
      const showHidden = mode === "WIREFRAME" || mode === "VISIBLE_HIDDEN";
      const hideAll = shaded && (mode === "SOLID" || mode === "MONOCHROME"
        || (mode === "SOLID_EDGES" && !exactAssemblyOcclusion));
      line.setAttribute("display", hideAll || (hidden && !showHidden) ? "none" : "inline");
      if (hidden && showHidden && mode !== "WIREFRAME") {
        line.setAttribute("stroke-dasharray", "4 3");
        line.setAttribute("stroke", "#777777");
        line.setAttribute("stroke-width", "0.6");
      } else if (mode === "WIREFRAME") {
        line.setAttribute("stroke-dasharray", "none");
        line.setAttribute("stroke", "#343b3f");
        line.setAttribute("stroke-width", "0.52");
      } else if (mode === "SOLID_EDGES" && shaded) {
        line.setAttribute("stroke", "#1b252b");
        line.setAttribute("stroke-width", "0.75");
      } else if (mode === "TRANSPARENT") {
        line.setAttribute("stroke", "#64747c");
        line.setAttribute("opacity", "0.72");
      } else {
        line.setAttribute("opacity", "1");
      }
    }
  }

  private firstGeometryLine(
    layout: DrawingViewLayoutState,
  ): SVGLineElement | null {
    return Array.from(this.workspace.svg.querySelectorAll<SVGLineElement>("line"))
      .find((line) => {
        if (line.hasAttribute("data-annotation-id")) return false;
        const x1 = Number(line.getAttribute("x1") ?? 0);
        const y1 = Number(line.getAttribute("y1") ?? 0);
        const x2 = Number(line.getAttribute("x2") ?? 0);
        const y2 = Number(line.getAttribute("y2") ?? 0);
        return inside((x1 + x2) / 2, (y1 + y2) / 2, layout);
      }) ?? null;
  }

  private syncSelect(): void {
    const viewId = this.activeViewId();
    this.select.disabled = !viewId;
    this.select.value = viewId
      ? this.styles.get(viewId) ?? "BLACK_WHITE"
      : "BLACK_WHITE";
  }

  private exportStyledPdf(): void {
    this.workspace.render();
    const sheet = this.production.getActiveSheet();
    if (!sheet) {
      this.baseExportPdf();
      return;
    }

    const size = SHEET_MM[sheet.size] ?? SHEET_MM["A3"]!;
    const [rawW, rawH] = size;
    const widthMm = sheet.orientation === "LANDSCAPE" ? rawW : rawH;
    const heightMm = sheet.orientation === "LANDSCAPE" ? rawH : rawW;
    const widthPt = widthMm * 72 / 25.4;
    const heightPt = heightMm * 72 / 25.4;
    const sx = widthPt / CANVAS_WIDTH;
    const sy = heightPt / CANVAS_HEIGHT;
    const commands: string[] = ["q", "1 J 1 j"];
    const jpegImages: PdfJpegImage[] = [];

    for (const child of Array.from(this.workspace.svg.children)) {
      if (child.getAttribute("display") === "none") continue;
      if (child.hasAttribute("data-framelogic-drawing-snap")) continue;
      if (child.hasAttribute("data-framelogic-view-action")) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === "line") {
        const line = child as SVGLineElement;
        const x1 = Number(line.getAttribute("x1") ?? 0) * sx;
        const y1 = heightPt - Number(line.getAttribute("y1") ?? 0) * sy;
        const x2 = Number(line.getAttribute("x2") ?? 0) * sx;
        const y2 = heightPt - Number(line.getAttribute("y2") ?? 0) * sy;
        const width = Math.max(0.2, Number(line.getAttribute("stroke-width") ?? 1) * Math.min(sx, sy));
        const stroke = pdfColor(line.getAttribute("stroke") ?? "#000000", false);
        const dash = line.getAttribute("stroke-dasharray") ?? "none";
        const pdfDash = dash === "none" ? "[] 0 d"
          : "[" + dash.split(/[ ,]+/).map((v) =>
            n(Math.max(0.1, Number(v) * Math.min(sx, sy)))).join(" ") + "] 0 d";
        commands.push(`${pdfDash} ${stroke} ${n(width)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
      }
      else if (tag === "image" && child.hasAttribute("data-framelogic-view-raster")) {
        const source = child.getAttribute("href") ?? "";
        const prefix = "data:image/jpeg;base64,";
        if (!source.startsWith(prefix)) continue;
        const image = child as SVGImageElement;
        const raster = atob(source.slice(prefix.length));
        const bytes = new Uint8Array(raster.length);
        for (let i = 0; i < raster.length; i++) bytes[i] = raster.charCodeAt(i);
        const imageWidth = Math.max(1, Math.round(Number(image.getAttribute("width") ?? 0) * 3));
        const imageHeight = Math.max(1, Math.round(Number(image.getAttribute("height") ?? 0) * 3));
        // JPEG dimensions are read from the image element's render metadata,
        // not inferred from page-space units.
        const widthPx = Number(image.dataset["framelogicImageWidth"]) || imageWidth;
        const heightPx = Number(image.dataset["framelogicImageHeight"]) || imageHeight;
        const name = "Im" + (jpegImages.length + 1);
        jpegImages.push({ bytes, width: widthPx, height: heightPx });
        const x = Number(image.getAttribute("x") ?? 0) * sx;
        const yTop = Number(image.getAttribute("y") ?? 0);
        const w = Number(image.getAttribute("width") ?? 0) * sx;
        const h = Number(image.getAttribute("height") ?? 0) * sy;
        const y = heightPt - yTop * sy - h;
        const clipX = Number(image.dataset["framelogicClipX"] ?? 0) * sx;
        const clipY = heightPt - (Number(image.dataset["framelogicClipY"] ?? 0)
          + Number(image.dataset["framelogicClipHeight"] ?? 0)) * sy;
        const clipW = Number(image.dataset["framelogicClipWidth"] ?? 0) * sx;
        const clipH = Number(image.dataset["framelogicClipHeight"] ?? 0) * sy;
        commands.push("q", `${n(clipX)} ${n(clipY)} ${n(clipW)} ${n(clipH)} re W n`,
          `${n(w)} 0 0 ${n(h)} ${n(x)} ${n(y)} cm /${name} Do`, "Q");
      }
      else if (tag === "polygon") {
        const polygon = child as SVGPolygonElement;
        const rawPoints = (polygon.getAttribute("points") ?? "").trim();
        const points = rawPoints.split(/\s+/).map((value) => value.split(",").map(Number)).filter((value) => value.length === 2 && value.every(Number.isFinite));
        if (points.length < 3) continue;
        const fill = pdfColor(polygon.getAttribute("fill") ?? "#ffffff", true);
        const [first, ...rest] = points;
        if (!first) continue;
        commands.push(`${fill} ${n(first[0]! * sx)} ${n(heightPt - first[1]! * sy)} m`);
        for (const point of rest) {
          commands.push(`${n(point[0]! * sx)} ${n(heightPt - point[1]! * sy)} l`);
        }
        commands.push("h f");
      }
      else if (tag === "rect") {
        const rect = child as SVGRectElement;
        const x = Number(rect.getAttribute("x") ?? 0) * sx;
        const yTop = Number(rect.getAttribute("y") ?? 0);
        const w = Number(rect.getAttribute("width") ?? 0) * sx;
        const h = Number(rect.getAttribute("height") ?? 0) * sy;
        const y = heightPt - yTop * sy - h;
        const strokeValue = rect.getAttribute("stroke") ?? "none";
        const fillValue = rect.getAttribute("fill") ?? "none";
        if (fillValue !== "none" && fillValue !== "transparent") {
          commands.push(`${pdfColor(fillValue, true)} ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`);
        }
        if (strokeValue !== "none" && strokeValue !== "transparent") {
          const width = Math.max(0.2, Number(rect.getAttribute("stroke-width") ?? 1) * Math.min(sx, sy));
          commands.push(`${pdfColor(strokeValue, false)} ${n(width)} w ${n(x)} ${n(y)} ${n(w)} ${n(h)} re S`);
        }
      }
      else if (tag === "text") {
        const text = child as SVGTextElement;
        const value = pdfText(text.textContent ?? "");
        if (!value) continue;
        const x = Number(text.getAttribute("x") ?? 0) * sx;
        const y = heightPt - Number(text.getAttribute("y") ?? 0) * sy;
        const sizePt = Math.max(5, Number(text.getAttribute("font-size") ?? 10) * Math.min(sx, sy));
        commands.push(`${pdfColor(text.getAttribute("fill") ?? "#111111", true)} BT /F1 ${n(sizePt)} Tf ${n(x)} ${n(y)} Td (${value}) Tj ET`);
      }
    }
    commands.push("Q");

    const bytes = buildPdf(widthPt, heightPt, commands.join("\n"), jpegImages);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const revision = sheet.revisions.at(-1)?.code ?? "0";
    anchor.href = url;
    anchor.download = `${fileSafeName(sheet.titleBlock.drawingNumber || "plano")}_R${revision}.pdf`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}


/** Backwards-compatible hydration of independently saved viewport styles. */
export function restoreDrawingViewModes(
  entries: readonly { readonly viewId: string; readonly mode: string }[],
): Map<string, DrawingViewRenderMode> {
  const modes = new Map<string, DrawingViewRenderMode>();
  for (const entry of entries) {
    if (entry.viewId && isRenderMode(entry.mode)) modes.set(entry.viewId, entry.mode);
  }
  return modes;
}

export function isRenderMode(value: string): value is DrawingViewRenderMode {
  return ["BLACK_WHITE", "VISIBLE_HIDDEN", "WIREFRAME", "SOLID", "SOLID_EDGES", "MONOCHROME", "TRANSPARENT"].includes(value);
}


function inside(x: number, y: number, layout: DrawingViewLayoutState): boolean {
  return x >= layout.x
    && x <= layout.x + layout.width
    && y >= layout.y
    && y <= layout.y + layout.height;
}


function stitchLoops(segments: readonly DrawingSegmentRuntime[]): THREE.Vector2[][] {
  const remaining = segments.map((segment) => ({ ...segment }));
  const loops: THREE.Vector2[][] = [];
  const tolerance = 1e-5;
  const near = (a: THREE.Vector2, b: THREE.Vector2) => a.distanceToSquared(b) <= tolerance * tolerance;

  while (remaining.length > 0) {
    const first = remaining.shift();
    if (!first) break;
    const loop = [
      new THREE.Vector2(first.x1, first.y1),
      new THREE.Vector2(first.x2, first.y2),
    ];

    let guard = remaining.length + 2;
    while (remaining.length > 0 && guard-- > 0) {
      const end = loop.at(-1);
      if (!end) break;
      const index = remaining.findIndex((segment) =>
        near(end, new THREE.Vector2(segment.x1, segment.y1))
        || near(end, new THREE.Vector2(segment.x2, segment.y2)),
      );
      if (index < 0) break;
      const [next] = remaining.splice(index, 1);
      if (!next) break;
      const a = new THREE.Vector2(next.x1, next.y1);
      const b = new THREE.Vector2(next.x2, next.y2);
      loop.push(near(end, a) ? b : a);
      if (loop.length > 3 && near(loop[0]!, loop.at(-1)!)) break;
    }

    if (loop.length >= 4 && near(loop[0]!, loop.at(-1)!)) {
      loop.pop();
      loops.push(loop);
    }
  }
  return loops;
}


function pastelColor(seed: string): string {
  const palette = [
    "#9db7c7", "#a8bfa3", "#c4b5d6", "#d7c7a3",
    "#d6a6ad", "#a8c9bf", "#d9b38c", "#a7bfd9",
  ];
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return palette[(hash >>> 0) % palette.length] ?? palette[0]!;
}


function blendHex(first: string, second: string, amount: number): string {
  const a = parseHex(first);
  const b = parseHex(second);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * amount);
  return `#${[mix(a[0], b[0]), mix(a[1], b[1]), mix(a[2], b[2])]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}


function parseHex(value: string): [number, number, number] {
  const cleaned = value.replace("#", "");
  if (cleaned.length === 3) {
    return [
      Number.parseInt(cleaned[0]! + cleaned[0]!, 16),
      Number.parseInt(cleaned[1]! + cleaned[1]!, 16),
      Number.parseInt(cleaned[2]! + cleaned[2]!, 16),
    ];
  }
  return [
    Number.parseInt(cleaned.slice(0, 2), 16) || 0,
    Number.parseInt(cleaned.slice(2, 4), 16) || 0,
    Number.parseInt(cleaned.slice(4, 6), 16) || 0,
  ];
}


function pdfColor(value: string, fill: boolean): string {
  let rgb: [number, number, number] = [0, 0, 0];
  if (value === "white") rgb = [255, 255, 255];
  else if (value === "black") rgb = [0, 0, 0];
  else if (value.startsWith("#")) rgb = parseHex(value);
  else {
    const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i);
    if (match) rgb = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  return `${n(rgb[0] / 255)} ${n(rgb[1] / 255)} ${n(rgb[2] / 255)} ${fill ? "rg" : "RG"}`;
}


function n(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3) : "0";
}


function pdfText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}


function fileSafeName(value: string): string {
  return pdfText(value).replace(/[^A-Za-z0-9_-]+/g, "_");
}


export interface PdfJpegImage {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Binary-safe, self-contained PDF: the shaded JPEG and vector edges are in
 * the same page content stream, preserving preview drawing order. */
export function buildPdf(
  width: number,
  height: number,
  stream: string,
  images: readonly PdfJpegImage[] = [],
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets = [0];
  let position = 0;
  const append = (value: string | Uint8Array): void => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    position += bytes.length;
  };
  const begin = (index: number): void => {
    offsets.push(position);
    append(String(index) + " 0 obj\n");
  };
  const end = (): void => { append("\nendobj\n"); };
  const streamBytes = encoder.encode(stream);
  const xObjects = images.map((_, index) => "/Im" + (index + 1)
    + " " + (index + 6) + " 0 R").join(" ");

  append("%PDF-1.4\n");
  begin(1); append("<< /Type /Catalog /Pages 2 0 R >>"); end();
  begin(2); append("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); end();
  begin(3);
  append("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "
    + n(width) + " " + n(height) + "] /Resources << /Font << /F1 4 0 R >>"
    + " /XObject << " + xObjects + " >> >> /Contents 5 0 R >>");
  end();
  begin(4); append("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"); end();
  begin(5);
  append("<< /Length " + streamBytes.length + " >>\nstream\n");
  append(streamBytes);
  append("\nendstream");
  end();

  for (const [index, image] of images.entries()) {
    begin(index + 6);
    append("<< /Type /XObject /Subtype /Image /Width " + image.width
      + " /Height " + image.height
      + " /ColorSpace /DeviceRGB /BitsPerComponent 8"
      + " /Filter /DCTDecode /Length " + image.bytes.length + " >>\nstream\n");
    append(image.bytes);
    append("\nendstream");
    end();
  }
  const xrefOffset = position;
  append("xref\n0 " + (images.length + 6) + "\n0000000000 65535 f \n");
  for (const offset of offsets.slice(1)) {
    append(String(offset).padStart(10, "0") + " 00000 n \n");
  }
  append("trailer\n<< /Size " + (images.length + 6)
    + " /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF");

  const result = new Uint8Array(position);
  let next = 0;
  for (const part of chunks) {
    result.set(part, next);
    next += part.length;
  }
  return result;
}
