import { useEffect, useMemo, useRef, useState } from "react";
import { writeAuthorizedPositionsFile } from "./positionsFileWriter";
import {
  queryCatalogReadPermission, requestCatalogReadPermission,
  restoreCatalogFileHandle, storeCatalogFileHandle,
  type CatalogFileHandle,
} from "./catalogFileHandleStore";
import {
  POSITIONS_FILE_NAME, POSITIONS_HANDLE_KEY, POSITIONS_LOCAL_PATH,
  POSITIONS_STORAGE_KEY, MAX_POSITIONS_BYTES,
  addPositionDefinition, createComponent, firstFreePosition, insertPositionSlot,
  markPositionsModified, movePositionSlot, newPositionsFile, normalizePositionsFile,
  parsePositionsFile, positionLabel, positionRows, previewPositionOperation,
  removePositionDefinition, serializePositionsFile, updatePositionDefinition, usageAt,
  type PositionComponent, type PositionDefinition, type PositionRef, type PositionsFile,
} from "./positionsCatalog";
import "./frameLogicPositionsSettings.css";

interface PositionsPickerWindow extends Window {
  showOpenFilePicker?: (options?: {
    id?: string; multiple?: boolean;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<CatalogFileHandle[]>;
  showSaveFilePicker?: (options?: {
    id?: string; suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<CatalogFileHandle>;
}
const fileTypes = [{ description: "Posiciones FrameLogic", accept: { "application/json": [".json"] } }];
const exceptionText = (error: unknown) => error instanceof Error ? error.message : String(error);
const isAbort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";
function downloadCopy(json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = POSITIONS_FILE_NAME;
  document.body.append(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function matchingRef(file: PositionsFile, family: number, slot: number): PositionRef | null {
  const index = file.families[family]?.positions.findIndex((p) => p.from <= slot && slot <= p.to) ?? -1;
  return index >= 0 ? { familyIndex: family, rowIndex: index } : null;
}
function overlapsOthers(file: PositionsFile, ref: PositionRef): boolean {
  const row = file.families[ref.familyIndex]?.positions[ref.rowIndex];
  if (!row) return false;
  return positionRows(file).some(({ familyIndex, rowIndex, position }) =>
    (familyIndex !== ref.familyIndex || rowIndex !== ref.rowIndex)
    && position.from <= row.to && position.to >= row.from);
}
export interface FrameLogicPositionsSettingsProps {
  unlocked: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Operates solely on POSITIONS.json; never silently changes external rules. */
export function FrameLogicPositionsSettings({
  unlocked, onDirtyChange,
}: FrameLogicPositionsSettingsProps) {
  const [route] = useState(() => {
    try { return localStorage.getItem(POSITIONS_STORAGE_KEY) || POSITIONS_LOCAL_PATH; }
    catch { return POSITIONS_LOCAL_PATH; }
  });
  const [file, setFile] = useState<PositionsFile | null>(null);
  const [readText, setReadText] = useState<string | null>(null);
  const [handle, setHandle] = useState<CatalogFileHandle | null>(null);
  const [rememberedHandle, setRememberedHandle] = useState<CatalogFileHandle | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [selected, setSelected] = useState<PositionRef | null>(null);
  const [familyName, setFamilyName] = useState("");
  const [positionDraft, setPositionDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const [inheritRange, setInheritRange] = useState(false);
  const [filter, setFilter] = useState("");
  const [versionDraft, setVersionDraft] = useState<string | null>(null);
  const [undo, setUndo] = useState<PositionsFile[]>([]);
  const [redo, setRedo] = useState<PositionsFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fallback = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  const editorAuth = useRef({ unlocked, generation: 0 });
  if (editorAuth.current.unlocked !== unlocked) {
    editorAuth.current = { unlocked, generation: editorAuth.current.generation + 1 };
  }
  const authorized = (g: number) =>
    editorAuth.current.unlocked && editorAuth.current.generation === g;

  const dirty = useMemo(() => {
    if (!file) return false;
    if (readText === null) return true;
    try { return JSON.stringify(file) !== JSON.stringify(parsePositionsFile(readText)); }
    catch { return true; }
  }, [file, readText]);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { if (!unlocked) setVersionDraft(null); }, [unlocked]);

  const loadSelectedFile = async (picked: File, selectedHandle: CatalogFileHandle | null, remember = true) => {
    if (picked.size > MAX_POSITIONS_BYTES) throw new Error("El archivo supera 10 MB.");
    const id = ++requestId.current;
    setBusy(true);
    try {
      const text = await picked.text();
      const parsed = parsePositionsFile(text);
      if (id !== requestId.current) return;
      setFile(parsed);
      setReadText(text);
      setSelected(parsed.families[0]?.positions.length ? { familyIndex: 0, rowIndex: 0 } : null);
      setFamilyName(parsed.families[0]?.family ?? "");
      setPositionDraft("");
      setVersionDraft(null);
      setUndo([]); setRedo([]);
      setHandle(selectedHandle);
      setRememberedHandle(selectedHandle);
      setNeedsAuth(false);
      setError("");
      if (selectedHandle && remember) {
        const success = await storeCatalogFileHandle(POSITIONS_LOCAL_PATH, selectedHandle, POSITIONS_HANDLE_KEY);
        if (id !== requestId.current) return;
        setNotice(success ? "Archivo autorizado y recordado para próximas visitas."
          : "Archivo leído; el navegador no pudo recordar el permiso.");
      } else {
        setNotice(selectedHandle ? "Archivo local cargado con autorización existente."
          : "Archivo abierto; guardar descargará una copia si este navegador no admite escritura directa.");
      }
      try { localStorage.setItem(POSITIONS_STORAGE_KEY, POSITIONS_LOCAL_PATH); } catch { /* private mode */ }
    } finally { if (id === requestId.current) setBusy(false); }
  };

  useEffect(() => {
    const id = ++requestId.current;
    void (async () => {
      try {
        const remembered = await restoreCatalogFileHandle(POSITIONS_LOCAL_PATH, POSITIONS_HANDLE_KEY);
        if (id !== requestId.current || !remembered) return;
        setRememberedHandle(remembered);
        const access = await queryCatalogReadPermission(remembered);
        if (id !== requestId.current) return;
        if (access === "granted" || !remembered.queryPermission) {
          try { await loadSelectedFile(await remembered.getFile(), remembered, false); }
          catch { if (id === requestId.current) setNeedsAuth(true); }
        } else setNeedsAuth(true);
      } catch (cause) {
        if (id === requestId.current) setError(exceptionText(cause));
      }
    })();
    return () => { requestId.current += 1; };
    // One attempt per mount. Browsers never auto-grant missing permissions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canDiscard = () => !dirty ||
    window.confirm("Hay cambios en POSITIONS.json sin guardar. ¿Descartarlos?");
  const selectJson = async () => {
    if (!canDiscard()) return;
    const picker = window as PositionsPickerWindow;
    try {
      if (!picker.showOpenFilePicker) { fallback.current?.click(); return; }
      const [selectedHandle] = await picker.showOpenFilePicker({
        id: "framelogic-positions-db", multiple: false, types: fileTypes,
      });
      if (selectedHandle) await loadSelectedFile(await selectedHandle.getFile(), selectedHandle);
    } catch (cause) { if (!isAbort(cause)) setError(exceptionText(cause)); }
  };
  const authorizeFile = async () => {
    if (!rememberedHandle) return;
    try {
      const allowed = await requestCatalogReadPermission(rememberedHandle);
      if (!allowed) throw new Error("El navegador no concedió permiso de lectura.");
      await loadSelectedFile(await rememberedHandle.getFile(), rememberedHandle, false);
    } catch (cause) { setError(exceptionText(cause)); setNeedsAuth(true); }
  };
  const createNew = () => {
    if (!unlocked || !canDiscard()) return;
    requestId.current++;
    setFile(newPositionsFile()); setReadText(null); setHandle(null); setSelected(null);
    setFamilyName(""); setUndo([]); setRedo([]);
    setError(""); setNotice("JSON nuevo en memoria. Selecciona una familia y guarda en la carpeta DB.");
  };

  const apply = (after: PositionsFile, title: string, preview = false, preferred?: PositionRef | null) => {
    if (!unlocked || !file || busy) return;
    try {
      normalizePositionsFile(after);
      serializePositionsFile(after);
      if (JSON.stringify(file) === JSON.stringify(after)) return;
      if (preview && !window.confirm(title + "\n\n"
        + previewPositionOperation(file, after) + "\n\n¿Aplicar?")) return;
      setUndo((previous) => [...previous.slice(-49), file]);
      setRedo([]);
      setFile(after);
      if (preferred !== undefined) setSelected(preferred);
      setError(""); setNotice(title + " (pendiente de Guardar JSON).");
    } catch (cause) { setError(exceptionText(cause)); }
  };
  const current = selected && file?.families[selected.familyIndex]?.positions[selected.rowIndex];
  const currentFamily = selected && file?.families[selected.familyIndex]?.family;

  const addPosition = (mode: "append" | "insert" | "free") => {
    if (!file || !unlocked || busy) return;
    try {
      const family = familyName.trim() || file.families[0]?.family;
      if (!family) throw new Error("Indica una familia para agregar la posición.");
      const slot = mode === "append" ? Math.max(0, ...positionRows(file).map((r) => r.position.to + 1))
        : positionDraft.trim() ? Number(positionDraft) : firstFreePosition(file);
      if (!Number.isSafeInteger(slot)) throw new Error("Indica una posición entera.");
      const next = mode === "insert"
        ? insertPositionSlot(file, family, slot, inheritRange)
        : addPositionDefinition(file, family, slot);
      const familyIndex = next.families.findIndex((f) => f.family === family);
      apply(next, mode === "insert" ? "Insertar y desplazar la numeración global"
        : "Agregar posición " + slot, mode === "insert",
        matchingRef(next, familyIndex, slot));
    } catch (cause) { setError(exceptionText(cause)); }
  };
  const move = (destination: number) => {
    if (!file || !current) return;
    try {
      const after = movePositionSlot(file, current.from, destination);
      apply(after, "Mover posición global " + current.from + " → " + destination,
        true, selected && matchingRef(after, selected.familyIndex, destination));
    } catch (cause) { setError(exceptionText(cause)); }
  };
  const remove = (closeSpace: boolean) => {
    if (!file || !selected || !current) return;
    if (!window.confirm("¿Eliminar " + positionLabel(current) + " de " + currentFamily
      + (closeSpace ? " y cerrar el espacio global?" : " sin cambiar los demás números?"))) return;
    try {
      const after = removePositionDefinition(file, selected, closeSpace);
      apply(after, closeSpace ? "Eliminar y cerrar numeración global" : "Eliminar definición",
        closeSpace, null);
    } catch (cause) { setError(exceptionText(cause)); }
  };
  const patchDefinition = (patch: Partial<PositionDefinition>, label: string) => {
    if (!file || !selected || !unlocked || busy) return;
    try {
      apply(updatePositionDefinition(file, selected, patch), label);
    } catch (cause) { setError(exceptionText(cause)); }
  };
  const editComponent = (index: number, patch: Partial<PositionComponent>) => {
    if (!current) return;
    patchDefinition({ components: current.components.map((c, i) =>
      i === index ? { ...c, ...patch } : c) }, "Componente actualizado");
  };
  const save = async () => {
    if (!file || !unlocked || busy || !dirty) return;
    const generation = editorAuth.current.generation;
    let saved: PositionsFile;
    let json: string;
    try {
      saved = markPositionsModified(normalizePositionsFile(file));
      json = serializePositionsFile(saved);
    } catch (cause) { setError(exceptionText(cause)); return; }
    setBusy(true); setError("");
    try {
      let destination = handle;
      if (!destination) {
        const picker = window as PositionsPickerWindow;
        if (!picker.showSaveFilePicker) {
          if (!authorized(generation)) throw new Error("Se cerró el candado durante el guardado.");
          downloadCopy(json);
          setNotice("Copia descargada. No se confirmó guardado en el archivo original.");
          return;
        }
        destination = await picker.showSaveFilePicker({
          id: "framelogic-positions-db", suggestedName: POSITIONS_FILE_NAME, types: fileTypes,
        });
      }
      if (!authorized(generation)) throw new Error("Se cerró el candado durante el guardado.");
      await writeAuthorizedPositionsFile(destination, json,
        destination === handle ? readText : null, () => authorized(generation));
      setHandle(destination);
      setRememberedHandle(destination);
      setNeedsAuth(false);
      setFile(saved); setReadText(json); setUndo([]); setRedo([]);
      const remembered = await storeCatalogFileHandle(POSITIONS_LOCAL_PATH,
        destination, POSITIONS_HANDLE_KEY);
      setNotice(remembered ? "POSITIONS.json guardado en el archivo autorizado."
        : "JSON guardado; no fue posible recordar el permiso del navegador.");
    } catch (cause) { if (!isAbort(cause)) setError(exceptionText(cause)); }
    finally { setBusy(false); }
  };
  const rows = useMemo(() => file ? positionRows(file) : [], [file]);
  const visible = useMemo(() => {
    const term = filter.toLocaleLowerCase().trim();
    return rows.filter((r) => !term || (r.family + " " + positionLabel(r.position)
      + " " + r.position.components.map((c) => c.code + " " + c.name).join(" "))
      .toLocaleLowerCase().includes(term));
  }, [rows, filter]);
  const usage = file && current ? usageAt(file, current.from) : null;

  const numberField = (label: string, value: number | null | undefined,
    onValue: (n: number | null) => void) => (
    <label key={label}>{label}
      <input type="number" step="any" value={value ?? ""}
        disabled={!unlocked || busy}
        onChange={(event) => {
          const raw = event.currentTarget.value;
          if (raw === "") { onValue(null); return; }
          const n = Number(raw);
          if (Number.isFinite(n)) onValue(n);
        }} />
    </label>
  );

  return (
    <section className="fl-positions" data-framelogic-positions-settings="true">
      <div className="fl-positions-route">
        <strong>Archivo en carpeta DB</strong>
        <code>{POSITIONS_LOCAL_PATH}</code>
        <div className="fl-positions-toolbar">
          <button type="button" disabled={busy} onClick={() => void selectJson()}>Seleccionar POSITIONS.json</button>
          {needsAuth && rememberedHandle && <button type="button" disabled={busy}
            onClick={() => void authorizeFile()}>Autorizar acceso</button>}
          <button type="button" disabled={!unlocked || busy} onClick={createNew}>Nuevo JSON</button>
          <button type="button" disabled={!file || busy} onClick={() => {
            if (!file) return;
            try { downloadCopy(serializePositionsFile(file)); setNotice("Copia descargada sin modificar el original."); }
            catch (cause) { setError(exceptionText(cause)); }
          }}>Descargar copia</button>
          <button type="button" disabled={!unlocked || !dirty || busy}
            onClick={() => void save()}>Guardar JSON</button>
        </div>
        <small>La ruta es una referencia: el navegador solo puede leer y guardar el archivo local
          cuando seleccionas el JSON y autorizas el acceso. No puede abrir D:\ directamente.
          Usa la carpeta DB existente; no se modifican otros JSON.</small>
        <input ref={fallback} hidden type="file" accept=".json,application/json"
          onChange={(event) => {
            const inputFile = event.currentTarget.files?.[0];
            if (inputFile) void loadSelectedFile(inputFile, null).catch((cause) => setError(exceptionText(cause)));
            event.currentTarget.value = "";
          }} />
      </div>
      {error && <div className="fl-positions-alert is-error" role="alert">{error}</div>}
      {notice && <div className="fl-positions-alert" role="status">{notice}</div>}
      <div className="fl-positions-meta">
        <strong>{unlocked ? "🔓 Edición" : "🔒 Solo lectura"} · {rows.length} definiciones
          · {file?.families.length ?? 0} familias {dirty ? "· Sin guardar" : ""}</strong>
        {file && <>
          <span>Versión: {file.version ?? "Sin registrar"}</span>
          <span>Fecha: {file.fecha_modificacion || "Sin registrar"}</span>
          <span>Usuario: {file.usuario_modificacion || "Sin registrar"}</span>
          {unlocked && (versionDraft !== null ? <>
            <input aria-label="Versión del archivo" value={versionDraft}
              onChange={(e) => setVersionDraft(e.currentTarget.value)} />
            <button type="button" onClick={() => {
              apply({ ...file, version: versionDraft }, "Versión actualizada");
              setVersionDraft(null);
            }}>Aplicar versión</button>
            <button type="button" onClick={() => setVersionDraft(null)}>Cancelar</button>
          </> : <button type="button" onClick={() => setVersionDraft(file.version ?? "1.0.0")}>
            Editar versión</button>)}
        </>}
      </div>
      {file && <>
        <div className="fl-positions-editbar">
          <label>Familia
            <input list="fl-positions-families" value={familyName}
              disabled={!unlocked || busy}
              onChange={(e) => setFamilyName(e.currentTarget.value)} />
            <datalist id="fl-positions-families">
              {file.families.map((f) => <option key={f.family} value={f.family} />)}
            </datalist>
          </label>
          <label>Número
            <input type="number" min="0" step="1" placeholder="Posición" value={positionDraft}
              disabled={!unlocked || busy} onChange={(e) => setPositionDraft(e.currentTarget.value)} />
          </label>
          <button type="button" disabled={!unlocked || busy} onClick={() => addPosition("append")}>
            Agregar al final</button>
          <button type="button" disabled={!unlocked || busy} onClick={() => addPosition("free")}>
            Agregar libre</button>
          <button type="button" disabled={!unlocked || busy} onClick={() => addPosition("insert")}>
            Insertar y desplazar</button>
          <label className="fl-positions-check">
            <input type="checkbox" checked={inheritRange} disabled={!unlocked || busy}
              onChange={(e) => setInheritRange(e.currentTarget.checked)} />
            Heredar rango</label>
        </div>
        <div className="fl-positions-editbar">
          <button type="button" disabled={!unlocked || busy || !undo.length}
            onClick={() => {
              const previous = undo[undo.length - 1];
              if (!previous || !file) return;
              setUndo(undo.slice(0, -1)); setRedo([...redo, file]);
              setFile(previous); setSelected(null);
            }}>Deshacer</button>
          <button type="button" disabled={!unlocked || busy || !redo.length}
            onClick={() => {
              const next = redo[redo.length - 1];
              if (!next || !file) return;
              setRedo(redo.slice(0, -1)); setUndo([...undo, file]);
              setFile(next); setSelected(null);
            }}>Rehacer</button>
          <button type="button" disabled={!unlocked || !current || busy || current.from === 0}
            onClick={() => { if (current) move(current.from - 1); }}>Subir posición</button>
          <button type="button" disabled={!unlocked || !current || busy}
            onClick={() => { if (current) move(current.from + 1); }}>Bajar posición</button>
          <label>Mover a
            <input type="number" min="0" step="1" value={targetDraft}
              disabled={!unlocked || !current || busy}
              onChange={(e) => setTargetDraft(e.currentTarget.value)} />
          </label>
          <button type="button" disabled={!unlocked || !current || !targetDraft || busy}
            onClick={() => move(Number(targetDraft))}>Mover</button>
          <button type="button" disabled={!unlocked || !current || busy}
            onClick={() => remove(false)}>Eliminar</button>
          <button type="button" disabled={!unlocked || !current || busy}
            onClick={() => remove(true)}>Eliminar y cerrar hueco</button>
        </div>
        <div className="fl-positions-filter">
          <input type="search" value={filter} placeholder="Buscar familia, posición, código o componente"
            onChange={(e) => setFilter(e.currentTarget.value)} />
          <span>{visible.length} resultados</span>
        </div>
        <div className="fl-positions-layout">
          <div className="fl-positions-grid" role="region" aria-label="Lista de posiciones" tabIndex={0}>
            <table>
              <thead><tr><th>Posición</th><th>Familia</th><th>Componentes</th><th>Estado</th></tr></thead>
              <tbody>{visible.map(({ family, familyIndex, rowIndex, position }) => {
                const selectedRow = selected?.familyIndex === familyIndex && selected?.rowIndex === rowIndex;
                const shared = overlapsOthers(file, { familyIndex, rowIndex })
                  || position.components.length > 1;
                return <tr key={familyIndex + ":" + rowIndex}
                  className={selectedRow ? "is-selected" : ""}
                  onClick={() => { setSelected({ familyIndex, rowIndex });
                    setFamilyName(family); setTargetDraft(String(position.from)); }}>
                  <td>{positionLabel(position)}</td>
                  <td>{family}</td><td>{position.components.length}</td>
                  <td>{shared ? "Compartida" : position.components.length ? "Normal" : "Sin piezas"}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="fl-positions-detail">
            {!current || !selected ? <p>Selecciona una posición para consultar o editar sus componentes.</p> : <>
              <h4>{currentFamily} · {positionLabel(current)}</h4>
              <p>{usage?.families.join(", ")} · {usage?.components ?? 0} componentes
                {usage?.overlap ? " · Rango o posición compartida" : ""}</p>
              <div className="fl-positions-range">
                {numberField("Desde", current.from, (v) => {
                  if (v !== null && Number.isInteger(v)) patchDefinition({ from: v }, "Inicio de rango actualizado");
                })}
                {numberField("Hasta", current.to, (v) => {
                  if (v !== null && Number.isInteger(v)) patchDefinition({ to: v }, "Final de rango actualizado");
                })}
              </div>
              <div className="fl-positions-detail-heading">
                <strong>Componentes ({current.components.length})</strong>
                <button type="button" disabled={!unlocked || busy} onClick={() => {
                  patchDefinition({ components: [...current.components, {
                    ...createComponent(), priority: current.components.length + 1,
                  }] }, "Nuevo componente");
                }}>+ Componente</button>
              </div>
              {current.components.map((component, index) =>
                <details key={index} open={index === 0}>
                  <summary>{component.priority}. {component.code || "(Sin código)"} · {component.name}</summary>
                  <div className="fl-positions-component">
                    <label>Código<input value={component.code} disabled={!unlocked || busy}
                      onChange={(e) => editComponent(index, { code: e.currentTarget.value })} /></label>
                    <label>Nombre<input value={component.name} disabled={!unlocked || busy}
                      onChange={(e) => editComponent(index, { name: e.currentTarget.value })} /></label>
                    {numberField("Prioridad", component.priority, (v) => {
                      if (v !== null && Number.isSafeInteger(v) && v >= 0)
                        editComponent(index, { priority: v });
                    })}
                    {(["lengthMm", "openingMinMm", "openingMaxMm", "angleMinDeg", "angleMaxDeg"] as const)
                      .map((key) => numberField(key, component[key], (v) => editComponent(index, { [key]: v })))}
                    <label>Observaciones<input value={component.notes ?? ""} disabled={!unlocked || busy}
                      onChange={(e) => editComponent(index, { notes: e.currentTarget.value || null })} /></label>
                    <label className="fl-positions-check">
                      <input type="checkbox" checked={component.active ?? true}
                        disabled={!unlocked || busy} onChange={(e) =>
                          editComponent(index, { active: e.currentTarget.checked })} />Activo</label>
                    <button type="button" disabled={!unlocked || busy}
                      onClick={() => patchDefinition({ components: current.components.filter((_, i) =>
                        i !== index) }, "Componente eliminado")}>Eliminar componente</button>
                  </div>
                </details>)}
            </>}
          </div>
        </div>
        <p className="fl-positions-warning">Los movimientos son globales para todas las familias
          del archivo. Las posiciones compartidas no se consideran errores automáticamente.
          Los archivos DECISIONS.json y RULES_CATALOG.json no se abren ni se actualizan:
          revisa sus referencias antes de utilizar una nueva numeración en producción.</p>
      </>}
    </section>
  );
}
