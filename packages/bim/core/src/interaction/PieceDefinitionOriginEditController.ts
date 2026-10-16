import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  DesignSnapController,
} from "./DesignSnapController";

import type {
  PieceDefinitionPreparationController,
} from "./PieceDefinitionPreparationController";


export interface PieceDefinitionOriginEditState {

  readonly active:
    boolean;

  readonly message:
    string;

}


export type PieceDefinitionOriginEditListener =
  (
    state:
      PieceDefinitionOriginEditState,
  ) => void;


export class PieceDefinitionOriginEditController {

  private readonly domElement:
    HTMLElement;


  private readonly snap:
    DesignSnapController;


  private readonly preparation:
    PieceDefinitionPreparationController;


  private readonly designSelection:
    DesignSelectionController;


  private readonly pointSelection:
    CadPointSelectionController;


  private readonly lineSelection:
    CadLineSelectionController;


  private readonly listeners =
    new Set<
      PieceDefinitionOriginEditListener
    >();


  private activeValue =
    false;


  private messageValue =
    "";


  private pointerDownX =
    0;


  private pointerDownY =
    0;


  private pointerDownActive =
    false;


  private disposed =
    false;


  constructor(
    domElement:
      HTMLElement,

    snap:
      DesignSnapController,

    preparation:
      PieceDefinitionPreparationController,

    designSelection:
      DesignSelectionController,

    pointSelection:
      CadPointSelectionController,

    lineSelection:
      CadLineSelectionController,
  ) {

    this.domElement =
      domElement;


    this.snap =
      snap;


    this.preparation =
      preparation;


    this.designSelection =
      designSelection;


    this.pointSelection =
      pointSelection;


    this.lineSelection =
      lineSelection;


    this.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );


    this.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );

  }


  get isActive():
    boolean {

    return this.activeValue;

  }


  getState():
    PieceDefinitionOriginEditState {

    return {
      active:
        this.activeValue,
      message:
        this.messageValue,
    };

  }


  start():
    void {

    if (
      this.disposed
    ) {

      return;

    }


    if (
      !this.preparation
        .isActive
    ) {

      throw new Error(
        "Start PieceDefinition preparation before defining its origin.",
      );

    }


    /*
     * No emitimos un estado inactivo cuando start() se invoca
     * desde reposo. El editor STEP usa la transición real
     * active -> inactive para cerrar la operación de historial
     * del origen. El antiguo this.cancel() emitía false antes
     * incluso de comenzar y hacía que Ctrl+Z perdiera el cambio
     * de origen.
     */
    if (
      this.activeValue
    ) {

      this.cancel();

    }
    else {

      this.pointerDownActive =
        false;

      this.messageValue =
        "";

      this.designSelection
        .setEnabled(
          true,
        );

      this.pointSelection
        .setEnabled(
          true,
        );

      this.lineSelection
        .setEnabled(
          true,
        );

    }


    this.activeValue =
      true;


    this.messageValue =
      "Selecciona un SNAP para el origen local de la pieza.";


    this.designSelection
      .setEnabled(
        false,
      );


    this.pointSelection
      .setEnabled(
        false,
      );


    this.lineSelection
      .setEnabled(
        false,
      );


    this.notify();

  }


  cancel():
    void {

    this.activeValue =
      false;


    this.pointerDownActive =
      false;


    this.messageValue =
      "";


    this.designSelection
      .setEnabled(
        true,
      );


    this.pointSelection
      .setEnabled(
        true,
      );


    this.lineSelection
      .setEnabled(
        true,
      );


    this.notify();

  }


  subscribe(
    listener:
      PieceDefinitionOriginEditListener,
  ):
    () => void {

    this.listeners.add(
      listener,
    );


    listener(
      this.getState(),
    );


    return () => {

      this.listeners.delete(
        listener,
      );

    };

  }


  private readonly handlePointerDown =
    (
      event:
        PointerEvent,
    ):
      void => {

      if (
        !this.activeValue
        || event.button !== 0
      ) {

        return;

      }


      this.pointerDownX =
        event.clientX;


      this.pointerDownY =
        event.clientY;


      this.pointerDownActive =
        true;

  };


  private readonly handlePointerUp =
    (
      event:
        PointerEvent,
    ):
      void => {

      if (
        !this.activeValue
        || !this.pointerDownActive
        || event.button !== 0
      ) {

        return;

      }


      this.pointerDownActive =
        false;


      const movement =
        Math.hypot(
          event.clientX
          - this.pointerDownX,
          event.clientY
          - this.pointerDownY,
        );


      if (
        movement > 5
      ) {

        return;

      }


      const snap =
        this.snap.findSnap(
          event.clientX,
          event.clientY,
        );


      if (
        !snap
      ) {

        this.messageValue =
          "No se encontró SNAP. Selecciona un SNAP válido de la geometría, POINT o línea.";


        this.notify();


        return;

      }


      event.preventDefault();

      event.stopPropagation();


      this.preparation
        .setOriginFromWorldPoint(
          snap.point,
        );


      this.activeValue =
        false;


      this.messageValue =
        "";


      this.notify();


      window.setTimeout(
        () => {

          if (
            this.disposed
          ) {

            return;

          }


          this.designSelection
            .setEnabled(
              true,
            );


          this.pointSelection
            .setEnabled(
              true,
            );


          this.lineSelection
            .setEnabled(
              true,
            );

        },
        0,
      );

  };


  private notify():
    void {

    const state =
      this.getState();


    for (
      const listener
      of this.listeners
    ) {

      listener(
        state,
      );

    }

  }


  dispose():
    void {

    if (
      this.disposed
    ) {

      return;

    }


    this.disposed =
      true;


    this.cancel();


    this.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );


    this.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );


    this.listeners.clear();

  }

}