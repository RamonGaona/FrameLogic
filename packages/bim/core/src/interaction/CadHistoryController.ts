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

  undo:
    () => void;

  redo:
    () => void;

}


interface CadHistoryGroup {

  label:
    string;

  entries:
    CadHistoryEntry[];

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


  private activeGroup:
    CadHistoryGroup | null =
      null;


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


  beginGroup(
    label:
      string,
  ): void {

    if (
      this.activeGroup
    ) {

      this.endGroup();

    }


    this.activeGroup = {
      label,
      entries: [],
    };

  }


  endGroup():
    boolean {

    const group =
      this.activeGroup;


    this.activeGroup =
      null;


    if (
      !group
      || group.entries.length
        < 1
    ) {

      return false;

    }


    const entries = [
      ...group.entries,
    ];


    this.undoStack.push({
      label:
        group.label,

      undo:
        () => {

          for (
            let index = entries.length - 1;
            index >= 0;
            index -= 1
          ) {

            entries[index]
              ?.undo();

          }

        },

      redo:
        () => {

          for (
            const entry
            of entries
          ) {

            entry.redo();

          }

        },
    });


    return true;

  }


  cancelGroup():
    void {

    this.activeGroup =
      null;

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


    this.recordOperation(
      label,
      () => {

        this.applySnapshot(
          before,
        );

      },
      () => {

        this.applySnapshot(
          after,
        );

      },
    );


    return true;

  }


  recordOperation(
    label:
      string,

    undo:
      () => void,

    redo:
      () => void,
  ): void {

    const entry: CadHistoryEntry = {
      label,
      undo,
      redo,
    };


    if (
      this.activeGroup
    ) {

      this.activeGroup.entries.push(
        entry,
      );


      /*
       * La primera acción real dentro del grupo crea una rama nueva.
       * Un grupo vacío no destruye Redo.
       */
      if (
        this.activeGroup.entries.length
        === 1
      ) {

        this.redoStack.length =
          0;

      }


      return;

    }


    this.undoStack.push(
      entry,
    );


    /*
     * Una acción nueva después de Undo crea una
     * nueva rama y elimina el Redo anterior.
     */
    this.redoStack.length =
      0;

  }


  undo(): boolean {

    const entry =
      this.undoStack.pop();


    if (
      !entry
    ) {

      return false;

    }


    entry.undo();


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


    entry.redo();


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

    this.activeGroup =
      null;


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
