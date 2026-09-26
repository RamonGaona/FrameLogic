import type {
  CadCommand,
} from "./CadCommand";


export class CadCommandManager {

  private activeCommand:
    CadCommand | null =
      null;


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


  dispose(): void {

    this.cancelActive();

  }

}