import * as THREE from "three";
import type { CadLine, CadPoint, DesignLayer, DesignModel } from "@framelogic/domain";
import type { CadHistoryController } from "../interaction/CadHistoryController";

interface CadReferenceCopySnapshot {
  readonly layers: readonly DesignLayer[];
  readonly lines: readonly CadLine[];
  readonly points: readonly CadPoint[];
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
  // Layer protection must be restored only after its geometry exists.
  for (const layer of snapshot.layers) {
    if (layer.locked) model.layers.update(layer.id, { locked: true });
  }
}
function remove(model: DesignModel, snapshot: CadReferenceCopySnapshot): void {
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
  const referenceNames: string[] = [];
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
        for (const old of model.cadLines.findByLayerId(original.id)) {
          const created = model.registerCadLine({
            layerId: createdLayer.id,
            start: moved(old.start, delta), end: moved(old.end, delta),
          });
          lines.push(created);
        }
        for (const old of model.cadPoints.findByLayerId(original.id)) {
          const created = model.registerCadPoint({
            layerId: createdLayer.id, position: moved(old.position, delta),
          });
          points.push(created);
        }
      }
    }
    if (!lines.length && !points.length) {
      throw new Error("La referencia no contiene geometría CAD que pueda copiarse.");
    }
    // Add all children before reenabling locked source-layer settings.
    for (const layer of layers) {
      if (layer.locked) model.layers.update(layer.id, { locked: true });
    }
    const snapshot: CadReferenceCopySnapshot = {
      layers, lines, points, referenceNames,
    };
    sync();
    history.recordOperation("COPY DWG/DXF",
      () => { remove(model, snapshot); sync(); },
      () => { restore(model, snapshot); sync(); },
    );
    return { referenceNames, lineIds: lines.map(x => x.id), pointIds: points.map(x => x.id) };
  } catch (error) {
    remove(model, { layers, lines, points, referenceNames });
    sync();
    throw error;
  }
}
