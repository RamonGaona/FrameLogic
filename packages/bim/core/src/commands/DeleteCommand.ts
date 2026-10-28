import type {
  DesignModel,
  PieceInstance,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  DesignSelectionController,
} from "../interaction/DesignSelectionController";

import type {
  CadHistoryController,
} from "../interaction/CadHistoryController";

interface DeletedPieceSnapshot {
  readonly id: string;
  readonly name?: string;
  readonly definitionId: string;
  readonly layerId: string;
  readonly transform: {
    readonly position: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    readonly rotation: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
  };
  readonly tags: readonly string[];
}

interface AssemblyMembershipSnapshot {
  readonly id: string;
  readonly pieceInstanceIds: readonly string[];
}

interface DeleteSnapshot {
  readonly pieces: readonly DeletedPieceSnapshot[];
  readonly assemblies: readonly AssemblyMembershipSnapshot[];
}

export class DeleteCommand {
  readonly id = "DELETE";

  private readonly designModel: DesignModel;
  private readonly designScene: DesignSceneController;
  private readonly selection: DesignSelectionController;
  private readonly history: CadHistoryController;

  constructor(
    designModel: DesignModel,
    designScene: DesignSceneController,
    selection: DesignSelectionController,
    history: CadHistoryController,
  ) {
    this.designModel = designModel;
    this.designScene = designScene;
    this.selection = selection;
    this.history = history;
  }

  execute(): boolean {
    const selectedIds = this.selection.getSelectedIds();
    if (selectedIds.length < 1) return false;

    for (const instanceId of selectedIds) {
      const instance = this.designModel.pieceInstances.get(instanceId);
      if (!instance) continue;

      const layer = this.designModel.layers.get(instance.layerId);
      if (layer?.locked) {
        throw new Error(
          `Cannot delete piece instance "${instanceId}" because layer "${layer.name}" is locked.`,
        );
      }
    }

    const deleting = new Set(selectedIds);
    const pieces = selectedIds
      .map((id) => this.designModel.pieceInstances.get(id))
      .filter((instance): instance is PieceInstance => instance !== undefined)
      .map((instance) => this.cloneInstance(instance));

    if (pieces.length < 1) return false;

    const assemblies = this.designModel.assemblies
      .getAll()
      .filter((assembly) =>
        assembly.pieceInstanceIds.some((id) => deleting.has(id)),
      )
      .map((assembly) => ({
        id: assembly.id,
        pieceInstanceIds: [...assembly.pieceInstanceIds],
      }));

    const snapshot: DeleteSnapshot = {
      pieces,
      assemblies,
    };

    this.removeSnapshot(snapshot);

    this.history.recordOperation(
      "DELETE",
      () => this.restoreSnapshot(snapshot),
      () => this.removeSnapshot(snapshot),
    );

    return true;
  }

  private restoreSnapshot(snapshot: DeleteSnapshot): void {
    for (const piece of snapshot.pieces) {
      if (this.designModel.pieceInstances.get(piece.id)) continue;

      this.designModel.registerPieceInstance({
        id: piece.id,
        name: piece.name,
        definitionId: piece.definitionId,
        layerId: piece.layerId,
        transform: {
          position: { ...piece.transform.position },
          rotation: { ...piece.transform.rotation },
        },
        tags: [...piece.tags],
      });
    }

    for (const membership of snapshot.assemblies) {
      if (!this.designModel.assemblies.get(membership.id)) continue;
      this.designModel.assemblies.updatePieceInstanceIds(
        membership.id,
        membership.pieceInstanceIds,
      );
    }

    this.designScene.sync();
    this.selection.setSelection(
      snapshot.pieces.map((piece) => piece.id),
    );
  }

  private removeSnapshot(snapshot: DeleteSnapshot): void {
    const deletedIds = new Set(
      snapshot.pieces.map((piece) => piece.id),
    );

    /*
     * El dominio protege las PieceInstance usadas por ensambles. Primero
     * actualizamos esos ensambles y solo después eliminamos las piezas.
     */
    for (const membership of snapshot.assemblies) {
      const current = this.designModel.assemblies.get(membership.id);
      if (!current) continue;

      this.designModel.assemblies.updatePieceInstanceIds(
        membership.id,
        current.pieceInstanceIds.filter((id) => !deletedIds.has(id)),
      );
    }

    for (const piece of snapshot.pieces) {
      this.designModel.removePieceInstance(piece.id);
    }

    this.designScene.sync();

    this.selection.setSelection(
      this.selection
        .getSelectedIds()
        .filter((id) => !deletedIds.has(id)),
    );
  }

  private cloneInstance(instance: PieceInstance): DeletedPieceSnapshot {
    return {
      id: instance.id,
      name: instance.name,
      definitionId: instance.definitionId,
      layerId: instance.layerId,
      transform: {
        position: {
          x: instance.transform.position.x,
          y: instance.transform.position.y,
          z: instance.transform.position.z,
        },
        rotation: {
          x: instance.transform.rotation.x,
          y: instance.transform.rotation.y,
          z: instance.transform.rotation.z,
        },
      },
      tags: [...instance.tags],
    };
  }
}
