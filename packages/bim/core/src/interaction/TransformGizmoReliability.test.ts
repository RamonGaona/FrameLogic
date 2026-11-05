import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { completeRotationRings, installTransformPointerLifecycle, PointerFocusGate } from "./TransformGizmoReliability";

function pointer(type: string, overrides: Record<string, unknown> = {}): PointerEvent {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 1, clientX: 10, clientY: 10, button: 0, buttons: 1, isPrimary: true, ...overrides });
  return event as PointerEvent;
}

function mouse(type: string, overrides: Record<string, unknown> = {}): MouseEvent {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { button: 0, buttons: 0, ...overrides });
  return event as MouseEvent;
}

function gesture() {
  const element = new EventTarget() as HTMLElement;
  const target = new EventTarget() as Window;
  const controls = {
    dragging: false, axis: "X" as string | null,
    reset: vi.fn(),
    pointerUp: vi.fn((_pointer: null) => { controls.dragging = false; controls.axis = null; }),
  };
  const dispose = installTransformPointerLifecycle(element, controls, target);
  const start = (): void => { element.dispatchEvent(pointer("pointerdown")); controls.dragging = true; };
  return { element, target, controls, dispose, start };
}

describe("gizmo physical pointer lifecycle", () => {
  it("signals cancellation before the native gizmo resets on blur", () => {
    const element = new EventTarget() as HTMLElement;
    const target = new EventTarget() as Window;
    const actions: string[] = [];
    const controls = {
      dragging: true,
      axis: "X",
      reset: () => { actions.push("reset"); },
      pointerUp: (_pointer: null) => {
        actions.push("release");
        controls.dragging = false;
      },
    };
    const remove = installTransformPointerLifecycle(
      element, controls, target, () => actions.push("cancel"),
    );
    target.dispatchEvent(new Event("blur"));
    expect(actions).toEqual(["cancel", "reset", "release"]);
    remove();
  });

  it("ignores click jitter and admits a deliberate drag", () => {
    const g = gesture(); g.start();
    const jitter = pointer("pointermove", { clientX: 13, clientY: 12 });
    g.target.dispatchEvent(jitter);
    expect(jitter.defaultPrevented).toBe(true);
    const drag = pointer("pointermove", { clientX: 30 });
    g.target.dispatchEvent(drag);
    expect(drag.defaultPrevented).toBe(false);
    g.dispose();
  });

  it("releases a click outside the canvas and cannot move after release", async () => {
    const g = gesture(); g.start();
    g.target.dispatchEvent(pointer("pointerup", { buttons: 0 }));
    await Promise.resolve();
    expect(g.controls.dragging).toBe(false);
    expect(g.controls.axis).toBeNull();
    expect(g.controls.pointerUp).toHaveBeenCalledOnce();
    g.target.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 200 }));
    expect(g.controls.pointerUp).toHaveBeenCalledOnce();
    g.dispose();
  });

  it("lets native handlers commit once before the fallback", async () => {
    const g = gesture(); g.start();
    g.target.dispatchEvent(pointer("pointerup", { buttons: 0 }));
    g.controls.pointerUp(null);
    await Promise.resolve();
    expect(g.controls.pointerUp).toHaveBeenCalledOnce();
    expect(g.controls.reset).not.toHaveBeenCalled();
    g.dispose();
  });

  it("detects a missing release from buttons before the next native move", () => {
    const g = gesture(); g.start();
    const nativeMove = vi.fn(() => expect(g.controls.dragging).toBe(false));
    g.target.addEventListener("pointermove", nativeMove);
    g.target.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 300 }));
    expect(nativeMove).toHaveBeenCalledOnce();
    expect(g.controls.pointerUp).toHaveBeenCalledOnce();
    g.dispose();
  });

  it("repairs stale native dragging when pointer ownership was already lost", () => {
    const g = gesture();
    g.controls.dragging = true;
    g.controls.axis = "Y";
    const nativeMove = vi.fn(() => expect(g.controls.dragging).toBe(false));
    g.target.addEventListener("pointermove", nativeMove);
    g.target.dispatchEvent(pointer("pointermove", { buttons: 0, clientX: 80 }));
    expect(nativeMove).toHaveBeenCalledOnce();
    expect(g.controls.pointerUp).toHaveBeenCalledOnce();
    expect(g.controls.axis).toBeNull();
    g.dispose();
  });

  it("uses mouseup as a fallback when pointerup is missing", () => {
    const g = gesture(); g.start();
    g.target.dispatchEvent(mouse("mouseup"));
    expect(g.controls.dragging).toBe(false);
    expect(g.controls.axis).toBeNull();
    expect(g.controls.pointerUp).toHaveBeenCalledOnce();
    g.dispose();
  });

  it.each(["pointercancel", "blur"])("rolls back and releases on %s", async (type) => {
    const g = gesture(); g.start();
    g.target.dispatchEvent(pointer(type));
    await Promise.resolve();
    expect(g.controls.reset).toHaveBeenCalledOnce();
    expect(g.controls.dragging).toBe(false);
    g.dispose();
  });

  it("releases on lost capture without rolling back a completed drag", async () => {
    const g = gesture(); g.start();
    g.element.dispatchEvent(pointer("lostpointercapture"));
    await Promise.resolve();
    expect(g.controls.dragging).toBe(false);
    expect(g.controls.reset).not.toHaveBeenCalled();
    g.dispose();
  });

  it("ignores release from a second pointer", async () => {
    const g = gesture(); g.start();
    g.target.dispatchEvent(pointer("pointerup", { pointerId: 2 }));
    await Promise.resolve();
    expect(g.controls.dragging).toBe(true);
    g.dispose();
  });

  it("cancels once on disposal and removes listeners", async () => {
    const g = gesture(); g.start();
    g.target.dispatchEvent(pointer("pointerup"));
    g.dispose();
    await Promise.resolve();
    expect(g.controls.reset).toHaveBeenCalledOnce();
    expect(g.controls.pointerUp).toHaveBeenCalledOnce();
    g.controls.dragging = true;
    g.target.dispatchEvent(pointer("pointermove", { buttons: 0 }));
    expect(g.controls.dragging).toBe(true);
  });
});

describe("numeric input focus", () => {
  it("waits for release and focuses only the latest field", async () => {
    const target = new EventTarget() as Window;
    const gate = new PointerFocusGate(target);
    const first = vi.fn(), last = vi.fn();
    target.dispatchEvent(pointer("pointerdown"));
    gate.request(first); gate.request(last);
    await Promise.resolve();
    expect(last).not.toHaveBeenCalled();
    target.dispatchEvent(pointer("pointerup"));
    await Promise.resolve();
    expect(first).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledOnce();
    gate.dispose();
  });

  it("drops pending focus on cancel and can focus a keyboard request", async () => {
    const target = new EventTarget() as Window;
    const gate = new PointerFocusGate(target);
    const focus = vi.fn();
    target.dispatchEvent(pointer("pointerdown"));
    gate.request(focus);
    target.dispatchEvent(pointer("pointercancel"));
    await Promise.resolve();
    expect(focus).not.toHaveBeenCalled();
    gate.request(focus);
    await Promise.resolve();
    expect(focus).toHaveBeenCalledOnce();
    gate.dispose();
  });
});

describe("complete native rotation rings", () => {
  it.each(["perspective", "orthographic"])("shows X/Y/Z circles in a %s camera", (kind) => {
    const camera = kind === "perspective" ? new THREE.PerspectiveCamera() : new THREE.OrthographicCamera();
    const element = Object.assign(new EventTarget(), { style: {} }) as unknown as HTMLElement;
    const controls = new TransformControls(camera, element);
    const helper = controls.getHelper();
    completeRotationRings(helper);
    const axes = new Map<string, THREE.Mesh>();
    helper.traverse((object) => {
      if (object.type !== "TransformControlsGizmo") return;
      const group = object as THREE.Object3D & { gizmo: { rotate: THREE.Object3D } };
      for (const ring of group.gizmo.rotate.children) {
        if (ring instanceof THREE.Mesh && ["X", "Y", "Z"].includes(ring.name)) axes.set(ring.name, ring);
      }
    });
    expect(axes.size).toBe(3);
    for (const [axis, mesh] of axes) {
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox!;
      for (const coordinate of ["x", "y", "z"] as const) {
        if (coordinate === axis.toLowerCase()) continue;
        expect(box.min[coordinate]).toBeLessThan(-0.49);
        expect(box.max[coordinate]).toBeGreaterThan(0.49);
      }
    }
    controls.dispose();
  });
});
