import * as THREE from "three";
import type { DesignModel, CadLine, CadPoint } from "@framelogic/domain";
import type { DesignSceneController } from "../design/DesignSceneController";
import type { CadLineSceneController } from "../design/CadLineSceneController";
import type { CadPointSceneController } from "../design/CadPointSceneController";
import type { CadPolyline, CadPolylineRegistryController } from "../design/CadPolylineRegistryController";
import type { DesignSelectionController } from "./DesignSelectionController";
import type { CadHistoryController } from "./CadHistoryController";
import { PieceMoveCopySession } from "./PieceMoveCopySession";
import { copyCadReferenceBlocks } from "../import/CadReferenceCopyTransaction";

export interface UnifiedCadSelection {
  readonly pieceIds: readonly string[];
  readonly assemblyIds: readonly string[];
  readonly lineIds: readonly string[];
  readonly pointIds: readonly string[];
  readonly referenceNames: readonly string[];
}
export interface UnifiedCadCopyContext {
  readonly model: DesignModel;
  readonly designScene: DesignSceneController;
  readonly lineScene: CadLineSceneController;
  readonly pointScene: CadPointSceneController;
  readonly polylines: CadPolylineRegistryController;
  readonly designSelection: DesignSelectionController;
  readonly history: CadHistoryController;
  readonly onCopiedAssemblySelection?: (ids: readonly string[]) => void;
  readonly clearCache?: () => void;
}
type Action = { undo: () => void; redo: () => void };
const add = (v: { x:number;y:number;z:number }, offset: THREE.Vector3) =>
  ({ x: v.x+offset.x, y: v.y+offset.y, z: v.z+offset.z });

function expandWholePolylines(ctx: UnifiedCadCopyContext, ids: readonly string[]): string[] {
  const result = new Set(ids);
  for (const id of ids) {
    const polyline = ctx.polylines.findByLineId(id);
    if (polyline) for (const segment of polyline.segments) result.add(segment.lineId);
  }
  return [...result];
}
function makeNativeCadCopies(
  ctx: UnifiedCadCopyContext,
  originalLineIds: readonly string[],
  originalPointIds: readonly string[],
  delta: THREE.Vector3,
): Action | null {
  const lines: CadLine[] = [];
  const points: CadPoint[] = [];
  const polylines: CadPolyline[] = [];
  const mapping = new Map<string, string>();
  const selected = expandWholePolylines(ctx, originalLineIds);
  const sourcePolylineIds = new Set<string>();
  try {
    for (const id of selected) {
      const line = ctx.model.cadLines.get(id);
      if (!line) throw new Error(`Línea CAD no encontrada: ${id}`);
      const copy = ctx.model.registerCadLine({
        layerId: line.layerId, start: add(line.start, delta), end: add(line.end, delta),
      });
      lines.push(copy);
      mapping.set(id, copy.id);
      const owner = ctx.polylines.findByLineId(id);
      if (owner) sourcePolylineIds.add(owner.id);
    }
    for (const id of [...new Set(originalPointIds)]) {
      const point = ctx.model.cadPoints.get(id);
      if (!point) throw new Error(`Punto CAD no encontrado: ${id}`);
      points.push(ctx.model.registerCadPoint({
        layerId: point.layerId, position: add(point.position, delta),
      }));
    }
    for (const id of sourcePolylineIds) {
      const parent = ctx.polylines.get(id);
      if (!parent || !parent.segments.every(s => mapping.has(s.lineId))) continue;
      polylines.push(ctx.polylines.register({
        layerId: parent.layerId, closed: parent.closed,
        segments: parent.segments.map(s => ({
          lineId: mapping.get(s.lineId)!, reversed: s.reversed,
        })),
      }));
    }
  } catch (error) {
    for (const p of polylines) ctx.polylines.remove(p.id);
    for (const p of points) ctx.model.removeCadPoint(p.id);
    for (const l of lines) ctx.model.removeCadLine(l.id);
    ctx.lineScene.sync(); ctx.pointScene.sync();
    throw error;
  }
  if (!lines.length && !points.length) return null;
  const undo = () => {
    for (const p of polylines) ctx.polylines.remove(p.id);
    for (const p of points) ctx.model.removeCadPoint(p.id);
    for (const l of lines) ctx.model.removeCadLine(l.id);
    ctx.lineScene.sync(); ctx.pointScene.sync();
  };
  const redo = () => {
    for (const l of lines) if (!ctx.model.cadLines.get(l.id)) ctx.model.registerCadLine({
      id: l.id, layerId: l.layerId, start: {...l.start}, end: {...l.end},
    });
    for (const p of points) if (!ctx.model.cadPoints.get(p.id)) ctx.model.registerCadPoint({
      id: p.id, layerId: p.layerId, position: {...p.position},
    });
    for (const p of polylines) if (!ctx.polylines.get(p.id)) ctx.polylines.register({
      id: p.id, layerId: p.layerId, closed: p.closed,
      segments: p.segments.map(s => ({ ...s })),
    });
    ctx.lineScene.sync(); ctx.pointScene.sync();
  };
  ctx.lineScene.sync(); ctx.pointScene.sync();
  return { undo, redo };
}

/**
 * One COPY for mixed 3D pieces/assemblies, native CAD lines/points and
 * full DWG/DXF reference blocks. Source geometry is never transformed.
 * Every component supplies reversible operations; one history entry wraps all.
 */
export function copyUnifiedCadSelection(
  ctx: UnifiedCadCopyContext,
  selection: UnifiedCadSelection,
  delta: THREE.Vector3,
): number {
  if (![delta.x,delta.y,delta.z].every(Number.isFinite) || delta.lengthSq() <= 1e-18) {
    throw new Error("El destino COPY debe ser diferente del punto base.");
  }
  const names = [...new Set(selection.referenceNames)];
  const referenceLayers = new Set(ctx.model.layers.getAll()
    .filter(layer => names.some(name => layer.name.startsWith(`CAD ${name} · `)))
    .map(layer => layer.id));
  // A line/point selected directly and also through a full DWG block must
  // be duplicated exactly once, as part of its parent reference.
  const lineIds = [...new Set(selection.lineIds)].filter(id => {
    const line = ctx.model.cadLines.get(id);
    return line && !referenceLayers.has(line.layerId);
  });
  const pointIds = [...new Set(selection.pointIds)].filter(id => {
    const point = ctx.model.cadPoints.get(id);
    return point && !referenceLayers.has(point.layerId);
  });
  const pieceIds = [...new Set(selection.pieceIds)];
  if (!pieceIds.length && !lineIds.length && !pointIds.length && !names.length)
    throw new Error("Selecciona una o varias piezas, líneas, puntos o referencias CAD.");
  const actions: Action[] = [];
  const fakeHistory = {
    recordOperation: (_name: string, undo: () => void, redo: () => void) => {
      actions.push({ undo, redo });
    },
  } as unknown as CadHistoryController;
  let pieceSession: PieceMoveCopySession | null = null;
  let total = 0;
  try {
    // Create copies before any source manipulation. Preserve assembly structure.
    if (pieceIds.length) {
      pieceSession = new PieceMoveCopySession(
        ctx.model, ctx.designScene, ctx.designSelection, fakeHistory,
        pieceIds, selection.assemblyIds, ctx.onCopiedAssemblySelection,
      );
      for (const id of pieceSession.ids) {
        const piece = ctx.model.pieceInstances.get(id);
        if (!piece) throw new Error("No existe la copia de la pieza.");
        ctx.model.pieceInstances.updateTransform(id, {
          position: add(piece.transform.position, delta),
          rotation: {...piece.transform.rotation},
        });
      }
      ctx.designScene.sync();
      pieceSession.finish(true); // source selection stays, one deferred undo/redo
      total += pieceIds.length;
      pieceSession = null;
    }
    const nativeAction = makeNativeCadCopies(ctx, lineIds, pointIds, delta);
    if (nativeAction) {
      actions.push(nativeAction);
      total += lineIds.length + pointIds.length;
    }
    if (names.length) {
      const result = copyCadReferenceBlocks(ctx.model, fakeHistory, names, delta,
        () => {ctx.lineScene.sync();ctx.pointScene.sync();});
      total += result.referenceNames.length;
    }
    // Commit just once after all types have succeeded.
    ctx.history.recordOperation("COPY MIXED", () => {
      for (const action of [...actions].reverse()) action.undo();
      ctx.clearCache?.();
    }, () => {
      for (const action of actions) action.redo();
      ctx.clearCache?.();
    });
    ctx.clearCache?.();
    return total;
  } catch (error) {
    pieceSession?.cancel();
    for (const action of [...actions].reverse()) {
      try { action.undo(); } catch { /* Preserve original transaction error. */ }
    }
    ctx.clearCache?.();
    throw error;
  }
}
