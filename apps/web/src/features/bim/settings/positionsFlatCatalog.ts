import {
  type PositionDefinition, type PositionsFile,
  parsePositionsFile, POSITIONS_FILE_NAME, POSITIONS_HANDLE_KEY,
  POSITIONS_LOCAL_PATH, POSITIONS_STORAGE_KEY, MAX_POSITIONS_BYTES,
} from "./positionsCatalog";

export { POSITIONS_FILE_NAME, POSITIONS_HANDLE_KEY, POSITIONS_LOCAL_PATH,
  POSITIONS_STORAGE_KEY, MAX_POSITIONS_BYTES };

export interface PositionItem {
  /** Single numeric slot or inclusive range: "31-49". */
  posicion: number | string;
  /** Foreign key to future DBFrameLogic.json registros[].codigo. */
  codigo: string;
  /** Free-text customer-specific family names, never predefined. */
  familias: string[];
}
export interface FlatPositionsFile {
  schemaVersion: 2;
  version?: string;
  fecha_modificacion?: string;
  usuario_modificacion?: string;
  items: PositionItem[];
}
export type PositionsDocument =
  | { kind: "flat"; file: FlatPositionsFile; originalText: string }
  | { kind: "legacy"; file: PositionsFile; originalText: string };

const LIMIT = 1_000_000;
const safe = (n: number) => Number.isSafeInteger(n) && n >= 0 && n <= LIMIT;
export function readPositionRange(value: PositionItem["posicion"]): { from: number; to: number } {
  if (typeof value === "number" && safe(value)) return { from: value, to: value };
  if (typeof value !== "string") throw new Error("La posición debe ser un entero o rango como 31-49.");
  const match = /^(\d+)(?:\s*[-–—]\s*(\d+))?$/.exec(value.trim());
  if (!match) throw new Error("Posición inválida. Ejemplos: 90 o 31-49.");
  const from = Number(match[1]);
  const to = match[2] === undefined ? from : Number(match[2]);
  if (!safe(from) || !safe(to) || from > to) throw new Error("Rango de posición fuera de límites.");
  return { from, to };
}
export function formatPositionRange(from: number, to: number): number | string {
  if (!safe(from) || !safe(to) || from > to) throw new Error("Rango fuera de límites.");
  return from === to ? from : from + "-" + to;
}
export function freeFamilies(raw: string): string[] {
  const values = raw.split(/[,;\n]/).map(v => v.trim()).filter(Boolean);
  const seen = new Set<string>();
  return values.filter(name => {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export function validateFlatPositionsFile(value: unknown): FlatPositionsFile {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("El documento debe ser un objeto JSON.");
  const obj = value as Record<string, unknown>;
  if (obj.schemaVersion !== 2 || !Array.isArray(obj.items)) {
    throw new Error("Se requiere schemaVersion: 2 y un arreglo items.");
  }
  if (obj.items.length > 40_000) throw new Error("Máximo de 40.000 piezas.");
  for (const [i,item] of obj.items.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("Fila " + (i+1) + ": debe ser un objeto.");
    const row = item as unknown as Record<string, unknown>;
    if (Object.keys(row).some(key => !["posicion","codigo","familias"].includes(key))) {
      throw new Error("Fila " + (i+1) + ": cada pieza solo tiene posición, código y familias.");
    }
    readPositionRange(row.posicion as PositionItem["posicion"]);
    if (typeof row.codigo !== "string" || !row.codigo.trim() || row.codigo.length > 256)
      throw new Error("Fila " + (i+1) + ": código obligatorio.");
    if (!Array.isArray(row.familias) || row.familias.some(f => typeof f !== "string"
      || !f.trim() || f.length > 256)) {
      throw new Error("Fila " + (i+1) + ": familias debe ser un arreglo de nombres libres.");
    }
    if (new Set((row.familias as string[]).map(f=>f.trim().toLocaleLowerCase())).size
      !== row.familias.length) throw new Error("Fila " + (i+1) + ": familias repetidas.");
  }
  if (obj.version !== undefined &&
    (typeof obj.version !== "string" || !/^\d+\.\d+\.\d+$/.test(obj.version)))
    throw new Error("La versión debe tener formato MAYOR.MENOR.PARCHE.");
  for (const key of ["fecha_modificacion","usuario_modificacion"] as const) {
    if (obj[key] !== undefined && typeof obj[key] !== "string")
      throw new Error(key + " debe ser texto.");
  }
  return value as unknown as FlatPositionsFile;
}
export function readPositionsDocument(text: string): PositionsDocument {
  if (new TextEncoder().encode(text).byteLength > MAX_POSITIONS_BYTES)
    throw new Error("POSITIONS.json supera 10 MB.");
  let value: unknown;
  try { value = JSON.parse(text); } catch {
    throw new Error("El archivo no contiene JSON válido.");
  }
  if (value && typeof value === "object" && (value as {schemaVersion?:unknown}).schemaVersion === 1)
    return { kind: "legacy", file: parsePositionsFile(text), originalText: text };
  return { kind: "flat", file: validateFlatPositionsFile(value), originalText: text };
}
export function serializeFlatPositionsFile(file: FlatPositionsFile): string {
  validateFlatPositionsFile(file);
  const text = JSON.stringify(file, null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > MAX_POSITIONS_BYTES)
    throw new Error("El documento modificado supera 10 MB.");
  return text;
}
export function newFlatPositionsFile(): FlatPositionsFile {
  return { schemaVersion: 2, version: "1.0.0",
    fecha_modificacion: "", usuario_modificacion: "", items: [] };
}
export function markFlatPositionsModified(file: FlatPositionsFile, date = new Date()): FlatPositionsFile {
  return { ...file, fecha_modificacion: date.toISOString(),
    usuario_modificacion: file.usuario_modificacion ?? "" };
}
export function cloneFlat(file: FlatPositionsFile): FlatPositionsFile {
  return { ...file, items: file.items.map(item => ({ ...item, familias: [...item.familias] })) };
}
export function overlapIndices(file: FlatPositionsFile, index: number): number[] {
  const row = file.items[index];
  if (!row) return [];
  const a = readPositionRange(row.posicion);
  return file.items.flatMap((other,i) => {
    if (i === index) return [];
    const b = readPositionRange(other.posicion);
    return a.from <= b.to && b.from <= a.to ? [i] : [];
  });
}
/** A single code can appear at multiple positions. Shared slots are warnings, not errors. */
export function insertFlatItem(file: FlatPositionsFile, item: PositionItem,
  atIndex = file.items.length): FlatPositionsFile {
  const next = cloneFlat(file);
  next.items.splice(atIndex, 0, { ...item, familias: [...item.familias] });
  return validateFlatPositionsFile(next);
}
export function updateFlatItem(file: FlatPositionsFile, index: number,
  changes: Partial<PositionItem>): FlatPositionsFile {
  const next = cloneFlat(file);
  if (!next.items[index]) throw new Error("Fila inexistente.");
  next.items[index] = { ...next.items[index], ...changes };
  return validateFlatPositionsFile(next);
}
function remapPiece(item: PositionItem, from: number, to: number): PositionItem {
  return { ...item, posicion: formatPositionRange(from,to), familias: [...item.familias] };
}
/** Insert one GLOBAL slot; split crossing intervals, shift all families equally. */
export function insertGlobalSlotFlat(file: FlatPositionsFile, slot: number,
  item: Omit<PositionItem,"posicion">): FlatPositionsFile {
  if (!safe(slot) || slot === LIMIT) throw new Error("Posición de inserción inválida.");
  const next = cloneFlat(file);
  next.items = next.items.flatMap(row => {
    const {from,to} = readPositionRange(row.posicion);
    if (to < slot) return [row];
    if (to === LIMIT) throw new Error("La inserción excede el límite de posiciones.");
    if (from >= slot) return [remapPiece(row,from+1,to+1)];
    return [remapPiece(row,from,slot-1),remapPiece(row,slot+1,to+1)];
  });
  next.items.push({ posicion:slot, codigo:item.codigo, familias:[...item.familias] });
  return validateFlatPositionsFile(next);
}
/** Relocate one contiguous global block, splitting affected ranges without losing memberships. */
export function moveGlobalRangeFlat(file: FlatPositionsFile, source: number,
  end: number, target: number): FlatPositionsFile {
  if (![source,end,target].every(safe) || source > end) throw new Error("Movimiento inválido.");
  const length = end-source+1;
  if (target+length-1>LIMIT) throw new Error("Movimiento fuera del límite.");
  if (target===source) return cloneFlat(file);
  const map=(n:number):number=>{
    if(n>=source && n<=end) return n+target-source;
    if(target<source && n>=target && n<source) return n+length;
    if(target>source && n>end && n<target+length) return n-length;
    return n;
  };
  const boundary=[source,end+1,target,target+length];
  const next=cloneFlat(file);
  next.items=next.items.flatMap(item=>{
    const {from,to}=readPositionRange(item.posicion);
    const segments=[...new Set([from,to+1,...boundary.filter(n=>n>from&&n<=to)])].sort((a,b)=>a-b);
    const result:PositionItem[]=[];
    for(let i=0;i<segments.length-1;i++){
      const a=map(segments[i]!),b=map(segments[i+1]!-1);
      result.push(remapPiece(item,Math.min(a,b),Math.max(a,b)));
    }
    return result;
  });
  return validateFlatPositionsFile(next);
}
export function closeGlobalSlotFlat(file: FlatPositionsFile, index: number): FlatPositionsFile {
  const row=file.items[index];
  if(!row)throw new Error("Fila inexistente.");
  const {from,to}=readPositionRange(row.posicion);
  if(from!==to)throw new Error("Solo se pueden cerrar posiciones individuales.");
  const next=cloneFlat(file);
  next.items.splice(index,1);
  if(next.items.some(other=>{
    const r=readPositionRange(other.posicion);
    return r.from<=from&&r.to>=from;
  }))throw new Error("La posición todavía está compartida por otra pieza.");
  next.items=next.items.map(item=>{
    const r=readPositionRange(item.posicion);
    return r.from>from ? remapPiece(item,r.from-1,r.to-1) : item;
  });
  return validateFlatPositionsFile(next);
}
/** Duplicate selected item at the end of the global numbering without changing its families. */
export function duplicateFlatItem(file: FlatPositionsFile,index:number):FlatPositionsFile {
  const original=file.items[index];
  if(!original)throw new Error("Selecciona una fila para duplicar.");
  const {from,to}=readPositionRange(original.posicion);
  const last=Math.max(-1,...file.items.map(row=>readPositionRange(row.posicion).to));
  const target=last+1;
  if(target+to-from>LIMIT)throw new Error("No hay espacio para duplicar ese rango.");
  return insertFlatItem(file,{posicion:formatPositionRange(target,target+to-from),
    codigo:original.codigo,familias:[...original.familias]},index+1);
}
/** Split an inclusive range into two rows, keeping code and all chosen families. */
export function splitFlatRange(file:FlatPositionsFile,index:number,point:number):FlatPositionsFile {
  const original=file.items[index];
  if(!original)throw new Error("Fila inexistente.");
  const {from,to}=readPositionRange(original.posicion);
  if(!safe(point)||point<=from||point>to)
    throw new Error("La división debe estar dentro del rango, después de su inicio.");
  const next=cloneFlat(file);
  next.items.splice(index,1,remapPiece(original,from,point-1),remapPiece(original,point,to));
  return validateFlatPositionsFile(next);
}
/** Merge only adjacent ranges with identical code and family membership. */
export function combineFlatRanges(file:FlatPositionsFile,index:number):FlatPositionsFile {
  const original=file.items[index];
  if(!original)throw new Error("Fila inexistente.");
  const a=readPositionRange(original.posicion);
  const eq=(row:PositionItem)=>
    row.codigo===original.codigo && JSON.stringify([...row.familias].sort())===
      JSON.stringify([...original.familias].sort());
  const otherIndex=file.items.findIndex((row,i)=>{
    if(i===index||!eq(row))return false;
    const b=readPositionRange(row.posicion);
    return a.to+1===b.from || b.to+1===a.from;
  });
  if(otherIndex<0)throw new Error("No hay intervalo contiguo con código y familias idénticos.");
  const other=file.items[otherIndex]!;
  const b=readPositionRange(other.posicion);
  const next=cloneFlat(file);
  const remove=[index,otherIndex].sort((x,y)=>y-x);
  for(const n of remove)next.items.splice(n,1);
  next.items.push(remapPiece(original,Math.min(a.from,b.from),Math.max(a.to,b.to)));
  return validateFlatPositionsFile(next);
}
/**
 * One-time explicit migration. Original v1 remains untouched until user
 * downloads a backup and explicitly confirms conversion to v2.
 * Deliberately loses v1 component attributes; those belong in future DB.
 * Merge the same code/range across different families into one row.
 */
export function migrateLegacyPositions(legacy: PositionsFile): FlatPositionsFile {
  const rows=new Map<string,PositionItem>();
  for(const family of legacy.families){
    for(const pos of family.positions){
      for(const component of pos.components){
        if(!component.code.trim())continue;
        const key=JSON.stringify([pos.from,pos.to,component.code.trim()]);
        let item=rows.get(key);
        if(!item){
          item={posicion:formatPositionRange(pos.from,pos.to),
            codigo:component.code.trim(),familias:[]};
          rows.set(key,item);
        }
        if(!item.familias.some(f=>f.toLocaleLowerCase()===family.family.toLocaleLowerCase()))
          item.familias.push(family.family);
      }
    }
  }
  return validateFlatPositionsFile({
    ...newFlatPositionsFile(),
    version: typeof legacy.version==="string"?legacy.version:"1.0.0",
    items:[...rows.values()].sort((a,b)=>readPositionRange(a.posicion).from-readPositionRange(b.posicion).from),
  });
}
