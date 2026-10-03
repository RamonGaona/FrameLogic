import type {
  CadCommand,
} from "./CadCommand";

import type {
  CadPointMoveController,
} from "../interaction/CadPointMoveController";


export class MoveCadPointCommand
implements CadCommand {

  readonly id =
    "MOVE_POINT";


  private readonly move:
    CadPointMoveController;


  constructor(
    move:
      CadPointMoveController,
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
