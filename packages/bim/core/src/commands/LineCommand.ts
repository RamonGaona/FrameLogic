import type {
  CadCommand,
} from "./CadCommand";

import type {
  CadLinePlacementController,
} from "../interaction/CadLinePlacementController";


export class LineCommand
implements CadCommand {

  readonly id =
    "LINE";


  private readonly linePlacement:
    CadLinePlacementController;


  constructor(
    linePlacement:
      CadLinePlacementController,
  ) {

    this.linePlacement =
      linePlacement;

  }


  start():
    boolean {

    return this.linePlacement
      .activate();

  }


  cancel():
    void {

    this.linePlacement
      .deactivate();

  }

}
