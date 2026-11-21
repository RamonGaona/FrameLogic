import type { CadLine } from "@framelogic/domain";
import type { PrecisionBimCoreInstance } from "@framelogic/bim-core";
import { OcctStepGeometryAdapter } from "./step/OcctStepGeometryAdapter";
import { detectPieceLongAxis } from "./linePieceGeometryOrientation";
import type { LineFillPlan, LineFillSegment } from "./linePositionFillPlanner";

/**
 * Temporary, self-contained STEP example. These files are shipped with the
 * application, not read from POSITIONS.json, DBFrameLogic.json or FLPIECE.
 * The order is fixed for the demo and repeats as long as full pieces fit.
 */
export const REPOSITORY_STEP_EXAMPLES = [
  { code: "REC1500", fileName: "REC1500.stp", url: "/examples/step/REC1500.stp" },
  { code: "REC3000", fileName: "REC3000.stp", url: "/examples/step/REC3000.stp" },
  { code: "REC6000", fileName: "REC6000.stp", url: "/examples/step/REC6000.stp" },
] as const;

export const REPOSITORY_STEP_DEMO_TAG = "REPOSITORY_STEP_DEMO";
export type DemoStepLength = { readonly code: string; readonly lengthMm: number };
const normalize = (value: string): string => value.trim().toUpperCase();

/**
 * Register only the missing definitions, without inserting a piece at the
 * origin. The STEP import retains original source bytes for .flproject.
 * Actual mesh extents, not numbers guessed from the file names, determine
 * the physical length in FrameLogic's millimetre Model Space.
 */
export async function ensureRepositoryStepDemoDefinitions(
  core: PrecisionBimCoreInstance,
  progress?: (message: string) => void,
): Promise<{ lengths: DemoStepLength[]; imported: number; reused: number }> {
  const lengths: DemoStepLength[] = [];
  let imported = 0;
  let reused = 0;
  const adapter = new OcctStepGeometryAdapter();

  for (const asset of REPOSITORY_STEP_EXAMPLES) {
    let definition = core.designModel.pieceDefinitions.getAll()
      .find((candidate) => normalize(candidate.code) === asset.code);

    // Never replace a user's actual part or silently reuse a similarly
    // named but different asset as one of the three repository examples.
    if (definition && !definition.tags.includes(REPOSITORY_STEP_DEMO_TAG)) {
      throw new Error(
        "El código " + asset.code + " ya pertenece a otra pieza del proyecto. "
        + "Usa un proyecto vacío para esta demostración.",
      );
    }

    if (!definition) {
      progress?.("Descargando ejemplo STEP " + asset.fileName + "…");
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(
          "No se pudo descargar " + asset.fileName
          + " (HTTP " + response.status + "). Comprueba el despliegue.",
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.byteLength || bytes.byteLength > 30 * 1024 * 1024) {
        throw new Error("Archivo STEP vacío o demasiado grande: " + asset.fileName);
      }
      progress?.("Leyendo geometría STEP " + asset.fileName + "…");
      const document = await adapter.load(bytes, {
        sourceFileName: asset.fileName,
        targetUnit: "millimeter",
        includeExactFeatures: true,
      });
      definition = core.importStepPiece(document, {
        code: asset.code,
        name: asset.code + " · Ejemplo",
        tags: [REPOSITORY_STEP_DEMO_TAG],
      }).definition;
      imported++;
    } else {
      reused++;
    }

    const prototype = core.designScene.getAssetPrototype(definition.geometryAssetId);
    if (!prototype) {
      throw new Error("La definición " + asset.code + " no tiene geometría 3D disponible.");
    }
    const axis = detectPieceLongAxis(
      prototype, definition.coordinateSystem, definition.referenceGeometry,
    );
    if (!Number.isFinite(axis.physicalLengthMm) || axis.physicalLengthMm <= 0) {
      throw new Error("Longitud 3D no válida en " + asset.fileName);
    }
    lengths.push({ code: asset.code, lengthMm: axis.physicalLengthMm });
  }
  return { lengths, imported, reused };
}

/** Fill the selected line in the fixed order REC1500→REC3000→REC6000. */
export function planRepositoryStepDemoFill(
  line: Pick<CadLine, "start" | "end">,
  sequence: readonly DemoStepLength[],
  maxInstances = 250,
): LineFillPlan {
  if (!sequence.length || sequence.some((item) =>
    !item.code.trim() || !Number.isFinite(item.lengthMm) || item.lengthMm <= 0)) {
    throw new Error("Las piezas de demostración no tienen longitudes válidas.");
  }
  if (!Number.isInteger(maxInstances) || maxInstances < 1 || maxInstances > 2000) {
    throw new Error("Límite de inserciones no válido.");
  }

  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const dz = line.end.z - line.start.z;
  const lineLengthMm = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(lineLengthMm) || lineLengthMm <= 1e-6) {
    throw new Error("Selecciona una línea CAD con longitud mayor a cero.");
  }

  const segments: LineFillSegment[] = [];
  let occupiedMm = 0;
  let index = 0;
  while (segments.length < maxInstances) {
    const item = sequence[index % sequence.length]!;
    if (occupiedMm + item.lengthMm > lineLengthMm + 1e-6) break;
    const fraction = occupiedMm / lineLengthMm;
    segments.push({
      code: item.code,
      position: index + 1,
      lengthMm: item.lengthMm,
      offsetMm: occupiedMm,
      start: {
        x: line.start.x + dx * fraction,
        y: line.start.y + dy * fraction,
        z: line.start.z + dz * fraction,
      },
    });
    occupiedMm += item.lengthMm;
    index++;
  }
  if (segments.length === 0) {
    throw new Error(
      "La primera pieza (" + sequence[0]!.code + ") mide "
      + sequence[0]!.lengthMm.toFixed(1) + " mm y no cabe en la línea.",
    );
  }
  const next = sequence[index % sequence.length]!;
  return {
    segments,
    lineLengthMm,
    occupiedMm,
    remainingMm: Math.max(0, lineLengthMm - occupiedMm),
    capped: segments.length === maxInstances
      && occupiedMm + next.lengthMm <= lineLengthMm + 1e-6,
  };
}
