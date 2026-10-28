import * as THREE from "three";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  CadWorkPlaneState,
} from "../interaction/CadWorkPlaneController";


interface AssemblyPdfControllerOptions {
  readonly container: HTMLElement;
  readonly designScene: DesignSceneController;
}

export interface AssemblyPdfRequest {
  readonly assemblyId: string;
  readonly assemblyName: string;
  readonly instanceIds: readonly string[];
  readonly workPlane: CadWorkPlaneState;
}

interface PlanSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

interface AssemblyPlanView {
  readonly id: string;
  readonly assemblyId: string;
  readonly assemblyName: string;
  readonly workPlaneMode: string;
  readonly width: number;
  readonly height: number;
  readonly segments: readonly PlanSegment[];
}

interface AssemblyPdfSheet {
  readonly id: string;
  name: string;
  readonly views: AssemblyPlanView[];
}

interface PaperLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

interface PaperLabel {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly size: number;
}

interface PaperLayout {
  readonly lines: readonly PaperLine[];
  readonly labels: readonly PaperLabel[];
  readonly frames: readonly {
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
}

const SVG_NS = "http://www.w3.org/2000/svg";
const SHEET_WIDTH = 1120;
const SHEET_HEIGHT = 792;
const LEFT = 42;
const RIGHT = 42;
const TOP = 42;
const BOTTOM = 70;
const VIEW_GAP = 18;
const EPSILON = 1e-8;

/**
 * Hojas PDF de vistas en planta de ensambles.
 *
 * Cada vista se proyecta con el WorkPlane activo en el instante de enviarla:
 * X/Y del WorkPlane son los ejes del papel y su normal define la vista en planta.
 * Solo se recorren las PieceInstance pertenecientes al ensamble solicitado.
 */
export class AssemblyPdfController {
  private readonly designScene: DesignSceneController;
  private readonly overlay: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly sheetSelect: HTMLSelectElement;
  private readonly svg: SVGSVGElement;
  private readonly sheets: AssemblyPdfSheet[] = [];
  private activeSheetId: string | null = null;
  private disposed = false;

  constructor(
    options: AssemblyPdfControllerOptions,
  ) {
    this.designScene = options.designScene;

    const overlay = document.createElement("div");
    overlay.dataset["framelogicAssemblyPdf"] = "true";
    Object.assign(overlay.style, {
      position: "absolute",
      inset: "0",
      zIndex: "540",
      display: "none",
      flexDirection: "column",
      background: "#20272c",
      color: "#edf2f5",
      font: "12px system-ui, sans-serif",
    });

    const toolbar = document.createElement("div");
    Object.assign(toolbar.style, {
      display: "flex",
      alignItems: "center",
      gap: "7px",
      padding: "8px 10px",
      background: "#141b20",
      borderBottom: "1px solid rgba(255,255,255,0.12)",
    });

    const back = this.makeButton("← Model Space");
    const title = document.createElement("div");
    title.style.fontWeight = "700";
    title.style.minWidth = "180px";

    const sheetSelect = document.createElement("select");
    Object.assign(sheetSelect.style, {
      minWidth: "160px",
      padding: "5px 7px",
      background: "#10171c",
      color: "#edf2f5",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
    });

    const rename = this.makeButton("Renombrar hoja");
    const exportButton = this.makeButton("Exportar PDF");
    exportButton.style.marginLeft = "auto";

    toolbar.append(
      back,
      title,
      sheetSelect,
      rename,
      exportButton,
    );

    const stage = document.createElement("div");
    Object.assign(stage.style, {
      flex: "1 1 auto",
      overflow: "auto",
      padding: "28px",
      background: "#3a4248",
    });

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}`);
    svg.setAttribute("width", String(SHEET_WIDTH));
    svg.setAttribute("height", String(SHEET_HEIGHT));
    Object.assign(svg.style, {
      display: "block",
      background: "white",
      boxShadow: "0 10px 30px rgba(0,0,0,0.32)",
    });

    stage.append(svg);
    overlay.append(toolbar, stage);
    options.container.append(overlay);

    this.overlay = overlay;
    this.title = title;
    this.sheetSelect = sheetSelect;
    this.svg = svg;

    back.addEventListener("click", this.close);
    sheetSelect.addEventListener("change", () => {
      this.activeSheetId = sheetSelect.value || null;
      this.render();
    });
    rename.addEventListener("click", () => {
      const sheet = this.getActiveSheet();
      if (!sheet) return;
      const name = window.prompt("Nombre de la hoja", sheet.name)?.trim();
      if (!name) return;
      sheet.name = name;
      this.refreshSheetSelect();
      this.render();
    });
    exportButton.addEventListener("click", () => this.exportActiveSheet());
  }

  sendAssembly(request: AssemblyPdfRequest): boolean {
    if (this.disposed) return false;
    if (!request.workPlane.enabled) {
      window.alert(
        "Activa un WorkPlane antes de enviar el ensamble a PDF. La planta se orienta con los ejes X/Y de ese plano.",
      );
      return false;
    }
    if (request.instanceIds.length < 1) {
      window.alert("El ensamble no contiene piezas.");
      return false;
    }

    const view = this.buildPlanView(request);
    if (!view) {
      window.alert("No se encontró geometría visible para generar la planta del ensamble.");
      return false;
    }

    const destination = this.chooseDestination();
    if (!destination) return false;

    let sheet: AssemblyPdfSheet;
    if (destination === "NEW") {
      const defaultName = `Hoja ${this.sheets.length + 1}`;
      const name = window.prompt("Nombre de la nueva hoja", defaultName)?.trim();
      if (!name) return false;
      sheet = {
        id: crypto.randomUUID(),
        name,
        views: [],
      };
      this.sheets.push(sheet);
    }
    else {
      const existing = this.sheets.find((item) => item.id === destination);
      if (!existing) return false;
      sheet = existing;
    }

    sheet.views.push(view);
    this.activeSheetId = sheet.id;
    this.refreshSheetSelect();
    this.overlay.style.display = "flex";
    this.render();
    return true;
  }

  readonly close = (): void => {
    this.overlay.style.display = "none";
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.overlay.remove();
    this.sheets.length = 0;
  }

  private chooseDestination(): "NEW" | string | null {
    if (this.sheets.length < 1) {
      return "NEW";
    }

    const options = [
      "0 = Nueva hoja",
      ...this.sheets.map(
        (sheet, index) => `${index + 1} = ${sheet.name}`,
      ),
    ].join("\n");
    const answer = window.prompt(
      `Enviar a PDF\n${options}\n\nEscribe el número de destino:`,
      "0",
    );
    if (answer === null) return null;
    const index = Number.parseInt(answer.trim(), 10);
    if (!Number.isFinite(index) || index < 0 || index > this.sheets.length) {
      window.alert("Destino de hoja inválido.");
      return null;
    }
    if (index === 0) return "NEW";
    return this.sheets[index - 1]?.id ?? null;
  }

  private buildPlanView(
    request: AssemblyPdfRequest,
  ): AssemblyPlanView | null {
    const ids = new Set(request.instanceIds);
    const state = request.workPlane;
    const worldToPlane = new THREE.Matrix4()
      .makeBasis(
        state.xAxis.clone().normalize(),
        state.yAxis.clone().normalize(),
        state.normal.clone().normalize(),
      );
    worldToPlane.setPosition(state.origin);
    worldToPlane.invert();

    const raw: PlanSegment[] = [];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const [instanceId, object] of this.designScene.getInstanceEntries()) {
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
          raw.push({
            x1: a.x,
            y1: a.y,
            x2: b.x,
            y2: b.y,
          });
          minX = Math.min(minX, a.x, b.x);
          minY = Math.min(minY, a.y, b.y);
          maxX = Math.max(maxX, a.x, b.x);
          maxY = Math.max(maxY, a.y, b.y);
        }
        edges.dispose();
      });
    }

    if (raw.length < 1 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
      return null;
    }

    const sourceWidth = Math.max(maxX - minX, 0.001);
    const sourceHeight = Math.max(maxY - minY, 0.001);
    const padding = Math.max(sourceWidth, sourceHeight) * 0.04;
    const width = sourceWidth + padding * 2;
    const height = sourceHeight + padding * 2;
    const offsetX = minX - padding;
    const offsetY = minY - padding;

    return {
      id: crypto.randomUUID(),
      assemblyId: request.assemblyId,
      assemblyName: request.assemblyName,
      workPlaneMode: state.mode,
      width,
      height,
      segments: raw.map((segment) => ({
        x1: segment.x1 - offsetX,
        y1: segment.y1 - offsetY,
        x2: segment.x2 - offsetX,
        y2: segment.y2 - offsetY,
      })),
    };
  }

  private layout(sheet: AssemblyPdfSheet): PaperLayout {
    const count = Math.max(sheet.views.length, 1);
    const columns = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / columns);
    const availableWidth = SHEET_WIDTH - LEFT - RIGHT;
    const availableHeight = SHEET_HEIGHT - TOP - BOTTOM;
    const cellWidth = (availableWidth - VIEW_GAP * (columns - 1)) / columns;
    const cellHeight = (availableHeight - VIEW_GAP * (rows - 1)) / rows;
    const lines: PaperLine[] = [];
    const labels: PaperLabel[] = [];
    const frames: PaperLayout["frames"] extends readonly (infer T)[] ? T[] : never = [];

    sheet.views.forEach((view, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const cellX = LEFT + column * (cellWidth + VIEW_GAP);
      const cellY = TOP + row * (cellHeight + VIEW_GAP);
      const titleHeight = 26;
      const innerWidth = Math.max(cellWidth - 20, 1);
      const innerHeight = Math.max(cellHeight - titleHeight - 18, 1);
      const scale = Math.min(
        innerWidth / Math.max(view.width, EPSILON),
        innerHeight / Math.max(view.height, EPSILON),
      );
      const drawnWidth = view.width * scale;
      const drawnHeight = view.height * scale;
      const originX = cellX + (cellWidth - drawnWidth) / 2;
      const originY = cellY + titleHeight + (innerHeight - drawnHeight) / 2;

      frames.push({
        x: cellX,
        y: cellY,
        width: cellWidth,
        height: cellHeight,
      });
      labels.push({
        x: cellX + 8,
        y: cellY + 17,
        text: `${view.assemblyName} · planta ${view.workPlaneMode}`,
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

  private render(): void {
    const sheet = this.getActiveSheet();
    this.svg.replaceChildren();
    if (!sheet) return;

    this.title.textContent = `PDF · ${sheet.name}`;
    const layout = this.layout(sheet);
    this.appendRect(0.5, 0.5, SHEET_WIDTH - 1, SHEET_HEIGHT - 1, "#111", 1);

    for (const frame of layout.frames) {
      this.appendRect(frame.x, frame.y, frame.width, frame.height, "#b6bdc1", 0.7);
    }
    for (const line of layout.lines) {
      this.appendLine(line.x1, line.y1, line.x2, line.y2);
    }
    for (const label of layout.labels) {
      this.appendText(label.x, label.y, label.text, label.size);
    }
  }

  private exportActiveSheet(): void {
    const sheet = this.getActiveSheet();
    if (!sheet) return;
    const bytes = this.createPdf(sheet);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${this.fileSafeName(sheet.name)}.pdf`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  private createPdf(sheet: AssemblyPdfSheet): Uint8Array<ArrayBuffer> {
    const pageWidth = 1190.55;
    const pageHeight = 841.89;
    const sx = pageWidth / SHEET_WIDTH;
    const sy = pageHeight / SHEET_HEIGHT;
    const toX = (value: number) => value * sx;
    const toY = (value: number) => pageHeight - value * sy;
    const layout = this.layout(sheet);
    const commands: string[] = [
      "q",
      "1 J 1 j",
      "0 G 0.45 w",
    ];

    for (const frame of layout.frames) {
      const x = toX(frame.x);
      const y = toY(frame.y + frame.height);
      commands.push(
        `${this.n(x)} ${this.n(y)} ${this.n(frame.width * sx)} ${this.n(frame.height * sy)} re S`,
      );
    }
    for (const line of layout.lines) {
      commands.push(
        `${this.n(toX(line.x1))} ${this.n(toY(line.y1))} m ${this.n(toX(line.x2))} ${this.n(toY(line.y2))} l S`,
      );
    }
    for (const label of layout.labels) {
      commands.push(
        `BT /F1 ${this.n(label.size)} Tf ${this.n(toX(label.x))} ${this.n(toY(label.y))} Td (${this.pdfText(label.text)}) Tj ET`,
      );
    }
    commands.push("Q");

    const stream = commands.join("\n");
    const encoder = new TextEncoder();
    const streamLength = encoder.encode(stream).length;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.n(pageWidth)} ${this.n(pageHeight)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`,
    ];

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];
    for (let index = 0; index < objects.length; index += 1) {
      offsets.push(encoder.encode(pdf).length);
      pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }
    const xrefOffset = encoder.encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let index = 1; index < offsets.length; index += 1) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return encoder.encode(pdf);
  }

  private getActiveSheet(): AssemblyPdfSheet | null {
    return this.activeSheetId
      ? this.sheets.find((sheet) => sheet.id === this.activeSheetId) ?? null
      : null;
  }

  private refreshSheetSelect(): void {
    this.sheetSelect.replaceChildren();
    for (const sheet of this.sheets) {
      const option = document.createElement("option");
      option.value = sheet.id;
      option.textContent = `${sheet.name} · ${sheet.views.length} vista${sheet.views.length === 1 ? "" : "s"}`;
      option.selected = sheet.id === this.activeSheetId;
      this.sheetSelect.append(option);
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
    });
    return button;
  }

  private appendLine(x1: number, y1: number, x2: number, y2: number): void {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("stroke", "#181818");
    line.setAttribute("stroke-width", "0.65");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    this.svg.append(line);
  }

  private appendRect(
    x: number,
    y: number,
    width: number,
    height: number,
    stroke: string,
    strokeWidth: number,
  ): void {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    rect.setAttribute("fill", "none");
    rect.setAttribute("stroke", stroke);
    rect.setAttribute("stroke-width", String(strokeWidth));
    this.svg.append(rect);
  }

  private appendText(x: number, y: number, text: string, size: number): void {
    const element = document.createElementNS(SVG_NS, "text");
    element.setAttribute("x", String(x));
    element.setAttribute("y", String(y));
    element.setAttribute("font-size", String(size));
    element.setAttribute("font-family", "Arial, Helvetica, sans-serif");
    element.setAttribute("fill", "#111");
    element.textContent = text;
    this.svg.append(element);
  }

  private n(value: number): string {
    return value.toFixed(3);
  }

  private pdfText(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  private fileSafeName(value: string): string {
    return this.pdfText(value).replace(/[^A-Za-z0-9_-]+/g, "_");
  }
}
