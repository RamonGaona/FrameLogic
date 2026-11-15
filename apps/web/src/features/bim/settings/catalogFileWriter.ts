import {
  requestCatalogWritePermission,
  type CatalogFileHandle,
} from "./catalogFileHandleStore";

/**
 * Local write with an explicit browser permission, optimistic concurrency
 * check and revalidation of the UI editor lock at each asynchronous boundary.
 *
 * NOTE: This is NOT backend authorization. Browser file permissions and local
 * access remain under the user's own control.
 */
export async function writeAuthorizedCatalogFile(
  handle: CatalogFileHandle,
  json: string,
  expectedText: string | null,
  isAuthorized: () => boolean,
): Promise<void> {
  const assertAuthorized = () => {
    if (!isAuthorized()) throw new Error("La autorización de edición ha caducado.");
  };

  assertAuthorized();
  if (!await requestCatalogWritePermission(handle)) {
    throw new Error("No se concedió permiso para escribir en DBFrameLogic.json.");
  }
  assertAuthorized();

  if (expectedText !== null) {
    const actualText = await (await handle.getFile()).text();
    assertAuthorized();
    if (actualText !== expectedText) {
      throw new Error("El JSON cambió fuera de FrameLogic. Ábrelo de nuevo antes de sobrescribir.");
    }
  }

  assertAuthorized();
  const writer = await handle.createWritable();
  try {
    assertAuthorized();
    await writer.write(json);
    assertAuthorized();
    await writer.close();
  } catch (cause) {
    try { await writer.abort?.(); } catch { /* Already closed or browser refused abort */ }
    throw cause;
  }
}
