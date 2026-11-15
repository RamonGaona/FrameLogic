import { useEffect, useRef, useState } from "react";
import {
  blankCatalog,
  CATALOG_DEFAULT_URL,
  CATALOG_SOURCE_STORAGE_KEY,
  EMPTY_CATALOG_RECORD,
  MAX_CATALOG_BYTES,
  createCatalogPasswordVerifier,
  normalizeCatalogRecord,
  normalizeFrameLogicCatalog,
  parseFrameLogicCatalog,
  resolveCatalogUrl,
  serializeFrameLogicCatalog,
  verifyCatalogPassword,
  type CatalogRecord,
  type FrameLogicCatalog,
} from "./frameLogicCatalog";
import "./frameLogicCatalogSettings.css";

/** File System Access API is progressive enhancement, not required for reading. */
interface CatalogWritable {
  write(data: string): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}
interface CatalogFileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<CatalogWritable>;
}
interface FilePickerWindow extends Window {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<CatalogFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<CatalogFileHandle>;
}

type CatalogDraft = Omit<CatalogRecord, "peso" | "longitud" | "tarifa"> & {
  peso: string;
  longitud: string;
  tarifa: string;
};
type SourceKind = "remote" | "local" | "new";

const JSON_FILE_TYPES = [{
  description: "Archivo JSON de FrameLogic",
  accept: { "application/json": [".json"] },
}];

function toDraft(record: CatalogRecord): CatalogDraft {
  return {
    codigo: record.codigo,
    nombre: record.nombre,
    familia: record.familia,
    ruta: record.ruta,
    peso: record.peso === null ? "" : String(record.peso),
    longitud: record.longitud === null ? "" : String(record.longitud),
    tarifa: record.tarifa === null ? "" : String(record.tarifa),
  };
}

function fromDraft(draft: CatalogDraft): CatalogRecord {
  const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);
  return normalizeCatalogRecord({
    ...draft,
    peso: numberOrNull(draft.peso),
    longitud: numberOrNull(draft.longitud),
    tarifa: numberOrNull(draft.tarifa),
  });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function downloadCatalog(json: string, fileName: string): void {
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.toLowerCase().endsWith(".json") ? fileName : fileName + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Catalog panel: shared read-only JSON URL, or a local file with explicit save. */
export function FrameLogicCatalogSettings() {
  const [route, setRoute] = useState(() => {
    try { return localStorage.getItem(CATALOG_SOURCE_STORAGE_KEY) ?? CATALOG_DEFAULT_URL; }
    catch { return CATALOG_DEFAULT_URL; }
  });
  const [catalog, setCatalog] = useState<FrameLogicCatalog | null>(null);
  const [source, setSource] = useState<SourceKind>("remote");
  const [fileHandle, setFileHandle] = useState<CatalogFileHandle | null>(null);
  const [readText, setReadText] = useState<string | null>(null);
  const [filename, setFilename] = useState("framelogic-catalog.json");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState("");
  const [admin, setAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draftDirty, setDraftDirty] = useState(false);
  const [draft, setDraft] = useState<CatalogDraft>(() => toDraft(EMPTY_CATALOG_RECORD));
  const fileInput = useRef<HTMLInputElement>(null);
  const requestSerial = useRef(0);

  const selectData = (
    data: FrameLogicCatalog,
    raw: string,
    kind: SourceKind,
    name: string,
    handle: CatalogFileHandle | null,
  ) => {
    setCatalog(data);
    setReadText(raw);
    setSource(kind);
    setFilename(name);
    setFileHandle(handle);
    setAdmin(false);
    setPassword("");
    setPasswordConfirm("");
    setDirty(false);
    setDraftDirty(false);
    setIsNew(false);
    setSelectedIndex(data.registros.length ? 0 : null);
    setDraft(toDraft(data.registros[0] ?? EMPTY_CATALOG_RECORD));
    setFilter("");
  };

  const requestRemote = async (value: string, onOpen = false): Promise<void> => {
    const serial = ++requestSerial.current;
    if (!onOpen && (dirty || draftDirty)
      && !window.confirm("Hay cambios sin guardar. ¿Descartar y cargar otra base de datos?")) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const url = resolveCatalogUrl(value, window.location.href);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("No se pudo abrir el JSON (HTTP " + response.status + ").");
      const size = Number(response.headers.get("content-length") || 0);
      if (size > MAX_CATALOG_BYTES) throw new Error("La base de datos supera 5 MB.");
      const raw = await response.text();
      const parsed = parseFrameLogicCatalog(raw);
      if (serial !== requestSerial.current) return;
      selectData(parsed, raw, "remote", new URL(url).pathname.split("/").pop() || "catalogo.json", null);
      try { localStorage.setItem(CATALOG_SOURCE_STORAGE_KEY, value); } catch { /* private mode */ }
      setMessage("Catálogo cargado en modo consulta desde la URL.");
    } catch (cause) {
      if (serial === requestSerial.current) setError(errorText(cause));
    } finally {
      if (serial === requestSerial.current) setBusy(false);
    }
  };

  // The default URL is served from Cloudflare Pages so all users start with the same catalog.
  // Remote updates require a protected server API; they are NEVER sent using a client password.
  useEffect(() => {
    void requestRemote(route, true);
    return () => { requestSerial.current += 1; };
    // Only load the initial saved URL when the settings section mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLocalFile = async (file: File, handle: CatalogFileHandle | null) => {
    if (file.size > MAX_CATALOG_BYTES) {
      setError("El archivo seleccionado supera el límite de 5 MB.");
      return;
    }
    const serial = ++requestSerial.current;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const raw = await file.text();
      const parsed = parseFrameLogicCatalog(raw);
      if (serial !== requestSerial.current) return;
      selectData(parsed, raw, "local", file.name, handle);
      setRoute(file.name);
      setMessage(handle
        ? "Archivo local abierto. Un administrador podrá guardar en este archivo."
        : "Archivo local abierto. Al guardar se descargará una nueva copia JSON.");
    } catch (cause) {
      if (serial === requestSerial.current) setError(errorText(cause));
    } finally {
      if (serial === requestSerial.current) setBusy(false);
    }
  };

  const openLocal = async () => {
    if ((dirty || draftDirty) && !window.confirm(
      "Hay cambios sin guardar. ¿Descartar y abrir otro archivo?",
    )) return;
    const picker = window as FilePickerWindow;
    if (!picker.showOpenFilePicker) {
      fileInput.current?.click();
      return;
    }
    try {
      const [handle] = await picker.showOpenFilePicker({
        multiple: false,
        types: JSON_FILE_TYPES,
      });
      if (handle) await loadLocalFile(await handle.getFile(), handle);
    } catch (cause) {
      if (!isAbort(cause)) setError(errorText(cause));
    }
  };

  const createNew = () => {
    if ((dirty || draftDirty) && !window.confirm(
      "Hay cambios sin guardar. ¿Descartar y crear otra base de datos?",
    )) return;
    requestSerial.current += 1;
    const data = blankCatalog();
    selectData(data, serializeFrameLogicCatalog(data), "new", "framelogic-catalog.json", null);
    setRoute("framelogic-catalog.json");
    setDirty(true);
    setMessage("JSON nuevo creado. Establece una contraseña de edición y guárdalo como archivo.");
    setError("");
  };

  const enterAdmin = async () => {
    if (!catalog) return;
    setAuthBusy(true);
    setError("");
    try {
      if (catalog.admin) {
        if (!await verifyCatalogPassword(password, catalog.admin)) {
          throw new Error("Contraseña de editor incorrecta.");
        }
      } else {
        if (password !== passwordConfirm) {
          throw new Error("Las dos contraseñas no coinciden.");
        }
        const verifier = await createCatalogPasswordVerifier(password);
        setCatalog({ ...catalog, admin: verifier });
        setDirty(true);
        setMessage("Contraseña de edición establecida. Guarda el JSON para conservarla.");
      }
      setAdmin(true);
      setPassword("");
      setPasswordConfirm("");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setAuthBusy(false);
    }
  };

  const selectRecord = (index: number) => {
    if (draftDirty && !window.confirm("¿Descartar los cambios de la ficha actual?")) return;
    setSelectedIndex(index);
    setIsNew(false);
    setDraft(toDraft(catalog!.registros[index]!));
    setDraftDirty(false);
    setError("");
  };

  const newRecord = () => {
    if (draftDirty && !window.confirm("¿Descartar los cambios de la ficha actual?")) return;
    setSelectedIndex(null);
    setIsNew(true);
    setDraft(toDraft(EMPTY_CATALOG_RECORD));
    setDraftDirty(false);
  };

  const setField = (key: keyof CatalogDraft, value: string) => {
    setDraft((old) => ({ ...old, [key]: value }));
    setDraftDirty(true);
  };

  const commitRecord = () => {
    if (!catalog || !admin || (!isNew && selectedIndex === null)) return;
    try {
      const record = fromDraft(draft);
      const records = [...catalog.registros];
      if (isNew) records.push(record);
      else records[selectedIndex!] = record;
      const next = normalizeFrameLogicCatalog({ ...catalog, registros: records });
      const index = isNew ? records.length - 1 : selectedIndex!;
      setCatalog(next);
      setSelectedIndex(index);
      setDraft(toDraft(next.registros[index]!));
      setIsNew(false);
      setDraftDirty(false);
      setDirty(true);
      setError("");
      setMessage("Ficha actualizada. Guarda el JSON para conservar los cambios.");
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const deleteRecord = () => {
    if (!catalog || !admin || selectedIndex === null || isNew) return;
    const old = catalog.registros[selectedIndex];
    if (!window.confirm("¿Eliminar el código «" + old?.codigo + "» del JSON?")) return;
    const records = catalog.registros.filter((_, i) => i !== selectedIndex);
    setCatalog({ ...catalog, registros: records });
    setSelectedIndex(records.length ? Math.min(selectedIndex, records.length - 1) : null);
    setDraft(toDraft(records[Math.min(selectedIndex, records.length - 1)] ?? EMPTY_CATALOG_RECORD));
    setDirty(true);
    setDraftDirty(false);
    setError("");
    setMessage("Registro eliminado. Guarda el JSON para confirmar.");
  };

  const saveChanges = async () => {
    if (!catalog || !admin) return;
    if (draftDirty) { setError("Primero pulsa «Aplicar ficha» para confirmar los campos."); return; }
    setError("");
    setMessage("");
    let json: string;
    try { json = serializeFrameLogicCatalog(catalog); }
    catch (cause) { setError(errorText(cause)); return; }

    // For URL sources, remote writes are intentionally unavailable.
    // Use a local file picker or explicit download; never send client passwords to a public API.
    setBusy(true);
    try {
      let target = fileHandle;
      if (!target) {
        const picker = window as FilePickerWindow;
        if (picker.showSaveFilePicker) {
          target = await picker.showSaveFilePicker({
            suggestedName: filename,
            types: JSON_FILE_TYPES,
          });
        } else {
          downloadCatalog(json, filename);
          setDirty(false);
          setMessage("Copia JSON descargada. La URL compartida NO se ha actualizado.");
          return;
        }
      }
      if (target === fileHandle && readText !== null) {
        // Prevent overwriting another edit made to the same local file.
        const latest = await (await target.getFile()).text();
        if (latest !== readText) {
          throw new Error("El archivo cambió fuera de FrameLogic. Vuelve a abrirlo antes de sobrescribir.");
        }
      }
      const writer = await target.createWritable();
      try {
        await writer.write(json);
        await writer.close();
      } catch (cause) {
        try { await writer.abort?.(); } catch { /* could already be closed */ }
        throw cause;
      }
      setFileHandle(target);
      setReadText(json);
      setFilename(target.name);
      setSource("local");
      setRoute(target.name);
      setDirty(false);
      setMessage("JSON guardado en el archivo local. No actualiza por sí solo la URL web compartida.");
    } catch (cause) {
      if (!isAbort(cause)) setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const matches = catalog?.registros
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => {
      const q = filter.toLocaleLowerCase().trim();
      return !q || [record.codigo, record.nombre, record.familia, record.ruta]
        .some((value) => value.toLocaleLowerCase().includes(q));
    }) ?? [];
  const activeRecord = selectedIndex === null ? null : catalog?.registros[selectedIndex] ?? null;
  const display = admin ? draft : toDraft(activeRecord ?? EMPTY_CATALOG_RECORD);
  const active = isNew || activeRecord !== null;

  return (
    <div className="fl-catalog" data-framelogic-catalog-settings="true">
      <div className="fl-settings-info">
        <strong>Catálogo JSON de códigos</strong>
        <p>Todos pueden consultar una misma URL JSON. En esta fase, la edición requiere
          contraseña y se guarda en un archivo local: para que aparezca a todos los usuarios,
          ese archivo debe publicarse en la URL común mediante un servicio protegido.</p>
      </div>
      <div className="fl-catalog-route">
        <label htmlFor="fl-catalog-json-route">Ruta o URL del archivo JSON</label>
        <div className="fl-catalog-route-row">
          <input id="fl-catalog-json-route" type="text" value={route}
            autoComplete="off" spellCheck={false}
            placeholder="https://servidor.com/catalogo.json o /data/catalogo.json"
            onChange={(event) => setRoute(event.target.value)} />
          <button type="button" disabled={busy}
            onClick={() => void requestRemote(route)}>Cargar URL</button>
          <button type="button" disabled={busy} onClick={() => void openLocal()}>
            Seleccionar JSON
          </button>
          <button type="button" disabled={busy} onClick={createNew}>Nuevo JSON</button>
        </div>
        <input ref={fileInput} type="file" accept=".json,application/json" hidden
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void loadLocalFile(file, null);
            event.currentTarget.value = "";
          }} />
        <small>Los navegadores no permiten abrir rutas locales como C:\carpeta\archivo.json
          directamente; utiliza «Seleccionar JSON». Una URL externa debe permitir CORS.</small>
      </div>

      {error && <div className="fl-catalog-alert is-error" role="alert">{error}</div>}
      {message && <div className="fl-catalog-alert" role="status">{message}</div>}

      {catalog ? (
        <>
          <div className="fl-catalog-action-row">
            <span className="fl-catalog-status">
              {admin ? "Modo editor" : "Solo lectura"} · {catalog.registros.length} códigos ·
              {" "}{source === "remote" ? "URL compartida" : "Archivo local"}
              {dirty ? " · Cambios sin guardar" : ""}
            </span>
            <div className="fl-catalog-buttons">
              <button type="button" onClick={() => {
                downloadCatalog(serializeFrameLogicCatalog(catalog), filename);
                setMessage("Se descargó una copia; no se modificó la URL compartida.");
              }}>Descargar copia</button>
              {admin && <>
                <button type="button" disabled={busy || !dirty} onClick={() => void saveChanges()}>
                  Guardar JSON
                </button>
                <button type="button" onClick={() => {
                  if (draftDirty && !window.confirm("¿Descartar los cambios de la ficha?")) return;
                  setDraftDirty(false);
                  setAdmin(false);
                }}>Salir del editor</button>
              </>}
            </div>
          </div>
          {!admin && (
            <div className="fl-catalog-admin-access">
              <strong>{catalog.admin ? "Ingresar como administrador" : "Establecer contraseña de edición"}</strong>
              <div className="fl-catalog-password-row">
                <input type="password" value={password}
                  autoComplete={catalog.admin ? "current-password" : "new-password"}
                  placeholder="Contraseña de administrador"
                  aria-label="Contraseña de administrador"
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && password) void enterAdmin();
                  }} />
                {!catalog.admin && <input type="password" value={passwordConfirm}
                  autoComplete="new-password" placeholder="Confirmar contraseña"
                  aria-label="Confirmar contraseña de administrador"
                  onChange={(event) => setPasswordConfirm(event.target.value)} />}
                <button type="button" disabled={authBusy || !password}
                  onClick={() => void enterAdmin()}>
                  {authBusy ? "Validando…" : catalog.admin ? "Entrar en modo editor" : "Crear clave y editar"}
                </button>
              </div>
              <small>La clave no se guarda en texto plano. Este bloqueo protege la edición
                desde la interfaz, pero NO reemplaza los permisos reales del archivo o
                la autenticación del servidor.</small>
            </div>
          )}
          <div className="fl-catalog-search">
            <label htmlFor="fl-catalog-search-input">Buscar código, nombre, familia o ruta</label>
            <input id="fl-catalog-search-input" type="search" value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Buscar en el catálogo" />
          </div>
          <div className="fl-catalog-grid">
            <div className="fl-catalog-table-wrap">
              <table className="fl-catalog-table">
                <thead><tr>
                  <th>Código</th><th>Nombre</th><th>Familia</th><th>Ruta</th>
                  <th>Peso</th><th>Longitud</th><th>Tarifa</th>
                </tr></thead>
                <tbody>
                  {matches.map(({ record, index }) => (
                    <tr key={record.codigo} className={selectedIndex === index && !isNew ? "is-selected" : ""}
                      onClick={() => selectRecord(index)}>
                      <td>{record.codigo}</td>
                      <td>{record.nombre || "—"}</td>
                      <td>{record.familia || "—"}</td>
                      <td title={record.ruta}>{record.ruta || "—"}</td>
                      <td>{record.peso ?? "—"}</td>
                      <td>{record.longitud ?? "—"}</td>
                      <td>{record.tarifa ?? "—"}</td>
                    </tr>
                  ))}
                  {!matches.length && <tr><td colSpan={7}>
                    {catalog.registros.length ? "Sin resultados." : "El catálogo todavía no contiene códigos."}
                  </td></tr>}
                </tbody>
              </table>
            </div>
            <section className="fl-catalog-record" aria-label="Ficha del código">
              <div className="fl-catalog-record-heading">
                <strong>{isNew ? "Nuevo código" : activeRecord ? "Ficha: " + activeRecord.codigo : "Ficha del código"}</strong>
                {admin && <button type="button" onClick={newRecord}>+ Nuevo</button>}
              </div>
              {active ? (
                <>
                  <div className="fl-catalog-form">
                    {(["codigo", "nombre", "familia", "ruta"] as const).map((key) => (
                      <label key={key}>{key === "codigo" ? "Código" : key === "nombre" ? "Nombre"
                        : key === "familia" ? "Familia" : "Ruta"}
                        <input type="text" value={display[key]} disabled={!admin}
                          maxLength={2048}
                          onChange={(event) => setField(key, event.target.value)} />
                      </label>
                    ))}
                    {(["peso", "longitud", "tarifa"] as const).map((key) => (
                      <label key={key}>{key === "peso" ? "Peso" : key === "longitud" ? "Longitud" : "Tarifa"}
                        <input type="number" min="0" step="any" value={display[key]}
                          disabled={!admin}
                          onChange={(event) => setField(key, event.target.value)} />
                      </label>
                    ))}
                  </div>
                  {admin && <div className="fl-catalog-record-actions">
                    <button type="button" disabled={!draftDirty && !isNew} onClick={commitRecord}>
                      Aplicar ficha
                    </button>
                    {!isNew && <button type="button" className="fl-catalog-danger"
                      onClick={deleteRecord}>Eliminar código</button>}
                  </div>}
                </>
              ) : (
                <p>Selecciona un código para ver sus propiedades.
                  {admin ? " También puedes crear uno nuevo." : ""}</p>
              )}
            </section>
          </div>
          <p className="fl-catalog-notice">
            {source === "remote"
              ? "Aviso: editar o guardar una copia NO modifica el JSON de la URL pública ni los datos de otros usuarios."
              : fileHandle
                ? "El guardado directo requiere permiso del navegador sobre el archivo seleccionado."
                : "Sin acceso de escritura directo, «Guardar JSON» crea o descarga un archivo en tu equipo."}
          </p>
        </>
      ) : (
        <p className="fl-catalog-empty">{busy ? "Cargando catálogo…" :
          "Introduce la URL de un JSON, selecciona un archivo o crea una base de datos nueva."}</p>
      )}
    </div>
  );
}
