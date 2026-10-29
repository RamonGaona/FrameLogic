import type {
  CadCommand,
} from "./CadCommand";


const LINE_DOUBLE_CANCEL_WINDOW_MS =
  400;


export class CadCommandManager {

  private activeCommand:
    CadCommand | null =
      null;


  private lastLineEscapeAt =
    Number.NEGATIVE_INFINITY;


  private lastLineRightClickAt =
    Number.NEGATIVE_INFINITY;


  private suppressContextMenuUntil =
    Number.NEGATIVE_INFINITY;


  constructor() {

    if (
      typeof window
      !== "undefined"
    ) {

      window.addEventListener(
        "keydown",
        this.handlePriorityKeyDown,
        true,
      );


      window.addEventListener(
        "pointerdown",
        this.handlePriorityPointerDown,
        true,
      );


      window.addEventListener(
        "contextmenu",
        this.handleContextMenu,
        true,
      );

    }

  }


  start(
    command: CadCommand,
  ): boolean {


    this.cancelActive();


    const started =
      command.start();


    if (
      !started
    ) {

      return false;

    }


    this.activeCommand =
      command;


    this.resetLineCancelGestures();


    return true;

  }


  cancelActive(): void {

    if (
      !this.activeCommand
    ) {

      return;

    }


    const command =
      this.activeCommand;


    this.activeCommand =
      null;


    this.resetLineCancelGestures();


    command.cancel();

  }


  get hasActiveCommand():
    boolean {

    return this.activeCommand
      !== null;

  }


  get activeCommandId():
    string | null {

    return this.activeCommand
      ?.id
      ?? null;

  }


  private handleLineCancelGesture(
    source:
      "ESCAPE"
      | "RIGHT_CLICK",
  ): void {

    const command =
      this.activeCommand;


    if (
      command?.id
      !== "LINE"
    ) {

      return;

    }


    const now =
      performance.now();


    const previous =
      source === "ESCAPE"
        ? this.lastLineEscapeAt
        : this.lastLineRightClickAt;


    if (
      now - previous
      <= LINE_DOUBLE_CANCEL_WINDOW_MS
    ) {

      this.cancelActive();
      return;

    }


    if (
      source === "ESCAPE"
    ) {

      this.lastLineEscapeAt =
        now;

    }
    else {

      this.lastLineRightClickAt =
        now;

    }


    /*
     * Primer gesto: termina únicamente la cadena/tramo pendiente.
     * LINE sigue siendo el activeCommand y queda esperando un nuevo
     * primer punto independiente. Si por algún motivo no puede rearmarse
     * (por ejemplo, la capa acaba de bloquearse), cerramos LINE para no
     * dejar un activeCommand fantasma.
     */
    const keptActive =
      command.softCancel?.()
      ?? false;


    if (
      !keptActive
    ) {

      this.cancelActive();

    }

  }


  private readonly handlePriorityKeyDown =
    (
      event:
        KeyboardEvent,
    ): void => {

      if (
        event.key !== "Escape"
        || this.activeCommand
          ?.id !== "LINE"
      ) {

        return;

      }


      event.preventDefault();
      event.stopImmediatePropagation();


      /*
       * Mantener Escape presionado no debe interpretarse como doble Escape.
       */
      if (
        event.repeat
      ) {

        return;

      }


      this.handleLineCancelGesture(
        "ESCAPE",
      );

  };


  private readonly handlePriorityPointerDown =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        event.button !== 2
        || this.activeCommand
          ?.id !== "LINE"
        || !(event.target instanceof HTMLCanvasElement)
      ) {

        return;

      }


      event.preventDefault();
      event.stopImmediatePropagation();


      this.suppressContextMenuUntil =
        performance.now()
        + 600;


      this.handleLineCancelGesture(
        "RIGHT_CLICK",
      );

  };


  private readonly handleContextMenu =
    (
      event:
        MouseEvent,
    ): void => {

      if (
        performance.now()
        > this.suppressContextMenuUntil
      ) {

        return;

      }


      event.preventDefault();
      event.stopImmediatePropagation();

  };


  private resetLineCancelGestures():
    void {

    this.lastLineEscapeAt =
      Number.NEGATIVE_INFINITY;


    this.lastLineRightClickAt =
      Number.NEGATIVE_INFINITY;

  }


  dispose(): void {

    if (
      typeof window
      !== "undefined"
    ) {

      window.removeEventListener(
        "keydown",
        this.handlePriorityKeyDown,
        true,
      );


      window.removeEventListener(
        "pointerdown",
        this.handlePriorityPointerDown,
        true,
      );


      window.removeEventListener(
        "contextmenu",
        this.handleContextMenu,
        true,
      );

    }


    this.cancelActive();

  }

}
