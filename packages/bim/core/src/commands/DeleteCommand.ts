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

  id:
    string;

  definitionId:
    string;

  layerId:
    string;

  transform:
    {
      position: {
        x: number;
        y: number;
        z: number;
      };

      rotation: {
        x: number;
        y: number;
        z: number;
      };
    };

  tags:
    string[];

}


export class DeleteCommand {

  readonly id =
    "DELETE";


  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  private readonly selection:
    DesignSelectionController;


  private readonly history:
    CadHistoryController;


  constructor(
    designModel:
      DesignModel,

    designScene:
      DesignSceneController,

    selection:
      DesignSelectionController,

    history:
      CadHistoryController,
  ) {

    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.selection =
      selection;


    this.history =
      history;

  }


  execute(): boolean {

    const selectedIds =
      this.selection
        .getSelectedIds();


    if (
      selectedIds.length < 1
    ) {

      return false;

    }


    /*
     * Validamos primero todas las piezas.
     *
     * Así evitamos borrar algunas y descubrir después
     * que otra pertenece a un Assembly.
     */
    for (
      const instanceId
      of selectedIds
    ) {

      const instance =
        this.designModel
          .pieceInstances
          .get(
            instanceId,
          );


      if (
        instance
      ) {

        const layer =
          this.designModel
            .layers
            .get(
              instance.layerId,
            );


        if (
          layer?.locked
        ) {

          throw new Error(
            `Cannot delete piece instance "${instanceId}" because layer "${layer.name}" is locked.`,
          );

        }

      }


      const usedBy =
        this.designModel
          .assemblies
          .findByPieceInstanceId(
            instanceId,
          );


      if (
        usedBy.length > 0
      ) {

        throw new Error(
          `Cannot delete piece instance "${instanceId}" because it is used by ${usedBy.length} assembly/assemblies.`,
        );

      }

    }


    const snapshots:
      DeletedPieceSnapshot[] =
        [];


    for (
      const instanceId
      of selectedIds
    ) {

      const instance =
        this.designModel
          .pieceInstances
          .get(
            instanceId,
          );


      if (
        !instance
      ) {

        continue;

      }


      snapshots.push(
        this.cloneInstance(
          instance,
        ),
      );

    }


    if (
      snapshots.length < 1
    ) {

      return false;

    }


    this.removeSnapshots(
      snapshots,
    );


    this.history.recordOperation(
      "DELETE",
      () => {

        this.restoreSnapshots(
          snapshots,
        );

      },
      () => {

        this.removeSnapshots(
          snapshots,
        );

      },
    );


    return true;

  }


  private restoreSnapshots(
    snapshots:
      readonly DeletedPieceSnapshot[],
  ): void {

    for (
      const snapshot
      of snapshots
    ) {

      if (
        this.designModel
          .pieceInstances
          .get(
            snapshot.id,
          )
      ) {

        continue;

      }


      this.designModel
        .registerPieceInstance({
          id:
            snapshot.id,

          definitionId:
            snapshot.definitionId,

          layerId:
            snapshot.layerId,

          transform: {
            position: {
              ...snapshot
                .transform
                .position,
            },

            rotation: {
              ...snapshot
                .transform
                .rotation,
            },
          },

          tags: [
            ...snapshot.tags,
          ],
        });

    }


    this.designScene.sync();


    this.selection.setSelection(
      snapshots.map(
        (
          snapshot,
        ) =>
          snapshot.id,
      ),
    );

  }


  private removeSnapshots(
    snapshots:
      readonly DeletedPieceSnapshot[],
  ): void {

    const deletedIds =
      new Set(
        snapshots.map(
          (
            snapshot,
          ) =>
            snapshot.id,
        ),
      );


    for (
      const snapshot
      of snapshots
    ) {

      this.designModel
        .removePieceInstance(
          snapshot.id,
        );

    }


    this.designScene.sync();


    const remainingSelection =
      this.selection
        .getSelectedIds()
        .filter(
          (
            instanceId,
          ) =>
            !deletedIds.has(
              instanceId,
            ),
        );


    this.selection.setSelection(
      remainingSelection,
    );

  }


  private cloneInstance(
    instance:
      PieceInstance,
  ):
    DeletedPieceSnapshot {

    return {
      id:
        instance.id,

      definitionId:
        instance.definitionId,

      layerId:
        instance.layerId,

      transform: {
        position: {
          x:
            instance.transform.position.x,

          y:
            instance.transform.position.y,

          z:
            instance.transform.position.z,
        },

        rotation: {
          x:
            instance.transform.rotation.x,

          y:
            instance.transform.rotation.y,

          z:
            instance.transform.rotation.z,
        },
      },

      tags: [
        ...instance.tags,
      ],
    };

  }

}
