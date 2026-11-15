/**
 * JSON-based catalog for FrameLogic: explicit, versioned, user-editable data.
 *
 * The password verifier is a local *UI editing gate*, NOT server-side
 * authorization. Anyone with filesystem/repository write permission can
 * bypass it. A future shared write API must authenticate server-side.
 */
export interface CatalogRecord {
  codigo: string;
  nombre: string;
  familia: string;
  ruta: string;
  peso: number | null;
  longitud: number | null;
  tarifa: number | null;
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
export const CATALOG_SOURCE_STORAGE_KEY = "framelogic.catalog.source.v1";
export const MAX_CATALOG_BYTES = 5_000_000;
const MAX_RECORDS = 10_000;
const MAX_STRING = 2048;
const ITERATIONS = 210_000;

export const EMPTY_CATALOG_RECORD: CatalogRecord = {
  codigo: "", nombre: "", familia: "", ruta: "",
  peso: null, longitud: null, tarifa: null,
};

export function blankCatalog(): FrameLogicCatalog {
  return { version: 1, registros: [] };
}

function asText(value: unknown, field: string, index: number): string {
  if (typeof value !== "string") throw new Error(
    "Registro " + (index + 1) + ": «" + field + "» debe ser texto.",
  );
  const text = value.trim();
  if (text.length > MAX_STRING) throw new Error(
    "Registro " + (index + 1) + ": «" + field + "» supera " + MAX_STRING + " caracteres.",
  );
  return text;
}

function asNumber(value: unknown, field: string, index: number): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(
      "Registro " + (index + 1) + ": «" + field + "» debe ser un número positivo o null.",
    );
  }
  return value;
}

export function normalizeCatalogRecord(value: unknown, index = 0): CatalogRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("El registro " + (index + 1) + " debe ser un objeto.");
  }
  const r = value as Record<string, unknown>;
  const codigo = asText(r.codigo, "codigo", index);
  if (!codigo) throw new Error("Registro " + (index + 1) + ": el código es obligatorio.");
  return {
    codigo,
    nombre: asText(r.nombre, "nombre", index),
    familia: asText(r.familia, "familia", index),
    ruta: asText(r.ruta, "ruta", index),
    peso: asNumber(r.peso, "peso", index),
    longitud: asNumber(r.longitud, "longitud", index),
    tarifa: asNumber(r.tarifa, "tarifa", index),
  };
}

export function normalizeFrameLogicCatalog(value: unknown): FrameLogicCatalog {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("El JSON debe contener un objeto con «version» y «registros».");
  }
  const obj = value as Record<string, unknown>;
  if (obj.version !== 1) throw new Error("Versión JSON no compatible. Se requiere version: 1.");
  if (!Array.isArray(obj.registros)) {
    throw new Error("El JSON debe contener una matriz «registros».");
  }
  if (obj.registros.length > MAX_RECORDS) {
    throw new Error("El catálogo supera el límite de " + MAX_RECORDS + " registros.");
  }
  const records = obj.registros.map((record, index) => normalizeCatalogRecord(record, index));
  const codes = new Set<string>();
  for (const record of records) {
    const key = record.codigo.toUpperCase();
    if (codes.has(key)) throw new Error("Código duplicado: " + record.codigo);
    codes.add(key);
  }
  const result: FrameLogicCatalog = { version: 1, registros: records };
  if (obj.admin !== undefined) {
    const auth = obj.admin;
    if (!auth || typeof auth !== "object" || Array.isArray(auth)) {
      throw new Error("Bloque «admin» inválido.");
    }
    const a = auth as Record<string, unknown>;
    if (a.algorithm !== "PBKDF2-SHA256"
      || !Number.isInteger(a.iterations)
      || (a.iterations as number) < 100_000
      || (a.iterations as number) > 1_000_000
      || typeof a.salt !== "string" || !/^[A-Za-z0-9+/]{20,}={0,2}$/.test(a.salt)
      || typeof a.verifier !== "string" || !/^[A-Za-z0-9+/]{40,}={0,2}$/.test(a.verifier)
    ) {
      throw new Error("Credenciales «admin» inválidas; no es posible habilitar la edición.");
    }
    result.admin = {
      algorithm: "PBKDF2-SHA256",
      iterations: a.iterations as number,
      salt: a.salt,
      verifier: a.verifier,
    };
  }
  return result;
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
  return JSON.stringify(normalizeFrameLogicCatalog(catalog), null, 2) + "\n";
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
