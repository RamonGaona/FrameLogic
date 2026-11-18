import type { CadLine } from "@framelogic/domain";
import type { FrameLogicCatalog, CatalogValue } from "./settings/frameLogicCatalog";
import {
  readPositionRange, positionActivation,
  type FlatPositionsFile, type PositionActivationKey,
} from "./settings/positionsFlatCatalog";

export interface LineFillSegment {
  readonly code: string;
  readonly position: number | string;
  readonly lengthMm: number;
  readonly offsetMm: number;
  readonly start: { x: number; y: number; z: number };
}
export interface LineFillPlan {
  readonly segments: readonly LineFillSegment[];
  readonly lineLengthMm: number;
  readonly occupiedMm: number;
  readonly remainingMm: number;
  readonly capped: boolean;
}
const normalizeCode = (value: string): string => value.trim().toLocaleUpperCase();
const normalizeField = (value: string): string =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
const lengthKeys = new Set(["longitud", "longitudmm", "lengthmm", "largo", "largomm", "length"]);

function numericMillimeters(value: CatalogValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== "string") return null;
  // Millimetres are the canonical unit of Model Space. No guessed m↔mm conversion.
  const match = /^\s*(\d+(?:\.\d+)?)\s*(?:mm)?\s*$/i.exec(value);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/** Read the universal DB field even when clients put longitud in a nested subdivision. */
export function recordLengthMm(record: { [key: string]: CatalogValue }): number | null {
  const matches: number[] = [];
  const visit = (node: CatalogValue, depth = 0): void => {
    if (depth > 12 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child, depth + 1);
      return;
    }
    for (const [name, value] of Object.entries(node)) {
      if (lengthKeys.has(normalizeField(name))) {
        const numeric = numericMillimeters(value);
        if (numeric !== null) matches.push(numeric);
      }
      if (typeof value === "object") visit(value, depth + 1);
    }
  };
  visit(record);
  const distinct = [...new Set(matches)];
  if (distinct.length > 1) {
    throw new Error("El código " + String(record.codigo ?? "") +
      " tiene varias longitudes diferentes en DBFrameLogic.json.");
  }
  return distinct[0] ?? null;
}

export function planLinePositionFill(
  line: Pick<CadLine, "start" | "end">,
  positions: FlatPositionsFile,
  catalog: FrameLogicCatalog,
  activation: PositionActivationKey = "activo_general",
  maxInstances = 250,
): LineFillPlan {
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const dz = line.end.z - line.start.z;
  const lineLengthMm = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(lineLengthMm) || lineLengthMm <= 1e-6) {
    throw new Error("Selecciona una línea CAD con longitud mayor a cero.");
  }
  if (!Number.isInteger(maxInstances) || maxInstances < 1 || maxInstances > 2000) {
    throw new Error("Límite de inserciones no válido.");
  }
  const records = new Map<string, (typeof catalog.registros)[number]>();
  for (const record of catalog.registros) {
    const code = normalizeCode(record.codigo);
    if (records.has(code)) throw new Error("Código duplicado en DBFrameLogic.json: " + code);
    records.set(code, record);
  }
  const ordered = positions.items.map((item, index) => ({
    item, index, position: readPositionRange(item.posicion).from,
  })).filter(({item}) => positionActivation(item, activation))
    .sort((a, b) => a.position - b.position || a.index - b.index);
  if (!ordered.length) throw new Error("POSITIONS.json no contiene ítems activos para ese ámbito.");

  const sequence = ordered.map(({item}) => {
    const record = records.get(normalizeCode(item.codigo));
    if (!record) throw new Error("No existe el código " + item.codigo + " en DBFrameLogic.json.");
    const lengthMm = recordLengthMm(record);
    if (lengthMm === null) {
      throw new Error("El código " + item.codigo +
        " no tiene longitud válida en mm dentro de DBFrameLogic.json.");
    }
    return {item, lengthMm};
  });
  const result: LineFillSegment[] = [];
  let occupiedMm = 0;
  let index = 0;
  // Repeat the ordered sequence until the next item does not fit.
  // Do not cut a piece, skip a position, or overrun the chosen CAD line.
  while (result.length < maxInstances) {
    const current = sequence[index % sequence.length]!;
    if (occupiedMm + current.lengthMm > lineLengthMm + 1e-6) break;
    const fraction = occupiedMm / lineLengthMm;
    result.push({
      code: current.item.codigo, position: current.item.posicion,
      lengthMm: current.lengthMm, offsetMm: occupiedMm,
      start: {
        x: line.start.x + dx * fraction,
        y: line.start.y + dy * fraction,
        z: line.start.z + dz * fraction,
      },
    });
    occupiedMm += current.lengthMm;
    index++;
  }
  if (result.length === 0) {
    throw new Error("La primera pieza (" + sequence[0]!.item.codigo +
      ") mide " + sequence[0]!.lengthMm + " mm y no cabe en la línea de " +
      Math.round(lineLengthMm) + " mm.");
  }
  const capped = result.length === maxInstances
    && occupiedMm + sequence[index % sequence.length]!.lengthMm <= lineLengthMm + 1e-6;
  return {
    segments: result, lineLengthMm, occupiedMm,
    remainingMm: Math.max(0, lineLengthMm - occupiedMm), capped,
  };
}
