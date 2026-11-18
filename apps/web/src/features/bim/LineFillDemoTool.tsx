import { useEffect, useRef, useState, type RefObject } from "react";
import type { ChangeEvent } from "react";
import type { PrecisionBimCoreInstance } from "@framelogic/bim-core";
import {
  CATALOG_LOCAL_FILE_NAME, CATALOG_LOCAL_FILE_PATH,
  CATALOG_SOURCE_STORAGE_KEY, MAX_CATALOG_BYTES,
  parseFrameLogicCatalog, type FrameLogicCatalog,
} from "./settings/frameLogicCatalog";
import {
  POSITIONS_FILE_NAME, POSITIONS_HANDLE_KEY, POSITIONS_LOCAL_PATH,
  MAX_POSITIONS_BYTES, readPositionsDocument,
  type FlatPositionsFile, type PositionActivationKey,
} from "./settings/positionsFlatCatalog";
import {
  queryCatalogReadPermission, restoreCatalogFileHandle,
} from "./settings/catalogFileHandleStore";
import { planLinePositionFill } from "./linePositionFillPlanner";
import { insertLinePositionDemo } from "./linePositionInsertDemo";

interface DemoCatalogs {
  readonly positions: FlatPositionsFile;
  readonly db: FrameLogicCatalog;
}

async function parseDemoCatalogs(positions: File, db: File): Promise<DemoCatalogs> {
  if (positions.size > MAX_POSITIONS_BYTES || db.size > MAX_CATALOG_BYTES) {
    throw new Error("Uno de los JSON supera su límite de tamaño.");
  }
  const [positionsText, dbText] = await Promise.all([positions.text(), db.text()]);
  const doc = readPositionsDocument(positionsText);
  if (doc.kind !== "flat") {
    throw new Error("Convierte primero el catálogo antiguo desde Configuración → Posiciones.");
  }
  return { positions: doc.file, db: parseFrameLogicCatalog(dbText) };
}

function catalogDbRoute(): string {
  try {
    const saved = localStorage.getItem(CATALOG_SOURCE_STORAGE_KEY);
    if (saved && !saved.startsWith("http://") && !saved.startsWith("https://")
      && !saved.startsWith("/")) return saved;
  } catch { /* localStorage can be disabled */ }
  return CATALOG_LOCAL_FILE_PATH;
}

/** Silent reads only; browser file permissions are never requested on startup. */
async function tryRememberedCatalogs(): Promise<DemoCatalogs | null> {
  const [positions, db] = await Promise.all([
    restoreCatalogFileHandle(POSITIONS_LOCAL_PATH, POSITIONS_HANDLE_KEY),
    restoreCatalogFileHandle(catalogDbRoute()),
  ]);
  if (!positions || !db) return null;
  const [positionsPermission, dbPermission] = await Promise.all([
    queryCatalogReadPermission(positions), queryCatalogReadPermission(db),
  ]);
  if (positionsPermission !== "granted" || dbPermission !== "granted") return null;
  return parseDemoCatalogs(await positions.getFile(), await db.getFile());
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface LineFillDemoToolProps {
  readonly coreRef: RefObject<PrecisionBimCoreInstance | null>;
  readonly onInstancesChanged: () => void;
}

/**
 * Temporary Model Space experiment. The user clicks Insertar, then a native
 * CadLine. The selected line determines the axis and direction.
 */
export function LineFillDemoTool({ coreRef, onInstancesChanged }: LineFillDemoToolProps) {
  const filesInput = useRef<HTMLInputElement>(null);
  const cleanupReferences = useRef<(() => void) | null>(null);
  const [catalogs, setCatalogs] = useState<DemoCatalogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [armed, setArmed] = useState(false);
  const [scope, setScope] = useState<PositionActivationKey>("activo_general");
  const [status, setStatus] = useState("Inserción de muestra: usa POSITIONS.json y longitudes de DBFrameLogic.json.");

  useEffect(() => {
    let active = true;
    void tryRememberedCatalogs().then(value => {
      if (active && value) {
        setCatalogs(value);
        setStatus("Catálogos disponibles. Pulsa Insertar y selecciona una línea CAD.");
      }
    }).catch(() => {
      // If access was revoked, the user may select both files explicitly.
    });
    return () => {
      active = false;
      cleanupReferences.current?.();
    };
  }, []);

  function beginSelection(): void {
    const core = coreRef.current;
    if (!core) throw new Error("El motor 3D todavía no está disponible.");
    if (core.pieceFrameLogicWorkspace.editingInstanceId) {
      throw new Error("Vuelve al modelo antes de insertar una secuencia de piezas.");
    }
    core.cancelActiveCadCommand();
    core.cadLineSelection.clearSelection();
    setArmed(true);
    setStatus("Selecciona una línea CAD de Model Space; Esc cancela la inserción.");
  }

  function onInsert(): void {
    if (armed) {
      setArmed(false);
      setStatus("Inserción cancelada.");
      return;
    }
    if (!catalogs) {
      setStatus("Selecciona juntos POSITIONS.json y DBFrameLogic.json (Ctrl+clic).");
      filesInput.current?.click();
      return;
    }
    try { beginSelection(); }
    catch (error) { setStatus(describeError(error)); }
  }

  async function onFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    const positions = files.find(f => f.name.toLowerCase() === POSITIONS_FILE_NAME.toLowerCase());
    const db = files.find(f => f.name.toLowerCase() === CATALOG_LOCAL_FILE_NAME.toLowerCase());
    if (!positions || !db) {
      setStatus("Debes seleccionar juntos POSITIONS.json y DBFrameLogic.json.");
      return;
    }
    setLoading(true);
    try {
      const loaded = await parseDemoCatalogs(positions, db);
      setCatalogs(loaded);
      setStatus("Catálogos leídos (solo lectura). Ahora selecciona una línea CAD.");
      beginSelection();
    } catch (error) {
      setStatus("No se pudo cargar el catálogo: " + describeError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!armed || !catalogs) return;
    const core = coreRef.current;
    if (!core) return;
    let stopped = false;
    let consumed = false;
    const unsubscribe = core.cadLineSelection.subscribe(ids => {
      if (stopped || consumed || ids.length !== 1) return;
      const lineId = ids[0]!;
      consumed = true;
      queueMicrotask(() => {
        if (stopped) return;
        const line = core.designModel.cadLines.get(lineId);
        if (!line) {
          setStatus("Selecciona una línea CAD individual, no una referencia compacta.");
          setArmed(false);
          return;
        }
        try {
          const plan = planLinePositionFill(line, catalogs.positions, catalogs.db, scope);
          const info = [
            "Línea: " + plan.lineLengthMm.toFixed(1) + " mm",
            "Piezas en orden: " + plan.segments.length,
            "Ocupación: " + plan.occupiedMm.toFixed(1) + " mm",
            "Resto sin cubrir: " + plan.remainingMm.toFixed(1) + " mm",
            plan.capped ? "Límite de 250 piezas alcanzado." : "",
            "Las piezas sin geometría cargada se representarán TEMPORALMENTE.",
            "¿Confirmar inserción de muestra?",
          ].filter(Boolean).join("\n");
          if (!window.confirm(info)) {
            setStatus("Inserción cancelada; no se añadieron piezas.");
            setArmed(false);
            return;
          }
          const placed = insertLinePositionDemo(core, plan, line.end);
          cleanupReferences.current?.();
          cleanupReferences.current = placed.clearTemporaryReferences;
          onInstancesChanged();
          setStatus(
            "Insertadas " + placed.realPieces + " piezas reales; " +
            placed.temporaryReferences + " referencias visuales temporales (no se guardan). " +
            "Resto: " + plan.remainingMm.toFixed(1) + " mm." +
            (plan.capped ? " Límite de seguridad alcanzado." : ""),
          );
        } catch (error) {
          setStatus("Inserción no realizada: " + describeError(error));
        }
        setArmed(false);
      });
    });
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setArmed(false);
        setStatus("Inserción cancelada.");
      }
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      stopped = true;
      unsubscribe();
      window.removeEventListener("keydown", onEscape);
    };
  }, [armed, catalogs, scope, coreRef, onInstancesChanged]);

  return <div data-framelogic-line-position-demo="true" style={{
    display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap",
  }}>
    <button type="button" onClick={onInsert} disabled={loading}
      title="Demo: leer POSITIONS.json y DBFrameLogic.json; seleccionar línea CAD y colocar piezas por longitud">
      {armed ? "Cancelar insertar" : loading ? "Leyendo JSON..." : "Insertar (demo)"}
    </button>
    <label style={{fontSize: 11}}>
      Ámbito{" "}
      <select aria-label="Ámbito de posiciones" value={scope} disabled={armed||loading}
        onChange={event => setScope(event.target.value as PositionActivationKey)}>
        <option value="activo_general">General</option>
        <option value="activo_proyecto">Proyecto</option>
        <option value="activo_puntal">Puntal</option>
      </select>
    </label>
    <span role="status" style={{maxWidth: 270, fontSize: 10}}>{status}</span>
    <input type="file" multiple hidden ref={filesInput} accept=".json,application/json"
      aria-label="Seleccionar POSITIONS.json y DBFrameLogic.json"
      onChange={event => { void onFiles(event); }}/>
  </div>;
}
