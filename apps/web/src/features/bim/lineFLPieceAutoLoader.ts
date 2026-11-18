import { loadPieceVisualPackage, type PrecisionBimCoreInstance } from "@framelogic/bim-core";
import { OcctStepGeometryAdapter } from "./step/OcctStepGeometryAdapter";
import {
  decodeFrameLogicPieceGeometry, parseFrameLogicPiecePackage,
  type FrameLogicPiecePackage,
} from "./pieces/FrameLogicPiecePackage";
import type { LineFillPlan } from "./linePositionFillPlanner";
import type { FLPieceDirectoryHandle } from "./flpieceDirectoryHandleStore";
import {
  indexFLPieceDirectory, indexChosenFLPieceFiles,
} from "./flpieceDirectoryHandleStore";

const MAX_PIECE_FILE_SIZE = 30 * 1024 * 1024;
const codeKey = (code: string) => code.trim().toLocaleUpperCase();

export interface FLPieceImportSource {
  directory: FLPieceDirectoryHandle | null;
  selectedFiles: readonly File[];
}

async function getRequiredFiles(
  plan: LineFillPlan,
  core: PrecisionBimCoreInstance,
  source: FLPieceImportSource,
): Promise<Array<{code:string; file:File}>> {
  const needed = [...new Set(plan.segments.map(segment=>codeKey(segment.code)))];
  const pending = needed.filter(code => {
    const def = core.designModel.pieceDefinitions.getAll()
      .find(row=>codeKey(row.code)===code);
    return !def || !core.designScene.getAssetPrototype(def.geometryAssetId);
  });
  if (!pending.length) return [];
  const selected = indexChosenFLPieceFiles(source.selectedFiles);
  const directory = source.directory
    ? await indexFLPieceDirectory(source.directory) : new Map();
  const result: Array<{code:string;file:File}> = [];
  for (const code of pending) {
    const file = selected.get(code) ?? await directory.get(code)?.getFile();
    if (!file) throw new Error("Falta " + code + ".flpiece. Selecciona la carpeta FLPIECE "
      + "o carga los archivos de pieza que aparecen en la secuencia.");
    if (file.size > MAX_PIECE_FILE_SIZE)
      throw new Error(file.name + " supera el límite de seguridad de 30 MB.");
    result.push({code,file});
  }
  return result;
}

interface ValidatedPiece {
  code: string;
  piece: FrameLogicPiecePackage;
}
async function preflightPieces(
  sources: Array<{code:string;file:File}>,
): Promise<ValidatedPiece[]> {
  const validated:ValidatedPiece[]=[];
  for (const source of sources) {
    const piece = parseFrameLogicPiecePackage(await source.file.text());
    if (codeKey(piece.definition.code) !== source.code) {
      throw new Error("El archivo " + source.file.name + " contiene el código "
        + piece.definition.code + "; se esperaba " + source.code + ".");
    }
    validated.push({code:source.code,piece});
  }
  return validated;
}

function restorePieceMetadata(
  core: PrecisionBimCoreInstance, definitionId: string, piece: FrameLogicPiecePackage,
): void {
  const registry = core.designModel.pieceDefinitions;
  registry.updateCoordinateSystem(definitionId,piece.definition.coordinateSystem,false);
  for(const snap of piece.definition.snapPoints) {
    registry.addSnapPoint(definitionId,{
      id:snap.id,name:snap.name,type:snap.type,
      position:{...snap.position},relatedAxisId:snap.relatedAxisId,
    });
  }
  for(const axis of piece.definition.referenceGeometry.axisLines) {
    registry.addReferenceAxisLine(definitionId,{
      id:axis.id,name:axis.name,type:axis.type,
      origin:{...axis.origin},direction:{...axis.direction},length:axis.length,
    });
  }
  core.engineeringModel.pieces.upsert({
    pieceDefinitionId:definitionId,
    revision:piece.engineering.revision, material:piece.engineering.material,
    commercial:piece.engineering.commercial,physical:piece.engineering.physical,
    structuralAxis:piece.engineering.structuralAxis,features:piece.engineering.features,
  });
  core.geometryQuery.clearCache();
}

/**
 * Imports only missing geometry definitions: no preliminary instance at 0,0,0.
 * Uses the same master STEP/IFC + optional GLB visual cache as "Abrir pieza".
 * Preflights every code/file before mutating the model.
 *
 * An import failure may leave previously loaded definitions available for retry,
 * but never creates any line instances or temporary placeholder geometry.
 */
export async function ensureLineFLPieceDefinitions(
  core: PrecisionBimCoreInstance,
  plan: LineFillPlan,
  source: FLPieceImportSource,
  progress?: (message: string)=>void,
): Promise<{ imported: string[]; reused: number }> {
  const needed=[...new Set(plan.segments.map(segment=>codeKey(segment.code)))];
  const sources=await getRequiredFiles(plan,core,source);
  const validated=await preflightPieces(sources);
  const imported:string[]=[];
  for(const {code,piece} of validated) {
    const duplicate=core.designModel.pieceDefinitions.getAll()
      .find(def=>codeKey(def.code)===code);
    if (duplicate) {
      if (!core.designScene.getAssetPrototype(duplicate.geometryAssetId))
        throw new Error("Existe una definición sin geometría para " + code
          + ". Repara esa pieza antes de ejecutar la inserción.");
      continue;
    }
    progress?.("Cargando geometría real " + code + ".flpiece...");
    const bytes=decodeFrameLogicPieceGeometry(piece);
    const identity={
      code:piece.definition.code,name:piece.definition.name,
      classification:piece.definition.classification,tags:[...piece.definition.tags],
    };
    let definition: {id:string;geometryAssetId:string};
    if (piece.geometry.format==="STEP") {
      let visuals:Awaited<ReturnType<typeof loadPieceVisualPackage>>|undefined;
      if (piece.visualRepresentations) {
        try { visuals=await loadPieceVisualPackage(piece.visualRepresentations,bytes); }
        catch(error) {console.warn("FrameLogic: cache visual inválida; usando STEP original",error);}
      }
      try{
        const document=await new OcctStepGeometryAdapter().load(bytes,{
          sourceFileName:piece.geometry.fileName,
          cachedVisuals:visuals,targetUnit:"meter",includeExactFeatures:true,
        });
        const importedPiece=core.importStepPiece(document,identity);
        definition=importedPiece.definition;
        if(visuals){
          const prototype=core.designScene.getAssetPrototype(definition.geometryAssetId);
          if(prototype)visuals.install(prototype);
        }
      }catch(error){visuals?.dispose();throw error;}
    } else {
      const file=new File([bytes],piece.geometry.fileName,{type:"application/octet-stream"});
      const importedPiece=await core.importDesignPieceIfc(file,identity);
      definition=importedPiece.definition;
    }
    restorePieceMetadata(core,definition.id,piece);
    if(!core.designScene.getAssetPrototype(definition.geometryAssetId))
      throw new Error("No se pudo registrar la geometría de " + code);
    imported.push(code);
  }
  return {imported,reused:needed.length-imported.length};
}
