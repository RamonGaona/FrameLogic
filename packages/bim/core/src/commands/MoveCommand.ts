import type {
  CadCommand,
} from "./CadCommand";

import type {
  DesignSelectionController,
} from "../interaction/DesignSelectionController";

import type {
  DesignTransformController,
} from "../interaction/DesignTransformController";


export class MoveCommand
implements CadCommand {

  readonly id =
    "MOVE";


  private readonly selection:
    DesignSelectionController;


  private readonly transform:
    DesignTransformController;


  constructor(
    selection:
      DesignSelectionController,

    transform:
      DesignTransformController,
  ) {

    this.selection =
      selection;


    this.transform =
      transform;

  }


  start(): boolean {

    const selectedIds =
      this.selection
        .getSelectedIds();


    if (
      selectedIds.length < 1
    ) {

      return false;

    }


    this.selection.setClearOnEmptyClick(
      false,
    );


    const started =
      this.transform.activate(
        "translate",
      );


    if (
      !started
    ) {

      this.selection.setClearOnEmptyClick(
        true,
      );

    }


    return started;

  }


  cancel(): void {

    this.transform.deactivate();


    this.selection.setClearOnEmptyClick(
      true,
    );

  }

}