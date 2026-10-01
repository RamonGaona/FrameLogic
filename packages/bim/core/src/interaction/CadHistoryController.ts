import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";


export interface CadTransformState {

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

}


export type CadTransformSnapshot =
  Map<
    string,
    CadTransformState
  >;


interface CadHistoryEntry {

  label:
    string;

  before:
    CadTransformSnapshot;

  after:
    CadTransformSnapshot;

}


export class CadHistoryController {

  private readonly designModel:
    DesignModel;


  private readonly designScene:
    DesignSceneController;


  private readonly selection:
    DesignSelectionController;


  private readonly undoStack:
    CadHistoryEntry[] =
      [];


  private readonly redoStack:
    CadHistoryEntry[] =
      [];


  constructor(
    designModel:
      DesignModel,

    designScene:
      DesignSceneController,

    selection:
      DesignSelectionController,
  ) {

    this.designModel =
      designModel;


    this.designScene =
      designScene;


    this.selection =
      selection;

  }


  capture(
    instanceIds:
      readonly string[],
  ):
    CadTransformSnapshot {

    const snapshot:
      CadTransformSnapshot =
        new Map();


    for (
      const instanceId
      of instanceIds
    ) {

      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      if (
        !object
      ) {

        continue;

      }


      snapshot.set(
        instanceId,
        {
          position: {
            x:
              object.position.x,

            y:
              object.position.y,

            z:
              object.position.z,
          },

          rotation: {
            x:
              object.rotation.x,

            y:
              object.rotation.y,

            z:
              object.rotation.z,
          },
        },
      );

    }


    return snapshot;

  }


  recordTransform(
    label:
      string,

    before:
      CadTransformSnapshot,

    instanceIds:
      readonly string[],
  ): boolean {

    const after =
      this.capture(
        instanceIds,
      );


    if (
      !this.hasDifference(
        before,
        after,
      )
    ) {

      return false;

    }


    this.undoStack.push({
      label,
      before,
      after,
    });


    /*
     * Una acción nueva después de Undo crea una
     * nueva rama y elimina el Redo anterior.
     */
    this.redoStack.length =
      0;


    return true;

  }


  undo(): boolean {

    const entry =
      this.undoStack.pop();


    if (
      !entry
    ) {

      return false;

    }


    this.applySnapshot(
      entry.before,
    );


    this.redoStack.push(
      entry,
    );


    return true;

  }


  redo(): boolean {

    const entry =
      this.redoStack.pop();


    if (
      !entry
    ) {

      return false;

    }


    this.applySnapshot(
      entry.after,
    );


    this.undoStack.push(
      entry,
    );


    return true;

  }


  get canUndo():
    boolean {

    return (
      this.undoStack.length
      > 0
    );

  }


  get canRedo():
    boolean {

    return (
      this.redoStack.length
      > 0
    );

  }


  clear(): void {

    this.undoStack.length =
      0;


    this.redoStack.length =
      0;

  }


  private applySnapshot(
    snapshot:
      CadTransformSnapshot,
  ): void {

    for (
      const [
        instanceId,
        state,
      ]
      of snapshot
    ) {

      const object =
        this.designScene
          .getInstanceObject(
            instanceId,
          );


      if (
        !object
      ) {

        continue;

      }


      object.position.set(
        state.position.x,
        state.position.y,
        state.position.z,
      );


      object.rotation.set(
        state.rotation.x,
        state.rotation.y,
        state.rotation.z,
      );


      object.updateMatrix();


      object.updateMatrixWorld(
        true,
      );


      this.designModel
        .pieceInstances
        .updateTransform(
          instanceId,
          {
            position: {
              ...state.position,
            },

            rotation: {
              ...state.rotation,
            },
          },
        );

    }


    this.selection.refreshHelpers();

  }


  private hasDifference(
    before:
      CadTransformSnapshot,

    after:
      CadTransformSnapshot,
  ): boolean {

    if (
      before.size
      !== after.size
    ) {

      return true;

    }


    const epsilon =
      1e-10;


    for (
      const [
        instanceId,
        beforeState,
      ]
      of before
    ) {

      const afterState =
        after.get(
          instanceId,
        );


      if (
        !afterState
      ) {

        return true;

      }


      if (
        Math.abs(
          beforeState.position.x
          - afterState.position.x,
        ) > epsilon
        || Math.abs(
          beforeState.position.y
          - afterState.position.y,
        ) > epsilon
        || Math.abs(
          beforeState.position.z
          - afterState.position.z,
        ) > epsilon
        || Math.abs(
          beforeState.rotation.x
          - afterState.rotation.x,
        ) > epsilon
        || Math.abs(
          beforeState.rotation.y
          - afterState.rotation.y,
        ) > epsilon
        || Math.abs(
          beforeState.rotation.z
          - afterState.rotation.z,
        ) > epsilon
      ) {

        return true;

      }

    }


    return false;

  }

}
