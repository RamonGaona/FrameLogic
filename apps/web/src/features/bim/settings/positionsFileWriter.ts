import {
  requestCatalogWritePermission, type CatalogFileHandle,
} from "./catalogFileHandleStore";

/** Local-only, optimistic-concurrency write; never modifies other JSON files. */
export async function writeAuthorizedPositionsFile(
  handle: CatalogFileHandle,
  json: string,
  expectedText: string | null,
  isAuthorized: () => boolean,
): Promise<void> {
  const check = () => {
    if (!isAuthorized()) throw new Error("La autorización de edición ha caducado.");
  };
  check();
  if (!await requestCatalogWritePermission(handle)) {
    throw new Error("No se concedió permiso para escribir POSITIONS.json.");
  }
  check();
  if (expectedText !== null) {
    const actual = await (await handle.getFile()).text();
    check();
    if (actual !== expectedText) {
      throw new Error("POSITIONS.json cambió fuera de FrameLogic. Vuelve a cargarlo antes de guardar.");
    }
  }
  check();
  const writer = await handle.createWritable();
  try {
    check();
    await writer.write(json);
    check();
    await writer.close();
  } catch (error) {
    try { await writer.abort?.(); } catch { /* File may already be closed */ }
    throw error;
  }
}
