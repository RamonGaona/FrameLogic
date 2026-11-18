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
import {
  canReadFLPieceDirectory, authorizeFLPieceDirectory,
  rememberFLPieceDirectory, restoreFLPieceDirectory,
  indexChosenFLPieceFiles, type FLPieceDirectoryHandle,
} from "./flpieceDirectoryHandleStore";
import { ensureLineFLPieceDefinitions } from "./lineFLPieceAutoLoader";
import { planLinePositionFill } from "./linePositionFillPlanner";
import { insertLinePositionDemo } from "./linePositionInsertDemo";

interface DemoCatalogs {
  readonly positions: FlatPositionsFile;
  readonly db: FrameLogicCatalog;
}
interface FolderPickerWindow extends Window {
  showDirectoryPicker?: (options?: {id?: string; mode?: "read"}) =>
    Promise<FLPieceDirectoryHandle>;
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
/** Never request a browser permission silently on mount. */
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
const describeError = (error:unknown):string =>
  error instanceof Error ? error.message : String(error);
const wasCancelled = (error:unknown):boolean =>
  error instanceof DOMException && error.name==="AbortError";

export interface LineFillDemoToolProps {
  readonly coreRef: RefObject<PrecisionBimCoreInstance | null>;
  readonly onInstancesChanged: () => void;
}

/**
 * INSERTAR demo loads actual READY .flpiece geometry from a browser-authorized
 * folder. No placeholder meshes or imaginary manufacturing geometry are saved.
 */
export function LineFillDemoTool({ coreRef, onInstancesChanged }: LineFillDemoToolProps) {
  const filesInput = useRef<HTMLInputElement>(null);
  const pieceFilesInput = useRef<HTMLInputElement>(null);
  const onChangedRef = useRef(onInstancesChanged);
  onChangedRef.current = onInstancesChanged;
  const [catalogs, setCatalogs] = useState<DemoCatalogs | null>(null);
  const [loading, setLoading] = useState(false);
  const [armed, setArmed] = useState(false);
  const [scope, setScope] = useState<PositionActivationKey>("activo_general");
  const [folder, setFolder] = useState<FLPieceDirectoryHandle | null>(null);
  const [folderNeedsAuth, setFolderNeedsAuth] = useState(false);
  const [pieceFiles, setPieceFiles] = useState<File[]>([]);
  const [folderLabel, setFolderLabel] = useState(
    "Selecciona la carpeta FLPIECE (una vez) para cargar geometría real por código.",
  );
  const [status, setStatus] = useState(
    "Inserción de muestra: longitudes de DBFrameLogic.json y geometría real .flpiece.",
  );

  useEffect(() => {
    let active = true;
    void tryRememberedCatalogs().then(value => {
      if (active && value) {
        setCatalogs(value);
        setStatus("Catálogos disponibles. Selecciona FLPIECE y luego Insertar.");
      }
    }).catch(() => { /* user can choose both JSONs */ });
    void restoreFLPieceDirectory().then(async remembered => {
      if (!active || !remembered) return;
      const allowed = await canReadFLPieceDirectory(remembered);
      if (!active) return;
      setFolder(remembered);
      setFolderNeedsAuth(!allowed);
      setFolderLabel(allowed ? "Carpeta FLPIECE autorizada: " + remembered.name
        : "Carpeta recordada: " + remembered.name + ". Autoriza la lectura.");
    }).catch(() => { /* folder selection remains available */ });
    return () => { active = false; };
  }, []);

  async function selectFolder(): Promise<void> {
    if (armed || loading) return;
    const picker = window as FolderPickerWindow;
    if (!picker.showDirectoryPicker) {
      setFolderLabel("Este navegador no permite elegir carpetas. Usa «Elegir archivos .flpiece».");
      pieceFilesInput.current?.click();
      return;
    }
    try {
      // Picker needs a direct user activation, so call before other awaits.
      const selected = await picker.showDirectoryPicker({
        id:"framelogic-flpiece-library", mode:"read",
      });
      setFolder(selected);setFolderNeedsAuth(false);setPieceFiles([]);
      const remembered = await rememberFLPieceDirectory(selected);
      setFolderLabel("FLPIECE: " + selected.name
        + (remembered ? " · permiso recordado" : " · permiso solo para esta visita"));
      setStatus("Carpeta FLPIECE lista. Ahora pulsa Insertar y selecciona la línea.");
    } catch(error) { if(!wasCancelled(error))setStatus("Carpeta: "+describeError(error)); }
  }
  async function authorizeFolder(): Promise<void> {
    if (!folder) return;
    // Request in direct button handler; never on page load.
    const granted = await authorizeFLPieceDirectory(folder);
    setFolderNeedsAuth(!granted);
    if (granted) {
      setFolderLabel("FLPIECE autorizada: " + folder.name);
      setStatus("Acceso concedido; puedes insertar las piezas reales.");
    } else setStatus("No se concedió acceso a la carpeta FLPIECE.");
  }
  function onPieceFiles(event:ChangeEvent<HTMLInputElement>):void {
    const files = Array.from(event.currentTarget.files??[]);
    event.currentTarget.value="";
    try {
      const indexed=indexChosenFLPieceFiles(files);
      if (!indexed.size) throw new Error("No se seleccionaron archivos .flpiece válidos.");
      setPieceFiles([...indexed.values()]);
      setFolder(null);setFolderNeedsAuth(false);
      setFolderLabel(indexed.size+" archivos .flpiece seleccionados para esta sesión.");
      setStatus("Geometrías listas para cargar. Pulsa Insertar y elige la línea.");
    }catch(error){setStatus(describeError(error));}
  }
  function beginSelection(): void {
    const core = coreRef.current;
    if (!core) throw new Error("El motor 3D todavía no está disponible.");
    if (core.pieceFrameLogicWorkspace.editingInstanceId) {
      throw new Error("Vuelve al modelo antes de insertar una secuencia de piezas.");
    }
    if (folderNeedsAuth) throw new Error("Autoriza la carpeta FLPIECE antes de insertar.");
    core.cancelActiveCadCommand();
    core.cadLineSelection.clearSelection();
    setArmed(true);
    setStatus("Selecciona una línea CAD individual. Esc cancela.");
  }
  function onInsert(): void {
    if (armed) {
      setArmed(false);setStatus("Inserción cancelada.");
      return;
    }
    if (!catalogs) {
      setStatus("Selecciona juntos POSITIONS.json y DBFrameLogic.json (Ctrl+clic).");
      filesInput.current?.click();
      return;
    }
    try {beginSelection();}
    catch(error){setStatus(describeError(error));}
  }
  async function onFiles(event:ChangeEvent<HTMLInputElement>):Promise<void> {
    const files=Array.from(event.currentTarget.files??[]);
    event.currentTarget.value="";
    const positions=files.find(f=>f.name.toLowerCase()===POSITIONS_FILE_NAME.toLowerCase());
    const db=files.find(f=>f.name.toLowerCase()===CATALOG_LOCAL_FILE_NAME.toLowerCase());
    if(!positions||!db){
      setStatus("Selecciona POSITIONS.json y DBFrameLogic.json a la vez.");
      return;
    }
    setLoading(true);
    try{
      const loaded=await parseDemoCatalogs(positions,db);
      setCatalogs(loaded);
      setStatus("Catálogos leídos. Inserta con FLPIECE autorizada o archivos seleccionados.");
      beginSelection();
    }catch(error){setStatus("Error leyendo JSON: "+describeError(error));}
    finally{setLoading(false);}
  }

  useEffect(()=>{
    if(!armed||!catalogs)return;
    const core=coreRef.current;
    if(!core)return;
    let stopped=false,consumed=false;
    const unsubscribe=core.cadLineSelection.subscribe(ids=>{
      if(stopped||consumed||ids.length!==1)return;
      consumed=true;
      const lineId=ids[0]!;
      queueMicrotask(()=>{
        if(stopped)return;
        const line=core.designModel.cadLines.get(lineId);
        setArmed(false);
        if(!line){
          setStatus("Selecciona una línea CAD individual válida.");
          return;
        }
        void (async()=>{
          try{
            const plan=planLinePositionFill(line,catalogs.positions,catalogs.db,scope);
            const distinct=[...new Set(plan.segments.map(s=>s.code))];
            const info=[
              "Línea: "+plan.lineLengthMm.toFixed(1)+" mm",
              "Instancias reales a crear: "+plan.segments.length,
              "Archivos .flpiece distintos necesarios: "+distinct.join(", "),
              "Ocupación: "+plan.occupiedMm.toFixed(1)+" mm",
              "Resto: "+plan.remainingMm.toFixed(1)+" mm",
              plan.capped?"Límite de seguridad: 250 piezas.":"",
              "Se cargarán solo geometrías reales: no se crearán referencias naranjas.",
              "¿Confirmar la inserción?",
            ].filter(Boolean).join("\n");
            if(!window.confirm(info)){
              setStatus("Inserción cancelada; ninguna pieza fue creada.");
              return;
            }
            setLoading(true);
            const imported=await ensureLineFLPieceDefinitions(core,plan,{
              directory:folder,selectedFiles:pieceFiles,
            },setStatus);
            const placed=insertLinePositionDemo(core,plan,line.end,{
              requireRealGeometry:true,
            });
            onChangedRef.current();
            setStatus(
              "Insertadas "+placed.realPieces+" piezas 3D reales ("+
              imported.imported.length+" geometrías FLPIECE cargadas; "+
              imported.reused+" reutilizadas). 0 referencias temporales. "+
              "Restante: "+plan.remainingMm.toFixed(1)+" mm.",
            );
          }catch(error){
            setStatus("No se insertó la línea: "+describeError(error));
          }finally{setLoading(false);}
        })();
      });
    });
    const onEscape=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){
        setArmed(false);setStatus("Inserción cancelada.");
      }
    };
    window.addEventListener("keydown",onEscape);
    return()=>{
      stopped=true;unsubscribe();window.removeEventListener("keydown",onEscape);
    };
  },[armed,catalogs,scope,coreRef,folder,folderNeedsAuth,pieceFiles]);

  return <div data-framelogic-line-position-demo="true" style={{
    display:"inline-flex",alignItems:"center",gap:6,flexWrap:"wrap",
  }}>
    <button type="button" onClick={onInsert} disabled={loading}
      title="Inserta geometría 3D real desde archivos .flpiece siguiendo la dirección de una línea CAD">
      {armed?"Cancelar insertar":loading?"Cargando piezas...":"Insertar (demo)"}
    </button>
    <label style={{fontSize:11,color:"#dbe6ed"}}>
      Ámbito{" "}
      <select aria-label="Ámbito de posiciones" value={scope} disabled={armed||loading}
        onChange={e=>setScope(e.target.value as PositionActivationKey)}>
        <option value="activo_general">General</option>
        <option value="activo_proyecto">Proyecto</option>
        <option value="activo_puntal">Puntal</option>
      </select>
    </label>
    <button type="button" onClick={()=>void selectFolder()} disabled={loading||armed}
      title="Autorizar carpeta local D:\\Documents\\FrameLogic\\FLPIECE para leer .flpiece por código">
      Carpeta FLPIECE
    </button>
    {folderNeedsAuth&&folder&&<button type="button" onClick={()=>void authorizeFolder()}
      disabled={loading||armed}>Autorizar carpeta</button>}
    <button type="button" onClick={()=>pieceFilesInput.current?.click()}
      disabled={loading||armed} title="Alternativa: seleccionar varios archivos .flpiece">
      Elegir .flpiece
    </button>
    <span role="status" style={{maxWidth:370,fontSize:11,color:"#dbe6ed",lineHeight:1.3}}
      title={folderLabel}>{status}</span>
    <input type="file" multiple hidden ref={filesInput} accept=".json,application/json"
      aria-label="Seleccionar POSITIONS.json y DBFrameLogic.json"
      onChange={event=>{void onFiles(event);}}/>
    <input type="file" multiple hidden ref={pieceFilesInput} accept=".flpiece"
      aria-label="Seleccionar archivos .flpiece preparados"
      onChange={onPieceFiles}/>
  </div>;
}
