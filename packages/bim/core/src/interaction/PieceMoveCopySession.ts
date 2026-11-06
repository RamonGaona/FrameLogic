import * as THREE from "three";
import type { DesignModel, PieceInstance } from "@framelogic/domain";
import type { DesignSceneController } from "../design/DesignSceneController";
import type { DesignSelectionController } from "./DesignSelectionController";
import type { CadHistoryController } from "./CadHistoryController";

/** Duplicación reversible de instancias para Ctrl + gizmo (no copia geometría). */
export class PieceMoveCopySession {
  readonly ids: readonly string[];
  readonly objects: ReadonlyMap<string, THREE.Object3D>;
  private completed = false;
  private readonly originals: string[];
  private readonly model: DesignModel;
  private readonly scene: DesignSceneController;
  private readonly selection: DesignSelectionController;
  private readonly history: CadHistoryController;

  constructor(
    model: DesignModel,
    scene: DesignSceneController,
    selection: DesignSelectionController,
    history: CadHistoryController,
    sourceIds: readonly string[],
  ) {
    this.model = model;
    this.scene = scene;
    this.selection = selection;
    this.history = history;
    this.originals = [...sourceIds];
    const ids: string[] = [];
    const objects = new Map<string, THREE.Object3D>();
    try {
      for (const id of sourceIds) {
        const original = model.pieceInstances.get(id);
        if (!original) throw new Error("No existe la pieza original: " + id);
        const copy = model.registerPieceInstance({
          definitionId: original.definitionId,
          layerId: original.layerId,
          name: original.name ? original.name + " (copia)" : undefined,
          tags: [...original.tags],
          transform: {
            position: { ...original.transform.position },
            rotation: { ...original.transform.rotation },
          },
        });
        ids.push(copy.id);
      }
      scene.sync();
      for (const id of ids) {
        const object = scene.getInstanceObject(id);
        if (!object) throw new Error("No se pudo visualizar la copia: " + id);
        objects.set(id, object);
      }
    } catch (error) {
      for (const id of ids) model.removePieceInstance(id);
      scene.sync();
      throw error;
    }
    this.ids = ids;
    this.objects = objects;
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;
    for (const id of this.ids) this.model.removePieceInstance(id);
    this.scene.sync();
  }

  /**
   * Ctrl + axis -> SNAP can place multiple copies from a fixed original.
   * In that mode, do not select each newly created instance; selection
   * changes would detach/rearm the transform gizmo after every placement.
   * Drag-copy keeps the existing select-new-copy behaviour by default.
   */
  finish(keepOriginalSelection = false): void {
    if (this.completed) return;
    const records: PieceInstance[] = this.ids.map((id) => {
      const record = this.model.pieceInstances.get(id);
      if (!record) throw new Error("No existe la copia: " + id);
      return record;
    });
    this.completed = true;
    const ids = [...this.ids];
    const originals = [...this.originals];
    this.history.recordOperation("COPY", () => {
      for (const id of ids) this.model.removePieceInstance(id);
      this.scene.sync();
      this.selection.setSelection(originals);
    }, () => {
      for (const record of records) {
        this.model.registerPieceInstance({
          id: record.id, name: record.name,
          definitionId: record.definitionId, layerId: record.layerId,
          tags: [...record.tags],
          transform: {
            position: { ...record.transform.position },
            rotation: { ...record.transform.rotation },
          },
        });
      }
      this.scene.sync();
      this.selection.setSelection(keepOriginalSelection ? originals : ids);
    });
    // Drag copy retains its prior behaviour: select the newly placed copies
    // after TransformControls releases the pointer. Multi-copy explicitly
    // retains the original as the source of each subsequent placement.
    if (!keepOriginalSelection) {
      queueMicrotask(() => {
        if (ids.every(id => this.model.pieceInstances.get(id))) {
          this.selection.setSelection(ids);
        }
      });
    }
  }
}
