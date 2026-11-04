import { describe, expect, it } from "vitest";
import {
  CadMouseNavigationController,
  restoreCadMouseNavigationBindings,
} from "./CadMouseNavigationController";

describe("CAD mouse orbit after camera projection changes", () => {
  it("reapplies wheel-pressed ROTATE after the projection manager uses ZOOM in ortho", () => {
    const mouseButtons = { left: 1, middle: 4, right: 2, wheel: 16 };
    const controls = { mouseButtons };
    const canvas = new EventTarget() as HTMLElement;
    const controller = new CadMouseNavigationController({ canvas, controls });

    expect(mouseButtons).toEqual({ left: 0, middle: 1, right: 2, wheel: 16 });

    // That Open ProjectionManager.setupOrthoCamera overwrites middle = ZOOM.
    mouseButtons.middle = 16;
    mouseButtons.wheel = 16;
    restoreCadMouseNavigationBindings(controls);
    expect(mouseButtons).toEqual({ left: 0, middle: 1, right: 2, wheel: 16 });

    controller.dispose();
    expect(mouseButtons).toEqual({ left: 1, middle: 4, right: 2, wheel: 16 });
  });

  it("reapplies wheel-pressed ROTATE after switching to perspective without losing wheel DOLLY", () => {
    const controls = { mouseButtons: { left: 0, middle: 1, right: 2, wheel: 16 } };
    const canvas = new EventTarget() as HTMLElement;
    const controller = new CadMouseNavigationController({ canvas, controls });

    // That Open ProjectionManager.setPerspectiveCamera overwrites middle = DOLLY.
    controls.mouseButtons.middle = 8;
    controls.mouseButtons.wheel = 8;
    restoreCadMouseNavigationBindings(controls);
    expect(controls.mouseButtons).toEqual({ left: 0, middle: 1, right: 2, wheel: 8 });

    controller.dispose();
    expect(controls.mouseButtons.middle).toBe(1);
  });
});
