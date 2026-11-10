import { afterEach, describe, expect, it, vi } from "vitest";
import { CadCommandInputController } from "./CadCommandInputController";
afterEach(() => vi.unstubAllGlobals());
describe("typed COPY / COPIAR routes to the two-point tool", () => {
  it.each(["COPY","COPIAR","C","CP"])("executes %s through the active command callback", (command) => {
    const runCopy = vi.fn(() => true);
    const alert = vi.fn();
    vi.stubGlobal("window", {
      __frameLogicStartCopyBaseCommand:runCopy,
      alert,
    });
    const hide = vi.fn();
    const input = Object.assign(
      Object.create(CadCommandInputController.prototype) as object,
      {command, hide},
    ) as unknown as {execute():void};
    input.execute();
    expect(runCopy).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledTimes(1);
    expect(alert).not.toHaveBeenCalled();
  });
});
