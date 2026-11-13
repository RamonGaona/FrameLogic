import * as THREE from "three";
import type { DesignModel } from "@framelogic/domain";

/**
 * CAD references often contain tens of thousands of individual segments after
 * nested AutoCAD INSERTs are expanded. They are editable as ONE reference and
 * should NOT produce one WebGL draw call and THREE.Line object per segment.
 *
 * Imported reference lines remain in DesignModel (selection, snapping, history,
 * save, MOVE/ROTATE and COPYBASE still operate on exact CAD geometry). The
 * rendering is aggregated into one LineSegments draw call PER imported layer.
 * Native/editable CAD lines keep their individual THREE.Line objects.
 */
function isImportedReferenceLayer(name: string | undefined): boolean {
  return Boolean(name?.startsWith("CAD ") && name.includes(" · "));
}

export class CadLineSceneController {
  private readonly scene: THREE.Scene;
  private readonly designModel: DesignModel;
  private readonly lineObjects = new Map<string, THREE.Line>();
  private readonly referenceBatches = new Map<string, THREE.LineSegments>();
  private readonly afterSyncListeners = new Set<() => void>();
  private readonly selectedIds = new Set<string>();
  private readonly hiddenIds = new Set<string>();

  constructor(scene: THREE.Scene, designModel: DesignModel) {
    this.scene = scene;
    this.designModel = designModel;
  }

  getLineObject(id: string): THREE.Line | undefined {
    return this.lineObjects.get(id);
  }

  getLineObjects(): THREE.Line[] {
    return [
      ...this.lineObjects.values(),
      ...this.referenceBatches.values(),
    ];
  }

  /** Per-entity entries are intentionally only native CAD lines. */
  getLineEntries(): Array<[string, THREE.Line]> {
    return [...this.lineObjects.entries()];
  }

  /** Used by the layer-colour bridge, without duplicating CAD reference geometry. */
  getReferenceBatchEntries(): Array<[string, THREE.LineSegments]> {
    return [...this.referenceBatches.entries()];
  }

  getReferenceBatchCount(): number {
    return this.referenceBatches.size;
  }

  /** CAD reference labels track MOVE/ROTATE/Undo through existing point anchors. */
  onSync(callback: () => void): () => void {
    this.afterSyncListeners.add(callback);
    return () => { this.afterSyncListeners.delete(callback); };
  }

  isHidden(id: string): boolean {
    return this.hiddenIds.has(id);
  }

  setHidden(id: string, hidden: boolean): void {
    if (hidden) this.hiddenIds.add(id);
    else this.hiddenIds.delete(id);
    if (this.lineObjects.has(id)) this.applyVisibility(id);
    else if (this.designModel.cadLines.get(id)) this.sync();
  }

  setSelectedIds(ids: readonly string[]): void {
    this.selectedIds.clear();
    for (const id of ids) this.selectedIds.add(id);
    this.updateSelectionAppearance();
  }

  sync(): void {
    const nativeIds = new Set<string>();
    const referenceGroups = new Map<string, {
      origin: { x: number; y: number; z: number };
      count: number;
      offset: number;
      positions: Float32Array;
    }>();

    // Two cheap registry walks, no 1.4m-element getAll() snapshot or another
    // million-element array of CAD line objects per reference layer.
    // Store only counts first, then allocate exactly one compact GPU buffer
    // for each layer.
    for (const line of this.designModel.cadLines.values()) {
      const layer = this.designModel.layers.get(line.layerId);
      if (!isImportedReferenceLayer(layer?.name)) {
        nativeIds.add(line.id);
        continue;
      }
      if (this.hiddenIds.has(line.id)) continue;
      const current = referenceGroups.get(line.layerId);
      if (current) current.count++;
      else referenceGroups.set(line.layerId, {
        origin: line.start, count: 1, offset: 0, positions: new Float32Array(),
      });
    }

    for (const group of referenceGroups.values()) {
      group.positions = new Float32Array(group.count * 6);
    }

    // An imported line is never rendered as an individual THREE.Line.
    for (const [id, object] of this.lineObjects) {
      if (nativeIds.has(id)) continue;
      this.scene.remove(object);
      object.geometry.dispose();
      this.disposeMaterial(object.material);
      this.lineObjects.delete(id);
      this.hiddenIds.delete(id);
    }

    for (const line of this.designModel.cadLines.values()) {
      const group = referenceGroups.get(line.layerId);
      if (group && !this.hiddenIds.has(line.id)
        && isImportedReferenceLayer(this.designModel.layers.get(line.layerId)?.name)) {
        const offset = group.offset;
        const origin = group.origin;
        group.positions[offset] = line.start.x - origin.x;
        group.positions[offset + 1] = line.start.y - origin.y;
        group.positions[offset + 2] = line.start.z - origin.z;
        group.positions[offset + 3] = line.end.x - origin.x;
        group.positions[offset + 4] = line.end.y - origin.y;
        group.positions[offset + 5] = line.end.z - origin.z;
        group.offset += 6;
        continue;
      }
      if (!nativeIds.has(line.id)) continue;
      let object = this.lineObjects.get(line.id);
      if (!object) {
        object = new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial(),
        );
        object.name = `CadLine:${line.id}`;
        object.userData = { frameLogic: { entityType: "CadLine", lineId: line.id } };
        this.scene.add(object);
        this.lineObjects.set(line.id, object);
      }
      object.geometry.setFromPoints([
        new THREE.Vector3(line.start.x, line.start.y, line.start.z),
        new THREE.Vector3(line.end.x, line.end.y, line.end.z),
      ]);
      object.geometry.computeBoundingSphere();
      this.applyVisibility(line.id);
      object.updateMatrixWorld(true);
    }

    for (const [layerId, group] of referenceGroups) {
      if (!group.count) continue;
      const layer = this.designModel.layers.get(layerId);
      let object = this.referenceBatches.get(layerId);
      if (!object) {
        object = new THREE.LineSegments(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: layer?.color ?? "#e5e7eb" }),
        );
        object.name = `CadReferenceBatch:${layerId}`;
        object.userData = { frameLogic: { entityType: "CadReferenceBatch", layerId } };
        this.referenceBatches.set(layerId, object);
        this.scene.add(object);
      }
      const previousGeometry = object.geometry;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(group.positions, 3));
      geometry.computeBoundingSphere();
      object.geometry = geometry;
      previousGeometry.dispose();
      object.position.set(group.origin.x, group.origin.y, group.origin.z);
      object.visible = layer?.visible ?? true;
      (object.material as THREE.LineBasicMaterial).color.set(layer?.color ?? "#e5e7eb");
      object.updateMatrixWorld(true);
    }

    for (const [layerId, object] of this.referenceBatches) {
      if (referenceGroups.has(layerId)) continue;
      this.scene.remove(object);
      object.geometry.dispose();
      this.disposeMaterial(object.material);
      this.referenceBatches.delete(layerId);
    }
    this.updateSelectionAppearance();
    for (const listener of this.afterSyncListeners) listener();
  }

  private applyVisibility(id: string): void {
    const object = this.lineObjects.get(id);
    const line = this.designModel.cadLines.get(id);
    if (!object || !line) return;
    const layer = this.designModel.layers.get(line.layerId);
    object.visible = (layer?.visible ?? true) && !this.hiddenIds.has(id);
  }

  private updateSelectionAppearance(): void {
    for (const [id, object] of this.lineObjects) {
      const line = this.designModel.cadLines.get(id);
      const layerColor = line
        ? this.designModel.layers.get(line.layerId)?.color
        : undefined;
      const materials = Array.isArray(object.material)
        ? object.material : [object.material];
      for (const material of materials) {
        if (!(material instanceof THREE.LineBasicMaterial)) continue;
        material.color.set(this.selectedIds.has(id)
          ? "#ffc533" : layerColor ?? "#e5e7eb");
      }
    }
    // Reference selection uses its own bounding-box outline and badge; never
    // repaint or duplicate its internally batched members here.
  }

  private disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    if (Array.isArray(material)) {
      for (const entry of material) entry.dispose();
    }
    else material.dispose();
  }

  dispose(): void {
    for (const object of this.getLineObjects()) {
      this.scene.remove(object);
      object.geometry.dispose();
      this.disposeMaterial(object.material);
    }
    this.lineObjects.clear();
    this.referenceBatches.clear();
    this.afterSyncListeners.clear();
    this.hiddenIds.clear();
  }
}
