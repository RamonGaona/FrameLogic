import * as THREE from "three";
import {
  CAD_TEXT_ANCHOR_PREFIX,
  isCadTextAnchorId,
  type CadReferenceTextAnnotation,
  type CadReferenceTextSceneController,
} from "../design/CadReferenceTextSceneController";
import type { CadLine, CadPoint, DesignLayer, DesignModel } from "@framelogic/domain";
import type { CadHistoryController } from "../interaction/CadHistoryController";

interface CadReferenceCopySnapshot {
  readonly layers: readonly DesignLayer[];
  readonly lines: readonly CadLine[];
  readonly points: readonly CadPoint[];
  readonly packed: readonly { id: string; layerId: string; positions: Float64Array; transform?: readonly number[]; sourceId: string }[];
  readonly referenceNames: readonly string[];
}
export interface CadReferenceCopyResult {
  readonly referenceNames: readonly string[];
  readonly lineIds: readonly string[];
  readonly pointIds: readonly string[];
}

/** The imported reference identity is stored in its own "CAD name · layer" layers.
 * Clones receive NEW layer and entity IDs so originals never move or share ownership.
 */
const PREFIX = "CAD ";
const SEPARATOR = " · ";
function parseLayer(name: string): { reference: string; source: string } | null {
  if (!name.startsWith(PREFIX)) return null;
  const value = name.slice(PREFIX.length);
  const index = value.indexOf(SEPARATOR);
  if (index <= 0) return null;
  const reference = value.slice(0, index).trim();
  const source = value.slice(index + SEPARATOR.length).trim();
  return reference && source ? { reference, source } : null;
}
const moved = (point: {x: number; y: number; z: number}, delta: THREE.Vector3) =>
  ({ x: point.x + delta.x, y: point.y + delta.y, z: point.z + delta.z });

function restore(model: DesignModel, snapshot: CadReferenceCopySnapshot): void {
  for (const layer of snapshot.layers) {
    if (!model.layers.get(layer.id)) model.layers.create({
      id: layer.id, name: layer.name, color: layer.color,
      visible: layer.visible, locked: false, snapEnabled: layer.snapEnabled,
    });
  }
  for (const line of snapshot.lines) {
    if (!model.cadLines.get(line.id)) model.registerCadLine({
      id: line.id, layerId: line.layerId,
      start: { ...line.start }, end: { ...line.end },
    });
  }
  for (const point of snapshot.points) {
    if (!model.cadPoints.get(point.id)) model.registerCadPoint({
      id: point.id, layerId: point.layerId, position: { ...point.position },
    });
  }
  for (const packet of snapshot.packed) {
    if (model.cadLines.getPackedBatches().some(p => p.id === packet.id)) continue;
    if (model.cadLines.getPackedBatches().some(p => p.id === packet.sourceId)) {
      model.cadLines.registerPackedCopy(
        packet.id, packet.layerId, packet.sourceId,
        packet.transform ?? new THREE.Matrix4().elements,
      );
    } else {
      model.cadLines.registerPackedBatch(packet);
    }
  }
  // Layer protection must be restored only after its geometry exists.
  for (const layer of snapshot.layers) {
    if (layer.locked) model.layers.update(layer.id, { locked: true });
  }
}
function remove(model: DesignModel, snapshot: CadReferenceCopySnapshot): void {
  model.cadLines.removePackedByLayerIds(new Set(snapshot.layers.map(layer => layer.id)));
  for (const line of snapshot.lines) model.removeCadLine(line.id);
  for (const point of snapshot.points) model.removeCadPoint(point.id);
  for (const layer of snapshot.layers) model.layers.remove(layer.id);
}

/**
 * Atomic COPY of one or several full DWG/DXF reference blocks.
 * No source-layer mutation, no copy of only part of a reference.
 * Each invocation registers one reversible history entry.
 */
export function copyCadReferenceBlocks(
  model: DesignModel,
  history: Pick<CadHistoryController, "recordOperation">,
  selectedNames: readonly string[],
  delta: THREE.Vector3,
  sync: () => void,
  textScene?: CadReferenceTextSceneController,
): CadReferenceCopyResult {
  if (![delta.x, delta.y, delta.z].every(Number.isFinite))
    throw new Error("El desplazamiento COPY DWG/DXF no es válido.");
  if (delta.lengthSq() <= 1e-18) throw new Error("Selecciona un punto destino diferente al origen.");
  const originals = model.layers.getAll();
  const occupied = new Set(originals.flatMap(layer => {
    const parsed = parseLayer(layer.name);
    return parsed ? [parsed.reference.toLowerCase()] : [];
  }));
  const layers: DesignLayer[] = [];
  const lines: CadLine[] = [];
  const points: CadPoint[] = [];
  const packed: Array<{ id: string; layerId: string; positions: Float64Array; transform?: readonly number[]; sourceId: string }> = [];
  const sourcePackets = model.cadLines.getPackedBatches();
  const referenceNames: string[] = [];
  const layerIdMap = new Map<string, string>();
  const pointIdMap = new Map<string, string>();
  const createdTexts: CadReferenceTextAnnotation[] = [];
  const selected = [...new Set(selectedNames)];
  if (!selected.length) throw new Error("Selecciona un DWG/DXF antes de COPY.");
  try {
    for (const name of selected) {
      const originalsForName = originals.filter(layer => parseLayer(layer.name)?.reference === name);
      if (!originalsForName.length) throw new Error(`La referencia CAD "${name}" no existe.`);
      let n = 1;
      let newName = `${name} copia ${n}`;
      while (occupied.has(newName.toLowerCase())) {
        newName = `${name} copia ${++n}`;
      }
      occupied.add(newName.toLowerCase());
      referenceNames.push(newName);
      for (const original of originalsForName) {
        const sourceName = parseLayer(original.name)!.source;
        const createdLayer = model.layers.create({
          name: `${PREFIX}${newName}${SEPARATOR}${sourceName}`,
          color: original.color, visible: original.visible,
          locked: false, snapEnabled: original.snapEnabled,
        });
        layers.push({ ...createdLayer, locked: original.locked });
        layerIdMap.set(original.id, createdLayer.id);
        for (const source of sourcePackets) {
          if (source.layerId !== original.id) continue;
          const transform = new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z)
            .multiply(source.transform
              ? new THREE.Matrix4().fromArray(source.transform) : new THREE.Matrix4());
          const id = crypto.randomUUID();
          model.cadLines.registerPackedCopy(id, createdLayer.id, source.id, transform.elements);
          packed.push({ id, layerId: createdLayer.id, positions: source.positions,
            transform: transform.toArray(), sourceId: source.id });
        }
        for (const old of model.cadLines.findByLayerId(original.id)) {
          const created = model.registerCadLine({
            layerId: createdLayer.id,
            start: moved(old.start, delta), end: moved(old.end, delta),
          });
          lines.push(created);
        }
        for (const old of model.cadPoints.findByLayerId(original.id)) {
          const created = model.registerCadPoint({
            id: isCadTextAnchorId(old.id)
              ? `${CAD_TEXT_ANCHOR_PREFIX}${crypto.randomUUID()}` : undefined,
            layerId: createdLayer.id, position: moved(old.position, delta),
          });
          points.push(created);
          pointIdMap.set(old.id, created.id);
        }
      }
    }
    if (!lines.length && !points.length && !packed.length) {
      throw new Error("La referencia no contiene geometría CAD que pueda copiarse.");
    }
    // Copy glyph annotations together with their three transformable CAD
    // anchors; COPYBASE, repeated Ctrl+MOVE and Undo/Redo preserve labels.
    for (const source of textScene?.getAnnotations() ?? []) {
      const layerId = layerIdMap.get(source.layerId);
      const originPointId = pointIdMap.get(source.originPointId);
      const axisXPointId = pointIdMap.get(source.axisXPointId);
      const axisYPointId = pointIdMap.get(source.axisYPointId);
      if (layerId && originPointId && axisXPointId && axisYPointId) {
        createdTexts.push({
          ...source, id: crypto.randomUUID(), layerId,
          originPointId, axisXPointId, axisYPointId,
        });
      }
    }
    textScene?.addAnnotations(createdTexts);
    // Add all children before reenabling locked source-layer settings.
    for (const layer of layers) {
      if (layer.locked) model.layers.update(layer.id, { locked: true });
    }
    const snapshot: CadReferenceCopySnapshot = {
      layers, lines, points, packed, referenceNames,
    };
    sync();
    history.recordOperation("COPY DWG/DXF",
      () => {
        textScene?.removeAnnotations(createdTexts.map(x => x.id));
        remove(model, snapshot); sync();
      },
      () => {
        restore(model, snapshot);
        textScene?.addAnnotations(createdTexts);
        sync();
      },
    );
    return { referenceNames, lineIds: lines.map(x => x.id), pointIds: points.map(x => x.id) };
  } catch (error) {
    textScene?.removeAnnotations(createdTexts.map(x => x.id));
    remove(model, { layers, lines, points, packed, referenceNames });
    sync();
    throw error;
  }
}
