import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
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
    return { left: 0, top: 0, right: 288, bottom: 118,
      width: 288, height: 118 } as DOMRect;
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
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 780, bottom: 520,
    width: 780, height: 520,
  }) as DOMRect;
  vi.stubGlobal("window", windowStub);
  vi.stubGlobal("document", { body, createElement: () => new FakeElement() });
  vi.stubGlobal("HTMLElement", FakeElement);

  const camera = new THREE.OrthographicCamera(-390, 390, 260, -260, 0.1, 10000);
  camera.position.set(0, 0, 1200);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const controls = {
    enabled: true,
    minDistance: 1,
    minZoom: 0.0001,
    getTarget: vi.fn((point: THREE.Vector3) => point.set(0, 0, 0)),
    setLookAt: vi.fn(async (px: number, py: number, pz: number,
      tx: number, ty: number, tz: number) => {
      camera.position.set(px, py, pz);
      camera.lookAt(tx, ty, tz);
      camera.updateMatrixWorld(true);
    }),
    zoomTo: vi.fn(async (zoom: number) => {
      camera.zoom = zoom; camera.updateProjectionMatrix();
    }),
  };
  type Options = ConstructorParameters<typeof ModelSpaceZoomExtentsController>[0];
  const controller = new ModelSpaceZoomExtentsController({
    container: container as unknown as HTMLElement,
    domElement: canvas as unknown as HTMLElement,
    cameraProvider: () => camera,
    controls,
  } as unknown as Options);
  const extents = vi.fn(async () => {});
  const object = vi.fn(async () => true);
  Reflect.set(controller, "zoomExtents", extents);
  Reflect.set(controller, "zoomSelected", object);
  const hint = body.children[0]!;
  return { controller, extents, object, hint, overlay: body.children[1]!,
    canvas, windowStub, camera, controls };
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
    expect(getZoomHintPosition(15, 3, 320, 200, 288, 118).left).toBe(20);
  });

  it("requires Z + Enter before showing E/O/S; Tab/arrows cycle and Enter applies", () => {
    const f = setup();
    pointerMove(f.canvas, 680, 495);
    const initial = sendKey(f.windowStub, "z");
    expect(initial.defaultPrevented).toBe(true);
    expect(f.hint.style.position).toBe("fixed");
    expect(f.hint.dataset.framelogicZoomChoices).toBe("true");
    expect(f.hint.style.display).toBe("block");
    expect(f.hint.textContent).toContain("Enter para abrir ZOOM");
    expect(f.hint.textContent).not.toContain("E · Extensión");
    expect(Number.parseInt(f.hint.style.top!, 10)).toBeLessThan(495);

    // E must not execute before entering the command with Enter.
    const eEarly = sendKey(f.windowStub, "e");
    expect(eEarly.defaultPrevented).toBe(false);
    expect(f.extents).not.toHaveBeenCalled();

    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "Enter");
    expect(f.hint.textContent).toContain("› E · Extensión");
    expect(f.hint.textContent).toContain("O · Objeto");
    expect(f.hint.textContent).toContain("S · Seleccionar área");
    sendKey(f.windowStub, "ArrowDown");
    expect(f.hint.textContent).toContain("› O · Objeto");
    sendKey(f.windowStub, "Tab");
    expect(f.hint.textContent).toContain("› S · Seleccionar área");
    sendKey(f.windowStub, "ArrowDown");
    expect(f.hint.textContent).toContain("› E · Extensión");
    sendKey(f.windowStub, "Enter");
    expect(f.extents).toHaveBeenCalledOnce();
    expect(f.object).not.toHaveBeenCalled();
    expect(f.hint.style.display).toBe("none");

    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "Enter");
    sendKey(f.windowStub, "ArrowUp");
    sendKey(f.windowStub, "ArrowUp");
    sendKey(f.windowStub, "Enter");
    expect(f.object).toHaveBeenCalledOnce();
    f.controller.dispose();
    expect(f.hint.removed).toBe(true);
    expect(f.overlay.removed).toBe(true);
  });

  it("Z Enter E/O highlights options, but only another Enter executes them", () => {
    const f = setup();
    const nextKeyHandler = vi.fn();
    f.windowStub.addEventListener("keydown", nextKeyHandler, true);
    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "Enter");
    sendKey(f.windowStub, "o");
    expect(f.object).not.toHaveBeenCalled();
    expect(f.hint.textContent).toContain("› O · Objeto");
    expect(f.hint.style.display).toBe("block");
    expect(nextKeyHandler).not.toHaveBeenCalled();
    sendKey(f.windowStub, "Enter");
    expect(f.object).toHaveBeenCalledOnce();
    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "Enter");
    sendKey(f.windowStub, "e");
    expect(f.extents).not.toHaveBeenCalled();
    expect(f.hint.textContent).toContain("› E · Extensión");
    sendKey(f.windowStub, "Enter");
    expect(f.extents).toHaveBeenCalledOnce();
    expect(nextKeyHandler).not.toHaveBeenCalled();

    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "Escape");
    expect(f.hint.style.display).toBe("none");
    expect(f.object).toHaveBeenCalledOnce();
    f.controller.dispose();
  });

  it("S starts a two-corner zoom window; 2 clicks frame camera without selecting objects", async () => {
    const f = setup();
    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "Enter");
    sendKey(f.windowStub, "s");
    expect(f.hint.textContent).toContain("› S · Seleccionar área");
    expect(f.controls.enabled).toBe(true);
    expect(f.overlay.style.display).toBe("none");
    sendKey(f.windowStub, "Enter");
    expect(f.controls.enabled).toBe(false);
    expect(f.hint.textContent).toContain("Primera esquina");

    const handler = (name: string) => Reflect.get(f.controller, name) as
      (event: PointerEvent) => void;
    const pointer = (type: string, x: number, y: number, id = 10) => {
      return { type, target: f.canvas, button: 0, pointerId: id,
        clientX: x, clientY: y, preventDefault: vi.fn(),
        stopImmediatePropagation: vi.fn(),
      } as unknown as PointerEvent;
    };
    // A click anchors the first point without zooming.
    handler("handleZoomWindowDown")(pointer("pointerdown", 100, 100));
    handler("handleZoomWindowUp")(pointer("pointerup", 100, 100));
    expect(f.hint.textContent).toContain("Segunda esquina");
    expect(f.controls.setLookAt).not.toHaveBeenCalled();
    handler("handleZoomWindowMove")(pointer("pointermove", 450, 390));
    expect(f.overlay.style.display).toBe("block");
    expect(f.overlay.style.width).toBe("350px");
    handler("handleZoomWindowDown")(pointer("pointerdown", 450, 390, 11));
    handler("handleZoomWindowUp")(pointer("pointerup", 450, 390, 11));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.controls.enabled).toBe(true);
    expect(f.controls.setLookAt).toHaveBeenCalledOnce();
    expect(f.controls.zoomTo).toHaveBeenCalledOnce();
    expect(f.camera.zoom).toBeGreaterThan(1);
    expect(f.overlay.style.display).toBe("none");
    f.controller.dispose();
  });

  it("S supports one drag from first corner; Escape restores controls without zoom", async () => {
    const f = setup();
    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "Enter");
    sendKey(f.windowStub, "s");
    expect(f.controls.enabled).toBe(true);
    sendKey(f.windowStub, "Enter");
    expect(f.controls.enabled).toBe(false);
    const handler = (name: string) => Reflect.get(f.controller, name) as
      (event: PointerEvent) => void;
    const pointer = (x: number, y: number, id = 7) => ({
      button: 0, pointerId: id, clientX: x, clientY: y,
      target: f.canvas, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(),
    } as unknown as PointerEvent);
    handler("handleZoomWindowDown")(pointer(100, 100));
    handler("handleZoomWindowMove")(pointer(300, 300));
    handler("handleZoomWindowUp")(pointer(300, 300));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.controls.setLookAt).toHaveBeenCalledOnce();
    expect(f.controls.enabled).toBe(true);

    sendKey(f.windowStub, "z");
    sendKey(f.windowStub, "Enter");
    sendKey(f.windowStub, "s");
    expect(f.controls.enabled).toBe(true);
    expect(f.hint.textContent).toContain("› S · Seleccionar área");
    sendKey(f.windowStub, "Enter");
    expect(f.controls.enabled).toBe(false);
    sendKey(f.windowStub, "Escape");
    expect(f.controls.enabled).toBe(true);
    expect(f.overlay.style.display).toBe("none");
    expect(f.controls.setLookAt).toHaveBeenCalledOnce();
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
