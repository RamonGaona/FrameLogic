import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CadCommandInputController,
  getLineCommandHint,
} from "./CadCommandInputController";

class FakeElement extends EventTarget {
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  children: FakeElement[] = [];
  textContent = "";
  append(...children: FakeElement[]) { this.children.push(...children); }
  remove() { this.children.length = 0; }
}

afterEach(() => vi.unstubAllGlobals());

describe("LINE: hide the floating command info after selecting the first point", () => {
  it("shows initial first-point help, then returns no hint for the rest of LINE", () => {
    expect(getLineCommandHint(false)).toEqual({
      command: "LINE · SNAP",
      detail: "Primer punto · selecciona SNAP exacto",
    });
    expect(getLineCommandHint(true)).toBeNull();
  });

  it("hides immediately on the first point's pointerup and stays hidden during drawing", () => {
    const canvas = new FakeElement();
    let hasStartPoint = false;
    // The LINE handler was registered before the command-HUD handler. It
    // stops propagation, but not other capture listeners on the same canvas.
    canvas.addEventListener("pointerup", event => {
      hasStartPoint = true;
      event.stopPropagation();
    }, true);
    const body = new FakeElement();
    vi.stubGlobal("document", {
      createElement: () => new FakeElement(),
      body,
    });
    const windowStub = Object.assign(new EventTarget(), {
      innerWidth: 1280,
      innerHeight: 720,
    });
    vi.stubGlobal("window", windowStub);

    const controller = new CadCommandInputController({
      domElement: canvas as unknown as HTMLElement,
      hasActiveCommand: () => hasStartPoint,
      startLine: () => true,
      getActiveCommandHint: () => getLineCommandHint(hasStartPoint),
    });
    const hud = body.children[0]!;
    const move = () => canvas.dispatchEvent(
      Object.assign(new Event("pointermove"), { clientX: 200, clientY: 150 }),
    );
    move();
    expect(hud.style.display).toBe("block");
    expect(hud.children[0]?.textContent).toBe("LINE · SNAP");

    canvas.dispatchEvent(
      Object.assign(new Event("pointerup"), { clientX: 200, clientY: 150 }),
    );
    expect(hasStartPoint).toBe(true);
    expect(hud.style.display).toBe("none");
    move();
    expect(hud.style.display).toBe("none");

    // Numeric length/angle overlays use different controls and are not removed.
    // Terminating/restarting LINE is allowed to display the first-point hint.
    hasStartPoint = false;
    move();
    expect(hud.style.display).toBe("block");
    controller.dispose();
  });
});
