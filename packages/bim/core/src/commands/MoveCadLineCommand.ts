import type {
  CadCommand,
} from "./CadCommand";

import type {
  CadLineMoveController,
} from "../interaction/CadLineMoveController";


export class MoveCadLineCommand
implements CadCommand {

  readonly id =
    "MOVE_LINE";


  private readonly move:
    CadLineMoveController;


  constructor(
    move:
      CadLineMoveController,
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
