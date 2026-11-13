import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAD_LINE_DISTANCE_APPLY_EVENT,
  CadNumericInputController,
  canResumeLineDistanceKey,
  nextLineDistanceDraft,
} from "./CadNumericInputController";
import { isCameraNavigationPointerMove } from "./CadLinePlacementController";

class FakeDocument extends EventTarget {
  readonly body: FakeElement;
  activeElement: FakeElement;
  constructor() {
    super();
    this.body = new FakeElement("body", this);
    this.activeElement = this.body;
  }
  createElement(tag: string): FakeElement {
    return tag === "input" ? new FakeInput(this) : new FakeElement(tag, this);
  }
}
class FakeElement extends EventTarget {
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  textContent = "";
  title = "";
  value = "";
  type = "";
  step = "";
  inputMode = "";
  autocomplete = "";
  isConnected = true;
  constructor(readonly tag: string, readonly doc: FakeDocument) { super(); }
  append(...children: FakeElement[]): void {
    children.forEach(c => { c.parent = this; this.children.push(c); });
  }
  replaceChildren(...children: FakeElement[]): void {
    this.children.splice(0);
    this.append(...children);
  }
  remove(): void { this.isConnected = false; }
  contains(target: EventTarget | null): boolean {
    if (target === this) return true;
    return this.children.some(c => c.contains(target));
  }
  setAttribute(_name: string, _value: string): void {}
  closest(_selector: string): FakeElement | null {
    return ["input", "textarea", "select"].includes(this.tag) ? this : null;
  }
  querySelector<T>(selector: string): T | null {
    for (const c of this.children) {
      if (c.tag === selector) return c as T;
      const descendant = c.querySelector<T>(selector);
      if (descendant) return descendant;
    }
    return null;
  }
  querySelectorAll<T>(selector: string): T[] {
    const results: T[] = [];
    for (const c of this.children) {
      if (c.tag === selector) results.push(c as T);
      results.push(...c.querySelectorAll<T>(selector));
    }
    return results;
  }
  focus(_options?: { preventScroll?: boolean }): void {
    this.doc.activeElement = this;
  }
  select(): void {}
  setSelectionRange(_start: number, _end: number): void {}
}
class FakeInput extends FakeElement {
  constructor(doc: FakeDocument) { super("input", doc); }
}
class FakeCustomEvent<T> extends Event {
  readonly detail: T;
  constructor(type: string, init: { detail: T }) {
    super(type);
    this.detail = init.detail;
  }
}
function fixture() {
  const doc = new FakeDocument();
  const canvas = new FakeElement("canvas", doc);
  const container = new FakeElement("div", doc);
  container.append(canvas);
  const win = new EventTarget() as EventTarget & {
    getComputedStyle: () => { position: string };
    setTimeout: (cb: () => void) => number;
  };
  win.getComputedStyle = () => ({ position: "relative" });
  win.setTimeout = cb => { queueMicrotask(cb); return 1; };
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  vi.stubGlobal("Element", FakeElement);
  vi.stubGlobal("Node", FakeElement);
  vi.stubGlobal("HTMLInputElement", FakeInput);
  vi.stubGlobal("CustomEvent", FakeCustomEvent);
  const controller = new CadNumericInputController(container as unknown as HTMLElement);
  controller.showLineDistance();
  const input = container.querySelector<FakeInput>("input")!;
  const handler = (name: string) =>
    Reflect.get(controller, name) as (...args: unknown[]) => void;
  const nav = (name: string, button: number, pointerId = 7) =>
    handler(name)({ target: canvas, button, pointerId });
  const key = (name: string) => {
    const e = {
      key: name, target: canvas, ctrlKey: false, altKey: false, metaKey: false,
      isComposing: false, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(),
    };
    handler("handleLineDistanceGlobalKeyDown")(e);
    return e;
  };
  return { doc, win, canvas, container, controller, input, nav, key };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("LINE exact distance after camera navigation", () => {
  it("allows decimal and negative drafts without hijacking shortcuts", () => {
    expect(nextLineDistanceDraft("0", "1")).toBe("1");
    expect(nextLineDistanceDraft("12", ".")).toBe("12.");
    expect(nextLineDistanceDraft("12.", "5")).toBe("12.5");
    expect(nextLineDistanceDraft("12", ",")).toBe("12.");
    expect(nextLineDistanceDraft("12.5", "Backspace")).toBe("12.");
    expect(nextLineDistanceDraft("12", "-")).toBe("-12");
    expect(nextLineDistanceDraft("-12", "-")).toBe("12");
    expect(nextLineDistanceDraft("1.2", ".")).toBe("1.2");
    expect(nextLineDistanceDraft("12", "a")).toBeNull();
    expect(canResumeLineDistanceKey("LINE_DISTANCE", "1",
      { ctrlKey: false, metaKey: false, altKey: false })).toBe(true);
    expect(canResumeLineDistanceKey("LINE_DISTANCE", "1",
      { ctrlKey: true, metaKey: false, altKey: false })).toBe(false);
    expect(canResumeLineDistanceKey("LINE", "1",
      { ctrlKey: false, metaKey: false, altKey: false })).toBe(false);
  });

  it("keeps typed length when right/middle camera gestures blur the numeric field", async () => {
    const f = fixture();
    await Promise.resolve();
    expect(f.input.type).toBe("text");
    f.input.value = "15000";
    f.nav("handleCameraNavigationDown", 2);
    f.doc.activeElement = f.canvas;
    f.nav("handleCameraNavigationUp", 2);
    await Promise.resolve();
    expect(f.doc.activeElement).toBe(f.input);
    expect(f.input.value).toBe("15000");

    f.nav("handleCameraNavigationDown", 1, 9);
    f.doc.activeElement = f.canvas;
    f.nav("handleCameraNavigationUp", 1, 9);
    await Promise.resolve();
    expect(f.doc.activeElement).toBe(f.input);
    expect(f.input.value).toBe("15000");
    f.controller.dispose();
  });

  it("accepts first digit and Enter after blurred focus, without switching LINE to manual", async () => {
    const f = fixture();
    const applied: number[] = [];
    f.doc.addEventListener(CAD_LINE_DISTANCE_APPLY_EVENT, event => {
      const detail = (event as CustomEvent<{ distance: number }>).detail;
      applied.push(detail.distance);
    });
    await Promise.resolve();
    f.doc.activeElement = f.canvas;
    const first = f.key("9");
    expect(first.preventDefault).toHaveBeenCalledOnce();
    expect(f.input.value).toBe("9");
    expect(f.doc.activeElement).toBe(f.input);

    f.doc.activeElement = f.canvas;
    f.key(".");
    f.doc.activeElement = f.canvas;
    f.key("8");
    expect(f.input.value).toBe("9.8");
    f.doc.activeElement = f.canvas;
    f.key("Enter");
    expect(applied).toEqual([9.8]);
    f.controller.hide();
    f.doc.activeElement = f.canvas;
    expect(f.key("2").preventDefault).not.toHaveBeenCalled();
    f.controller.dispose();
  });

  it("never updates LINE bearing during right/middle camera pointermove", () => {
    expect(isCameraNavigationPointerMove(0)).toBe(false);
    expect(isCameraNavigationPointerMove(1)).toBe(false);
    expect(isCameraNavigationPointerMove(2)).toBe(true);
    expect(isCameraNavigationPointerMove(4)).toBe(true);
    expect(isCameraNavigationPointerMove(6)).toBe(true);
  });
});
