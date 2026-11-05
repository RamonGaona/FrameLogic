import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DesignPlacementController } from "./DesignPlacementController";

function pointer(type: string, x: number, y: number): PointerEvent {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1,
    clientX: x, clientY: y, isPrimary: true });
  return event as PointerEvent;
}

function fixture() {
  const canvas = new EventTarget() as HTMLElement;
  Object.assign(canvas, { style: { cursor: "" } });
  vi.stubGlobal("window", new EventTarget() as Window);
  const registerPieceInstance = vi.fn((data: any) => ({ id: "piece", data }));
  const model = {
    pieceDefinitions: { get: () => ({ geometryAssetId: "asset", code: "P" }) },
    registerPieceInstance,
  };
  const visuals = { getAssetPrototype: () => new THREE.Object3D(), sync: vi.fn() };
  const picker = vi.fn(async (x: number, y: number) => ({
    point: new THREE.Vector3(x, 0, y), distance: 1, modelId: "ref", localId: 1,
  }));
  type Args = ConstructorParameters<typeof DesignPlacementController>;
  const ctl = new DesignPlacementController(
    new THREE.Scene(), canvas, () => new THREE.PerspectiveCamera(),
    model as unknown as Args[3], visuals as unknown as Args[4], picker,
  );
  const click = (x: number, y: number) => {
    canvas.dispatchEvent(pointer("pointerdown", x, y));
    canvas.dispatchEvent(pointer("pointerup", x, y));
  };
  return { ctl, click, registerPieceInstance };
}
afterEach(() => vi.unstubAllGlobals());

describe("two-click instance insertion", () => {
  it("uses first click for origin and second for yaw, then creates exactly one instance", async () => {
    const s = fixture();
    const pending = s.ctl.startPlacement("definition");
    s.click(10, 20);
    await vi.waitFor(() => expect(Reflect.get(s.ctl, "placementOrigin")).toBeInstanceOf(THREE.Vector3));
    expect(s.registerPieceInstance).not.toHaveBeenCalled();
    expect(s.ctl.isPlacing).toBe(true);
    s.click(10, 30);
    await vi.waitFor(() => expect(s.registerPieceInstance).toHaveBeenCalledOnce());
    const params = s.registerPieceInstance.mock.calls[0]![0];
    expect(params.transform.position).toEqual({ x: 10, y: 0, z: 20 });
    expect(params.transform.rotation.y).toBeCloseTo(-Math.PI / 2);
    expect(await pending).not.toBeNull();
    expect(s.ctl.isPlacing).toBe(false);
    s.ctl.dispose();
  });

  it("ignores a zero-length direction and cancels without creating a piece", async () => {
    const s = fixture();
    const pending = s.ctl.startPlacement("definition");
    s.click(5, 7);
    await vi.waitFor(() => expect(Reflect.get(s.ctl, "placementOrigin")).toBeInstanceOf(THREE.Vector3));
    s.click(5, 7);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(s.registerPieceInstance).not.toHaveBeenCalled();
    expect(s.ctl.isPlacing).toBe(true);
    s.ctl.cancelPlacement();
    expect(await pending).toBeNull();
    s.ctl.dispose();
  });
});
