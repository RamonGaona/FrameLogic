import type {
  CadCommand,
} from "./CadCommand";

import type {
  CadPointPlacementController,
} from "../interaction/CadPointPlacementController";


export class PointCommand
implements CadCommand {

  readonly id =
    "POINT";


  private readonly pointPlacement:
    CadPointPlacementController;


  constructor(
    pointPlacement:
      CadPointPlacementController,
  ) {

    this.pointPlacement =
      pointPlacement;

  }


  start():
    boolean {

    return this.pointPlacement
      .activate();

  }


  cancel():
    void {

    this.pointPlacement
      .deactivate();

  }

}
