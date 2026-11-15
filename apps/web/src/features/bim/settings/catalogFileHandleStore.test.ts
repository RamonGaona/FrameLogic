import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CATALOG_FILE_HANDLE_DB,
  CATALOG_FILE_HANDLE_STORE,
  CATALOG_FILE_HANDLE_KEY,
  forgetCatalogFileHandle,
  queryCatalogReadPermission,
  requestCatalogReadPermission,
  requestCatalogWritePermission,
  restoreCatalogFileHandle,
  storeCatalogFileHandle,
  type CatalogFileHandle,
} from "./catalogFileHandleStore";

const readFileHandle = (overrides: Partial<CatalogFileHandle> = {}): CatalogFileHandle => ({
  name: "DBFrameLogic.json",
  getFile: async () => ({ name: "DBFrameLogic.json" }) as File,
  createWritable: async () => ({ write: async () => {}, close: async () => {} }),
  ...overrides,
});

function mockIndexedDb() {
  const saved = new Map<string, unknown>();
  const names = {
    contains: (name: string) => name === CATALOG_FILE_HANDLE_STORE,
  };
  const db = {
    objectStoreNames: names,
    createObjectStore: () => {},
    close: vi.fn(),
    transaction: (_name: string, _mode: string) => {
      const tx: Record<string, unknown> = { oncomplete: null, onerror: null, onabort: null };
      const request = (operation: () => unknown) => {
        const req: Record<string, unknown> = {
          result: undefined, onsuccess: null, onerror: null,
        };
        queueMicrotask(() => {
          req.result = operation();
          (req.onsuccess as (() => void) | null)?.();
          (tx.oncomplete as (() => void) | null)?.();
        });
        return req;
      };
      tx.objectStore = () => ({
        get: (key: string) => request(() => saved.get(key)),
        put: (value: unknown, key: string) => request(() => {
          saved.set(key, value); return key;
        }),
        delete: (key: string) => request(() => {
          saved.delete(key); return undefined;
        }),
      });
      return tx;
    },
  };
  const open = vi.fn((_name: string, _version: number) => {
    const req: Record<string, unknown> = {
      result: db, onsuccess: null, onupgradeneeded: null, onerror: null,
    };
    queueMicrotask(() => (req.onsuccess as (() => void) | null)?.());
    return req;
  });
  vi.stubGlobal("indexedDB", { open });
  return { saved, open, db };
}

afterEach(() => vi.unstubAllGlobals());

describe("remembering a File System Access JSON handle", () => {
  it("persists the selected file handle without its JSON or passwords", async () => {
    const fake = mockIndexedDb();
    const handle = readFileHandle();
    const route = String.raw`D:\Documents\FrameLogic\DB\DBFrameLogic.json`;
    expect(await storeCatalogFileHandle(route, handle)).toBe(true);
    expect(fake.open).toHaveBeenCalledWith(CATALOG_FILE_HANDLE_DB, 1);
    expect(fake.saved.get(CATALOG_FILE_HANDLE_KEY)).toEqual({ route, handle });
    expect(await restoreCatalogFileHandle(route)).toBe(handle);
    expect(await restoreCatalogFileHandle("D:\\other\\file.json")).toBeNull();
    await forgetCatalogFileHandle();
    expect(await restoreCatalogFileHandle(route)).toBeNull();
  });

  it("degrades safely if IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const handle = readFileHandle();
    expect(await storeCatalogFileHandle("local", handle)).toBe(false);
    expect(await restoreCatalogFileHandle("local")).toBeNull();
    await expect(forgetCatalogFileHandle()).resolves.toBeUndefined();
  });

  it("queries permission silently but never requests it on its own", async () => {
    const queryPermission = vi.fn(async () => "prompt" as const);
    const requestPermission = vi.fn(async () => "granted" as const);
    const handle = readFileHandle({ queryPermission, requestPermission });
    expect(await queryCatalogReadPermission(handle)).toBe("prompt");
    expect(queryPermission).toHaveBeenCalledWith({ mode: "read" });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(await requestCatalogReadPermission(handle)).toBe(true);
    expect(requestPermission).toHaveBeenCalledWith({ mode: "read" });
  });

  it("never requests write permission for an automatic read", async () => {
    const requestPermission = vi.fn(async (args: { mode: string }) =>
      args.mode === "readwrite" ? "denied" as const : "granted" as const);
    const handle = readFileHandle({ requestPermission });
    expect(await requestCatalogReadPermission(handle)).toBe(true);
    expect(await requestCatalogWritePermission(handle)).toBe(false);
    expect(requestPermission).toHaveBeenNthCalledWith(1, { mode: "read" });
    expect(requestPermission).toHaveBeenNthCalledWith(2, { mode: "readwrite" });
  });

  it("falls back to selecting the file if permissions API is unavailable", async () => {
    const handle = readFileHandle();
    expect(await queryCatalogReadPermission(handle)).toBe("prompt");
    expect(await requestCatalogReadPermission(handle)).toBe(false);
  });
});
