import type {
  DesignModel,
  PieceInstance,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadHistoryController,
} from "../interaction/CadHistoryController";

import type {
  CadUnifiedSelectionController,
} from "../interaction/CadUnifiedSelectionController";

import type {
  DesignSelectionController,
} from "../interaction/DesignSelectionController";

import type {
  CadPointSelectionController,
} from "../interaction/CadPointSelectionController";

import type {
  CadLineSelectionController,
} from "../interaction/CadLineSelectionController";


interface DeletedPieceSnapshot {

  readonly id:
    string;

  readonly definitionId:
    string;

  readonly layerId:
    string;

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

  readonly tags:
    readonly string[];

}


interface DeletedPointSnapshot {

  readonly id:
    string;

  readonly layerId:
    string;

  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };

}


interface DeletedLineSnapshot {

  readonly id:
    string;

  readonly layerId:
    string;

  readonly start: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };

  readonly end: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };

}


interface MixedDeleteSnapshot {

  readonly pieces:
    readonly DeletedPieceSnapshot[];

  readonly points:
    readonly DeletedPointSnapshot[];

  readonly lines:
    readonly DeletedLineSnapshot[];

}


export class DeleteMixedSelectionCommand {

  readonly id =
    "DELETE_MIXED";


  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  private readonly pointScene:
    CadPointSceneController;


  private readonly lineScene:
    CadLineSceneController;


  private readonly unifiedSelection:
    CadUnifiedSelectionController;


  private readonly designSelection:
    DesignSelectionController;


  private readonly pointSelection:
    CadPointSelectionController;


  private readonly lineSelection:
    CadLineSelectionController;


  private readonly history:
    CadHistoryController;


  constructor(
    designModel:
      DesignModel,

    designScene:
      DesignSceneController,

    pointScene:
      CadPointSceneController,

    lineScene:
      CadLineSceneController,

    unifiedSelection:
      CadUnifiedSelectionController,

    designSelection:
      DesignSelectionController,

    pointSelection:
      CadPointSelectionController,

    lineSelection:
      CadLineSelectionController,

    history:
      CadHistoryController,
  ) {

    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.pointScene =
      pointScene;


    this.lineScene =
      lineScene;


    this.unifiedSelection =
      unifiedSelection;


    this.designSelection =
      designSelection;


    this.pointSelection =
      pointSelection;


    this.lineSelection =
      lineSelection;


    this.history =
      history;

  }


  execute():
    boolean {

    const state =
      this.unifiedSelection
        .getState();


    if (
      state.items.length < 1
      || state.selectedTypeCount < 2
    ) {

      return false;

    }


    this.validatePieces(
      state.pieceIds,
    );


    this.validatePoints(
      state.pointIds,
    );


    this.validateLines(
      state.lineIds,
    );


    const snapshot:
      MixedDeleteSnapshot = {

        pieces:
          state.pieceIds
            .map(
              (
                instanceId,
              ) =>
                this.designModel
                  .pieceInstances
                  .get(
                    instanceId,
                  ),
            )
            .filter(
              (
                instance,
              ):
                instance is PieceInstance =>
                  instance !== undefined,
            )
            .map(
              (
                instance,
              ) =>
                this.clonePiece(
                  instance,
                ),
            ),

        points:
          state.pointIds
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
            ),

        lines:
          state.lineIds
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
            ),

      };


    this.removeSnapshot(
      snapshot,
    );


    this.history.recordOperation(
      "DELETE MIXED",
      () => {

        this.restoreSnapshot(
          snapshot,
        );

      },
      () => {

        this.removeSnapshot(
          snapshot,
        );

      },
    );


    return true;

  }


  private validatePieces(
    instanceIds:
      readonly string[],
  ):
    void {

    for (
      const instanceId
      of instanceIds
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

  }


  private validatePoints(
    pointIds:
      readonly string[],
  ):
    void {

    for (
      const pointId
      of pointIds
    ) {

      const point =
        this.designModel
          .cadPoints
          .get(
            pointId,
          );


      if (
        !point
      ) {

        continue;

      }


      const layer =
        this.designModel
          .layers
          .get(
            point.layerId,
          );


      if (
        layer?.locked
      ) {

        throw new Error(
          `Cannot delete CAD point "${pointId}" because layer "${layer.name}" is locked.`,
        );

      }

    }

  }


  private validateLines(
    lineIds:
      readonly string[],
  ):
    void {

    for (
      const lineId
      of lineIds
    ) {

      const line =
        this.designModel
          .cadLines
          .get(
            lineId,
          );


      if (
        !line
      ) {

        continue;

      }


      const layer =
        this.designModel
          .layers
          .get(
            line.layerId,
          );


      if (
        layer?.locked
      ) {

        throw new Error(
          `Cannot delete CAD line "${lineId}" because layer "${layer.name}" is locked.`,
        );

      }

    }

  }


  private removeSnapshot(
    snapshot:
      MixedDeleteSnapshot,
  ):
    void {

    this.unifiedSelection
      .clearSelection();


    for (
      const piece
      of snapshot.pieces
    ) {

      this.designModel
        .removePieceInstance(
          piece.id,
        );

    }


    for (
      const point
      of snapshot.points
    ) {

      this.designModel
        .removeCadPoint(
          point.id,
        );

    }


    for (
      const line
      of snapshot.lines
    ) {

      this.designModel
        .removeCadLine(
          line.id,
        );

    }


    this.syncScenes();

  }


  private restoreSnapshot(
    snapshot:
      MixedDeleteSnapshot,
  ):
    void {

    for (
      const piece
      of snapshot.pieces
    ) {

      if (
        this.designModel
          .pieceInstances
          .get(
            piece.id,
          )
      ) {

        continue;

      }


      this.designModel
        .registerPieceInstance({
          id:
            piece.id,
          definitionId:
            piece.definitionId,
          layerId:
            piece.layerId,
          transform: {
            position: {
              ...piece.transform.position,
            },
            rotation: {
              ...piece.transform.rotation,
            },
          },
          tags: [
            ...piece.tags,
          ],
        });

    }


    for (
      const point
      of snapshot.points
    ) {

      if (
        this.designModel
          .cadPoints
          .get(
            point.id,
          )
      ) {

        continue;

      }


      this.designModel
        .registerCadPoint({
          id:
            point.id,
          layerId:
            point.layerId,
          position: {
            ...point.position,
          },
        });

    }


    for (
      const line
      of snapshot.lines
    ) {

      if (
        this.designModel
          .cadLines
          .get(
            line.id,
          )
      ) {

        continue;

      }


      this.designModel
        .registerCadLine({
          id:
            line.id,
          layerId:
            line.layerId,
          start: {
            ...line.start,
          },
          end: {
            ...line.end,
          },
        });

    }


    this.syncScenes();


    this.designSelection
      .setSelection(
        snapshot.pieces.map(
          (
            piece,
          ) =>
            piece.id,
        ),
      );


    this.pointSelection
      .setSelection(
        snapshot.points.map(
          (
            point,
          ) =>
            point.id,
        ),
        true,
      );


    this.lineSelection
      .setSelection(
        snapshot.lines.map(
          (
            line,
          ) =>
            line.id,
        ),
        true,
      );

  }


  private syncScenes():
    void {

    this.designScene.sync();

    this.pointScene.sync();

    this.lineScene.sync();

  }


  private clonePiece(
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
