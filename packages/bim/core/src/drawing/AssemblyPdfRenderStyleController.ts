import * as THREE from "three";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  AssemblyPdfController,
} from "./AssemblyPdfController";

import type {
  DrawingViewRenderMode,
} from "./DrawingViewRenderStyleController";


interface VectorLike {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}


interface WorkPlaneRuntime {
  readonly origin: VectorLike;
  readonly xAxis: VectorLike;
  readonly yAxis: VectorLike;
  readonly normal: VectorLike;
  readonly mode: string;
}


interface AssemblyViewRuntime {
  readonly id: string;
  readonly assemblyId: string;
  readonly assemblyName: string;
  readonly instanceIds: readonly string[];
  readonly workPlane: WorkPlaneRuntime;
  width: number;
  height: number;
  resolved: boolean;
}


interface AssemblySheetRuntime {
  readonly id: string;
  readonly name: string;
  readonly views: AssemblyViewRuntime[];
}


interface AssemblyPdfRuntime {
  readonly overlay: HTMLDivElement;
  readonly svg: SVGSVGElement;
  readonly sheets: AssemblySheetRuntime[];
  readonly designScene: DesignSceneController;
  activeSheetId: string | null;
  render(): void;
  createSnapshot(): unknown;
  restoreSnapshot(snapshot: unknown): void;
  createPdf(sheet: AssemblySheetRuntime): Uint8Array<ArrayBuffer>;
  getActiveSheet(): AssemblySheetRuntime | null;
}


interface SnapshotExtension {
  readonly assemblyPdfRenderStyles?: {
    readonly version: 1;
    readonly styles: readonly {
      readonly viewId: string;
      readonly mode: DrawingViewRenderMode;
    }[];
  };
}


interface ProjectedTriangle {
  readonly points: readonly [THREE.Vector2, THREE.Vector2, THREE.Vector2];
  readonly depth: number;
  readonly color: string;
}


interface Frame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}


const SVG_NS = "http://www.w3.org/2000/svg";
const LANDSCAPE_WIDTH = 1120;
const LANDSCAPE_HEIGHT = 792;
const LEFT = 42;
const RIGHT = 42;
const TOP = 42;
const BOTTOM = 70;
const VIEW_GAP = 18;
const EPSILON = 1e-10;
const MAX_TRIANGLES_PER_VIEW = 9000;


/**
 * Render por viewport en hojas de ensamble/pieza.
 *
 * Los modos SOLID/TRANSPARENT proyectan triángulos reales del objeto 3D sobre
 * el WorkPlane guardado en la vista. El resultado es independiente del modo
 * visual de Model Space y queda persistido en el snapshot de AssemblyPdf.
 */
export class AssemblyPdfRenderStyleController {
  private readonly runtime: AssemblyPdfRuntime;
  private readonly designScene: DesignSceneController;
  private readonly baseRender: () => void;
  private readonly baseCreateSnapshot: () => unknown;
  private readonly baseRestoreSnapshot: (snapshot: unknown) => void;
  private readonly baseCreatePdf:
    (sheet: AssemblySheetRuntime) => Uint8Array<ArrayBuffer>;
  private readonly styles = new Map<string, DrawingViewRenderMode>();
  private readonly select: HTMLSelectElement;
  private disposed = false;

  constructor(assemblyPdf: AssemblyPdfController) {
    this.runtime = assemblyPdf as unknown as AssemblyPdfRuntime;
    this.designScene = this.runtime.designScene;
    this.baseRender = this.runtime.render.bind(assemblyPdf);
    this.baseCreateSnapshot = this.runtime.createSnapshot.bind(assemblyPdf);
    this.baseRestoreSnapshot = this.runtime.restoreSnapshot.bind(assemblyPdf);
    this.baseCreatePdf = this.runtime.createPdf.bind(assemblyPdf);

    this.select = this.installToolbar();
    this.installPatches();
    this.runtime.overlay.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime.overlay.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.runtime.render = this.baseRender;
    this.runtime.createSnapshot = this.baseCreateSnapshot;
    this.runtime.restoreSnapshot = this.baseRestoreSnapshot;
    this.runtime.createPdf = this.baseCreatePdf;
    this.select.previousElementSibling?.remove();
    this.select.remove();
    this.styles.clear();
  }

  private installPatches(): void {
    this.runtime.render = (): void => {
      this.baseRender();
      this.decorate();
    };

    this.runtime.createSnapshot = (): unknown => {
      const base = this.baseCreateSnapshot();
      const object = base && typeof base === "object"
        ? base as Record<string, unknown>
        : {};
      return {
        ...object,
        assemblyPdfRenderStyles: {
          version: 1,
          styles: [...this.styles.entries()].map(([viewId, mode]) => ({
            viewId,
            mode,
          })),
        },
      };
    };

    this.runtime.restoreSnapshot = (snapshot: unknown): void => {
      this.baseRestoreSnapshot(snapshot);
      this.styles.clear();
      const extension =
        snapshot && typeof snapshot === "object"
          ? (snapshot as SnapshotExtension).assemblyPdfRenderStyles
          : undefined;
      if (extension?.version === 1) {
        for (const entry of extension.styles) {
          if (isRenderMode(entry.mode)) {
            this.styles.set(entry.viewId, entry.mode);
          }
        }
      }
      this.runtime.render();
    };

    this.runtime.createPdf = (
      sheet: AssemblySheetRuntime,
    ): Uint8Array<ArrayBuffer> => {
      this.runtime.render();
      return this.pdfFromCurrentSvg(sheet);
    };
  }

  private installToolbar(): HTMLSelectElement {
    const toolbar = this.runtime.overlay.firstElementChild as HTMLElement | null;
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
      ["BLACK_WHITE", "Blanco y negro"],
      ["SOLID", "Sólido"],
      ["WIREFRAME", "Alámbrico"],
      ["TRANSPARENT", "Transparente"],
    ] as const) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    select.addEventListener("change", () => {
      const viewId = this.selectedViewId();
      if (!viewId) return;
      this.styles.set(viewId, select.value as DrawingViewRenderMode);
      this.runtime.render();
    });

    if (toolbar) {
      const exportButton = Array.from(toolbar.querySelectorAll("button"))
        .find((button) => button.textContent === "Exportar PDF");
      if (exportButton) exportButton.before(label, select);
      else toolbar.append(label, select);
    }
    return select;
  }

  private readonly handlePointerDown = (): void => {
    window.setTimeout(() => this.syncSelect(), 0);
  };

  private selectedViewId(): string | null {
    const sheet = this.runtime.getActiveSheet();
    if (!sheet) return null;
    const selected =
      this.runtime.overlay.dataset["framelogicSelectedAssemblyPdfViewId"];
    if (selected && sheet.views.some((view) => view.id === selected)) {
      return selected;
    }
    return sheet.views[0]?.id ?? null;
  }

  private syncSelect(): void {
    const viewId = this.selectedViewId();
    this.select.disabled = !viewId;
    this.select.value = viewId
      ? this.styles.get(viewId) ?? "BLACK_WHITE"
      : "BLACK_WHITE";
  }

  private decorate(): void {
    const sheet = this.runtime.getActiveSheet();
    if (!sheet) {
      this.select.disabled = true;
      return;
    }

    this.runtime.svg
      .querySelectorAll('[data-framelogic-assembly-render-fill="true"]')
      .forEach((element) => element.remove());

    const portrait = this.isPortrait();
    sheet.views.forEach((view, index) => {
      const mode = this.styles.get(view.id) ?? "BLACK_WHITE";
      const frameLandscape = landscapeFrame(sheet.views.length, index);
      const frame = portrait
        ? rotateFramePortrait(frameLandscape)
        : frameLandscape;

      if (mode === "SOLID" || mode === "TRANSPARENT") {
        this.renderSolidView(view, frameLandscape, portrait, mode);
      }
      this.styleLines(frame, mode);
    });

    this.syncSelect();
  }

  private renderSolidView(
    view: AssemblyViewRuntime,
    frame: Frame,
    portrait: boolean,
    mode: "SOLID" | "TRANSPARENT",
  ): void {
    const projection = this.projectTriangles(view);
    if (projection.triangles.length < 1) return;

    const titleHeight = 26;
    const innerWidth = Math.max(frame.width - 20, 1);
    const innerHeight = Math.max(frame.height - titleHeight - 18, 1);
    const scale = Math.min(
      innerWidth / Math.max(view.width, 1e-9),
      innerHeight / Math.max(view.height, 1e-9),
    );
    const drawnWidth = view.width * scale;
    const drawnHeight = view.height * scale;
    const originX = frame.x + (frame.width - drawnWidth) / 2;
    const originY = frame.y + titleHeight + (innerHeight - drawnHeight) / 2;

    const actualFrame = portrait ? rotateFramePortrait(frame) : frame;
    const anchor = this.firstGeometryLine(actualFrame);
    const fragment = document.createDocumentFragment();

    for (const triangle of projection.triangles) {
      const points = triangle.points.map((point) => {
        const x = originX + (point.x - projection.offsetX) * scale;
        const y = originY + drawnHeight - (point.y - projection.offsetY) * scale;
        return portrait
          ? new THREE.Vector2(y, LANDSCAPE_WIDTH - x)
          : new THREE.Vector2(x, y);
      });

      const polygon = document.createElementNS(SVG_NS, "polygon");
      polygon.dataset["framelogicAssemblyRenderFill"] = "true";
      polygon.setAttribute(
        "points",
        points.map((point) => `${point.x},${point.y}`).join(" "),
      );
      polygon.setAttribute(
        "fill",
        mode === "SOLID"
          ? triangle.color
          : blendHex(triangle.color, "#ffffff", 0.72),
      );
      polygon.setAttribute("stroke", "none");
      polygon.style.pointerEvents = "none";
      fragment.append(polygon);
    }

    if (anchor) this.runtime.svg.insertBefore(fragment, anchor);
    else this.runtime.svg.append(fragment);
  }

  private projectTriangles(view: AssemblyViewRuntime): {
    readonly triangles: ProjectedTriangle[];
    readonly offsetX: number;
    readonly offsetY: number;
  } {
    const state = view.workPlane;
    const worldToPlane = new THREE.Matrix4().makeBasis(
      vector(state.xAxis).normalize(),
      vector(state.yAxis).normalize(),
      vector(state.normal).normalize(),
    );
    worldToPlane.setPosition(vector(state.origin));
    worldToPlane.invert();

    const ids = new Set(view.instanceIds);
    const triangles: ProjectedTriangle[] = [];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let remaining = MAX_TRIANGLES_PER_VIEW;

    for (const [instanceId, root] of this.designScene.getInstanceEntries()) {
      if (!ids.has(instanceId) || remaining <= 0) continue;
      root.updateWorldMatrix(true, true);
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) || remaining <= 0) return;
        const position = object.geometry.getAttribute("position");
        if (!position) return;
        const index = object.geometry.index;
        const triangleCount = Math.floor((index?.count ?? position.count) / 3);
        if (triangleCount < 1) return;
        const step = Math.max(1, Math.ceil(triangleCount / Math.max(remaining, 1)));
        const color = meshColor(object, instanceId);

        for (let triangleIndex = 0; triangleIndex < triangleCount && remaining > 0; triangleIndex += step) {
          const base = triangleIndex * 3;
          const ia = index ? index.getX(base) : base;
          const ib = index ? index.getX(base + 1) : base + 1;
          const ic = index ? index.getX(base + 2) : base + 2;
          const a = new THREE.Vector3().fromBufferAttribute(position, ia)
            .applyMatrix4(object.matrixWorld)
            .applyMatrix4(worldToPlane);
          const b = new THREE.Vector3().fromBufferAttribute(position, ib)
            .applyMatrix4(object.matrixWorld)
            .applyMatrix4(worldToPlane);
          const c = new THREE.Vector3().fromBufferAttribute(position, ic)
            .applyMatrix4(object.matrixWorld)
            .applyMatrix4(worldToPlane);
          const area = Math.abs(
            (b.x - a.x) * (c.y - a.y)
            - (b.y - a.y) * (c.x - a.x),
          );
          if (area <= EPSILON) continue;

          const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
          const light = new THREE.Vector3(0.35, 0.45, 0.82).normalize();
          const shade = 0.70 + Math.abs(normal.dot(light)) * 0.30;
          const shaded = shadeHex(color, shade);
          triangles.push({
            points: [
              new THREE.Vector2(a.x, a.y),
              new THREE.Vector2(b.x, b.y),
              new THREE.Vector2(c.x, c.y),
            ],
            depth: (a.z + b.z + c.z) / 3,
            color: shaded,
          });
          minX = Math.min(minX, a.x, b.x, c.x);
          minY = Math.min(minY, a.y, b.y, c.y);
          maxX = Math.max(maxX, a.x, b.x, c.x);
          maxY = Math.max(maxY, a.y, b.y, c.y);
          remaining -= 1;
        }
      });
    }

    triangles.sort((first, second) => first.depth - second.depth);
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
      return { triangles: [], offsetX: 0, offsetY: 0 };
    }
    const sourceWidth = Math.max(maxX - minX, 0.001);
    const sourceHeight = Math.max(maxY - minY, 0.001);
    const padding = Math.max(sourceWidth, sourceHeight) * 0.04;
    return {
      triangles,
      offsetX: minX - padding,
      offsetY: minY - padding,
    };
  }

  private styleLines(frame: Frame, mode: DrawingViewRenderMode): void {
    for (const line of Array.from(this.runtime.svg.querySelectorAll<SVGLineElement>("line"))) {
      if (line.hasAttribute("data-annotation-id")) continue;
      const x1 = Number(line.getAttribute("x1") ?? 0);
      const y1 = Number(line.getAttribute("y1") ?? 0);
      const x2 = Number(line.getAttribute("x2") ?? 0);
      const y2 = Number(line.getAttribute("y2") ?? 0);
      if (!inside((x1 + x2) / 2, (y1 + y2) / 2, frame)) continue;

      if (mode === "WIREFRAME") {
        line.setAttribute("stroke", "#343b3f");
        line.setAttribute("stroke-width", "0.5");
        line.setAttribute("opacity", "1");
      }
      else if (mode === "SOLID") {
        line.setAttribute("stroke", "#20272b");
        line.setAttribute("stroke-width", "0.62");
        line.setAttribute("opacity", "0.88");
      }
      else if (mode === "TRANSPARENT") {
        line.setAttribute("stroke", "#65757d");
        line.setAttribute("stroke-width", "0.55");
        line.setAttribute("opacity", "0.72");
      }
      else {
        line.setAttribute("stroke", "#111111");
        line.setAttribute("opacity", "1");
      }
    }
  }

  private firstGeometryLine(frame: Frame): SVGLineElement | null {
    return Array.from(this.runtime.svg.querySelectorAll<SVGLineElement>("line"))
      .find((line) => {
        if (line.hasAttribute("data-annotation-id")) return false;
        const x1 = Number(line.getAttribute("x1") ?? 0);
        const y1 = Number(line.getAttribute("y1") ?? 0);
        const x2 = Number(line.getAttribute("x2") ?? 0);
        const y2 = Number(line.getAttribute("y2") ?? 0);
        return inside((x1 + x2) / 2, (y1 + y2) / 2, frame);
      }) ?? null;
  }

  private isPortrait(): boolean {
    const viewBox = this.runtime.svg.viewBox.baseVal;
    return viewBox.width > 0 && viewBox.height > viewBox.width;
  }

  private pdfFromCurrentSvg(
    sheet: AssemblySheetRuntime,
  ): Uint8Array<ArrayBuffer> {
    void sheet;
    const viewBox = this.runtime.svg.viewBox.baseVal;
    const sourceWidth = viewBox.width || LANDSCAPE_WIDTH;
    const sourceHeight = viewBox.height || LANDSCAPE_HEIGHT;
    const pageWidth = this.isPortrait() ? 841.89 : 1190.55;
    const pageHeight = this.isPortrait() ? 1190.55 : 841.89;
    const sx = pageWidth / sourceWidth;
    const sy = pageHeight / sourceHeight;
    const commands: string[] = ["q", "1 J 1 j"];

    for (const child of Array.from(this.runtime.svg.children)) {
      if (child.hasAttribute("data-framelogic-assembly-pdf-view-hit")) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === "polygon") {
        const polygon = child as SVGPolygonElement;
        const points = parsePoints(polygon.getAttribute("points") ?? "");
        if (points.length < 3) continue;
        const first = points[0]!;
        commands.push(`${pdfColor(polygon.getAttribute("fill") ?? "#ffffff", true)} ${n(first.x * sx)} ${n(pageHeight - first.y * sy)} m`);
        for (const point of points.slice(1)) {
          commands.push(`${n(point.x * sx)} ${n(pageHeight - point.y * sy)} l`);
        }
        commands.push("h f");
      }
      else if (tag === "line") {
        const line = child as SVGLineElement;
        const x1 = Number(line.getAttribute("x1") ?? 0) * sx;
        const y1 = pageHeight - Number(line.getAttribute("y1") ?? 0) * sy;
        const x2 = Number(line.getAttribute("x2") ?? 0) * sx;
        const y2 = pageHeight - Number(line.getAttribute("y2") ?? 0) * sy;
        const width = Math.max(0.2, Number(line.getAttribute("stroke-width") ?? 1) * Math.min(sx, sy));
        commands.push(`${pdfColor(line.getAttribute("stroke") ?? "#111111", false)} ${n(width)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`);
      }
      else if (tag === "rect") {
        const rect = child as SVGRectElement;
        const fill = rect.getAttribute("fill") ?? "none";
        const stroke = rect.getAttribute("stroke") ?? "none";
        const x = Number(rect.getAttribute("x") ?? 0) * sx;
        const yTop = Number(rect.getAttribute("y") ?? 0);
        const width = Number(rect.getAttribute("width") ?? 0) * sx;
        const height = Number(rect.getAttribute("height") ?? 0) * sy;
        const y = pageHeight - yTop * sy - height;
        if (fill !== "none" && fill !== "transparent" && !fill.startsWith("rgba(0,0,0,0")) {
          commands.push(`${pdfColor(fill, true)} ${n(x)} ${n(y)} ${n(width)} ${n(height)} re f`);
        }
        if (stroke !== "none" && stroke !== "transparent") {
          const strokeWidth = Math.max(0.2, Number(rect.getAttribute("stroke-width") ?? 1) * Math.min(sx, sy));
          commands.push(`${pdfColor(stroke, false)} ${n(strokeWidth)} w ${n(x)} ${n(y)} ${n(width)} ${n(height)} re S`);
        }
      }
      else if (tag === "text") {
        const text = child as SVGTextElement;
        const value = pdfText(text.textContent ?? "");
        if (!value) continue;
        const x = Number(text.getAttribute("x") ?? 0) * sx;
        const y = pageHeight - Number(text.getAttribute("y") ?? 0) * sy;
        const fontSize = Math.max(5, Number(text.getAttribute("font-size") ?? 10) * Math.min(sx, sy));
        commands.push(`${pdfColor(text.getAttribute("fill") ?? "#111111", true)} BT /F1 ${n(fontSize)} Tf ${n(x)} ${n(y)} Td (${value}) Tj ET`);
      }
    }
    commands.push("Q");
    return buildPdf(pageWidth, pageHeight, commands.join("\n"));
  }
}


function vector(value: VectorLike): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}


function landscapeFrame(countValue: number, index: number): Frame {
  const count = Math.max(countValue, 1);
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const availableWidth = LANDSCAPE_WIDTH - LEFT - RIGHT;
  const availableHeight = LANDSCAPE_HEIGHT - TOP - BOTTOM;
  const cellWidth = (availableWidth - VIEW_GAP * (columns - 1)) / columns;
  const cellHeight = (availableHeight - VIEW_GAP * (rows - 1)) / rows;
  const column = index % columns;
  const row = Math.floor(index / columns);
  return {
    x: LEFT + column * (cellWidth + VIEW_GAP),
    y: TOP + row * (cellHeight + VIEW_GAP),
    width: cellWidth,
    height: cellHeight,
  };
}


function rotateFramePortrait(frame: Frame): Frame {
  return {
    x: frame.y,
    y: LANDSCAPE_WIDTH - frame.x - frame.width,
    width: frame.height,
    height: frame.width,
  };
}


function inside(x: number, y: number, frame: Frame): boolean {
  return x >= frame.x
    && x <= frame.x + frame.width
    && y >= frame.y
    && y <= frame.y + frame.height;
}


function meshColor(mesh: THREE.Mesh, seed: string): string {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  for (const material of materials) {
    const color = (material as THREE.MeshBasicMaterial).color;
    if (color instanceof THREE.Color) {
      return `#${color.getHexString()}`;
    }
  }
  return pastelColor(seed);
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


function shadeHex(color: string, factor: number): string {
  const rgb = parseHex(color);
  return `#${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value * factor))).toString(16).padStart(2, "0")).join("")}`;
}


function blendHex(first: string, second: string, amount: number): string {
  const a = parseHex(first);
  const b = parseHex(second);
  return `#${a.map((value, index) => Math.round(value + (b[index]! - value) * amount).toString(16).padStart(2, "0")).join("")}`;
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


function isRenderMode(value: string): value is DrawingViewRenderMode {
  return ["BLACK_WHITE", "WIREFRAME", "SOLID", "TRANSPARENT"].includes(value);
}


function parsePoints(value: string): THREE.Vector2[] {
  return value.trim().split(/\s+/).map((entry) => {
    const [x, y] = entry.split(",").map(Number);
    return new THREE.Vector2(x ?? 0, y ?? 0);
  }).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
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


function buildPdf(
  width: number,
  height: number,
  stream: string,
): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const streamLength = encoder.encode(stream).length;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(width)} ${n(height)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(pdf);
}
