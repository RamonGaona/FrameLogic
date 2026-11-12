import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";
import { parseCadDxf, type CadDxfPoint3 } from "./CadDxfGeometryParser";

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

    const parsed = parseCadDxf(text);
    if (parsed.segments.length < 1 && parsed.points.length < 1) {
      throw new Error("No se encontraron entidades 2D compatibles en el archivo CAD.");
    }

    const unitScale = this.resolveUnitScale(parsed.insUnits);
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

    for (const segment of parsed.segments) {
      this.options.designModel.registerCadLine({
        layerId: getLayerId(segment.layer, segment.color),
        start: scaledPoint(segment.start, unitScale),
        end: scaledPoint(segment.end, unitScale),
      });
    }

    for (const entry of parsed.points) {
      this.options.designModel.registerCadPoint({
        layerId: getLayerId(entry.layer, entry.color),
        position: scaledPoint(entry.point, unitScale),
      });
    }

    this.options.cadLineScene.sync();
    this.options.cadPointScene.sync();
    this.options.clearGeometryQueryCache();
    await this.options.onImported?.();

    const skipped = parsed.skippedEntities > 0
      ? ` · ${parsed.skippedEntities} entidades no representadas: ${[
        ...parsed.skippedTypes.entries(),
      ].sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([kind, count]) => `${kind} ${count}`).join(", ")}`
      : "";
    window.alert(
      `Plano CAD "${referenceName}" importado como bloque de referencia.\n${parsed.segments.length} segmentos · ${parsed.points.length} puntos · ${parsed.expandedBlocks} INSERT/DIMENSION expandidos${skipped}.\nLos colores ByLayer/ByBlock y la escala original se conservan en los elementos compatibles.`,
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
    // dwgdxf dynamically imports its WASM glue from <wasmBase>/dwgdxf.js.
    // Vite does not bundle this runtime-computed import automatically, so
    // predev/prebuild publish both glue and binary under /assets/wasm.
    const wasmBase = new URL("/assets/wasm/", window.location.origin).href;
    try {
      await module.init({ wasmBase });
    } catch (error) {
      throw new Error(
        "No se pudo cargar el convertidor DWG local de FrameLogic. "
        + "Comprueba la conexión y recarga la página (Ctrl+F5). "
        + `Recurso: ${wasmBase}dwgdxf.js. `
        + (error instanceof Error ? error.message : String(error)),
      );
    }
    const converted = await module.convertDwgToDxf(
      new Uint8Array(await file.arrayBuffer()),
    );
    return new TextDecoder().decode(converted);
  }

  private resolveUnitScale(insUnits: number): number {
    const known = insUnitsToMillimeters(insUnits);
    if (known !== null) return known;

    const answer = window.prompt(
      "El plano no declara unidades. Escribe mm, cm, m, in o ft:",
      "mm",
    )?.trim().toLowerCase();
    if (answer === null || answer === undefined) {
      throw new Error("Importación cancelada: faltan las unidades del plano.");
    }
    switch (answer) {
      case "mm": return 1;
      case "cm": return 10;
      case "m": return 1000;
      case "in":
      case "inch":
      case "inches": return 25.4;
      case "ft":
      case "feet": return 304.8;
      default:
        throw new Error(`Unidad "${answer}" no reconocida.`);
    }
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
