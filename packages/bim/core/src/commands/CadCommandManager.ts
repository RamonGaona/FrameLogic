import type {
  CadCommand,
} from "./CadCommand";


export class CadCommandManager {

  private activeCommand:
    CadCommand | null =
      null;


  constructor() {

    if (
      typeof window
      !== "undefined"
    ) {

      /*
       * LINE necesita prioridad contextual de Escape.
       *
       * Este listener corre en capture y desactiva inmediatamente
       * la herramienta, pero conserva activeCommand hasta que el
       * listener CAD general procese el mismo Escape. De esa forma
       * el flujo normal todavía oculta la entrada numérica y evita
       * interpretar ese Escape como "limpiar selección".
       */
      window.addEventListener(
        "keydown",
        this.handlePriorityKeyDown,
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


      /*
       * Cancelación visual/inmediata del tramo pendiente.
       * No se elimina ninguna línea ya registrada: LineCommand.cancel()
       * únicamente desactiva CadLinePlacementController y su preview.
       *
       * No limpiamos activeCommand aquí. El manejador CAD general del
       * mismo Escape ejecutará cancelActive(), ocultará la entrada
       * numérica y consumirá el Escape antes del flujo de selección.
       */
      this.activeCommand.cancel();

  };


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

    }


    this.cancelActive();

  }

}
