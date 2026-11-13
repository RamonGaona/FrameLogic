import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatZoomChoices,
  getZoomHintPosition,
  ModelSpaceZoomExtentsController,
} from "./ModelSpaceZoomExtentsController";

class FakeElement extends EventTarget {
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly children: FakeElement[] = [];
  tagName = "DIV";
  isContentEditable = false;
  textContent = "";
  removed = false;
  constructor(tag = "DIV") {
    super();
    this.tagName = tag;
  }
  append(...elements: FakeElement[]): void { this.children.push(...elements); }
  setAttribute(_name: string, _value: string): void {}
  getBoundingClientRect(): DOMRect {
    return { left: 0, top: 0, width: 288, height: 118 } as DOMRect;
  }
  remove(): void { this.removed = true; }
}

function pointerMove(canvas: EventTarget, x: number, y: number): void {
  const event = Object.assign(new Event("pointermove"), { clientX: x, clientY: y });
  canvas.dispatchEvent(event);
}

function sendKey(windowStub: EventTarget, key: string, modifiers: Record<string, boolean> = {}): Event {
  const event = Object.assign(new Event("keydown", { cancelable: true }), {
    key, ctrlKey: false, metaKey: false, altKey: false, ...modifiers,
  });
  windowStub.dispatchEvent(event);
  return event;
}

function setup() {
  const windowStub = Object.assign(new EventTarget(), {
    innerWidth: 780, innerHeight: 520,
  });
  const body = new FakeElement("BODY");
  const container = new FakeElement();
  const canvas = new FakeElement("CANVAS");
  vi.stubGlobal("window", windowStub);
  vi.stubGlobal("document", { body, createElement: () => new FakeElement() });
  vi.stubGlobal("HTMLElement", FakeElement);

  // Existing camera fit implementation is not under test: only the
  // keyboard dispatch and cursor-positioned menu should change.
  type Options = ConstructorParameters<typeof ModelSpaceZoomExtentsController>[0];
  const controller = new ModelSpaceZoomExtentsController({
    container: container as unknown as HTMLElement,
    domElement: canvas as unknown as HTMLElement,
  } as Options);
  const extents = vi.fn(async () => {});
  const object = vi.fn(async () => true);
  Reflect.set(controller, "zoomExtents", extents);
  Reflect.set(controller, "zoomSelected", object);
  const hint = body.children[0]!;
  return { controller, extents, object, hint, canvas, windowStub };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ZOOM cursor choices", () => {
  it("keeps the full menu visible beside the cursor even close to the bottom edge", () => {
    expect(getZoomHintPosition(650, 500, 780, 520, 288, 118))
      .toEqual({ left: 480, top: 366 });
    expect(getZoomHintPosition(15, 12, 780, 520, 288, 118))
      .toEqual({ left: 31, top: 28 });
    expect(getZoomHintPosition(15, 3, 320, 200, 288, 118).left).toBe(12);
  });

  it("shows ZOOM E/O options after Z, allows Tab/arrows and Enter, and avoids bottom HUD", () => {
    const f = setup();
    pointerMove(f.canvas, 680, 495);
    const initial = sendKey(f.windowStub, "z");
    expect(initial.defaultPrevented).toBe(true);
    expect(f.hint.style.position).toBe("fixed");
    expect(f.hint.dataset.framelogicZoomChoices).toBe("true");
    expect(f.hint.style.display).toBe("block");
    expect(Number.parseInt(f.hint.style.top!, 10)).toBeLessThan(495);
    expect(Number.parseInt(f.hint.style.left!, 10)).toBeLessThan(680);
    expect(f.hint.textContent).toContain("Z · ZOOM");
    expect(f.hint.textContent).toContain("› E · Extensión");
    expect(f.hint.textContent).toContain("O · Objeto");

    sendKey(f.windowStub, "ArrowDown");
    expect(f.hint.textContent).toContain("› O · Objeto");
    sendKey(f.windowStub, "Tab");
    expect(f.hint.textContent).toContain("› E · Extensión");
    sendKey(f.windowStub, "Enter");
    expect(f.extents).toHaveBeenCalledOnce();
    expect(f.object).not.toHaveBeenCalled();
    expect(f.hint.style.display).toBe("none");

    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "ArrowUp");
    sendKey(f.windowStub, "Enter");
    expect(f.object).toHaveBeenCalledOnce();
    f.controller.dispose();
    expect(f.hint.removed).toBe(true);
  });

  it("Z + O/E executes immediately; those letters do not start an unrelated command", () => {
    const f = setup();
    const nextKeyHandler = vi.fn();
    f.windowStub.addEventListener("keydown", nextKeyHandler, true);
    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "o");
    expect(f.object).toHaveBeenCalledOnce();
    expect(nextKeyHandler).not.toHaveBeenCalled();
    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "e");
    expect(f.extents).toHaveBeenCalledOnce();
    expect(nextKeyHandler).not.toHaveBeenCalled();

    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "Escape");
    expect(f.hint.style.display).toBe("none");
    expect(f.object).toHaveBeenCalledOnce();
    f.controller.dispose();
  });

  it("does not capture Ctrl+Z/Alt+Z or ordinary shortcuts after dismissing ZOOM", () => {
    const f = setup();
    const undo = sendKey(f.windowStub, "z", { ctrlKey: true });
    expect(undo.defaultPrevented).toBe(false);
    expect(f.hint.style.display).toBe("none");
    sendKey(f.windowStub, "z");
    const unrelated = sendKey(f.windowStub, "m");
    expect(unrelated.defaultPrevented).toBe(false);
    expect(f.hint.style.display).toBe("none");
    expect(f.extents).not.toHaveBeenCalled();
    expect(f.object).not.toHaveBeenCalled();
    f.controller.dispose();
  });

  it("does not open ZOOM when the key is typed into an input field", () => {
    const f = setup();
    const input = new FakeElement("INPUT");
    const onKey = Reflect.get(f.controller, "handleKeyDown") as (e: KeyboardEvent) => void;
    const event = {
      key: "z", target: input, ctrlKey: false, metaKey: false, altKey: false,
      preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(),
    };
    onKey(event as unknown as KeyboardEvent);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(f.hint.style.display).toBe("none");
    f.controller.dispose();
  });
});
