import { afterEach, describe, expect, it, vi } from "vitest";
import { CadCommandInputController } from "./CadCommandInputController";
afterEach(() => vi.unstubAllGlobals());
describe("typed COPY / COPIAR routes to the two-point tool", () => {
  it.each(["COPY","COPYBASE","COPIAR","CP"])("executes %s through the active command callback", (command) => {
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

describe("typed C / CIRCULO / CIRCLE routes to native CAD circles on Enter", () => {
  it.each(["C", "CIRCULO", "CIRCLE"])("executes %s as CIRCLE (never COPY)", (command) => {
    const startCircle = vi.fn(() => true);
    const startCopy = vi.fn(() => true);
    vi.stubGlobal("window", {
      __frameLogicStartCircleCommand: startCircle,
      __frameLogicStartCopyBaseCommand: startCopy,
      alert: vi.fn(),
    });
    const hide = vi.fn();
    const input = Object.assign(
      Object.create(CadCommandInputController.prototype) as object,
      { command, hide },
    ) as unknown as { execute(): void };
    input.execute();
    expect(startCircle).toHaveBeenCalledOnce();
    expect(startCopy).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalledOnce();
  });
});

describe("typed E / PEDIT routes to the polyline edit choice menu", () => {
  it.each(["E", "PEDIT", "EDITAR POLILINEA"])("accepts %s after Enter", (command) => {
    const startPedit = vi.fn(() => true);
    const startCircle = vi.fn(() => true);
    const alert = vi.fn();
    vi.stubGlobal("window", {
      __frameLogicStartPolylineEditCommand: startPedit,
      __frameLogicStartCircleCommand: startCircle,
      alert,
    });
    const hide = vi.fn();
    const controller = Object.assign(
      Object.create(CadCommandInputController.prototype) as object,
      { command, hide },
    ) as unknown as { execute(): void };
    controller.execute();
    expect(startPedit).toHaveBeenCalledOnce();
    expect(startCircle).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalledOnce();
    expect(alert).not.toHaveBeenCalled();
  });
});


describe("typed P / PU / PUN / PUNTO / POINT starts native CAD points", () => {
  it.each(["P", "PU", "PUN", "PUNTO", "POINT"])("executes %s on Enter without starting TRIM", (command) => {
    const startPoint = vi.fn(() => true);
    const startTrim = vi.fn(() => true);
    const alert = vi.fn();
    vi.stubGlobal("window", {
      __frameLogicStartPointTextCommand: startPoint,
      __frameLogicStartTrimTextCommand: startTrim,
      alert,
    });
    const hide = vi.fn();
    const input = Object.assign(
      Object.create(CadCommandInputController.prototype) as object,
      {command, hide},
    ) as unknown as {execute():void};
    input.execute();
    expect(startPoint).toHaveBeenCalledOnce();
    expect(startTrim).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalledOnce();
    expect(alert).not.toHaveBeenCalled();
  });

  it("ignores unrecognized partial commands until they can be completed", () => {
    const startPoint = vi.fn(() => true);
    vi.stubGlobal("window", {
      __frameLogicStartPointTextCommand: startPoint,
      alert: vi.fn(),
    });
    const input = Object.assign(
      Object.create(CadCommandInputController.prototype) as object,
      {
        command: "PUN",
        hide: vi.fn(),
      },
    ) as unknown as {execute():void};
    input.execute();
    expect(startPoint).toHaveBeenCalledOnce();
  });
});
