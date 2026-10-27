import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

interface DxfPair {
  readonly code: number;
  readonly value: string;
}

interface DxfRecord {
  readonly type: string;
  readonly pairs: readonly DxfPair[];
}

interface CadPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface ImportedSegment {
  readonly layer: string;
  readonly start: CadPoint3;
  readonly end: CadPoint3;
}

interface ImportedPoint {
  readonly layer: string;
  readonly point: CadPoint3;
}

interface ParsedCadReference {
  readonly segments: readonly ImportedSegment[];
  readonly points: readonly ImportedPoint[];
  readonly insUnits: number;
  readonly skippedEntities: number;
}

export interface CadReferenceImportControllerOptions {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly cadLineScene: CadLineSceneController;
  readonly cadPointScene: CadPointSceneController;
  readonly clearGeometryQueryCache: () => void;
  readonly onImported?: () => void | Promise<void>;
}

/**
 * Importa planos 2D como geometría CAD nativa de FrameLogic. DXF ASCII se
 * procesa directamente y DWG se convierte localmente a DXF mediante WASM.
 */
export class CadReferenceImportController {
  private readonly options: CadReferenceImportControllerOptions;
  private readonly button: HTMLButtonElement;
  private readonly input: HTMLInputElement;
  private disposed = false;

  constructor(
    options: CadReferenceImportControllerOptions,
  ) {
    this.options = options;
    this.button = this.createButton(options.container);
    this.input = this.createInput(options.container);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.button.remove();
    this.input.remove();
  }

  async importFile(file: File): Promise<void> {
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    let text: string;

    if (extension === "dwg") {
      text = await this.convertDwgToDxfText(file);
    }
    else if (extension === "dxf") {
      text = await file.text();
    }
    else {
      throw new Error("Selecciona un archivo .DWG o .DXF.");
    }

    if (text.startsWith("AutoCAD Binary DXF")) {
      throw new Error("El DXF es binario. Guárdalo como DXF ASCII o abre el DWG original.");
    }

    const parsed = parseDxf(text);
    if (parsed.segments.length < 1 && parsed.points.length < 1) {
      throw new Error("No se encontraron entidades 2D compatibles en el archivo CAD.");
    }

    const unitScale = this.resolveUnitScale(parsed.insUnits);
    const layerIds = new Map<string, string>();
    const referenceName = uniqueReferenceName(
      this.options.designModel,
      stripExtension(file.name),
    );
    const getLayerId = (sourceLayer: string): string => {
      const key = sourceLayer.trim() || "0";
      const current = layerIds.get(key);
      if (current) return current;
      const layer = this.options.designModel.layers.create({
        name: uniqueLayerName(
          this.options.designModel,
          `CAD ${referenceName} · ${key}`,
        ),
        visible: true,
        locked: false,
        snapEnabled: true,
      });
      layerIds.set(key, layer.id);
      return layer.id;
    };

    for (const segment of parsed.segments) {
      this.options.designModel.registerCadLine({
        layerId: getLayerId(segment.layer),
        start: scaledPoint(segment.start, unitScale),
        end: scaledPoint(segment.end, unitScale),
      });
    }

    for (const entry of parsed.points) {
      this.options.designModel.registerCadPoint({
        layerId: getLayerId(entry.layer),
        position: scaledPoint(entry.point, unitScale),
      });
    }

    this.options.cadLineScene.sync();
    this.options.cadPointScene.sync();
    this.options.clearGeometryQueryCache();
    await this.options.onImported?.();

    const skipped = parsed.skippedEntities > 0
      ? ` · ${parsed.skippedEntities} entidades no compatibles omitidas`
      : "";
    window.alert(
      `Plano CAD "${referenceName}" importado como bloque de referencia.\n${parsed.segments.length} segmentos · ${parsed.points.length} puntos${skipped}.`,
    );
  }

  private createButton(container: HTMLElement): HTMLButtonElement {
    const projectBar = container.querySelector<HTMLElement>('[data-framelogic-project-toolbar="true"]');
    if (projectBar) {
      projectBar.style.top = "52px";
      projectBar.style.left = "16px";
      projectBar.style.zIndex = "124";
      projectBar.style.flexWrap = "wrap";
      projectBar.style.maxWidth = "min(520px, calc(100% - 32px))";
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Abrir DWG/DXF";
    button.title = "Importar plano CAD 2D como bloque de referencia con SNAP";
    Object.assign(button.style, {
      padding: "5px 8px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#27343c",
      color: "#f3f7f9",
      cursor: "pointer",
      font: "12px system-ui, sans-serif",
    });
    button.addEventListener("click", () => this.input.click());

    if (projectBar) projectBar.append(button);
    else {
      button.style.position = "absolute";
      button.style.left = "16px";
      button.style.top = "52px";
      button.style.zIndex = "124";
      container.append(button);
    }
    return button;
  }

  private createInput(container: HTMLElement): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".dwg,.dxf";
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      void this.importFile(file)
        .catch((error) => {
          console.error("Error importing DWG/DXF reference:", error);
          window.alert(
            `No se pudo importar el plano CAD.\n\n${error instanceof Error ? error.message : String(error)}`,
          );
        })
        .finally(() => {
          input.value = "";
        });
    });
    container.append(input);
    return input;
  }

  private async convertDwgToDxfText(file: File): Promise<string> {
    const module = await import("dwgdxf");
    await module.init();
    const converted = await module.convertDwgToDxf(
      new Uint8Array(await file.arrayBuffer()),
    );
    return new TextDecoder().decode(converted);
  }

  private resolveUnitScale(insUnits: number): number {
    const known = insUnitsToMeters(insUnits);
    if (known !== null) return known;

    const answer = window.prompt(
      "El plano no declara unidades. Escribe mm, cm, m, in o ft:",
      "mm",
    )?.trim().toLowerCase();
    if (answer === null || answer === undefined) {
      throw new Error("Importación cancelada: faltan las unidades del plano.");
    }
    switch (answer) {
      case "mm": return 0.001;
      case "cm": return 0.01;
      case "m": return 1;
      case "in":
      case "inch":
      case "inches": return 0.0254;
      case "ft":
      case "feet": return 0.3048;
      default:
        throw new Error(`Unidad "${answer}" no reconocida.`);
    }
  }
}

function parseDxf(text: string): ParsedCadReference {
  const pairs = parsePairs(text);
  const records = extractEntityRecords(pairs);
  const segments: ImportedSegment[] = [];
  const points: ImportedPoint[] = [];
  let skippedEntities = 0;
  let polyline: {
    layer: string;
    closed: boolean;
    vertices: CadPoint3[];
  } | null = null;

  const flushPolyline = (): void => {
    if (!polyline) return;
    appendPolylineSegments(segments, polyline.layer, polyline.vertices, polyline.closed);
    polyline = null;
  };

  for (const record of records) {
    if (record.type === "POLYLINE") {
      flushPolyline();
      polyline = {
        layer: stringCode(record, 8, "0"),
        closed: (numberCode(record, 70, 0) & 1) !== 0,
        vertices: [],
      };
      continue;
    }
    if (record.type === "VERTEX" && polyline) {
      polyline.vertices.push(pointFromRecord(record, 10, 20, 30));
      continue;
    }
    if (record.type === "SEQEND" && polyline) {
      flushPolyline();
      continue;
    }
    if (polyline) flushPolyline();

    const layer = stringCode(record, 8, "0");
    switch (record.type) {
      case "LINE":
        segments.push({
          layer,
          start: pointFromRecord(record, 10, 20, 30),
          end: pointFromRecord(record, 11, 21, 31),
        });
        break;
      case "POINT":
        points.push({
          layer,
          point: pointFromRecord(record, 10, 20, 30),
        });
        break;
      case "LWPOLYLINE": {
        const vertices = lightweightPolylineVertices(record);
        const closed = (numberCode(record, 70, 0) & 1) !== 0;
        appendPolylineSegments(segments, layer, vertices, closed);
        break;
      }
      case "CIRCLE": {
        const center = pointFromRecord(record, 10, 20, 30);
        const radius = Math.abs(numberCode(record, 40, 0));
        if (radius > 0) appendArcSegments(segments, layer, center, radius, 0, Math.PI * 2, 64);
        break;
      }
      case "ARC": {
        const center = pointFromRecord(record, 10, 20, 30);
        const radius = Math.abs(numberCode(record, 40, 0));
        let start = THREE_DEG_TO_RAD * numberCode(record, 50, 0);
        let end = THREE_DEG_TO_RAD * numberCode(record, 51, 0);
        while (end <= start) end += Math.PI * 2;
        const count = Math.max(8, Math.ceil((end - start) / (Math.PI * 2) * 64));
        if (radius > 0) appendArcSegments(segments, layer, center, radius, start, end, count);
        break;
      }
      case "ELLIPSE": {
        const center = pointFromRecord(record, 10, 20, 30);
        const major = pointFromRecord(record, 11, 21, 31);
        const ratio = Math.abs(numberCode(record, 40, 1));
        const start = numberCode(record, 41, 0);
        let end = numberCode(record, 42, Math.PI * 2);
        while (end <= start) end += Math.PI * 2;
        appendEllipseSegments(segments, layer, center, major, ratio, start, end, 64);
        break;
      }
      case "TEXT":
      case "MTEXT":
      case "DIMENSION":
      case "HATCH":
      case "INSERT":
      case "SPLINE":
      case "SOLID":
      case "3DFACE":
        skippedEntities += 1;
        break;
      default:
        if (record.type !== "") skippedEntities += 1;
        break;
    }
  }
  flushPolyline();

  return {
    segments,
    points,
    insUnits: readInsUnits(pairs),
    skippedEntities,
  };
}

function parsePairs(text: string): DxfPair[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const result: DxfPair[] = [];
  for (let index = 0; index + 1 < lines.length; index += 2) {
    const code = Number.parseInt(lines[index]?.trim() ?? "", 10);
    if (!Number.isFinite(code)) continue;
    result.push({
      code,
      value: lines[index + 1]?.trim() ?? "",
    });
  }
  return result;
}

function extractEntityRecords(pairs: readonly DxfPair[]): DxfRecord[] {
  const records: DxfRecord[] = [];
  let inEntities = false;
  let index = 0;
  while (index < pairs.length) {
    const pair = pairs[index];
    const next = pairs[index + 1];
    if (!pair) break;
    if (
      pair.code === 0
      && pair.value.toUpperCase() === "SECTION"
      && next?.code === 2
      && next.value.toUpperCase() === "ENTITIES"
    ) {
      inEntities = true;
      index += 2;
      continue;
    }
    if (inEntities && pair.code === 0 && pair.value.toUpperCase() === "ENDSEC") break;
    if (!inEntities || pair.code !== 0) {
      index += 1;
      continue;
    }

    const type = pair.value.toUpperCase();
    const entityPairs: DxfPair[] = [];
    index += 1;
    while (index < pairs.length && pairs[index]?.code !== 0) {
      const current = pairs[index];
      if (current) entityPairs.push(current);
      index += 1;
    }
    records.push({ type, pairs: entityPairs });
  }
  return records;
}

function readInsUnits(pairs: readonly DxfPair[]): number {
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    if (pair?.code !== 9 || pair.value !== "$INSUNITS") continue;
    for (let offset = 1; offset <= 4; offset += 1) {
      const candidate = pairs[index + offset];
      if (candidate?.code === 70) return Number.parseInt(candidate.value, 10) || 0;
    }
  }
  return 0;
}

function pointFromRecord(
  record: DxfRecord,
  xCode: number,
  yCode: number,
  zCode: number,
): CadPoint3 {
  return {
    x: numberCode(record, xCode, 0),
    y: numberCode(record, yCode, 0),
    z: numberCode(record, zCode, 0),
  };
}

function lightweightPolylineVertices(record: DxfRecord): CadPoint3[] {
  const result: CadPoint3[] = [];
  let current: { x: number; y: number; z: number } | null = null;
  for (const pair of record.pairs) {
    if (pair.code === 10) {
      if (current) result.push(current);
      current = { x: Number(pair.value) || 0, y: 0, z: 0 };
    }
    else if (pair.code === 20 && current) current.y = Number(pair.value) || 0;
    else if (pair.code === 30 && current) current.z = Number(pair.value) || 0;
  }
  if (current) result.push(current);
  return result;
}

function appendPolylineSegments(
  output: ImportedSegment[],
  layer: string,
  vertices: readonly CadPoint3[],
  closed: boolean,
): void {
  for (let index = 0; index + 1 < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[index + 1];
    if (start && end) output.push({ layer, start, end });
  }
  if (closed && vertices.length > 2) {
    const start = vertices.at(-1);
    const end = vertices[0];
    if (start && end) output.push({ layer, start, end });
  }
}

function appendArcSegments(
  output: ImportedSegment[],
  layer: string,
  center: CadPoint3,
  radius: number,
  startAngle: number,
  endAngle: number,
  count: number,
): void {
  let previous = arcPoint(center, radius, startAngle);
  for (let index = 1; index <= count; index += 1) {
    const angle = startAngle + (endAngle - startAngle) * index / count;
    const current = arcPoint(center, radius, angle);
    output.push({ layer, start: previous, end: current });
    previous = current;
  }
}

function appendEllipseSegments(
  output: ImportedSegment[],
  layer: string,
  center: CadPoint3,
  major: CadPoint3,
  ratio: number,
  startParameter: number,
  endParameter: number,
  count: number,
): void {
  const majorLength = Math.hypot(major.x, major.y);
  if (majorLength <= 1e-12 || ratio <= 0) return;
  const ux = major.x / majorLength;
  const uy = major.y / majorLength;
  const vx = -uy;
  const vy = ux;
  const pointAt = (parameter: number): CadPoint3 => ({
    x: center.x + ux * majorLength * Math.cos(parameter) + vx * majorLength * ratio * Math.sin(parameter),
    y: center.y + uy * majorLength * Math.cos(parameter) + vy * majorLength * ratio * Math.sin(parameter),
    z: center.z,
  });
  let previous = pointAt(startParameter);
  for (let index = 1; index <= count; index += 1) {
    const parameter = startParameter + (endParameter - startParameter) * index / count;
    const current = pointAt(parameter);
    output.push({ layer, start: previous, end: current });
    previous = current;
  }
}

function arcPoint(center: CadPoint3, radius: number, angle: number): CadPoint3 {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
    z: center.z,
  };
}

function numberCode(record: DxfRecord, code: number, fallback: number): number {
  const value = record.pairs.find((pair) => pair.code === code)?.value;
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringCode(record: DxfRecord, code: number, fallback: string): string {
  return record.pairs.find((pair) => pair.code === code)?.value ?? fallback;
}

function scaledPoint(point: CadPoint3, scale: number): CadPoint3 {
  return {
    x: point.x * scale,
    y: point.y * scale,
    z: point.z * scale,
  };
}

function insUnitsToMeters(code: number): number | null {
  switch (code) {
    case 1: return 0.0254;
    case 2: return 0.3048;
    case 3: return 1609.344;
    case 4: return 0.001;
    case 5: return 0.01;
    case 6: return 1;
    case 7: return 1000;
    case 8: return 0.0000000254;
    case 9: return 0.0000254;
    case 10: return 0.9144;
    case 11: return 1e-10;
    case 12: return 1e-9;
    case 13: return 1e-6;
    case 14: return 0.1;
    case 15: return 10;
    case 16: return 100;
    case 17: return 1e9;
    case 18: return 1.495978707e11;
    case 19: return 9.4607304725808e15;
    case 20: return 3.085677581491367e16;
    case 21: return 1200 / 3937;
    default: return null;
  }
}

function uniqueReferenceName(
  designModel: DesignModel,
  requested: string,
): string {
  const base = requested.trim().slice(0, 72) || "Referencia";
  const used = new Set<string>();
  for (const layer of designModel.layers.getAll()) {
    if (!layer.name.startsWith("CAD ")) continue;
    const body = layer.name.slice(4);
    const separator = body.indexOf(" · ");
    if (separator <= 0) continue;
    used.add(
      body.slice(0, separator).trim().toLowerCase(),
    );
  }
  if (!used.has(base.toLowerCase())) return base;
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${base} (${index})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${crypto.randomUUID().slice(0, 8)}`;
}

function uniqueLayerName(designModel: DesignModel, requested: string): string {
  const base = requested.trim().slice(0, 96) || "CAD Reference";
  const used = new Set(
    designModel.layers.getAll().map((layer) => layer.name.trim().toLowerCase()),
  );
  if (!used.has(base.toLowerCase())) return base;
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${base} (${index})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} ${crypto.randomUUID().slice(0, 8)}`;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Referencia";
}

const THREE_DEG_TO_RAD = Math.PI / 180;
