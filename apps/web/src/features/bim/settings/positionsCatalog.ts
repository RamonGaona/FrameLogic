/**
 * POSITIONS.json schemaVersion 1, verified against FrameLogic's original
 * families/from/to/components catalog. All operations stay in this file;
 * DECISIONS and RULES_CATALOG are deliberately out of scope.
 */
export const POSITIONS_FILE_NAME = "POSITIONS.json";
export const POSITIONS_LOCAL_PATH = String.raw`D:\Documents\FrameLogic\DB\POSITIONS.json`;
export const POSITIONS_STORAGE_KEY = "framelogic.positions.route.v1";
export const POSITIONS_HANDLE_KEY = "positions-json";
export const MAX_POSITIONS_BYTES = 10_000_000;
const MAX_SLOT = 1_000_000;

export interface PositionComponent {
  priority: number;
  code: string;
  name: string;
  lengthMm: number | null;
  openingMinMm: number | null;
  openingMaxMm: number | null;
  angleMinDeg: number | null;
  angleMaxDeg: number | null;
  notes: string | null;
  active?: boolean;
  [key: string]: unknown;
}

export interface PositionDefinition {
  from: number;
  to: number;
  components: PositionComponent[];
  [key: string]: unknown;
}
export interface PositionFamily {
  family: string;
  positions: PositionDefinition[];
  [key: string]: unknown;
}
export interface PositionsFile {
  schemaVersion: 1;
  families: PositionFamily[];
  version?: string;
  fecha_modificacion?: string;
  usuario_modificacion?: string;
  [key: string]: unknown;
}
export interface PositionRef { familyIndex: number; rowIndex: number }

export function newPositionsFile(): PositionsFile {
  return { schemaVersion: 1, version: "1.0.0",
    fecha_modificacion: "", usuario_modificacion: "", families: [] };
}
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
function intSlot(v: unknown, label: string): asserts v is number {
  if (!Number.isSafeInteger(v) || (v as number) < 0 || (v as number) > MAX_SLOT) {
    throw new Error(label + " debe ser entero entre 0 y " + MAX_SLOT + ".");
  }
}
function nullableNumber(v: unknown, label: string) {
  if (v !== null && (typeof v !== "number" || !Number.isFinite(v))) {
    throw new Error(label + " debe ser número o null.");
  }
}
export function normalizePositionsFile(value: unknown): PositionsFile {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.families)) {
    throw new Error("Se requiere POSITIONS.json con schemaVersion: 1 y families[].");
  }
  if (value.families.length > 200) throw new Error("Demasiadas familias.");
  const names = new Set<string>();
  let rows = 0;
  for (const f of value.families) {
    if (!object(f) || typeof f.family !== "string" || !f.family.trim()
      || !Array.isArray(f.positions)) throw new Error("Familia o lista de posiciones inválida.");
    if (names.has(f.family.toLowerCase())) throw new Error("Familia duplicada: " + f.family);
    names.add(f.family.toLowerCase());
    for (const p of f.positions) {
      rows++;
      if (rows > 40_000 || !object(p) || !Array.isArray(p.components)) {
        throw new Error("Se excedió el límite de posiciones o hay una posición inválida.");
      }
      intSlot(p.from, "from");
      intSlot(p.to, "to");
      if (p.from > p.to) throw new Error("El inicio del rango supera su final.");
      if (p.components.length > 500) throw new Error("Demasiados componentes en una posición.");
      for (const c of p.components) {
        if (!object(c) || typeof c.code !== "string" || typeof c.name !== "string"
          || c.code.length > 512 || c.name.length > 1024
          || !Number.isSafeInteger(c.priority) || (c.priority as number) < 0) {
          throw new Error("Código, nombre o prioridad de componente inválidos.");
        }
        for (const key of ["lengthMm", "openingMinMm", "openingMaxMm",
          "angleMinDeg", "angleMaxDeg"] as const) {
          if (c[key] === undefined) continue; // tolerate older components
          nullableNumber(c[key], key);
        }
        if (c.notes !== undefined && c.notes !== null && typeof c.notes !== "string") {
          throw new Error("notes debe ser texto o null.");
        }
        if (c.active !== undefined && typeof c.active !== "boolean") {
          throw new Error("active debe ser booleano.");
        }
      }
    }
  }
  if (value.version !== undefined &&
    (typeof value.version !== "string" || !/^\d+\.\d+\.\d+$/.test(value.version))) {
    throw new Error("Versión del archivo: usa MAYOR.MENOR.PARCHE.");
  }
  for (const key of ["fecha_modificacion", "usuario_modificacion"]) {
    if (value[key] !== undefined && typeof value[key] !== "string") {
      throw new Error(key + " debe ser texto.");
    }
  }
  return value as unknown as PositionsFile;
}

export function parsePositionsFile(text: string): PositionsFile {
  if (new TextEncoder().encode(text).byteLength > MAX_POSITIONS_BYTES) {
    throw new Error("POSITIONS.json supera 10 MB.");
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error("POSITIONS.json no contiene JSON válido."); }
  return normalizePositionsFile(value);
}
export function serializePositionsFile(file: PositionsFile): string {
  normalizePositionsFile(file);
  const text = JSON.stringify(file, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > MAX_POSITIONS_BYTES) {
    throw new Error("El JSON editado supera 10 MB.");
  }
  return text;
}
export function markPositionsModified(file: PositionsFile, date = new Date()): PositionsFile {
  return { ...file, fecha_modificacion: date.toISOString(),
    usuario_modificacion: file.usuario_modificacion ?? "" };
}
function clone(file: PositionsFile): PositionsFile {
  return JSON.parse(JSON.stringify(file)) as PositionsFile;
}
export function positionLabel(p: PositionDefinition): string {
  return p.from === p.to ? String(p.from) : p.from + "–" + p.to;
}
export function positionRows(file: PositionsFile) {
  return file.families.flatMap((family, familyIndex) =>
    family.positions.map((position, rowIndex) =>
      ({ family: family.family, familyIndex, rowIndex, position })));
}
export function usageAt(file: PositionsFile, slot: number) {
  const matches = positionRows(file).filter(({ position }) =>
    position.from <= slot && slot <= position.to);
  const families = [...new Set(matches.map((row) => row.family))];
  const components = matches.flatMap((row) => row.position.components);
  const duplicates = new Set(components.map((c) => c.code)).size !== components.length;
  return { families, definitions: matches.length, components: components.length,
    shared: matches.length > 1 || components.length > 1,
    overlap: matches.length > 1, duplicates };
}
export function createComponent(): PositionComponent {
  return { priority: 1, code: "", name: "", lengthMm: null,
    openingMinMm: null, openingMaxMm: null, angleMinDeg: null,
    angleMaxDeg: null, notes: null };
}
export function addPositionDefinition(file: PositionsFile, family: string, slot: number): PositionsFile {
  intSlot(slot, "Posición");
  if (!family.trim()) throw new Error("Selecciona una familia.");
  const next = clone(file);
  let target = next.families.find((f) => f.family === family);
  if (!target) {
    target = { family, positions: [] };
    next.families.push(target);
  }
  if (target.positions.some((p) => p.from <= slot && slot <= p.to)) {
    throw new Error("La familia ya utiliza esa posición. Edita la definición existente.");
  }
  target.positions.push({ from: slot, to: slot, components: [] });
  target.positions.sort((a,b) => a.from - b.from || a.to - b.to);
  return normalizePositionsFile(next);
}
function mapDefinition(p: PositionDefinition, from: number, to: number): PositionDefinition {
  return { ...p, from, to, components: p.components.map((c) => ({ ...c })) };
}
export function insertPositionSlot(file: PositionsFile, family: string, slot: number,
  inherit = false): PositionsFile {
  intSlot(slot, "Posición");
  if (slot === MAX_SLOT) throw new Error("No se puede desplazar más allá del límite.");
  const next = clone(file);
  for (const f of next.families) {
    f.positions = f.positions.flatMap((p) => {
      if (p.to < slot) return [p];
      if (p.from >= slot) {
        if (p.to === MAX_SLOT) throw new Error("Desplazamiento fuera del límite.");
        return [mapDefinition(p, p.from + 1, p.to + 1)];
      }
      if (p.to === MAX_SLOT) throw new Error("Desplazamiento fuera del límite.");
      if (inherit) return [mapDefinition(p, p.from, p.to + 1)];
      return [mapDefinition(p, p.from, slot - 1),
        mapDefinition(p, slot + 1, p.to + 1)];
    });
  }
  normalizePositionsFile(next);
  // If inheritance was requested for this family, the inherited range already
  // occupies the slot. Do not create a conflicting empty definition over it.
  if (inherit && next.families.find((f) => f.family === family)?.positions.some(
    (p) => p.from <= slot && slot <= p.to)) return next;
  return addPositionDefinition(next, family, slot);
}

/** Permute one GLOBAL numeric slot, including every family and overlapping range. */
export function movePositionSlot(file: PositionsFile, source: number, target: number): PositionsFile {
  intSlot(source, "Origen");
  intSlot(target, "Destino");
  if (source === target) return clone(file);
  const next = clone(file);
  const map = (n: number): number => {
    if (n === source) return target;
    if (source > target && n >= target && n < source) return n + 1;
    if (source < target && n > source && n <= target) return n - 1;
    return n;
  };
  const breaks = [source, source + 1, target, target + 1];
  for (const family of next.families) {
    const mapped = family.positions.flatMap((p) => {
      const points = [...new Set([p.from, p.to + 1,
        ...breaks.filter((v) => v > p.from && v <= p.to)])].sort((a,b) => a-b);
      const parts: PositionDefinition[] = [];
      for (let i = 0; i < points.length - 1; i++) {
        const a = map(points[i]!);
        const b = map(points[i+1]! - 1);
        parts.push(mapDefinition(p, Math.min(a,b), Math.max(a,b)));
      }
      return parts;
    }).sort((a,b) => a.from-b.from || a.to-b.to);
    // Merge only adjacent pieces of the exact same original definition.
    family.positions = [];
    for (const p of mapped) {
      const prev = family.positions[family.positions.length - 1];
      const payload = ({ from: _f, to: _t, ...data }: PositionDefinition) => JSON.stringify(data);
      if (prev && prev.to + 1 === p.from && payload(prev) === payload(p)) prev.to = p.to;
      else family.positions.push(p);
    }
  }
  return normalizePositionsFile(next);
}
/** Deletion without renumber removes only the requested family definition. */
export function removePositionDefinition(file: PositionsFile, ref: PositionRef,
  closeSpace = false): PositionsFile {
  const next = clone(file);
  const f = next.families[ref.familyIndex];
  const removed = f?.positions[ref.rowIndex];
  if (!f || !removed) throw new Error("Selecciona una posición válida.");
  if (closeSpace && removed.from !== removed.to) {
    throw new Error("Para cerrar un espacio selecciona una posición individual, no un rango.");
  }
  f.positions.splice(ref.rowIndex, 1);
  if (!closeSpace) return normalizePositionsFile(next);
  const slot = removed.from;
  if (next.families.some((family) => family.positions.some((p) =>
    p.from <= slot && slot <= p.to))) {
    throw new Error("La posición sigue compartida por otras definiciones; no se puede cerrar el espacio sin borrarlas.");
  }
  for (const family of next.families) {
    family.positions = family.positions.flatMap((p) => {
      if (p.to < slot) return [p];
      if (p.from > slot) return [mapDefinition(p, p.from - 1, p.to - 1)];
      // Unreachable with the shared-slot guard above.
      return [p];
    });
  }
  return normalizePositionsFile(next);
}
export function updatePositionDefinition(file: PositionsFile, ref: PositionRef,
  patch: Partial<PositionDefinition>): PositionsFile {
  const next = clone(file);
  const current = next.families[ref.familyIndex]?.positions[ref.rowIndex];
  if (!current) throw new Error("La posición ya no existe.");
  const changed = { ...current, ...patch };
  next.families[ref.familyIndex]!.positions[ref.rowIndex] = changed;
  return normalizePositionsFile(next);
}
export function firstFreePosition(file: PositionsFile): number {
  let slot = 0;
  for (const p of positionRows(file).map((r) => r.position).sort((a,b) => a.from-b.from)) {
    if (p.from > slot) break;
    if (p.to >= slot) slot = p.to + 1;
  }
  if (slot > MAX_SLOT) throw new Error("No hay posiciones libres.");
  return slot;
}
export function previewPositionOperation(before: PositionsFile, after: PositionsFile): string {
  const a = positionRows(before).map((row) => row.family + ": " + positionLabel(row.position));
  const b = positionRows(after).map((row) => row.family + ": " + positionLabel(row.position));
  const omitted = a.filter((s) => !b.includes(s)).slice(0, 10);
  const added = b.filter((s) => !a.includes(s)).slice(0, 10);
  return "Definiciones: " + a.length + " → " + b.length
    + "\nAntes (afectadas): " + (omitted.join(", ") || "ninguna")
    + "\nDespués (afectadas): " + (added.join(", ") || "ninguna")
    + "\nEl cambio afecta solo POSITIONS.json, no actualiza reglas externas.";
}
