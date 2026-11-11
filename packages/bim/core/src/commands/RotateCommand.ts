import type {
  CadCommand,
} from "./CadCommand";

import type {
  DesignSelectionController,
} from "../interaction/DesignSelectionController";

import type {
  DesignRotateController,
} from "../interaction/DesignRotateController";


export class RotateCommand
implements CadCommand {

  readonly id =
    "ROTATE";


  private readonly selection:
    DesignSelectionController;


  private readonly rotate:
    DesignRotateController;

  private readonly onActivated: () => void;
  private readonly onDeactivated: () => void;


  constructor(
    selection:
      DesignSelectionController,

    rotate:
      DesignRotateController,
    onActivated: () => void = () => {},
    onDeactivated: () => void = () => {},
  ) {

    this.selection =
      selection;


    this.rotate =
      rotate;

    this.onActivated = onActivated;
    this.onDeactivated = onDeactivated;

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


    /*
     * Igual que MOVE:
     * un clic vacío no pierde la selección mientras
     * el comando está activo.
     */
    this.selection.setClearOnEmptyClick(
      false,
    );


    const started =
      this.rotate.activate();


    if (
      !started
    ) {

      this.selection.setClearOnEmptyClick(
        true,
      );

    }
    else {
      this.onActivated();
    }

    return started;

  }


  cancel(): void {

    this.rotate.deactivate();
    this.onDeactivated();

    this.selection.setClearOnEmptyClick(
      true,
    );

  }

}
