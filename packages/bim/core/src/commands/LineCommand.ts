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


  softCancel():
    boolean {

    if (
      !this.linePlacement
        .isActive
    ) {

      return false;

    }


    /*
     * CadLinePlacementController enlaza automáticamente el extremo del último
     * segmento como startPoint del siguiente. Reiniciarlo limpia únicamente
     * ese tramo pendiente/preview, pero conserva todas las líneas ya creadas
     * y deja LINE armado para recibir un nuevo primer punto.
     */
    this.linePlacement
      .deactivate();


    return this.linePlacement
      .activate();

  }


  cancel():
    void {

    this.linePlacement
      .deactivate();

  }

}
