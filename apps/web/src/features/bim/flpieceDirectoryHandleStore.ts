/**
 * Browser-authorized FLPIECE directory. The native folder path cannot be read
 * from a text field. Only a user-picked File System Access handle is retained.
 * Stored values are handles, never STEP/IFC bytes or plaintext file contents.
 */
export interface FLPieceFileHandle {
  readonly kind: "file";
  readonly name: string;
  getFile(): Promise<File>;
}
export interface FLPieceDirectoryHandle {
  readonly kind: "directory";
  readonly name: string;
  entries(): AsyncIterableIterator<[string, FLPieceFileHandle | FLPieceDirectoryHandle]>;
  queryPermission?: (options: {mode: "read"}) => Promise<PermissionState>;
  requestPermission?: (options: {mode: "read"}) => Promise<PermissionState>;
}
const DB_NAME = "framelogic.flpiece.directory.v1";
const STORE = "handles";
const KEY = "chosen-flpiece-folder";

function withStore<T>(
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Este navegador no permite recordar carpetas."));
      return;
    }
    const open = indexedDB.open(DB_NAME, 1);
    open.onerror = () => reject(open.error ?? new Error("Error abriendo IndexedDB."));
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
    };
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const op = request(tx.objectStore(STORE));
      let answer: T;
      op.onsuccess = () => { answer = op.result; };
      op.onerror = () => reject(op.error);
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.oncomplete = () => { db.close(); resolve(answer); };
    };
  });
}
export async function rememberFLPieceDirectory(directory: FLPieceDirectoryHandle): Promise<boolean> {
  try {
    await withStore("readwrite", store => store.put(directory, KEY));
    return true;
  } catch { return false; }
}
export async function restoreFLPieceDirectory(): Promise<FLPieceDirectoryHandle | null> {
  try {
    const saved = await withStore<unknown>("readonly", store => store.get(KEY));
    if (saved && typeof saved === "object") {
      const value = saved as Partial<FLPieceDirectoryHandle>;
      if (value.kind === "directory" && typeof value.entries === "function") {
        return value as FLPieceDirectoryHandle;
      }
    }
  } catch { /* permissions or storage may be revoked */ }
  return null;
}
export async function canReadFLPieceDirectory(directory: FLPieceDirectoryHandle): Promise<boolean> {
  try { return await directory.queryPermission?.({mode:"read"}) === "granted"; }
  catch { return false; }
}
/** Only call from an explicit click, never on mount. */
export async function authorizeFLPieceDirectory(directory: FLPieceDirectoryHandle): Promise<boolean> {
  try {
    return directory.requestPermission
      ? (await directory.requestPermission({mode:"read"})) === "granted"
      : false;
  } catch { return false; }
}
const normalize = (value: string) => value.trim().toLocaleUpperCase();
/**
 * Directory entries are enumerated, not guessed, so capitalization differences
 * and non-ASCII filenames are handled; directories and unrelated files ignored.
 */
export async function indexFLPieceDirectory(
  directory: FLPieceDirectoryHandle,
): Promise<Map<string, FLPieceFileHandle>> {
  const indexed = new Map<string, FLPieceFileHandle>();
  for await (const [name, entry] of directory.entries()) {
    if (entry.kind !== "file" || !name.toLowerCase().endsWith(".flpiece")) continue;
    const code = normalize(name.slice(0, -".flpiece".length));
    if (indexed.has(code)) throw new Error("Hay dos archivos .flpiece para el mismo código: " + code);
    indexed.set(code, entry);
  }
  return indexed;
}
export function indexChosenFLPieceFiles(files: readonly File[]): Map<string, File> {
  const indexed = new Map<string, File>();
  for (const file of files) {
    if (!file.name.toLowerCase().endsWith(".flpiece")) continue;
    const code = normalize(file.name.slice(0, -".flpiece".length));
    if (indexed.has(code)) throw new Error("Archivo FLPIECE duplicado para el código " + code);
    indexed.set(code, file);
  }
  return indexed;
}
