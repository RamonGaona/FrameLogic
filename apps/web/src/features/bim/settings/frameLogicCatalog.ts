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
  /** Manual catalog release. Numeric 1 is accepted only for legacy files. */
  version?: string | 1;
  /** Canonical ISO 8601 audit fields (changed only after an effective save). */
  fecha_modificacion?: string;
  usuario_modificacion?: string;
  /** Historic audit names: retained so old files can round-trip unchanged. */
  fecha?: string;
  usuario?: string;
  /** Shared base directory stored independently; never rewrites a record's relative paths. */
  ruta_base?: string;
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

export const CATALOG_INITIAL_BASE_PATH = String.raw`D:\Documents\FrameLogic`;
const CATALOG_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** App releases and JSON releases have separate version numbers. */
export function validateCatalogVersion(value: string): string {
  if (!CATALOG_SEMVER.test(value)) {
    throw new Error("La versión del JSON debe seguir MAYOR.MENOR.PARCHE, por ejemplo 1.0.0.");
  }
  return value;
}

export function displayCatalogVersion(version: FrameLogicCatalog["version"]): string {
  return typeof version === "string" ? version : "Sin versión registrada";
}

/** A UI-level guard; server-side authorization is required for shared writes. */
export function setCatalogVersion(
  catalog: FrameLogicCatalog, value: string, authorized: boolean,
): FrameLogicCatalog {
  if (!authorized) throw new Error("No hay autorización para modificar la versión del JSON.");
  return { ...catalog, version: validateCatalogVersion(value) };
}

export function blankCatalog(): FrameLogicCatalog {
  return {
    version: "1.0.0", fecha_modificacion: "", usuario_modificacion: "",
    ruta_base: CATALOG_INITIAL_BASE_PATH, registros: [],
  };
}

/** Apply audit metadata only to a successfully written copy, never to a draft. */
export function markCatalogModified(
  catalog: FrameLogicCatalog, now = new Date(), authenticatedUser = "",
): FrameLogicCatalog {
  const timestamp = now.toISOString();
  const updated: FrameLogicCatalog = {
    ...catalog, fecha_modificacion: timestamp, usuario_modificacion: authenticatedUser,
  };
  // Legacy clients may still inspect these keys. Do not introduce them in new files.
  if (catalog.fecha !== undefined) updated.fecha = timestamp;
  if (catalog.usuario !== undefined) updated.usuario = authenticatedUser;
  return updated;
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
  // Missing version and numeric 1 are legacy; neither is migrated silently.
  if (obj.version !== undefined && obj.version !== 1) {
    if (typeof obj.version !== "string") {
      throw new Error("Versión JSON no compatible.");
    }
    validateCatalogVersion(obj.version);
  }
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
  const metadata: Pick<FrameLogicCatalog,
    "fecha" | "usuario" | "fecha_modificacion" | "usuario_modificacion" | "ruta_base"> = {};
  for (const key of ["fecha", "fecha_modificacion"] as const) {
    const raw = obj[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string"
      || (raw !== "" && (!Number.isFinite(Date.parse(raw))
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(raw)))) {
      throw new Error("«" + key + "» debe ser ISO 8601 con zona horaria, o estar vacío.");
    }
    metadata[key] = raw;
  }
  for (const key of ["usuario", "usuario_modificacion"] as const) {
    const raw = obj[key];
    if (raw === undefined) continue;
    if (typeof raw !== "string" || raw.length > 256) {
      throw new Error("«" + key + "» debe ser texto.");
    }
    metadata[key] = raw;
  }
  if (obj.ruta_base !== undefined) {
    if (typeof obj.ruta_base !== "string" || obj.ruta_base.length > MAX_TEXT) {
      throw new Error("«ruta_base» debe ser texto (una ruta de carpeta).");
    }
    metadata.ruta_base = obj.ruta_base;
  }
  // Preserve absent legacy metadata and root keys; never add a version during read.
  const catalog: FrameLogicCatalog = {
    ...(obj.version === undefined ? {} : { version: obj.version as string | 1 }),
    ...metadata, registros: records,
  };
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

/**
 * Every leaf can change its JSON scalar type from the editor. This is not a
 * schema inference: the user explicitly chooses Text/Number/Boolean/Null.
 */
export type CatalogScalarType = "text" | "number" | "boolean" | "null";

export function catalogScalarType(value: CatalogValue): CatalogScalarType {
  if (value === null) return "null";
  if (typeof value === "string") return "text";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  throw new Error("Los grupos y listas se modifican desde Editar estructura JSON.");
}

/**
 * Strict locale-friendly numeric parser: accepts decimals with . or ,
 * and negative values; never turns arbitrary text or an empty string into 0.
 * An empty input represents null (missing numeric value).
 */
export function parseCatalogNumericInput(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const normalized = text.replace(",", ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
    throw new Error("Introduce un número válido, por ejemplo 125.5 o -2,75.");
  }
  const number = Number(normalized);
  if (!Number.isFinite(number)) {
    throw new Error("El número introducido está fuera del intervalo permitido.");
  }
  return number;
}

export function convertCatalogScalarValue(
  value: CatalogValue,
  target: CatalogScalarType,
): string | number | boolean | null {
  const source = catalogScalarType(value);
  if (target === source) return value as string | number | boolean | null;
  if (target === "null") return null;
  if (target === "text") return value === null ? "" : String(value);
  if (target === "number") {
    if (value === null) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "number") return value;
    if (typeof value !== "string") {
      throw new Error("Solo los valores simples pueden convertirse a número.");
    }
    return parseCatalogNumericInput(value);
  }
  if (value === null) return false;
  if (typeof value === "string") {
    if (value.trim().toLowerCase() === "true" || value.trim().toLowerCase() === "sí") return true;
    if (value.trim().toLowerCase() === "false" || value.trim().toLowerCase() === "no") return false;
    // Do not silently treat arbitrary text as a true boolean.
    throw new Error("El texto no representa un booleano. Escribe true o false antes de convertir.");
  }
  return Boolean(value);
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
 * Builds a blank universal template using ALL records from the currently
 * loaded catalog. No product values, prices, file paths or personal data are
 * copied: only the property names, nested shapes and array positions.
 *
 * When a property has contradictory types across records, an object takes
 * precedence over an array, and an array over a primitive. A single JSON
 * property cannot represent two conflicting container types at once.
 */
function blankStructure(value: CatalogValue): CatalogValue {
  if (Array.isArray(value)) return value.map(blankStructure);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) =>
      [key, blankStructure(nested)])) as { [key: string]: CatalogValue };
  }
  return typeof value === "string" ? "" : null;
}

function mergeBlankStructures(first: CatalogValue, other: CatalogValue): CatalogValue {
  if (first !== null && typeof first === "object" && !Array.isArray(first)
    && other !== null && typeof other === "object" && !Array.isArray(other)) {
    const result: Record<string, CatalogValue> = { ...first };
    for (const [key, value] of Object.entries(other)) {
      result[key] = Object.prototype.hasOwnProperty.call(result, key)
        ? mergeBlankStructures(result[key]!, value) : blankStructure(value);
    }
    return result;
  }
  if (Array.isArray(first) && Array.isArray(other)) {
    return Array.from({ length: Math.max(first.length, other.length) }, (_, index) =>
      index < first.length && index < other.length
        ? mergeBlankStructures(first[index]!, other[index]!)
        : index < first.length
          ? blankStructure(first[index]!)
          : blankStructure(other[index]!));
  }
  const rank = (value: CatalogValue): number =>
    value !== null && typeof value === "object"
      ? Array.isArray(value) ? 2 : 3
      : typeof value === "string" ? 1 : 0;
  return rank(first) >= rank(other) ? blankStructure(first) : blankStructure(other);
}

/**
 * Adds a new unique code and inherits the recursive UNION of all subdivisions
 * across the loaded JSON records, not only the currently selected one.
 */
export function makeCatalogRecordWithAllSubdivisions(
  records: readonly CatalogRecord[],
): CatalogRecord {
  const existing = new Set(records.map((record) => record.codigo.trim().toLocaleUpperCase()));
  let suffix = 1;
  let code = "";
  do {
    code = "NUEVO_" + String(suffix++).padStart(4, "0");
  } while (existing.has(code.toLocaleUpperCase()));

  let template: CatalogValue = {};
  for (const record of records) {
    const { codigo: _codigo, ...properties } = record;
    template = mergeBlankStructures(template, properties);
  }
  const fresh = { codigo: code, ...(template as Record<string, CatalogValue>) };
  return normalizeCatalogRecord(fresh);
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
