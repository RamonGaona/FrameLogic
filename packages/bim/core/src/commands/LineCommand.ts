import type {
  CadCommand,
} from "./CadCommand";

import type {
  CadLinePlacementController,
} from "../interaction/CadLinePlacementController";

import type {
  CadHistoryController,
} from "../interaction/CadHistoryController";


export class LineCommand
implements CadCommand {

  readonly id =
    "LINE";


  private readonly linePlacement:
    CadLinePlacementController;


  private readonly history:
    CadHistoryController;


  constructor(
    linePlacement:
      CadLinePlacementController,

    history:
      CadHistoryController,
  ) {

    this.linePlacement =
      linePlacement;


    this.history =
      history;

  }


  start():
    boolean {

    this.history.beginGroup(
      "LINE",
    );


    const started =
      this.linePlacement
        .activate();


    if (
      !started
    ) {

      this.history.cancelGroup();

    }


    return started;

  }


  softCancel():
    boolean {

    if (
      !this.linePlacement
        .isActive
    ) {

      return false;

    }


    /*
     * Un Escape/clic derecho simple termina la cadena actual pero LINE sigue
     * activo. La cadena recién terminada se consolida como UNA entrada de
     * Undo, aunque contenga varios segmentos.
     */
    this.linePlacement
      .deactivate();


    this.history.endGroup();


    this.history.beginGroup(
      "LINE",
    );


    const restarted =
      this.linePlacement
        .activate();


    if (
      !restarted
    ) {

      this.history.cancelGroup();

    }


    return restarted;

  }


  cancel():
    void {

    this.linePlacement
      .deactivate();


    this.history.endGroup();

  }

}
