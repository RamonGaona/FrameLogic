import type {
  CadCommand,
} from "./CadCommand";

import type {
  CadMixedMoveController,
} from "../interaction/CadMixedMoveController";


export class MoveMixedSelectionCommand
implements CadCommand {

  readonly id =
    "MOVE_MIXED";


  private readonly move:
    CadMixedMoveController;


  constructor(
    move:
      CadMixedMoveController,
  ) {

    this.move =
      move;

  }


  start():
    boolean {

    return this.move
      .activate();

  }


  cancel():
    void {

    this.move
      .deactivate();

  }

}
