import { useEffect, useRef, useState } from "react";
import { FrameLogicUniversalCatalogGrid } from "./FrameLogicUniversalCatalogGrid";
import {
  forgetCatalogFileHandle,
  queryCatalogReadPermission,
  requestCatalogReadPermission,
  requestCatalogWritePermission,
  restoreCatalogFileHandle,
  storeCatalogFileHandle,
  type CatalogFileHandle,
} from "./catalogFileHandleStore";
import {
  blankCatalog,
  CATALOG_DEFAULT_URL,
  CATALOG_LOCAL_FILE_NAME,
  CATALOG_LOCAL_FILE_PATH,
  CATALOG_SOURCE_STORAGE_KEY,
  EMPTY_CATALOG_RECORD,
  MAX_CATALOG_BYTES,
  normalizeFrameLogicCatalog,
  parseFrameLogicCatalog,
  resolveCatalogUrl,
  serializeFrameLogicCatalog,
  updateCatalogField,
  type CatalogPath,
  type CatalogValue,
  type CatalogRecord,
  type FrameLogicCatalog,
} from "./frameLogicCatalog";
import "./frameLogicCatalogSettings.css";

interface CatalogPickerWindow extends Window {
  showOpenFilePicker?: (options?: {
    id?: string;
    multiple?: boolean;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<CatalogFileHandle[]>;
  showSaveFilePicker?: (options?: {
    id?: string;
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<CatalogFileHandle>;
}

const JSON_FILE_TYPES = [{
  description: "Base de datos FrameLogic (JSON)",
  accept: { "application/json": [".json"] },
}];

type SourceKind = "remote" | "local" | "new";

function isWebRoute(value: string): boolean {
  return /^(https?:\/\/|\/)/i.test(value.trim());
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function downloadJson(json: string, name: string): void {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name.endsWith(".json") ? name : CATALOG_LOCAL_FILE_NAME;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface FrameLogicCatalogSettingsProps {
  /** Controlled by the single lock in the settings WINDOW header. */
  unlocked: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * Excel-style catalog grid. Every onChange updates the in-memory JSON.
 * Explicit Guardar JSON writes to the selected local file (when permission
 * exists) or downloads a copy. Never pretends to update the public URL.
 */
export function FrameLogicCatalogSettings({
  unlocked,
  onDirtyChange,
}: FrameLogicCatalogSettingsProps) {
  const [route, setRoute] = useState(() => {
    try {
      const saved = localStorage.getItem(CATALOG_SOURCE_STORAGE_KEY);
      // Migrate the original default web catalog to the new local DB location.
      return saved && saved !== CATALOG_DEFAULT_URL
        ? saved : CATALOG_LOCAL_FILE_PATH;
    } catch {
      return CATALOG_LOCAL_FILE_PATH;
    }
  });
  const [catalog, setCatalog] = useState<FrameLogicCatalog | null>(null);
  const [source, setSource] = useState<SourceKind>("local");
  const [fileHandle, setFileHandle] = useState<CatalogFileHandle | null>(null);
  const [rememberedHandle, setRememberedHandle] = useState<CatalogFileHandle | null>(null);
  const [needsAuthorization, setNeedsAuthorization] = useState(false);
  const [handleNotice, setHandleNotice] = useState("");
  const [readText, setReadText] = useState<string | null>(null);
  const [fileName, setFileName] = useState(CATALOG_LOCAL_FILE_NAME);
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const rememberRoute = (value: string) => {
    setRoute(value);
    setRememberedHandle(null);
    setNeedsAuthorization(false);
    try { localStorage.setItem(CATALOG_SOURCE_STORAGE_KEY, value); }
    catch { /* Incognito/private browser mode */ }
  };

  const acceptCatalog = (
    data: FrameLogicCatalog,
    text: string,
    kind: SourceKind,
    name: string,
    handle: CatalogFileHandle | null,
  ) => {
    setCatalog(data);
    setReadText(text);
    setSource(kind);
    setFileName(name);
    setFileHandle(handle);
    setSelectedRow(data.registros.length ? 0 : null);
    setDirty(false);
    setFilter("");
    setError("");
  };

  const confirmDiscard = (): boolean => !dirty
    || window.confirm("Hay cambios sin guardar. ¿Deseas descartarlos?");

  const loadRemote = async (value: string, initial = false): Promise<void> => {
    if (!initial && !confirmDiscard()) return;
    if (!isWebRoute(value)) {
      setError("La ruta local se abre con «Seleccionar JSON». Por seguridad, el navegador no puede leer D:\\ directamente.");
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const url = resolveCatalogUrl(value, location.href);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo abrir el JSON: HTTP " + response.status + ".");
      if (Number(response.headers.get("content-length") || 0) > MAX_CATALOG_BYTES) {
        throw new Error("El archivo excede el máximo de 5 MB.");
      }
      const text = await response.text();
      const next = parseFrameLogicCatalog(text);
      if (id !== requestId.current) return;
      acceptCatalog(next, text, "remote", new URL(url).pathname.split("/").pop()
        || CATALOG_LOCAL_FILE_NAME, null);
      rememberRoute(value);
      setMessage("Catálogo web cargado en modo consulta. No se puede sobrescribir desde el navegador.");
    } catch (cause) {
      if (id === requestId.current) setError(errorMessage(cause));
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };

  // A typed Windows path is just a reference. An IndexedDB file handle can
  // be read automatically on reload ONLY if the browser still permits it.
  // We never call requestPermission without a direct user click.
  useEffect(() => {
    const id = ++requestId.current;
    if (isWebRoute(route)) {
      void loadRemote(route, true);
    } else {
      setBusy(true);
      void (async () => {
        try {
          const handle = await restoreCatalogFileHandle(route);
          if (id !== requestId.current) return;
          if (!handle) {
            setMessage("Ruta local recordada. Selecciona DBFrameLogic.json una vez para recordar el archivo.");
            return;
          }
          setRememberedHandle(handle);
          const permission = await queryCatalogReadPermission(handle);
          if (id !== requestId.current) return;
          if (permission === "granted" || !handle.queryPermission) {
            try {
              const file = await handle.getFile();
              if (id !== requestId.current) return;
              await loadLocal(file, handle, false);
            } catch {
              if (id !== requestId.current) return;
              setNeedsAuthorization(true);
              setMessage("Se recordó DBFrameLogic.json, pero el navegador requiere autorizar su lectura.");
            }
          } else {
            setNeedsAuthorization(true);
            setMessage("Archivo recordado: " + handle.name
              + ". Pulsa «Autorizar acceso» para renovar el permiso de lectura.");
          }
        } catch (cause) {
          if (id === requestId.current) setError(errorMessage(cause));
        } finally {
          if (id === requestId.current) setBusy(false);
        }
      })();
    }
    return () => { requestId.current += 1; };
    // Only use the initial saved route; subsequent route changes require explicit loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLocal = async (file: File, handle: CatalogFileHandle | null, remember = true) => {
    if (file.size > MAX_CATALOG_BYTES) {
      setError("El archivo seleccionado supera 5 MB.");
      return;
    }
    const id = ++requestId.current;
    setBusy(true);
    setError("");
    try {
      const text = await file.text();
      const parsed = parseFrameLogicCatalog(text);
      if (id !== requestId.current) return;
      acceptCatalog(parsed, text, "local", file.name, handle);
      const localRoute = isWebRoute(route) ? CATALOG_LOCAL_FILE_PATH : route;
      if (isWebRoute(route)) rememberRoute(localRoute);
      if (handle) {
        setRememberedHandle(handle);
        setNeedsAuthorization(false);
        if (remember) {
          const stored = await storeCatalogFileHandle(localRoute, handle);
          if (id !== requestId.current) return;
          setHandleNotice(stored ? "" :
            "El navegador no pudo recordar el permiso del archivo (IndexedDB no disponible).");
        } else {
          setHandleNotice("");
        }
      } else {
        setRememberedHandle(null);
        setNeedsAuthorization(false);
        setHandleNotice("Este navegador puede leer JSON, pero no admite recordar archivos locales.");
        await forgetCatalogFileHandle();
        if (id !== requestId.current) return;
      }
      setMessage(handle
        ? (remember
          ? "JSON cargado. FrameLogic recordará el archivo y comprobará el permiso al volver a abrir."
          : "JSON recuperado automáticamente desde el archivo local autorizado.")
        : "Archivo local abierto. Guardar JSON descargará una copia.");
    } catch (cause) {
      if (id === requestId.current) setError(errorMessage(cause));
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  };

  const authorizeRememberedFile = async () => {
    const handle = rememberedHandle;
    if (!handle) return;
    setError("");
    setBusy(true);
    // Request read access DIRECTLY from the click, before any other await.
    try {
      const granted = await requestCatalogReadPermission(handle);
      if (!granted) {
        setNeedsAuthorization(true);
        setError("No se concedió permiso de lectura. Puedes seleccionar el archivo otra vez.");
        return;
      }
      const file = await handle.getFile();
      await loadLocal(file, handle, false);
    } catch (cause) {
      setNeedsAuthorization(true);
      setError("No se pudo reabrir el archivo recordado: " + errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const selectJson = async () => {
    if (!confirmDiscard()) return;
    const picker = window as CatalogPickerWindow;
    if (!picker.showOpenFilePicker) {
      fileInput.current?.click();
      return;
    }
    try {
      const [handle] = await picker.showOpenFilePicker({
        id: "framelogic-db-json",
        multiple: false,
        types: JSON_FILE_TYPES,
      });
      if (handle) await loadLocal(await handle.getFile(), handle);
    } catch (cause) {
      if (!isAbort(cause)) setError(errorMessage(cause));
    }
  };

  const newCatalog = () => {
    if (!unlocked || !confirmDiscard()) return;
    requestId.current += 1;
    const fresh = blankCatalog();
    acceptCatalog(fresh, serializeFrameLogicCatalog(fresh),
      "new", CATALOG_LOCAL_FILE_NAME, null);
    rememberRoute(CATALOG_LOCAL_FILE_PATH);
    setDirty(true);
    setMessage("Nuevo DBFrameLogic.json. Añade códigos y pulsa «Guardar JSON» para elegir dónde guardarlo.");
  };

  const editCell = (index: number, path: CatalogPath, value: CatalogValue) => {
    if (!unlocked) return;
    try {
      setCatalog((current) => {
        if (!current || !current.registros[index]) return current;
        const records = [...current.registros];
        records[index] = updateCatalogField(records[index]!, path, value);
        return { ...current, registros: records };
      });
      setDirty(true);
      setError("");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const replaceRecord = (index: number, record: CatalogRecord) => {
    if (!unlocked || !catalog) return;
    try {
      const records = [...catalog.registros];
      records[index] = record;
      const normalized = normalizeFrameLogicCatalog({ ...catalog, registros: records });
      setCatalog(normalized);
      setDirty(true);
      setError("");
      setMessage("Estructura del código actualizada en memoria. Guarda JSON para conservarla.");
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const addRow = () => {
    if (!unlocked || !catalog) return;
    const codes = new Set(catalog.registros.map((r) => r.codigo.toUpperCase()));
    let number = catalog.registros.length + 1;
    let code = "CODIGO_" + String(number).padStart(3, "0");
    while (codes.has(code)) {
      number += 1;
      code = "CODIGO_" + String(number).padStart(3, "0");
    }
    const next: CatalogRecord = { ...EMPTY_CATALOG_RECORD, codigo: code };
    setCatalog({ ...catalog, registros: [...catalog.registros, next] });
    setSelectedRow(catalog.registros.length);
    setDirty(true);
    setError("");
    setMessage("Fila añadida. Edita sus celdas y guarda el archivo JSON.");
  };

  const removeRow = () => {
    if (!unlocked || !catalog || selectedRow === null) return;
    const code = catalog.registros[selectedRow]?.codigo;
    if (!window.confirm("¿Eliminar la fila «" + code + "»?")) return;
    setCatalog({
      ...catalog,
      registros: catalog.registros.filter((_, i) => i !== selectedRow),
    });
    setSelectedRow(null);
    setDirty(true);
    setMessage("Fila eliminada. Guarda JSON para confirmar.");
  };

  const saveJson = async () => {
    if (!unlocked || !catalog) return;
    setError("");
    setMessage("");
    let json: string;
    try {
      json = serializeFrameLogicCatalog(normalizeFrameLogicCatalog(catalog));
    } catch (cause) {
      setError("Corrige las celdas antes de guardar: " + errorMessage(cause));
      return;
    }

    setBusy(true);
    try {
      let handle = fileHandle;
      // A persisted read-only handle may need explicit write authorization.
      // Ask from this Save button gesture, never during automatic restore.
      if (handle && !await requestCatalogWritePermission(handle)) {
        setError("No se concedió permiso para escribir en DBFrameLogic.json.");
        return;
      }
      if (!handle) {
        const picker = window as CatalogPickerWindow;
        if (picker.showSaveFilePicker) {
          handle = await picker.showSaveFilePicker({
            id: "framelogic-db-json",
            suggestedName: CATALOG_LOCAL_FILE_NAME,
            types: JSON_FILE_TYPES,
          });
        } else {
          downloadJson(json, CATALOG_LOCAL_FILE_NAME);
          setDirty(false);
          setMessage("Copia descargada. Muévela manualmente a la carpeta D:\\Documents\\FrameLogic\\DB. No se modificó el JSON original.");
          return;
        }
      }
      if (handle === fileHandle && readText !== null) {
        const currentText = await (await handle.getFile()).text();
        if (currentText !== readText) {
          throw new Error("El JSON cambió fuera de FrameLogic. Ábrelo de nuevo antes de sobrescribir.");
        }
      }
      const writer = await handle.createWritable();
      try {
        await writer.write(json);
        await writer.close();
      } catch (cause) {
        try { await writer.abort?.(); } catch { /* Already closed */ }
        throw cause;
      }
      setFileHandle(handle);
      setRememberedHandle(handle);
      setNeedsAuthorization(false);
      const localRoute = isWebRoute(route) ? CATALOG_LOCAL_FILE_PATH : route;
      if (isWebRoute(route)) rememberRoute(localRoute);
      const remembered = await storeCatalogFileHandle(localRoute, handle);
      setHandleNotice(remembered ? "" :
        "Se guardó el JSON, pero el navegador no puede recordar el archivo para la siguiente visita.");
      setReadText(json);
      setFileName(handle.name);
      setSource("local");
      setDirty(false);
      setMessage("DBFrameLogic.json guardado en el archivo local seleccionado. La URL pública no se ha modificado.");
    } catch (cause) {
      if (!isAbort(cause)) setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const matches = catalog?.registros.map((record, index) => ({ record, index }))
    .filter(({ record }) => {
      const text = filter.trim().toLocaleLowerCase();
      return !text || JSON.stringify(record).toLocaleLowerCase().includes(text);
    }) ?? [];

  return (
    <div className="fl-catalog" data-framelogic-catalog-settings="true">
      <div className="fl-catalog-route">
        <label htmlFor="fl-catalog-json-route">Ubicación de DBFrameLogic.json</label>
        <div className="fl-catalog-route-row">
          <input id="fl-catalog-json-route" type="text" value={route}
            disabled={!unlocked} spellCheck={false}
            onChange={(event) => rememberRoute(event.currentTarget.value)}
            title="Ubicación de referencia. Para abrir archivos locales usa Seleccionar JSON." />
          <button type="button" onClick={() => void selectJson()} disabled={busy}>
            Seleccionar JSON
          </button>
          {needsAuthorization && rememberedHandle && (
            <button type="button" className="fl-catalog-authorize"
              data-framelogic-catalog-authorize="true"
              disabled={busy}
              onClick={() => void authorizeRememberedFile()}>
              Autorizar acceso
            </button>
          )}
          <button type="button" onClick={() => void loadRemote(route)} disabled={busy || !isWebRoute(route)}>
            Cargar URL
          </button>
          <button type="button" onClick={newCatalog} disabled={!unlocked || busy}>
            Nuevo JSON
          </button>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void loadLocal(file, null);
            event.currentTarget.value = "";
          }} />
        <small>Ruta local prevista: {CATALOG_LOCAL_FILE_PATH}. Al seleccionar el JSON,
          FrameLogic intentará recordar el archivo en este navegador. La próxima vez lo leerá
          automáticamente si el navegador conserva el permiso; si no, aparecerá
          «Autorizar acceso». La ruta es solo una referencia, no concede acceso al disco.
          También puedes utilizar una URL HTTPS, por ejemplo {CATALOG_DEFAULT_URL}.</small>
        {handleNotice && <small role="status" className="fl-catalog-handle-notice">{handleNotice}</small>
      </div>

      {error && <div role="alert" className="fl-catalog-alert is-error">{error}</div>}
      {message && <div role="status" className="fl-catalog-alert">{message}</div>}
      <div className="fl-catalog-action-row">
        <strong>{unlocked ? "🔓 Edición habilitada" : "🔒 Solo lectura"} ·{" "}
          {catalog?.registros.length ?? 0} códigos · {source === "remote" ? "URL web" : "Archivo local"}
          {dirty ? " · Sin guardar" : ""}
        </strong>
        <div className="fl-catalog-buttons">
          <button type="button" disabled={!catalog} onClick={() => {
            if (!catalog) return;
            try {
              downloadJson(serializeFrameLogicCatalog(catalog), CATALOG_LOCAL_FILE_NAME);
              setMessage("Copia descargada; no se modificó el archivo original.");
            } catch (cause) { setError(errorMessage(cause)); }
          }}>Descargar copia</button>
          {unlocked && <>
            <button type="button" onClick={addRow} disabled={!catalog || busy}>+ Agregar fila</button>
            <button type="button" onClick={removeRow}
              disabled={!catalog || selectedRow === null || busy}>Eliminar fila</button>
            <button type="button" onClick={() => void saveJson()}
              disabled={!catalog || busy || !dirty}>Guardar JSON</button>
          </>}
        </div>
      </div>

      <label className="fl-catalog-search" htmlFor="fl-catalog-search-input">
        Buscar códigos y propiedades
        <input id="fl-catalog-search-input" type="search" value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
          placeholder="Buscar cualquier código, campo o valor anidado…" />
      </label>

      {catalog ? (
        <FrameLogicUniversalCatalogGrid
          registros={catalog.registros}
          matches={matches}
          selectedRow={selectedRow}
          unlocked={unlocked}
          onSelect={setSelectedRow}
          onCellEdit={editCell}
          onRecordReplace={replaceRecord}
        />
      ) : (
        <div className="fl-catalog-empty">
          Selecciona DBFrameLogic.json para consultar cualquier código y sus subdivisiones.
        </div>
      )}
      <small className="fl-catalog-notice">
        Las propiedades se muestran de forma dinámica: solo «codigo» es obligatorio. Los valores editados modifican el JSON en memoria. Pulsa Guardar JSON para escribir
        el archivo local (si el navegador permite escritura) o descargar una copia.
        El candado global de Configuración controla todas las pestañas.
        Esta clave provisional vacía NO protege un archivo compartido ni permite escribir
        directamente en SharePoint o en Cloudflare Pages.
      </small>
    </div>
  );
}
