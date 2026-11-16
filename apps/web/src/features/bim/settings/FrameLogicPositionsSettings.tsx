import { useEffect, useMemo, useRef, useState } from "react";
import { writeAuthorizedPositionsFile } from "./positionsFileWriter";
import {
  queryCatalogReadPermission, requestCatalogReadPermission,
  restoreCatalogFileHandle, storeCatalogFileHandle,
  type CatalogFileHandle,
} from "./catalogFileHandleStore";
import {
  POSITIONS_FILE_NAME, POSITIONS_HANDLE_KEY, POSITIONS_LOCAL_PATH, MAX_POSITIONS_BYTES,
  type FlatPositionsFile, type PositionItem, type PositionsDocument,
  cloneFlat, closeGlobalSlotFlat, combineFlatRanges, duplicateFlatItem,
  formatPositionRange, freeFamilies,
  insertFlatItem, insertGlobalSlotFlat, markFlatPositionsModified,
  migrateLegacyPositions, moveGlobalRangeFlat, newFlatPositionsFile,
  readPositionRange, readPositionsDocument, serializeFlatPositionsFile,
  sharedPositionFlags,
  splitFlatRange,
  updateFlatItem, validateFlatPositionsFile,
} from "./positionsFlatCatalog";
import {
  CATALOG_LOCAL_FILE_PATH, CATALOG_LOCAL_FILE_NAME, CATALOG_SOURCE_STORAGE_KEY,
  MAX_CATALOG_BYTES, parseFrameLogicCatalog,
} from "./frameLogicCatalog";
import { indexCatalogNames, resolveCatalogName } from "./positionsCatalogNames";
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
const types = [{ description: "Posiciones FrameLogic", accept: { "application/json": [".json"] } }];
const errorMessage = (e:unknown) => e instanceof Error ? e.message : String(e);
const aborted = (e:unknown) => e instanceof DOMException && e.name==="AbortError";
function downloadText(text:string, name=POSITIONS_FILE_NAME){
  const url=URL.createObjectURL(new Blob([text],{type:"application/json;charset=utf-8"}));
  const link=document.createElement("a");
  link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const cellKey=(row:PositionItem)=>JSON.stringify(row);

/** Spreadsheet-style POSITIONS v2 editor; families are arbitrary user-entered labels. */
export interface FrameLogicPositionsSettingsProps {
  unlocked:boolean;
  onDirtyChange?:(dirty:boolean)=>void;
}
export function FrameLogicPositionsSettings({unlocked,onDirtyChange}:FrameLogicPositionsSettingsProps){
  const [file,setFile]=useState<FlatPositionsFile|null>(null);
  const [legacy,setLegacy]=useState<PositionsDocument|null>(null);
  const [readText,setReadText]=useState<string|null>(null);
  const [handle,setHandle]=useState<CatalogFileHandle|null>(null);
  const [rememberedHandle,setRememberedHandle]=useState<CatalogFileHandle|null>(null);
  const [needsAuth,setNeedsAuth]=useState(false);
  const [selected,setSelected]=useState<number|null>(null);
  const [filter,setFilter]=useState("");
  const [insertAt,setInsertAt]=useState("");
  const [moveTo,setMoveTo]=useState("");
  const [splitAt,setSplitAt]=useState("");
  const [versionDraft,setVersionDraft]=useState<string|null>(null);
  const [undo,setUndo]=useState<FlatPositionsFile[]>([]);
  const [redo,setRedo]=useState<FlatPositionsFile[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const fallback=useRef<HTMLInputElement>(null);
  const dbFallback=useRef<HTMLInputElement>(null);
  const dbRequest=useRef(0);
  const [dbNames,setDbNames]=useState<Map<string,string|null>|null>(null);
  const [dbHandle,setDbHandle]=useState<CatalogFileHandle|null>(null);
  const [dbNeedsAuth,setDbNeedsAuth]=useState(false);
  const [dbMessage,setDbMessage]=useState("DBFrameLogic.json no cargada.");
  const [dbError,setDbError]=useState("");
  const [dbBusy,setDbBusy]=useState(false);
  const requestId=useRef(0);
  const lock=useRef({unlocked,generation:0});
  if(lock.current.unlocked!==unlocked){
    lock.current={unlocked,generation:lock.current.generation+1};
  }
  const authorized=(generation:number)=>
    lock.current.unlocked && lock.current.generation===generation;
  const dirty=useMemo(()=>{
    if(!file)return false;
    if(readText===null)return true;
    try{
      const old=readPositionsDocument(readText);
      // An older flat file may still include schemaVersion: 2. Mark it as
      // unsaved so Guardar JSON can remove that field without altering items.
      const hasObsoleteSchema = Object.prototype.hasOwnProperty.call(JSON.parse(readText), "schemaVersion");
      return old.kind!=="flat" || hasObsoleteSchema || JSON.stringify(old.file)!==JSON.stringify(file);
    }catch{return true;}
  },[file,readText]);
  useEffect(()=>onDirtyChange?.(dirty),[dirty,onDirtyChange]);
  useEffect(()=>{
    if(!dirty)return;
    const beforeUnload=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};
    window.addEventListener("beforeunload",beforeUnload);
    return()=>window.removeEventListener("beforeunload",beforeUnload);
  },[dirty]);
  useEffect(()=>{if(!unlocked)setVersionDraft(null);},[unlocked]);

  const dbRoute=():string=>{
    try {
      const saved=localStorage.getItem(CATALOG_SOURCE_STORAGE_KEY);
      return saved && !/^https?:\\/\\//i.test(saved) && !saved.startsWith("/")
        ? saved : CATALOG_LOCAL_FILE_PATH;
    } catch { return CATALOG_LOCAL_FILE_PATH; }
  };

  // Names are a read-only projection from the separate DBFrameLogic.json file.
  // No fields from the DB are ever written to POSITIONS.json.
  const loadNames=async(dbFile:File,sourceHandle:CatalogFileHandle|null,remember=false)=>{
    if(dbFile.name.toLocaleLowerCase()!==CATALOG_LOCAL_FILE_NAME.toLocaleLowerCase())
      throw new Error("Selecciona DBFrameLogic.json, no otro archivo.");
    if(dbFile.size>MAX_CATALOG_BYTES)throw new Error("DBFrameLogic.json supera 5 MB.");
    const id=++dbRequest.current;
    setDbBusy(true);setDbError("");
    try {
      const text=await dbFile.text();
      const names=indexCatalogNames(parseFrameLogicCatalog(text));
      if(id!==dbRequest.current)return;
      setDbNames(names);setDbHandle(sourceHandle);setDbNeedsAuth(false);
      setDbMessage("DBFrameLogic.json cargada: "+names.size+" códigos disponibles.");
      if(remember && sourceHandle){
        const saved=await storeCatalogFileHandle(dbRoute(),sourceHandle);
        if(id===dbRequest.current&&!saved){
          setDbMessage("Base de datos cargada; el navegador no pudo recordar el acceso.");
        }
      }
    }finally{if(id===dbRequest.current)setDbBusy(false);}
  };
  const reloadRememberedNames=async(requestAccess=false)=>{
    try{
      const existing=await restoreCatalogFileHandle(dbRoute());
      if(!existing){
        setDbNeedsAuth(false);
        setDbMessage("Base de datos no recordada. Selecciona DBFrameLogic.json.");
        return;
      }
      setDbHandle(existing);
      const permission=requestAccess
        ? await requestCatalogReadPermission(existing)
        : (await queryCatalogReadPermission(existing))==="granted";
      if(!permission && existing.queryPermission){
        setDbNeedsAuth(true);
        setDbMessage("DBFrameLogic.json necesita permiso de lectura.");
        return;
      }
      await loadNames(await existing.getFile(),existing);
    }catch(cause){
      setDbNames(null);
      setDbError(errorMessage(cause));
      setDbNeedsAuth(true);
    }
  };
  useEffect(()=>{
    void reloadRememberedNames();
    return()=>{dbRequest.current+=1;};
    // One silent attempt on mount, without requesting browser permissions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const selectNamesFile=async()=>{
    const picker=window as PositionsPickerWindow;
    try{
      if(!picker.showOpenFilePicker){dbFallback.current?.click();return;}
      const [chosen]=await picker.showOpenFilePicker({
        id:"framelogic-db-json",multiple:false,types,
      });
      if(chosen)await loadNames(await chosen.getFile(),chosen,true);
    }catch(cause){if(!aborted(cause))setDbError(errorMessage(cause));}
  };

  const loadLocal=async(picked:File,pickedHandle:CatalogFileHandle|null,remember=true)=>{
    if(picked.size>MAX_POSITIONS_BYTES)throw new Error("El archivo excede 10 MB.");
    const id=++requestId.current;
    setBusy(true);
    try{
      const text=await picked.text();
      const doc=readPositionsDocument(text);
      if(id!==requestId.current)return;
      setFile(doc.kind==="flat"?doc.file:null);
      setLegacy(doc.kind==="legacy"?doc:null);
      setReadText(text);setHandle(pickedHandle);
      setRememberedHandle(pickedHandle);setNeedsAuth(false);
      setSelected(doc.kind==="flat"&&doc.file.items.length?0:null);
      setUndo([]);setRedo([]);setFilter("");setVersionDraft(null);setError("");
      if(pickedHandle&&remember){
        const remembered=await storeCatalogFileHandle(POSITIONS_LOCAL_PATH,pickedHandle,POSITIONS_HANDLE_KEY);
        if(id!==requestId.current)return;
        setNotice(remembered?"Archivo recordado.":"Archivo cargado, pero no se pudo recordar el permiso.");
      }else{
        setNotice(doc.kind==="legacy"
          ?"Formato anterior detectado. Descarga una copia antes de migrar."
          :"Archivo cargado; las familias son texto libre.");
      }
    }finally{if(id===requestId.current)setBusy(false);}
  };
  useEffect(()=>{
    const id=++requestId.current;
    void(async()=>{
      try{
        const saved=await restoreCatalogFileHandle(POSITIONS_LOCAL_PATH,POSITIONS_HANDLE_KEY);
        if(id!==requestId.current||!saved)return;
        setRememberedHandle(saved);
        const status=await queryCatalogReadPermission(saved);
        if(id!==requestId.current)return;
        if(status==="granted"||!saved.queryPermission){
          try{await loadLocal(await saved.getFile(),saved,false);}
          catch{setNeedsAuth(true);}
        }else setNeedsAuth(true);
      }catch(cause){if(id===requestId.current)setError(errorMessage(cause));}
    })();
    return()=>{requestId.current+=1;};
    // Load only once; permissions are never requested without a user click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  const canReplace=()=>!dirty||window.confirm("¿Descartar los cambios de posiciones sin guardar?");
  const selectLocal=async()=>{
    if(!canReplace())return;
    const picker=window as PositionsPickerWindow;
    try{
      if(!picker.showOpenFilePicker){fallback.current?.click();return;}
      const [picked]=await picker.showOpenFilePicker({
        id:"framelogic-positions-db",multiple:false,types,
      });
      if(picked)await loadLocal(await picked.getFile(),picked);
    }catch(cause){if(!aborted(cause))setError(errorMessage(cause));}
  };
  const authorizeLocal=async()=>{
    if(!rememberedHandle)return;
    try{
      const granted=await requestCatalogReadPermission(rememberedHandle);
      if(!granted)throw new Error("Acceso no autorizado.");
      await loadLocal(await rememberedHandle.getFile(),rememberedHandle,false);
    }catch(cause){setNeedsAuth(true);setError(errorMessage(cause));}
  };
  const newFile=()=>{
    if(!unlocked||busy||!canReplace())return;
    requestId.current++;
    setFile(newFlatPositionsFile());setLegacy(null);setReadText(null);
    setHandle(null);setSelected(null);setUndo([]);setRedo([]);
    setVersionDraft(null);setError("");setNotice("Nuevo POSITIONS.json de tres campos por pieza.");
  };
  const migrate=()=>{
    if(!unlocked||!legacy||legacy.kind!=="legacy"||busy)return;
    if(!window.confirm("El esquema anterior contiene prioridades, medidas y restricciones "
      +"que NO existirán en el nuevo POSITIONS.json. Se descargará una copia integral "
      +"del original y luego se generará la tabla de tres campos. "
      +"No se sobrescribirá el archivo hasta pulsar Guardar JSON. ¿Continuar?"))return;
    try{
      const converted=migrateLegacyPositions(legacy.file);
      downloadText(legacy.originalText,"POSITIONS_respaldo_v1.json");
      setFile(converted);setLegacy(null);setSelected(converted.items.length?0:null);
      setUndo([]);setRedo([]);
      setError("");
      setNotice("Migración en memoria. Respaldo descargado. Revisa filas y familias antes de guardar.");
    }catch(cause){setError(errorMessage(cause));}
  };
  const apply=(next:FlatPositionsFile,label:string,confirm=false,nextSelected?:number|null)=>{
    if(!unlocked||busy||!file)return;
    try{
      validateFlatPositionsFile(next);
      serializeFlatPositionsFile(next);
      if(JSON.stringify(file)===JSON.stringify(next))return;
      if(confirm&&!window.confirm(label+"\n\nLa numeración afecta todas las piezas "
        +"y puede cambiar rangos. Las referencias externas no se actualizan. ¿Aplicar?"))return;
      setUndo(previous=>[...previous.slice(-49),file]);
      setRedo([]);setFile(next);
      if(nextSelected!==undefined)setSelected(nextSelected);
      setError("");setNotice(label+" · Sin guardar");
    }catch(cause){setError(errorMessage(cause));}
  };
  const commitCell=(index:number,column:"posicion"|"codigo"|"familias",raw:string):boolean=>{
    if(!file||!unlocked)return false;
    try{
      let change:Partial<PositionItem>;
      if(column==="posicion"){
        const {from,to}=readPositionRange(raw);
        change={posicion:formatPositionRange(from,to)};
      }else if(column==="codigo"){
        change={codigo:raw.trim()};
      }else change={familias:freeFamilies(raw)};
      const next=updateFlatItem(file,index,change);
      if(column==="posicion" && JSON.stringify(next)!==JSON.stringify(file)
        && !window.confirm("Cambiar la posición de esta pieza no renumerará las demás. "
          +"¿Confirmar la nueva posición?")) return false;
      const label=column==="familias"?"Familias de la pieza":column==="codigo"?"Código de la pieza":"Posición";
      apply(next,label+" actualizado",false,index);
      return true;
    }catch(cause){setError(errorMessage(cause));return false;}
  };
  const availableCode=()=>{
    const existing=new Set(file?.items.map(x=>x.codigo.toLocaleUpperCase())??[]);
    let i=1,code="";
    do{code="NUEVO_"+String(i++).padStart(4,"0");}while(existing.has(code));
    return code;
  };
  const addRow=(shift:boolean)=>{
    if(!file||!unlocked||busy)return;
    try{
      const max=Math.max(-1,...file.items.map(x=>readPositionRange(x.posicion).to));
      const slot=shift ? Number(insertAt) : max+1;
      if(!Number.isSafeInteger(slot)||slot<0)
        throw new Error("Indica una posición entera no negativa.");
      const item={codigo:availableCode(),familias:[]};
      const next=shift?insertGlobalSlotFlat(file,slot,item):
        insertFlatItem(file,{posicion:slot,...item});
      apply(next,shift?"Insertar y desplazar números globales":"Agregar nueva pieza",
        shift,next.items.length-1);
    }catch(cause){setError(errorMessage(cause));}
  };
  const active=selected===null?null:file?.items[selected]??null;
  const moveRow=(target:number)=>{
    if(!file||!active)return;
    try{
      const {from,to}=readPositionRange(active.posicion);
      const next=moveGlobalRangeFlat(file,from,to,target);
      const nextIndex=next.items.findIndex(row=>row.codigo===active.codigo
        && readPositionRange(row.posicion).from===target);
      apply(next,"Mover bloque global "+from+"–"+to+" → "+target,
        true,nextIndex>=0?nextIndex:null);
    }catch(cause){setError(errorMessage(cause));}
  };
  const removeRow=(close:boolean)=>{
    if(!file||selected===null||!active||!unlocked||busy)return;
    if(!window.confirm("¿Eliminar "+active.codigo+(close?" y cerrar el espacio global":"")
      +"?"))return;
    try{
      const next=close?closeGlobalSlotFlat(file,selected):
        {...cloneFlat(file),items:file.items.filter((_,i)=>i!==selected)};
      apply(next,close?"Eliminar y renumerar":"Eliminar pieza",close,null);
    }catch(cause){setError(errorMessage(cause));}
  };
  const moveVisual=(direction:-1|1)=>{
    if(!file||selected===null||!file.items[selected+direction])return;
    const next=cloneFlat(file);
    const item=next.items[selected]!;
    next.items[selected]=next.items[selected+direction]!;
    next.items[selected+direction]=item;
    apply(next,"Reordenar filas sin cambiar posiciones",false,selected+direction);
  };
  const save=async()=>{
    if(!file||!unlocked||busy||!dirty||versionDraft!==null)return;
    const generation=lock.current.generation;
    let saved:FlatPositionsFile,json:string;
    try{
      saved=markFlatPositionsModified(validateFlatPositionsFile(file));
      json=serializeFlatPositionsFile(saved);
    }catch(cause){setError(errorMessage(cause));return;}
    setBusy(true);setError("");
    try{
      let destination=handle;
      if(!destination){
        const picker=window as PositionsPickerWindow;
        if(!picker.showSaveFilePicker){
          if(!authorized(generation))throw new Error("El candado se cerró.");
          downloadText(json);
          setNotice("Copia descargada. El original no fue modificado.");
          return;
        }
        destination=await picker.showSaveFilePicker({
          id:"framelogic-positions-db",suggestedName:POSITIONS_FILE_NAME,types,
        });
      }
      if(!authorized(generation))throw new Error("El candado se cerró.");
      await writeAuthorizedPositionsFile(destination,json,destination===handle?readText:null,
        ()=>authorized(generation));
      setFile(saved);setReadText(json);setHandle(destination);
      setRememberedHandle(destination);setNeedsAuth(false);setUndo([]);setRedo([]);
      const remembered=await storeCatalogFileHandle(
        POSITIONS_LOCAL_PATH,destination,POSITIONS_HANDLE_KEY);
      setNotice(remembered?"POSITIONS.json guardado.":"JSON guardado; permiso no recordado.");
    }catch(cause){if(!aborted(cause))setError(errorMessage(cause));}
    finally{setBusy(false);}
  };
  const matches=useMemo(()=>{
    if(!file)return [];
    const q=filter.toLocaleLowerCase().trim();
    return file.items.map((row,index)=>({row,index})).filter(({row})=>
      !q||(String(row.posicion)+" "+row.codigo+" "+row.familias.join(" ")
        +" "+(resolveCatalogName(dbNames,row.codigo).state==="resolved"
          ?resolveCatalogName(dbNames,row.codigo).label:""))
        .toLocaleLowerCase().includes(q));
  },[file,filter,dbNames]);
  const shared=useMemo(()=>file?sharedPositionFlags(file):[],[file]);
  const showDuplicates=shared.some(Boolean);
  return <section className="fl-positions" data-framelogic-positions-settings="true">
    <div className="fl-positions-route">
      <strong>Posiciones · carpeta DB</strong>
      <code>{POSITIONS_LOCAL_PATH}</code>
      <div className="fl-positions-toolbar">
        <button type="button" disabled={busy} onClick={()=>void selectLocal()}>Seleccionar POSITIONS.json</button>
        {needsAuth&&rememberedHandle&&<button type="button" disabled={busy}
          onClick={()=>void authorizeLocal()}>Autorizar acceso</button>}
        <button type="button" disabled={!unlocked||busy} onClick={newFile}>Nuevo JSON</button>
        <button type="button" disabled={!file&&!legacy||busy} onClick={()=>{
          if(readText&&legacy?.kind==="legacy")downloadText(readText,"POSITIONS_respaldo_v1.json");
          else if(file)downloadText(serializeFlatPositionsFile(file));
        }}>Descargar copia</button>
        <button type="button" disabled={!unlocked||!file||!dirty||busy||versionDraft!==null}
          onClick={()=>void save()}>Guardar JSON</button>
      </div>
      <small>Una fila por código y posición. Las familias se escriben libremente, separadas por comas;
        internamente son una lista. El código se relacionará después con DBFrameLogic.json.
        La ruta local necesita permiso del navegador: no se abre automáticamente solo con escribirla.</small>
      <input ref={fallback} type="file" hidden accept=".json,application/json"
        onChange={e=>{
          const picked=e.currentTarget.files?.[0];
          if(picked)void loadLocal(picked,null).catch(cause=>setError(errorMessage(cause)));
          e.currentTarget.value="";
        }}/>
    </div>
    <div className="fl-positions-db-source" data-framelogic-positions-db-link="true">
      <div>
        <strong>Nombre del ítem · DBFrameLogic.json</strong>
        <small>{dbMessage} Los nombres son de solo lectura y no se guardan en POSITIONS.json.</small>
      </div>
      <div className="fl-positions-toolbar">
        <button type="button" disabled={dbBusy} onClick={()=>void selectNamesFile()}>
          Seleccionar DBFrameLogic.json
        </button>
        {dbNeedsAuth&&dbHandle&&<button type="button" disabled={dbBusy}
          onClick={()=>void reloadRememberedNames(true)}>Autorizar DB</button>}
        <button type="button" disabled={dbBusy}
          onClick={()=>void reloadRememberedNames()}>Actualizar nombres</button>
      </div>
      {dbError&&<small role="alert" className="fl-positions-db-error">{dbError}</small>}
      <input type="file" ref={dbFallback} hidden accept=".json,application/json"
        onChange={e=>{
          const chosen=e.currentTarget.files?.[0];
          if(chosen)void loadNames(chosen,null).catch(cause=>setDbError(errorMessage(cause)));
          e.currentTarget.value="";
        }}/>
    </div>
    {error&&<div className="fl-positions-alert is-error" role="alert">{error}</div>}
    {notice&&<div className="fl-positions-alert" role="status">{notice}</div>}
    {legacy?.kind==="legacy"&&<div className="fl-positions-alert">
      <strong>Formato anterior de posiciones</strong>
      <p>Este archivo agrupa componentes por familias y guarda también medidas y prioridades.
        Para convertirlo al modelo de tres campos debes guardar un respaldo; la conversión descarta
        esas propiedades antiguas, no modifica DBFrameLogic.json.</p>
      <button type="button" disabled={!unlocked||busy} onClick={migrate}>
        Descargar respaldo y migrar a tres campos
      </button>
    </div>}
    {file&&<>
      <div className="fl-positions-meta">
        <strong>{unlocked?"🔓 Edición":"🔒 Solo lectura"} · {file.items.length} piezas
          {dirty?" · Cambios sin guardar":""}</strong>
        <span>Posición · Código · Familias</span>
        <span data-framelogic-positions-version="true">
          Versión JSON: {file.version ?? "Sin registrar (1.0.0 al guardar)"}
        </span>
        <span data-framelogic-positions-modified-at="true">
          Última modificación: {file.fecha_modificacion || "Sin registrar"}
        </span>
        <span data-framelogic-positions-modified-by="true">
          Modificado por: {file.usuario_modificacion || "(vacío)"}
        </span>
        {unlocked && (file.version === undefined ||
            file.fecha_modificacion === undefined || file.usuario_modificacion === undefined) && (
          <button type="button" disabled={busy}
            onClick={() => apply({
              ...file,
              version: file.version ?? "1.0.0",
              fecha_modificacion: file.fecha_modificacion ?? "",
              usuario_modificacion: "",
            }, "Metadatos inicializados")}>
            Completar metadatos
          </button>
        )}
        {unlocked&&(versionDraft!==null ? <>
          <input aria-label="Versión del JSON" value={versionDraft}
            onChange={e=>setVersionDraft(e.currentTarget.value)}/>
          <button type="button" onClick={()=>{
            if(versionDraft===null)return;
            try{apply(validateFlatPositionsFile({...file,version:versionDraft}),
              "Versión actualizada");setVersionDraft(null);}
            catch(cause){setError(errorMessage(cause));}
          }}>Aplicar versión</button>
          <button type="button" onClick={()=>setVersionDraft(null)}>Cancelar</button>
        </> : <button type="button" onClick={()=>setVersionDraft(file.version??"1.0.0")}>
          Editar versión</button>)}
      </div>
      <div className="fl-positions-editbar">
        <button type="button" disabled={!unlocked||busy} onClick={()=>addRow(false)}>
          + Agregar pieza</button>
        <label>Insertar en
          <input type="number" min="0" step="1" value={insertAt}
            onChange={e=>setInsertAt(e.currentTarget.value)} disabled={!unlocked||busy}
            placeholder="N.º"/></label>
        <button type="button" disabled={!unlocked||busy||!insertAt.trim()}
          onClick={()=>addRow(true)}>Insertar y desplazar</button>
        <button type="button" disabled={!unlocked||busy||!undo.length} onClick={()=>{
          const past=undo[undo.length-1];
          if(!past)return;
          setUndo(undo.slice(0,-1));setRedo([...redo,file]);setFile(past);setSelected(null);
        }}>Deshacer</button>
        <button type="button" disabled={!unlocked||busy||!redo.length} onClick={()=>{
          const future=redo[redo.length-1];
          if(!future)return;
          setRedo(redo.slice(0,-1));setUndo([...undo,file]);setFile(future);setSelected(null);
        }}>Rehacer</button>
      </div>
      <div className="fl-positions-editbar">
        <button type="button" disabled={!unlocked||busy||selected===null||selected===0}
          onClick={()=>moveVisual(-1)}>↑ Fila</button>
        <button type="button" disabled={!unlocked||busy||selected===null||
            selected===file.items.length-1} onClick={()=>moveVisual(1)}>↓ Fila</button>
        <button type="button" disabled={!unlocked||busy||!active} onClick={()=>{
          if(!active)return;
          const r=readPositionRange(active.posicion);
          if(r.from>0)moveRow(r.from-1);
        }}>Subir número</button>
        <button type="button" disabled={!unlocked||busy||!active} onClick={()=>{
          if(!active)return;
          moveRow(readPositionRange(active.posicion).from+1);
        }}>Bajar número</button>
        <label>Mover a
          <input type="number" min="0" step="1" disabled={!unlocked||busy||!active}
            value={moveTo} onChange={e=>setMoveTo(e.currentTarget.value)}
            placeholder="N.º"/></label>
        <button type="button" disabled={!unlocked||busy||!active||!moveTo.trim()}
          onClick={()=>moveRow(Number(moveTo))}>Mover número</button>
        <button type="button" disabled={!unlocked||busy||!active||selected===null}
          onClick={()=>{
            if(!file||selected===null)return;
            try{const next=duplicateFlatItem(file,selected);
              apply(next,"Duplicar pieza y su lista de familias",true,selected+1);}
            catch(cause){setError(errorMessage(cause));}
          }}>Duplicar fila</button>
        <label>Dividir en
          <input type="number" min="0" step="1" value={splitAt}
            disabled={!unlocked||busy||!active} onChange={e=>setSplitAt(e.currentTarget.value)}/>
        </label>
        <button type="button" disabled={!unlocked||busy||!active||selected===null||!splitAt.trim()}
          onClick={()=>{
            if(!file||selected===null)return;
            try{apply(splitFlatRange(file,selected,Number(splitAt)),
              "Dividir rango en dos filas",true,selected);}
            catch(cause){setError(errorMessage(cause));}
          }}>Dividir rango</button>
        <button type="button" disabled={!unlocked||busy||!active||selected===null}
          onClick={()=>{
            if(!file||selected===null)return;
            try{const next=combineFlatRanges(file,selected);
              apply(next,"Combinar rangos contiguos",true,next.items.length-1);}
            catch(cause){setError(errorMessage(cause));}
          }}>Combinar rangos</button>
        <button type="button" disabled={!unlocked||busy||!active} onClick={()=>removeRow(false)}>
          Eliminar</button>
        <button type="button" disabled={!unlocked||busy||!active} onClick={()=>removeRow(true)}>
          Eliminar y cerrar hueco</button>
      </div>
      <div className="fl-positions-filter">
        <input type="search" value={filter} onChange={e=>setFilter(e.currentTarget.value)}
          placeholder="Buscar posición, código o familia"/>
        <span>{matches.length} filas {showDuplicates?"· Hay posiciones compartidas":""}</span>
      </div>
      <div className="fl-positions-grid" role="region"
        aria-label="Hoja de posiciones, códigos y familias editables" tabIndex={0}>
        <table className="fl-positions-excel">
          <thead><tr><th>N.º</th><th>Posición</th><th>Código del ítem</th>
            <th>Nombre</th><th>Familias del ítem (texto libre)</th><th title="Compartida indica posiciones o rangos superpuestos">Estado</th></tr></thead>
          <tbody>{matches.map(({row,index})=><tr key={index}
            className={selected===index?"is-selected":""}
            onClick={()=>setSelected(index)}>
            <td>{index+1}</td>
            <td><input aria-label={"Posición fila "+(index+1)}
              key={"p"+index+cellKey(row)}
              defaultValue={String(row.posicion)} disabled={!unlocked||busy}
              onBlur={e=>{if(!commitCell(index,"posicion",e.currentTarget.value))
                e.currentTarget.value=String(row.posicion);}}
              onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}/></td>
            <td><input aria-label={"Código fila "+(index+1)}
              key={"c"+index+cellKey(row)}
              defaultValue={row.codigo} disabled={!unlocked||busy}
              onBlur={e=>{if(!commitCell(index,"codigo",e.currentTarget.value))
                e.currentTarget.value=row.codigo;}}
              onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}/></td>
            <td className={"fl-positions-name fl-positions-name--"
                +resolveCatalogName(dbNames,row.codigo).state}
              title={"Nombre obtenido de DBFrameLogic.json para "+row.codigo}>
              {resolveCatalogName(dbNames,row.codigo).label}
            </td>
            <td><input aria-label={"Familias fila "+(index+1)}
              key={"f"+index+cellKey(row)}
              defaultValue={row.familias.join(", ")} disabled={!unlocked||busy}
              placeholder="Escribe: Familia A, Familia B"
              onBlur={e=>{if(!commitCell(index,"familias",e.currentTarget.value))
                e.currentTarget.value=row.familias.join(", ");}}
              onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur();}}/></td>
            <td className="fl-positions-status">
              {shared[index]?
                <span title="Otro ítem utiliza una posición que coincide">Compartida</span>
                : "Única"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="fl-positions-warning">
        Estado «Única» significa sin solapamientos numéricos; «Compartida»
        significa que otro ítem utiliza esa posición o parte del rango.
        Este estado no valida el código contra DBFrameLogic.json.
        Al cambiar una posición no se altera ninguna otra base de datos.
        Si el mismo código aparece en varias posiciones o familias, se conservan sus filas.
        Las posiciones compartidas se resaltan para revisión, sin bloquear usos válidos.
      </p>
    </>}
  </section>;
}
