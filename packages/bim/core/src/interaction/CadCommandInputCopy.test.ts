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


class FloatingHudTestElement extends EventTarget {
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  children: FloatingHudTestElement[] = [];
  textContent = "";
  append(...items: FloatingHudTestElement[]) { this.children.push(...items); }
  remove() { this.children.length = 0; }
}

describe("PUNTO keyboard capture in the isolated piece editor", () => {
  it("keeps all letters including T in one text command and restores the shortcut after Enter", () => {
    const body = new FloatingHudTestElement();
    const canvas = new FloatingHudTestElement();
    const startPoint = vi.fn(() => true);
    const startTrim = vi.fn(() => true);
    const win = Object.assign(new EventTarget(), {
      innerWidth: 1200, innerHeight: 800,
      __frameLogicStartPointTextCommand: startPoint,
      __frameLogicStartTrimTextCommand: startTrim,
      alert: vi.fn(),
      __frameLogicTextCommandInputActive: undefined as (() => boolean) | undefined,
    });

    // TRIM registers its capture handler before the command HUD does.
    // The same guard used by CadTrimController must reserve T for "PUNTO".
    let trimShortcuts = 0;
    win.addEventListener("keydown", event => {
      const key = (event as KeyboardEvent).key.toLowerCase();
      if (key === "t" && !win.__frameLogicTextCommandInputActive?.()) {
        trimShortcuts++;
        event.stopImmediatePropagation();
      }
    }, true);
    vi.stubGlobal("window", win);
    vi.stubGlobal("HTMLElement", FloatingHudTestElement);
    vi.stubGlobal("document", {
      createElement: () => new FloatingHudTestElement(),
      body,
    });
    const controller = new CadCommandInputController({
      domElement: canvas as unknown as HTMLElement,
      hasActiveCommand: () => false,
      startLine: () => true,
    });
    const keyDown = (key: string): void => {
      const event = Object.assign(new Event("keydown", {cancelable:true}), {
        key, ctrlKey:false, metaKey:false, altKey:false,
      });
      win.dispatchEvent(event);
    };
    keyDown("p");
    expect(win.__frameLogicTextCommandInputActive?.()).toBe(true);
    for (const letter of ["u", "n", "t", "o"]) keyDown(letter);
    expect(body.children[0]!.children[0]!.textContent).toBe("PUNTO▌");
    expect(trimShortcuts).toBe(0);
    keyDown("Enter");
    expect(startPoint).toHaveBeenCalledOnce();
    expect(startTrim).not.toHaveBeenCalled();
    expect(win.__frameLogicTextCommandInputActive?.()).toBe(false);
    keyDown("t");
    expect(trimShortcuts).toBe(1);
    controller.dispose();
    expect(win.__frameLogicTextCommandInputActive).toBeUndefined();
  });
});
