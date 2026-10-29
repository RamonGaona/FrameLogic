// ============================================================
// CAD COMMAND
// ============================================================

export interface CadCommand {

  readonly id:
    string;


  start():
    boolean;


  /**
   * Cancelación contextual sin terminar el comando.
   *
   * LINE la usa para abandonar únicamente el tramo pendiente y quedar
   * preparado para un nuevo primer punto. Los demás comandos pueden omitirla.
   */
  softCancel?():
    boolean;


  cancel():
    void;

}
