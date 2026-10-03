import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import type {
  CadHistoryController,
} from "../interaction/CadHistoryController";

import type {
  CadPointSelectionController,
} from "../interaction/CadPointSelectionController";


export class DeleteCadPointCommand {

  readonly id =
    "DELETE_POINT";


  private readonly designModel:
    DesignModel;


  private readonly pointScene:
    CadPointSceneController;


  private readonly selection:
    CadPointSelectionController;


  private readonly history:
    CadHistoryController;


  constructor(
    designModel:
      DesignModel,

    pointScene:
      CadPointSceneController,

    selection:
      CadPointSelectionController,

    history:
      CadHistoryController,
  ) {

    this.designModel =
      designModel;


    this.pointScene =
      pointScene;


    this.selection =
      selection;


    this.history =
      history;

  }


  execute():
    boolean {

    const selectedIds =
      this.selection
        .getSelectedIds();


    if (
      selectedIds.length < 1
    ) {

      return false;

    }


    const snapshots =
      selectedIds
        .map(
          (
            pointId,
          ) =>
            this.designModel
              .cadPoints
              .get(
                pointId,
              ),
        )
        .filter(
          (
            point,
          ) =>
            point !== undefined,
        )
        .map(
          (
            point,
          ) => ({
            id:
              point.id,
            layerId:
              point.layerId,
            position: {
              x:
                point.position.x,
              y:
                point.position.y,
              z:
                point.position.z,
            },
          }),
        );


    if (
      snapshots.length < 1
    ) {

      return false;

    }


    for (
      const snapshot
      of snapshots
    ) {

      const layer =
        this.designModel
          .layers
          .get(
            snapshot.layerId,
          );


      if (
        layer?.locked
      ) {

        throw new Error(
          `Cannot delete CAD point "${snapshot.id}" because layer "${layer.name}" is locked.`,
        );

      }

    }


    this.selection
      .clearSelection();


    for (
      const snapshot
      of snapshots
    ) {

      this.designModel
        .removeCadPoint(
          snapshot.id,
        );

    }


    this.pointScene.sync();


    this.history.recordOperation(
      "DELETE POINT",
      () => {

        for (
          const snapshot
          of snapshots
        ) {

          if (
            this.designModel
              .cadPoints
              .get(
                snapshot.id,
              )
          ) {

            continue;

          }


          this.designModel
            .registerCadPoint({
              id:
                snapshot.id,
              layerId:
                snapshot.layerId,
              position: {
                ...snapshot.position,
              },
            });

        }


        this.pointScene.sync();


        this.selection.setSelection(
          snapshots.map(
            (
              snapshot,
            ) =>
              snapshot.id,
          ),
        );

      },
      () => {

        this.selection
          .clearSelection();


        for (
          const snapshot
          of snapshots
        ) {

          this.designModel
            .removeCadPoint(
              snapshot.id,
            );

        }


        this.pointScene.sync();

      },
    );


    return true;

  }

}
