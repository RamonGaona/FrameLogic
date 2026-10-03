import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadHistoryController,
} from "../interaction/CadHistoryController";

import type {
  CadLineSelectionController,
} from "../interaction/CadLineSelectionController";


export class DeleteCadLineCommand {

  readonly id =
    "DELETE_LINE";


  private readonly designModel:
    DesignModel;


  private readonly lineScene:
    CadLineSceneController;


  private readonly selection:
    CadLineSelectionController;


  private readonly history:
    CadHistoryController;


  constructor(
    designModel:
      DesignModel,

    lineScene:
      CadLineSceneController,

    selection:
      CadLineSelectionController,

    history:
      CadHistoryController,
  ) {

    this.designModel =
      designModel;


    this.lineScene =
      lineScene;


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
            lineId,
          ) =>
            this.designModel
              .cadLines
              .get(
                lineId,
              ),
        )
        .filter(
          (
            line,
          ) =>
            line !== undefined,
        )
        .map(
          (
            line,
          ) => ({
            id:
              line.id,
            layerId:
              line.layerId,
            start: {
              x:
                line.start.x,
              y:
                line.start.y,
              z:
                line.start.z,
            },
            end: {
              x:
                line.end.x,
              y:
                line.end.y,
              z:
                line.end.z,
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
          `Cannot delete CAD line "${snapshot.id}" because layer "${layer.name}" is locked.`,
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
        .removeCadLine(
          snapshot.id,
        );

    }


    this.lineScene.sync();


    this.history.recordOperation(
      "DELETE LINE",
      () => {

        for (
          const snapshot
          of snapshots
        ) {

          if (
            this.designModel
              .cadLines
              .get(
                snapshot.id,
              )
          ) {

            continue;

          }


          this.designModel
            .registerCadLine({
              id:
                snapshot.id,
              layerId:
                snapshot.layerId,
              start: {
                ...snapshot.start,
              },
              end: {
                ...snapshot.end,
              },
            });

        }


        this.lineScene.sync();


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
            .removeCadLine(
              snapshot.id,
            );

        }


        this.lineScene.sync();

      },
    );


    return true;

  }

}
