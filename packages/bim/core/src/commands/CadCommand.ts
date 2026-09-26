// ============================================================
// CAD COMMAND
// ============================================================

export interface CadCommand {

  readonly id:
    string;


  start():
    boolean;


  cancel():
    void;

}
