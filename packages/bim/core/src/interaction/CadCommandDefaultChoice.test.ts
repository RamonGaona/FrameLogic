import { afterEach, describe, expect, it, vi } from "vitest";
import { CadCommandDefaultChoice } from "./CadCommandDefaultChoice";
import { CadCirclePlacementController } from "./CadCirclePlacementController";
import { CadPolylineEditController } from "./CadPolylineEditController";

type MockButton = HTMLButtonElement & { clicked: ReturnType<typeof vi.fn>; attributes: Record<string,string> };
function button(disabled = false): MockButton {
  const clicked = vi.fn();
  const attributes: Record<string, string> = {};
  return {
    disabled, hidden: false, dataset: {}, style: {},
    clicked, attributes, click: clicked,
    setAttribute: (name: string, value: string) => { attributes[name] = value; },
  } as unknown as MockButton;
}
afterEach(() => vi.unstubAllGlobals());

describe("CAD shared default option selection", () => {
  it("selects the FIRST enabled option visibly when a command opens, and Enter accepts it without extra click", () => {
    const radio = button();
    const diameter = button();
    const choices = new CadCommandDefaultChoice([radio, diameter]);
    expect(choices.currentIndex).toBe(0);
    expect(radio.attributes["aria-pressed"]).toBe("true");
    expect(radio.dataset["defaultOptionSelected"]).toBe("true");
    expect(diameter.attributes["aria-pressed"]).toBe("false");
    expect(choices.handleKey("Enter")).toBe(true);
    expect(radio.clicked).toHaveBeenCalledOnce();
    expect(diameter.clicked).not.toHaveBeenCalled();
  });

  it("Arrow/Tab cycle the highlighted option without executing; then Enter accepts only that choice", () => {
    const a = button(), b = button(), c = button();
    const choices = new CadCommandDefaultChoice([a,b,c]);
    expect(choices.handleKey("ArrowDown")).toBe(true);
    expect(choices.currentIndex).toBe(1);
    expect(choices.handleKey("Tab")).toBe(true);
    expect(choices.currentIndex).toBe(2);
    expect(choices.handleKey("Tab", true)).toBe(true);
    expect(choices.currentIndex).toBe(1);
    expect(choices.handleKey("Enter")).toBe(true);
    expect(a.clicked).not.toHaveBeenCalled();
    expect(b.clicked).toHaveBeenCalledOnce();
    expect(c.clicked).not.toHaveBeenCalled();
    choices.reset();
    expect(choices.currentIndex).toBe(0);
    expect(choices.handleKey("Enter")).toBe(true);
    expect(a.clicked).toHaveBeenCalledOnce();
  });

  it("skips disabled choices and never dispatches them", () => {
    const disabled = button(true), available = button();
    const choices = new CadCommandDefaultChoice([disabled, available]);
    expect(choices.currentIndex).toBe(1);
    expect(choices.confirm()).toBe(true);
    expect(available.clicked).toHaveBeenCalledOnce();
    expect(disabled.clicked).not.toHaveBeenCalled();
  });
});

describe("CIRCLE and PEDIT command menus share Enter acceptance", () => {
  it("in Circle SIZE_MODE, Enter confirms the visible first option RADIUS", () => {
    const controller = Object.create(CadCirclePlacementController.prototype) as CadCirclePlacementController;
    const radio = button(), diameter = button();
    const choices = new CadCommandDefaultChoice([radio, diameter]);
    Reflect.set(controller, "active", true);
    Reflect.set(controller, "stage", "SIZE_MODE");
    Reflect.set(controller, "modeChoices", choices);
    const e = { key: "Enter", shiftKey: false, ctrlKey: false,
      metaKey: false, altKey: false, preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn() };
    const handler = Reflect.get(controller, "processKeyDown") as
      (this: CadCirclePlacementController, event: unknown) => void;
    handler.call(controller, e);
    expect(radio.clicked).toHaveBeenCalledOnce();
    expect(diameter.clicked).not.toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalledOnce();
  });

  it("CIRCLE second SNAP uses Diameter/2 when the second menu option is highlighted", () => {
    const controller = Object.create(CadCirclePlacementController.prototype) as CadCirclePlacementController;
    const canvas = {};
    const radio = button(), diameter = button();
    const choices = new CadCommandDefaultChoice([radio, diameter]);
    choices.select(1);
    const commitRadius = vi.fn();
    Reflect.set(controller, "options", { domElement: canvas });
    Reflect.set(controller, "stage", "SIZE_MODE");
    Reflect.set(controller, "active", true);
    Reflect.set(controller, "modeChoices", choices);
    Reflect.set(controller, "getManualRadius", () => 100);
    Reflect.set(controller, "commitRadius", commitRadius);
    const handler = Reflect.get(controller, "processPointerUp") as
      (this: CadCirclePlacementController, event: unknown) => void;
    handler.call(controller, {
      button: 0, target: canvas, clientX: 10, clientY: 15,
      preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(),
    });
    expect(commitRadius).toHaveBeenCalledWith(50);
    expect(Reflect.get(controller, "sizeMode")).toBe("DIAMETER");
  });

  it("PEDIT first operation is confirmed with Enter and can be changed with ArrowDown", () => {
    vi.stubGlobal("HTMLElement", class HTMLElement {});
    const controller = Object.create(CadPolylineEditController.prototype) as CadPolylineEditController;
    const move = button(), add = button();
    const choices = new CadCommandDefaultChoice([move, add]);
    Reflect.set(controller, "active", true);
    Reflect.set(controller, "stage", "MENU");
    Reflect.set(controller, "operationChoices", choices);
    const handler = Reflect.get(controller, "processKeyDown") as
      (this: CadPolylineEditController, event: unknown) => void;
    const event = (key: string) => ({
      key, shiftKey: false, ctrlKey: false, metaKey: false,
      altKey: false, target: null, preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    });
    handler.call(controller, event("Enter"));
    expect(move.clicked).toHaveBeenCalledOnce();
    handler.call(controller, event("ArrowDown"));
    expect(add.clicked).not.toHaveBeenCalled();
    handler.call(controller, event("Enter"));
    expect(add.clicked).toHaveBeenCalledOnce();
  });
});
