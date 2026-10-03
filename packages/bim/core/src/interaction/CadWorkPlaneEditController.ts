import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  DesignSnapController,
} from "./DesignSnapController";

import type {
  CadWorkPlaneController,
} from "./CadWorkPlaneController";


export type CadWorkPlaneEditMode =
  | "NONE"
  | "ORIGIN"
  | "THREE_POINTS";


export interface CadWorkPlaneEditState {

  readonly mode:
    CadWorkPlaneEditMode;

  readonly pointCount:
    number;

  readonly message:
    string;

}


export type CadWorkPlaneEditListener =
  (
    state:
      CadWorkPlaneEditState,
  ) => void;


export class CadWorkPlaneEditController {

  private readonly domElement:
    HTMLElement;


  private readonly workPlane:
    CadWorkPlaneController;


  private readonly snap:
    DesignSnapController;


  private readonly selection:
    DesignSelectionController;


  private readonly listeners =
    new Set<
      CadWorkPlaneEditListener
    >();


  private readonly points:
    import("three").Vector3[] =
      [];


  private modeValue:
    CadWorkPlaneEditMode =
      "NONE";


  private pointerDownX =
    0;


  private pointerDownY =
    0;


  private pointerDownActive =
    false;


  private messageValue =
    "";


  private disposed =
    false;


  constructor(
    domElement:
      HTMLElement,

    workPlane:
      CadWorkPlaneController,

    snap:
      DesignSnapController,

    selection:
      DesignSelectionController,
  ) {

    this.domElement =
      domElement;


    this.workPlane =
      workPlane;


    this.snap =
      snap;


    this.selection =
      selection;


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


  // ==========================================================
  // STATE
  // ==========================================================

  get isActive():
    boolean {

    return this.modeValue
      !== "NONE";

  }


  getState():
    CadWorkPlaneEditState {

    return {

      mode:
        this.modeValue,

      pointCount:
        this.points.length,

      message:
        this.messageValue,

    };

  }


  // ==========================================================
  // START
  // ==========================================================

  startOrigin():
    void {

    if (
      this.disposed
    ) {

      return;

    }


    this.cancel();


    this.modeValue =
      "ORIGIN";


    this.messageValue =
      "Selecciona un SNAP para el nuevo origen del WorkPlane.";


    this.selection.setEnabled(
      false,
    );


    this.notify();

  }


  startThreePoints():
    void {

    if (
      this.disposed
    ) {

      return;

    }


    this.cancel();


    this.modeValue =
      "THREE_POINTS";


    this.messageValue =
      "Punto 1/3: selecciona el SNAP del origen.";


    this.selection.setEnabled(
      false,
    );


    this.notify();

  }


  // ==========================================================
  // CANCEL
  // ==========================================================

  cancel():
    void {

    this.modeValue =
      "NONE";


    this.points.length =
      0;


    this.pointerDownActive =
      false;


    this.messageValue =
      "";


    this.selection.setEnabled(
      true,
    );


    this.notify();

  }


  // ==========================================================
  // POINTER
  // ==========================================================

  private readonly handlePointerDown =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.isActive
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
    ): void => {

      if (
        !this.isActive
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
          this.modeValue
          === "ORIGIN"
            ? "No se encontró SNAP. Selecciona ENDPOINT, MIDPOINT o CENTER."
            : `Punto ${this.points.length + 1}/3: selecciona un SNAP válido.`;


        this.notify();


        return;

      }


      event.preventDefault();


      event.stopPropagation();


      if (
        this.modeValue
        === "ORIGIN"
      ) {

        this.workPlane.setOrigin(
          snap.point,
        );


        this.finish();


        return;

      }


      if (
        this.points.length === 1
        && snap.point.distanceToSquared(
          this.points[0],
        ) <= 1e-12
      ) {

        this.messageValue =
          "Punto 2/3: debe ser diferente al origen para definir +X local.";


        this.notify();


        return;

      }


      this.points.push(
        snap.point.clone(),
      );


      if (
        this.points.length === 1
      ) {

        this.messageValue =
          "Punto 2/3: selecciona el SNAP que define +X local.";


        this.notify();


        return;

      }


      if (
        this.points.length === 2
      ) {

        this.messageValue =
          "Punto 3/3: selecciona un SNAP para definir el plano y +Y local.";


        this.notify();


        return;

      }


      const applied =
        this.workPlane
          .setFromThreePoints(
            this.points[0],
            this.points[1],
            this.points[2],
          );


      if (
        !applied
      ) {

        this.points.pop();


        this.messageValue =
          "El tercer punto no puede ser colineal con los dos primeros. Selecciona otro SNAP.";


        this.notify();


        return;

      }


      this.finish();

    };


  // ==========================================================
  // FINISH
  // ==========================================================

  private finish():
    void {

    this.modeValue =
      "NONE";


    this.points.length =
      0;


    this.pointerDownActive =
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


        this.selection.setEnabled(
          true,
        );

      },
      0,
    );

  }


  // ==========================================================
  // SUBSCRIBE
  // ==========================================================

  subscribe(
    listener:
      CadWorkPlaneEditListener,
  ): () => void {

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


  // ==========================================================
  // DISPOSE
  // ==========================================================

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
