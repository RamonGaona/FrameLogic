import * as THREE from "three";
import type { Assembly, DesignModel, PieceInstance } from "@framelogic/domain";
import type { DesignSceneController } from "../design/DesignSceneController";
import type { DesignSelectionController } from "./DesignSelectionController";
import type { CadHistoryController } from "./CadHistoryController";
import {
  createAssemblyCopies,
  independentCopyTags,
  planAssemblyCopy,
} from "./AssemblyCopyStructure";

/**
 * Reversible shared copy transaction for Ctrl+gizmo and COPY by base point.
 * Geometry definitions and STEP source assets remain shared. Only placements
 * and selected assembly hierarchy nodes receive new stable IDs.
 */
export class PieceMoveCopySession {
  readonly ids: readonly string[];
  readonly objects: ReadonlyMap<string, THREE.Object3D>;
  readonly rootAssemblyIds: readonly string[];
  private completed = false;
  private readonly originals: string[];
  private readonly sourceAssemblyIds: readonly string[];
  private readonly assemblies: readonly Assembly[];
  private readonly model: DesignModel;
  private readonly scene: DesignSceneController;
  private readonly selection: DesignSelectionController;
  private readonly history: CadHistoryController;
  private readonly onAssemblySelection?: (assemblyIds: readonly string[]) => void;

  constructor(
    model: DesignModel,
    scene: DesignSceneController,
    selection: DesignSelectionController,
    history: CadHistoryController,
    sourceIds: readonly string[],
    selectedAssemblyIds: readonly string[] = [],
    onAssemblySelection?: (assemblyIds: readonly string[]) => void,
  ) {
    this.model = model;
    this.scene = scene;
    this.selection = selection;
    this.history = history;
    this.originals = [...new Set(sourceIds)];
    this.sourceAssemblyIds = [...selectedAssemblyIds];
    this.onAssemblySelection = onAssemblySelection;
    const plan = selectedAssemblyIds.length
      ? planAssemblyCopy(model, this.originals, selectedAssemblyIds)
      : null;
    const ids: string[] = [];
    const mapping = new Map<string, string>();
    const objects = new Map<string, THREE.Object3D>();
    let createdAssemblies: readonly Assembly[] = [];
    let rootAssemblyIds: readonly string[] = [];
    try {
      for (const id of this.originals) {
        const original = model.pieceInstances.get(id);
        if (!original) throw new Error("No existe la pieza original: " + id);
        if (model.isPieceLocked?.(id) === true) {
          throw new Error("No se puede copiar una pieza bloqueada.");
        }
        const copy = model.registerPieceInstance({
          definitionId: original.definitionId,
          layerId: original.layerId,
          name: original.name ? original.name + " (copia)" : undefined,
          tags: independentCopyTags(original.tags),
          transform: {
            position: { ...original.transform.position },
            rotation: { ...original.transform.rotation },
          },
        });
        ids.push(copy.id);
        mapping.set(id, copy.id);
      }

      if (plan) {
        const hierarchy = createAssemblyCopies(model, plan, mapping);
        createdAssemblies = hierarchy.records;
        rootAssemblyIds = hierarchy.rootIds;
      }

      scene.sync();
      for (const id of ids) {
        const object = scene.getInstanceObject(id);
        if (!object) throw new Error("No se pudo visualizar la copia: " + id);
        objects.set(id, object);
      }
    } catch (error) {
      for (const assembly of [...createdAssemblies].reverse()) {
        model.assemblies.remove(assembly.id);
      }
      for (const id of ids) model.removePieceInstance(id);
      scene.sync();
      throw error;
    }
    this.ids = ids;
    this.objects = objects;
    this.assemblies = createdAssemblies;
    this.rootAssemblyIds = rootAssemblyIds;
  }

  private removeCreated(): void {
    for (const assembly of [...this.assemblies].reverse()) {
      this.model.assemblies.remove(assembly.id);
    }
    for (const id of this.ids) this.model.removePieceInstance(id);
    this.scene.sync();
  }

  cancel(): void {
    if (this.completed) return;
    this.completed = true;
    this.removeCreated();
  }

  /**
   * In repeat SNAP mode the source selection and its assembly identity stay
   * active, so the next click copies the original again.
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
    const originalAssemblies = [...this.sourceAssemblyIds];
    const copiedRoots = [...this.rootAssemblyIds];
    const copiedAssemblies = [...this.assemblies];

    const selectOriginal = (): void => {
      this.selection.setSelection(originals);
      this.onAssemblySelection?.(originalAssemblies);
    };
    const selectCopies = (): void => {
      this.selection.setSelection(ids);
      this.onAssemblySelection?.(copiedRoots);
    };

    this.history.recordOperation("COPY", () => {
      this.removeCreated();
      selectOriginal();
    }, () => {
      const created: string[] = [];
      const restored: string[] = [];
      try {
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
          created.push(record.id);
        }
        for (const assembly of copiedAssemblies) {
          this.model.assemblies.register({
            id: assembly.id, name: assembly.name,
            layerId: assembly.layerId, classification: assembly.classification,
            tags: [...assembly.tags],
            pieceInstanceIds: [...assembly.pieceInstanceIds],
            parentAssemblyId: assembly.parentAssemblyId,
            locked: assembly.locked,
          });
          restored.push(assembly.id);
        }
        this.scene.sync();
        if (keepOriginalSelection) selectOriginal();
        else selectCopies();
      } catch (error) {
        for (const id of restored.reverse()) this.model.assemblies.remove(id);
        for (const id of created) this.model.removePieceInstance(id);
        this.scene.sync();
        throw error;
      }
    });

    if (!keepOriginalSelection) {
      // Do not replace native TransformControls selection mid-mouseUp.
      queueMicrotask(() => {
        if (ids.every((id) => this.model.pieceInstances.get(id))) {
          selectCopies();
        }
      });
    }
  }
}
