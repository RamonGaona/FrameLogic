/**
 * Universal FrameLogic catalog. Only "codigo" is mandatory for each record;
 * unknown properties, nested objects, arrays, scalars and null are preserved.
 * This JSON is local-first, not a server-authenticated data store.
 */
export type CatalogValue =
  | string | number | boolean | null
  | CatalogValue[] | { [key: string]: CatalogValue };

export interface CatalogRecord {
  codigo: string;
  [key: string]: CatalogValue;
}

export interface CatalogPasswordVerifier {
  algorithm: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  verifier: string;
}

export interface FrameLogicCatalog {
  version: 1;
  registros: CatalogRecord[];
  admin?: CatalogPasswordVerifier;
}

export const CATALOG_DEFAULT_URL = "/data/framelogic-catalog.json";
export const CATALOG_LOCAL_FILE_PATH = String.raw`D:\Documents\FrameLogic\DB\DBFrameLogic.json`;
export const CATALOG_LOCAL_FILE_NAME = "DBFrameLogic.json";
export const CATALOG_SOURCE_STORAGE_KEY = "framelogic.catalog.source.v1";
export const MAX_CATALOG_BYTES = 5_000_000;
const MAX_RECORDS = 10_000;
const MAX_DEPTH = 24;
const MAX_NODES = 60_000;
const MAX_TEXT = 32_768;
const ITERATIONS = 210_000;

export const EMPTY_CATALOG_RECORD: CatalogRecord = { codigo: "" };

export function blankCatalog(): FrameLogicCatalog {
  return { version: 1, registros: [] };
}

/** Reject unsupported runtime values rather than silently discarding fields. */
function cloneCatalogValue(value: unknown, depth: number, budget: { remaining: number }): CatalogValue {
  if (--budget.remaining < 0) throw new Error("El JSON tiene demasiados elementos.");
  if (depth > MAX_DEPTH) throw new Error("Demasiados niveles de subdivisiones en el JSON.");
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > MAX_TEXT) throw new Error("Un texto supera la longitud admitida.");
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    return value.map((item) => cloneCatalogValue(item, depth + 1, budget));
  }
  if (typeof value === "object" && value) {
    const object: { [key: string]: CatalogValue } = {};
    for (const [key, child] of Object.entries(value)) {
      if (!key || key.length > 256 || ["__proto__", "prototype", "constructor"].includes(key)) {
        throw new Error("Nombre de propiedad JSON no permitido: " + key);
      }
      object[key] = cloneCatalogValue(child, depth + 1, budget);
    }
    return object;
  }
  throw new Error("La base de datos contiene un valor que no es JSON.");
}

/** A record may have any fields, including arbitrarily named nested divisions. */
export function normalizeCatalogRecord(value: unknown, index = 0): CatalogRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Registro " + (index + 1) + ": debe ser un objeto JSON.");
  }
  const obj = cloneCatalogValue(value, 0, { remaining: MAX_NODES }) as Record<string, CatalogValue>;
  if (typeof obj.codigo !== "string" || obj.codigo.trim() === "") {
    throw new Error("Registro " + (index + 1) + ": «codigo» es obligatorio.");
  }
  if (obj.codigo.length > 256) throw new Error("El código supera 256 caracteres.");
  return { ...obj, codigo: obj.codigo.trim() };
}

export function normalizeFrameLogicCatalog(value: unknown): FrameLogicCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("El JSON debe contener un objeto con «version» y «registros».");
  }
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) throw new Error("Versión JSON no compatible. Se requiere version: 1.");
  if (!Array.isArray(obj.registros)) throw new Error("El JSON debe incluir una matriz «registros».");
  if (obj.registros.length > MAX_RECORDS) {
    throw new Error("El catálogo supera el límite de " + MAX_RECORDS + " registros.");
  }
  const records = obj.registros.map((r, i) => normalizeCatalogRecord(r, i));
  const codes = new Set<string>();
  for (const record of records) {
    const key = record.codigo.toLocaleUpperCase();
    if (codes.has(key)) throw new Error("Código duplicado: " + record.codigo);
    codes.add(key);
  }
  const catalog: FrameLogicCatalog = { version: 1, registros: records };
  // Keep legacy verifier metadata for backward compatibility; the global
  // editor lock is still temporary and never authorizes server writes.
  if (obj.admin !== undefined) {
    const a = obj.admin as Record<string, unknown> | null;
    if (!a || typeof a !== "object" || Array.isArray(a)
      || a.algorithm !== "PBKDF2-SHA256"
      || !Number.isInteger(a.iterations)
      || (a.iterations as number) < 100_000
      || (a.iterations as number) > 1_000_000
      || typeof a.salt !== "string" || !/^[A-Za-z0-9+/]{20,}={0,2}$/.test(a.salt)
      || typeof a.verifier !== "string" || !/^[A-Za-z0-9+/]{40,}={0,2}$/.test(a.verifier)
    ) throw new Error("Credenciales «admin» no válidas.");
    catalog.admin = {
      algorithm: "PBKDF2-SHA256", iterations: a.iterations as number,
      salt: a.salt, verifier: a.verifier,
    };
  }
  return catalog;
}

export function parseFrameLogicCatalog(json: string): FrameLogicCatalog {
  if (new TextEncoder().encode(json).byteLength > MAX_CATALOG_BYTES) {
    throw new Error("El archivo JSON excede 5 MB.");
  }
  let data: unknown;
  try { data = JSON.parse(json); }
  catch { throw new Error("El archivo seleccionado no contiene JSON válido."); }
  return normalizeFrameLogicCatalog(data);
}

export function serializeFrameLogicCatalog(catalog: FrameLogicCatalog): string {
  const text = JSON.stringify(normalizeFrameLogicCatalog(catalog), null, 2) + "\n";
  if (new TextEncoder().encode(text).byteLength > MAX_CATALOG_BYTES) {
    throw new Error("El JSON editado excede 5 MB.");
  }
  return text;
}

export type CatalogPath = readonly (string | number)[];
export interface CatalogFieldRow {
  path: CatalogPath;
  label: string;
  depth: number;
  kind: "object" | "array" | "value";
  value: CatalogValue;
}

/** One row per subdivision or leaf, regardless of its name or nesting. */
export function catalogFieldRows(record: CatalogRecord): CatalogFieldRow[] {
  const rows: CatalogFieldRow[] = [];
  const walk = (value: CatalogValue, path: (string | number)[], depth: number) => {
    const label = path.length ? String(path[path.length - 1]) : "Raíz";
    const kind = Array.isArray(value) ? "array"
      : value !== null && typeof value === "object" ? "object" : "value";
    rows.push({ path, label, depth, kind, value });
    if (kind === "array") {
      (value as CatalogValue[]).forEach((child, index) =>
        walk(child, [...path, index], depth + 1));
    } else if (kind === "object") {
      Object.entries(value as Record<string, CatalogValue>).forEach(([key, child]) =>
        walk(child, [...path, key], depth + 1));
    }
  };
  walk(record.codigo, ["codigo"], 0);
  for (const [key, value] of Object.entries(record)) {
    if (key !== "codigo") walk(value, [key], 0);
  }
  return rows;
}

/** Immutable update of a primitive, preserving adjacent nested values. */
export function updateCatalogField(
  record: CatalogRecord, path: CatalogPath, value: CatalogValue,
): CatalogRecord {
  if (!path.length) throw new Error("Selecciona un campo para editar.");
  const update = (node: CatalogValue, i: number): CatalogValue => {
    if (i === path.length) return value;
    const segment = path[i]!;
    if (Array.isArray(node) && typeof segment === "number"
      && segment >= 0 && segment < node.length) {
      const next = [...node];
      next[segment] = update(node[segment]!, i + 1);
      return next;
    }
    if (node !== null && typeof node === "object" && !Array.isArray(node)
      && typeof segment === "string" && Object.prototype.hasOwnProperty.call(node, segment)) {
      return { ...node, [segment]: update(node[segment]!, i + 1) };
    }
    throw new Error("Ruta de propiedad inexistente: " + path.join("."));
  };
  return update(record, 0) as CatalogRecord;
}

/**
 * Builds a new code from the UNION of subdivisions found in every existing
 * record, rather than copying the values of a single record.
 *
 * Empty strings remain editable as text; numerical, boolean and null leaves
 * start at null so no weight, cost, dimension or approval is invented.
 * Objects and arrays preserve all nested property paths and list positions.
 */
function emptyCatalogTemplate(value: CatalogValue): CatalogValue {
  if (Array.isArray(value)) return value.map(emptyCatalogTemplate);
  if (value !== null && typeof value === "object") {
    const result: Record<string, CatalogValue> = {};
    for (const [key, child] of Object.entries(value)) {
      result[key] = emptyCatalogTemplate(child);
    }
    return result;
  }
  return typeof value === "string" ? "" : null;
}

function isCatalogObject(value: CatalogValue): value is Record<string, CatalogValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Combine compatible paths without destroying nested fields from either code. */
function mergeCatalogTemplate(
  current: CatalogValue, incoming: CatalogValue, path: string,
): CatalogValue {
  if (Array.isArray(current) && Array.isArray(incoming)) {
    return Array.from({ length: Math.max(current.length, incoming.length) }, (_, index) => {
      if (index >= current.length) return incoming[index]!;
      if (index >= incoming.length) return current[index]!;
      return mergeCatalogTemplate(current[index]!, incoming[index]!, path + "[" + index + "]");
    });
  }
  if (isCatalogObject(current) && isCatalogObject(incoming)) {
    const result: Record<string, CatalogValue> = { ...current };
    for (const [key, value] of Object.entries(incoming)) {
      result[key] = Object.prototype.hasOwnProperty.call(result, key)
        ? mergeCatalogTemplate(result[key]!, value, path + "." + key)
        : value;
    }
    return result;
  }
  // A subdivision must not silently lose fields if two records disagree
  // about whether the very same path is an object or an array.
  if ((Array.isArray(current) && isCatalogObject(incoming))
    || (isCatalogObject(current) && Array.isArray(incoming))) {
    throw new Error("Subdivisión incompatible (objeto/lista) en «" + path
      + "». Revisa los códigos existentes antes de crear la pieza.");
  }
  // Prefer structured paths over a scalar so no nested subdivision is lost.
  if (Array.isArray(current) || isCatalogObject(current)) return current;
  if (Array.isArray(incoming) || isCatalogObject(incoming)) return incoming;
  return typeof current === "string" || typeof incoming === "string" ? "" : null;
}

/** Only the new codigo is mandatory; all other fields are an empty union. */
export function createCatalogRecordFromExisting(
  records: readonly CatalogRecord[], code: string,
): CatalogRecord {
  const normalizedCode = code.trim();
  if (!normalizedCode) throw new Error("Escribe el código de la nueva pieza.");
  if (normalizedCode.length > 256) throw new Error("El código supera 256 caracteres.");
  if (records.some((record) => record.codigo.toLocaleUpperCase()
    === normalizedCode.toLocaleUpperCase())) {
    throw new Error("Código duplicado: " + normalizedCode);
  }
  const template: Record<string, CatalogValue> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (key === "codigo") continue;
      const empty = emptyCatalogTemplate(value);
      template[key] = Object.prototype.hasOwnProperty.call(template, key)
        ? mergeCatalogTemplate(template[key]!, empty, key) : empty;
    }
  }
  return normalizeCatalogRecord({ codigo: normalizedCode, ...template });
}

/** User-entered raw JSON can introduce any new subdivision, no fixed fields. */
export function parseCatalogRecordEditor(text: string): CatalogRecord {
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw new Error("El contenido de la ficha no es JSON válido."); }
  return normalizeCatalogRecord(value);
}

function toBase64(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result);
}

function fromBase64(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
}

async function passwordBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256",
  }, key, 256);
  return new Uint8Array(bits);
}

/** No default password or secret is embedded in the app or localStorage. */
export async function createCatalogPasswordVerifier(
  password: string,
): Promise<CatalogPasswordVerifier> {
  if (password.length < 12) throw new Error("La contraseña debe contener al menos 12 caracteres.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const verifier = await passwordBits(password, salt, ITERATIONS);
  return {
    algorithm: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: toBase64(salt),
    verifier: toBase64(verifier),
  };
}

export async function verifyCatalogPassword(
  password: string,
  auth: CatalogPasswordVerifier,
): Promise<boolean> {
  try {
    const expected = fromBase64(auth.verifier);
    const actual = await passwordBits(password, fromBase64(auth.salt), auth.iterations);
    if (expected.length !== actual.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) mismatch |= expected[i]! ^ actual[i]!;
    return mismatch === 0;
  } catch {
    return false;
  }
}

/** Browser file:// URLs cannot be read as local paths from a public web app. */
export function resolveCatalogUrl(input: string, base: string): string {
  const value = input.trim();
  if (!value) throw new Error("Indica una ruta o URL de un archivo JSON.");
  let url: URL;
  try { url = new URL(value, base); }
  catch { throw new Error("La ruta o URL del JSON no es válida."); }
  const isDevLocalhost = (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.protocol !== "https:" && !(isDevLocalhost && url.protocol === "http:")) {
    throw new Error("Usa una URL HTTPS; para archivos de tu equipo utiliza «Seleccionar JSON».");
  }
  if (!url.pathname.toLowerCase().endsWith(".json")) {
    throw new Error("La ruta debe apuntar a un archivo .json.");
  }
  if (url.username || url.password) throw new Error("No incluyas credenciales en la URL.");
  return url.toString();
}
