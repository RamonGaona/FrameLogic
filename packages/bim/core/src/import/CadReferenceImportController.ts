import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";
import { type CadDxfPoint3, type ParsedCadReference, MAX_RENDERED_SEGMENTS } from "./CadDxfGeometryParser";
import { suspiciousDwgMeterScale } from "./CadImportScaleSafety";
import {
  CAD_TEXT_ANCHOR_PREFIX,
  type CadReferenceTextAnnotation,
  type CadReferenceTextSceneController,
} from "../design/CadReferenceTextSceneController";

export interface CadReferenceImportControllerOptions {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly cadLineScene: CadLineSceneController;
  readonly cadPointScene: CadPointSceneController;
  readonly cadTextScene?: CadReferenceTextSceneController;
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
  private readonly recoveryButton: HTMLButtonElement;
  private readonly input: HTMLInputElement;
  private recoverNextDwg = false;
  private disposed = false;
  private importing = false;

  constructor(
    options: CadReferenceImportControllerOptions,
  ) {
    this.options = options;
    this.button = this.createButton(options.container);
    this.input = this.createInput(options.container);
    this.recoveryButton = this.createRecoveryButton(options.container);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.button.remove();
    this.recoveryButton.remove();
    this.input.remove();
  }

  async importFile(file: File, recoverDwg = false): Promise<void> {
    if (this.importing) {
      throw new Error("Ya se está importando un DWG/DXF.");
    }
    this.importing = true;
    this.button.disabled = true;
    this.recoveryButton.disabled = true;
    // Pause pointer-driven SNAP until the last registered CAD segment is
    // available; otherwise every 900-line import chunk invalidates the
    // spatial index while the user moves the pointer.
    document.body.dataset["framelogicCadImporting"] = "true";
    const status = document.createElement("div");
    status.dataset["framelogicCadImportProgress"] = "true";
    status.setAttribute("role", "status");
    Object.assign(status.style, {
      position: "fixed", top: "72px", left: "50%",
      transform: "translateX(-50%)", zIndex: "2147483100",
      color: "#f0f9ff", background: "rgba(12,27,42,0.96)",
      border: "1px solid #60a5fa", borderRadius: "6px",
      padding: "12px 18px", font: "13px system-ui, sans-serif",
      maxWidth: "min(600px, 90vw)", pointerEvents: "none",
    });
    document.body.append(status);
    const report = (message: string) => { status.textContent = message; };
    const yieldFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

    try {
      const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
      if (extension !== "dwg" && extension !== "dxf") {
        throw new Error("Selecciona un archivo .DWG o .DXF.");
      }
      report(`DWG/DXF · Convirtiendo y analizando ${file.name} fuera del navegador principal…`);
      const parsed = await this.parseInWorker(file, extension, recoverDwg);
    if (parsed.segments.length < 1 && parsed.points.length < 1) {
      throw new Error("No se encontraron entidades 2D compatibles en el archivo CAD.");
    }

    const unitScale = this.resolveUnitScale(parsed.insUnits, extension);
    if (extension === "dwg") {
      const suspicious = suspiciousDwgMeterScale(parsed, unitScale);
      if (suspicious) {
        const raw = suspicious.rawSpan.toLocaleString("es-CO", { maximumFractionDigits: 2 });
        const converted = suspicious.resultingSpanMm.toLocaleString("es-CO", { maximumFractionDigits: 2 });
        const accepted = window.confirm(
          `ATENCIÓN: posible error de escala DWG ×${unitScale}.\n\n`
          + `El dibujo ocupa aproximadamente ${raw} unidades de origen.\n`
          + `Con el factor elegido ocuparía ${converted} mm.\n\n`
          + "Si en AutoCAD esa longitud está en milímetros, pulsa Cancelar y vuelve a importar usando «mm» (factor ×1).\n"
          + "Pulsa Aceptar SOLO si confirmaste que el dibujo realmente está en metros.",
        );
        if (!accepted) throw new Error(
          "Importación cancelada para evitar multiplicar el DWG ×1.000. Importa otra vez y selecciona «mm» si las coordenadas ya están en milímetros.",
        );
      }
    }
    report(`DWG/DXF · Unidad origen confirmada · factor ${unitScale} hacia mm…`);
    const layerIds = new Map<string, string>();
    const referenceName = uniqueReferenceName(
      this.options.designModel,
      stripExtension(file.name),
    );
    const getLayerId = (sourceLayer: string, effectiveColor: string): string => {
      const key = sourceLayer.trim() || "0";
      const color = effectiveColor.toLowerCase();
      // BYBLOCK and explicit ACI/true-colour entities may share an original
      // layer yet differ in colour. Keep them inside the SAME imported block
      // while splitting only their visual sublayers for proper appearance.
      const cacheKey = `${key.toLowerCase()}|${color}`;
      const current = layerIds.get(cacheKey);
      if (current) return current;
      const appearance = parsed.sourceLayers.get(key.toLowerCase());
      const suffix = color === (appearance?.color ?? "#ffffff")
        ? "" : ` [${color}]`;
      const layer = this.options.designModel.layers.create({
        name: uniqueLayerName(
          this.options.designModel,
          `CAD ${referenceName} · ${key}${suffix}`,
        ),
        color,
        visible: appearance?.visible ?? true,
        locked: false,
        snapEnabled: true,
      });
      layerIds.set(cacheKey, layer.id);
      return layer.id;
    };

    // Process data in short chunks. The UI can repaint and receive pointer
    // events while lines are registered; only one GPU batch per layer is
    // assembled at the end, avoiding a draw call for every imported line.
    // 1,800 records per frame balances large-model registration throughput
    // against browser responsiveness; renderer still batches once per layer.
    const CHUNK = 1800;
    for (let i = 0; i < parsed.segments.length; i += CHUNK) {
      for (const segment of parsed.segments.slice(i, i + CHUNK)) {
        // The imported layer has just been created and validated unlocked.
        // Skip the extra layer lookup/error construction per segment.
        this.options.designModel.cadLines.register({
          layerId: getLayerId(segment.layer, segment.color),
          start: scaledPoint(segment.start, unitScale),
          end: scaledPoint(segment.end, unitScale),
        });
      }
      report(`DWG/DXF · Registrando geometría ${Math.min(i + CHUNK, parsed.segments.length).toLocaleString()} / ${parsed.segments.length.toLocaleString()} segmentos…`);
      await yieldFrame();
    }
    for (let i = 0; i < parsed.points.length; i += CHUNK) {
      for (const entry of parsed.points.slice(i, i + CHUNK)) {
        this.options.designModel.registerCadPoint({
          layerId: getLayerId(entry.layer, entry.color),
          position: scaledPoint(entry.point, unitScale),
        });
      }
      report(`DWG/DXF · Registrando ${Math.min(i + CHUNK, parsed.points.length)} / ${parsed.points.length} puntos…`);
      await yieldFrame();
    }
    // Text annotations use hidden CAD point anchors. They follow the same
    // DWG reference transform, history and project persistence as its lines.
    const annotations: CadReferenceTextAnnotation[] = [];
    for (let i = 0; i < parsed.texts.length; i += CHUNK) {
      for (const label of parsed.texts.slice(i, i + CHUNK)) {
        const layerId = getLayerId(label.layer, label.color);
        const id = crypto.randomUUID();
        const originPointId = `${CAD_TEXT_ANCHOR_PREFIX}${id}:origin`;
        const axisXPointId = `${CAD_TEXT_ANCHOR_PREFIX}${id}:x`;
        const axisYPointId = `${CAD_TEXT_ANCHOR_PREFIX}${id}:y`;
        this.options.designModel.cadPoints.register({
          id: originPointId, layerId,
          position: scaledPoint(label.position, unitScale),
        });
        this.options.designModel.cadPoints.register({
          id: axisXPointId, layerId,
          position: scaledPoint(label.axisX, unitScale),
        });
        this.options.designModel.cadPoints.register({
          id: axisYPointId, layerId,
          position: scaledPoint(label.axisY, unitScale),
        });
        annotations.push({
          id, text: label.text, kind: label.kind, layerId,
          originPointId, axisXPointId, axisYPointId,
          horizontalAlign: label.horizontalAlign,
          verticalAlign: label.verticalAlign,
        });
      }
      report(`DWG/DXF · Preparando textos ${Math.min(i + CHUNK, parsed.texts.length).toLocaleString()} / ${parsed.texts.length.toLocaleString()}…`);
      await yieldFrame();
    }
    this.options.cadTextScene?.addAnnotations(annotations);
    report("DWG/DXF · Preparando geometría agrupada para la GPU…");
    await yieldFrame();
    this.options.cadLineScene.sync();
    this.options.cadPointScene.sync();
    this.options.clearGeometryQueryCache();
    report("DWG/DXF · Actualizando referencias, SNAP y encuadre…");
    await yieldFrame();
    await this.options.onImported?.();

    const skipped = parsed.skippedEntities > 0
      ? ` · ${parsed.skippedEntities} entidades no representadas: ${[
        ...parsed.skippedTypes.entries(),
      ].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([kind, count]) => `${kind} ${count}`).join(", ")}`
      : "";
    const truncation = parsed.truncated
      ? `\nATENCIÓN: importación parcial. Se alcanzó el límite de ${MAX_RENDERED_SEGMENTS.toLocaleString()} segmentos. El importador reparte la capacidad entre los bloques para mostrar todo el plano, pero ${parsed.incompleteRootEntities} entidades aún tienen detalles sin incorporar. No utilizar este resultado como plano completo de fabricación.`
      : "";
    const xrefs = parsed.unresolvedExternalReferences.length
      ? `\nREFERENCIAS EXTERNAS (XREF) NO DISPONIBLES: ${parsed.unresolvedExternalReferences.join(", ")}. Estas geometrías no están embebidas en el DWG: importa también los archivos DWG referenciados.`
      : "";
    const missingBlocks = parsed.unresolvedBlocks.length
      ? `\nDefiniciones BLOCK ausentes: ${parsed.unresolvedBlocks.slice(0, 8).join(", ")}.`
      : "";
    window.alert(
      `Plano CAD "${referenceName}" importado como bloque de referencia.\nSe priorizaron perfiles, tubos, bloques y textos. Los sombreados HATCH se omiten; se rescata solo la geometría gráfica de DIMENSION que cabe después de la estructura.\n${parsed.segments.length} segmentos · ${parsed.points.length} puntos · ${parsed.texts.length} textos · ${parsed.expandedBlocks} INSERT/DIMENSION expandidos · ${parsed.recoveredDimensionSegments} segmentos gráficos secundarios${skipped}.${truncation}${xrefs}${missingBlocks}${parsed.importDiagnostics ?? ""}\nUnidades de origen: ${unitScale === 1 ? "1 unidad = 1 mm" : `1 unidad = ${unitScale} mm`}. Factor aplicado: ×${unitScale}.\nLos colores ByLayer/ByBlock y la escala original se conservan en las entidades compatibles.`,
    );
    } finally {
      status.remove();
      this.button.disabled = false;
      this.recoveryButton.disabled = false;
      this.importing = false;
      delete document.body.dataset["framelogicCadImporting"];
    }
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
    button.dataset["framelogicFileCommand"] = "open-cad";
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
    button.addEventListener("click", () => {
      this.recoverNextDwg = false;
      this.input.accept = ".dwg,.dxf";
      this.input.click();
    });

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

  private createRecoveryButton(container: HTMLElement): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Recuperar DWG";
    button.dataset["framelogicFileCommand"] = "recover-cad";
    button.title = "Comparar el importador normal con el lector alternativo DWG. Puede tardar más; no reconstruye XREF.";
    Object.assign(button.style, {
      padding: "5px 8px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px", background: "#304654", color: "#f3f7f9",
      cursor: "pointer", font: "12px system-ui, sans-serif",
    });
    button.addEventListener("click", () => {
      this.recoverNextDwg = true;
      this.input.accept = ".dwg";
      this.input.click();
    });
    const bar = container.querySelector<HTMLElement>('[data-framelogic-project-toolbar="true"]');
    if (bar) bar.append(button);
    else {
      button.style.position = "absolute";
      button.style.left = "130px";
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
      const recoverDwg = this.recoverNextDwg;
      this.recoverNextDwg = false;
      input.accept = ".dwg,.dxf";
      if (!file) return;
      void this.importFile(file, recoverDwg)
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

  private async parseInWorker(
    file: File,
    extension: "dwg" | "dxf",
    recoverDwg = false,
  ): Promise<ParsedCadReference> {
    if (typeof Worker === "undefined") {
      throw new Error(
        "Este navegador no admite Web Workers. Actualiza Firefox o Chrome para importar archivos DWG grandes sin bloquear la página.",
      );
    }
    const bytes = await file.arrayBuffer();
    return new Promise<ParsedCadReference>((resolve, reject) => {
      const worker = new Worker(
        new URL("./CadReferenceImportWorker.ts", import.meta.url),
        { type: "module" },
      );
      let settled = false;
      const stop = () => {
        if (settled) return false;
        settled = true;
        worker.terminate();
        return true;
      };
      worker.onmessage = (event: MessageEvent<
        { ok: true; parsed: ParsedCadReference }
        | { ok: false; error: string }
      >) => {
        if (!stop()) return;
        if (event.data.ok) resolve(event.data.parsed);
        else reject(new Error("No se pudo convertir o analizar el DWG/DXF: " + event.data.error));
      };
      worker.onerror = (error) => {
        if (!stop()) return;
        reject(new Error("Error en el procesador DWG/DXF: " + error.message));
      };
      worker.postMessage({ extension, buffer: bytes, recoverDwg }, [bytes]);
    });
  }

  private resolveUnitScale(insUnits: number, extension: "dwg" | "dxf"): number {
    return resolveCadImportUnitScale(
      extension, insUnits,
      (message, initialValue) => window.prompt(message, initialValue),
    );
  }
}

/**
 * Binary DWG -> DXF converters may not preserve the drawing's insertion-unit
 * metadata consistently. Confirm the source coordinate unit BEFORE any CAD
 * geometry or TEXT transform anchors are registered. Never silently apply an
 * inferred x1000 factor to a DWG that was authored in millimetres.
 *
 * DXF ASCII keeps the existing automatic INSUNITS behavior. DWG defaults to
 * "mm" but explicitly allows users with metre-based drawings to choose "m"
 * or "auto" (trust the converted DXF's INSUNITS metadata).
 */
export function resolveCadImportUnitScale(
  extension: "dwg" | "dxf",
  insUnits: number,
  promptForUnits: (message: string, initialValue: string) => string | null,
): number {
  const declaredScale = insUnitsToMillimeters(insUnits);
  if (extension === "dxf" && declaredScale !== null) return declaredScale;

  const description = declaredScale === null
    ? "sin unidades reconocidas"
    : `código ${insUnits} (factor automático ×${declaredScale} hacia mm)`;
  const message = extension === "dwg"
    ? `DWG convertido a DXF: ${description}.\n\nIndica la unidad REAL de las coordenadas del dibujo en AutoCAD: mm, cm, m, in o ft.\nSi AutoCAD muestra milímetros (como CUNAS_MEDIR), usa mm y NO se multiplicará por 1000.\nEscribe auto solo si deseas confiar en las unidades del DXF convertido.\nCancelar = no importar.`
    : "El plano no declara unidades. Escribe mm, cm, m, in o ft:";
  const raw = promptForUnits(message, "mm");
  if (raw === null) {
    throw new Error("Importación cancelada: no se confirmó la unidad de origen.");
  }
  const answer = raw.trim().toLowerCase();
  switch (answer) {
    case "mm": return 1;
    case "cm": return 10;
    case "m": return 1000;
    case "in":
    case "inch":
    case "inches": return 25.4;
    case "ft":
    case "feet": return 304.8;
    case "auto":
      if (declaredScale !== null) return declaredScale;
      throw new Error("El DWG/DXF no declara unidades válidas para la opción auto.");
    default:
      throw new Error(`Unidad "${answer}" no reconocida. Usa mm, cm, m, in, ft o auto.`);
  }
}

function scaledPoint(point: CadDxfPoint3, scale: number): CadDxfPoint3 {
  return { x: point.x * scale, y: point.y * scale, z: point.z * scale };
}

/** AutoCAD INSUNITS converted into FrameLogic's canonical MILLIMETRES. */
export function insUnitsToMillimeters(code: number): number | null {
  switch (code) {
    case 1: return 25.4;
    case 2: return 304.8;
    case 3: return 1609344;
    case 4: return 1;
    case 5: return 10;
    case 6: return 1000;
    case 7: return 1_000_000;
    case 8: return 0.0000254;
    case 9: return 0.0254;
    case 10: return 914.4;
    case 11: return 1e-7;
    case 12: return 1e-6;
    case 13: return 0.001;
    case 14: return 100;
    case 15: return 10000;
    case 16: return 100000;
    case 17: return 1e12;
    case 18: return 1.495978707e14;
    case 19: return 9.4607304725808e18;
    case 20: return 3.085677581491367e19;
    case 21: return 304.8006096012192;
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
