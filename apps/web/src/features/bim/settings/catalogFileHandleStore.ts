/**
 * Persists the browser's File System Access handle, NOT file contents,
 * in origin-scoped IndexedDB. Read access is rechecked at every visit.
 *
 * A remembered path in localStorage is only display text; a file handle
 * may be used only when the browser has granted permission.
 */
export type CatalogFilePermission = "granted" | "prompt" | "denied";

export interface CatalogWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

export interface CatalogFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<CatalogWritable>;
  queryPermission?: (options: { mode: "read" | "readwrite" }) => Promise<CatalogFilePermission>;
  requestPermission?: (options: { mode: "read" | "readwrite" }) => Promise<CatalogFilePermission>;
}

export interface RememberedCatalogFile {
  readonly route: string;
  readonly handle: CatalogFileHandle;
}

export const CATALOG_FILE_HANDLE_DB = "framelogic.catalog.file-handle.v1";
export const CATALOG_FILE_HANDLE_STORE = "handles";
export const CATALOG_FILE_HANDLE_KEY = "selected-json";

function openCatalogHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB no está disponible en este navegador."));
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(CATALOG_FILE_HANDLE_DB, 1);
    } catch (error) {
      reject(error);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CATALOG_FILE_HANDLE_STORE)) {
        db.createObjectStore(CATALOG_FILE_HANDLE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se puede abrir IndexedDB."));
    request.onblocked = () => reject(new Error("La base de archivos recordados está bloqueada."));
  });
}

async function operate<T>(
  access: "readonly" | "readwrite",
  requestFactory: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openCatalogHandleDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      let tx: IDBTransaction;
      try { tx = db.transaction(CATALOG_FILE_HANDLE_STORE, access); }
      catch (error) { reject(error); return; }
      const request = requestFactory(tx.objectStore(CATALOG_FILE_HANDLE_STORE));
      let value: T;
      request.onsuccess = () => { value = request.result; };
      request.onerror = () => reject(request.error ?? new Error("No se puede acceder al archivo recordado."));
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error ?? new Error("Falló el almacenamiento del archivo."));
      tx.onabort = () => reject(tx.error ?? new Error("Se canceló el almacenamiento del archivo."));
    });
  } finally {
    db.close();
  }
}

export async function storeCatalogFileHandle(
  route: string, handle: CatalogFileHandle,
): Promise<boolean> {
  try {
    await operate<IDBValidKey>("readwrite", (store) =>
      store.put({ route, handle } satisfies RememberedCatalogFile, CATALOG_FILE_HANDLE_KEY));
    return true;
  } catch {
    // IndexedDB may be disabled, or the handle cannot be structured-cloned.
    return false;
  }
}

export async function restoreCatalogFileHandle(route: string): Promise<CatalogFileHandle | null> {
  try {
    const saved = await operate<RememberedCatalogFile | undefined>("readonly", (store) =>
      store.get(CATALOG_FILE_HANDLE_KEY));
    // Never open a remembered handle when the user selected a different route.
    if (!saved || saved.route !== route || !isCatalogFileHandle(saved.handle)) return null;
    return saved.handle;
  } catch {
    return null;
  }
}

export async function forgetCatalogFileHandle(): Promise<void> {
  try {
    await operate<undefined>("readwrite", (store) => store.delete(CATALOG_FILE_HANDLE_KEY));
  } catch {
    // Clear failures never block the active user's ability to choose a file.
  }
}

export function isCatalogFileHandle(value: unknown): value is CatalogFileHandle {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CatalogFileHandle>;
  return typeof candidate.name === "string"
    && typeof candidate.getFile === "function"
    && typeof candidate.createWritable === "function";
}

/**
 * Never request permission on page load: browsers require an explicit
 * user gesture. Some implementations may lack queryPermission but still
 * permit getFile(); the caller can try a silent read and handle failure.
 */
export async function queryCatalogReadPermission(
  handle: CatalogFileHandle,
): Promise<CatalogFilePermission> {
  if (!handle.queryPermission) return "prompt";
  try { return await handle.queryPermission({ mode: "read" }); }
  catch { return "prompt"; }
}

/** Call ONLY from a direct "Autorizar acceso" button interaction. */
export async function requestCatalogReadPermission(
  handle: CatalogFileHandle,
): Promise<boolean> {
  if (!handle.requestPermission) return false;
  try {
    return await handle.requestPermission({ mode: "read" }) === "granted";
  } catch {
    return false;
  }
}

/** For explicit save only, never on automatic read. */
export async function requestCatalogWritePermission(
  handle: CatalogFileHandle,
): Promise<boolean> {
  if (!handle.requestPermission) return true; // createWritable still enforces browser policy.
  try {
    return await handle.requestPermission({ mode: "readwrite" }) === "granted";
  } catch {
    return false;
  }
}
