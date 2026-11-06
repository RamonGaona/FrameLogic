import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PieceReferenceManipulationController } from "./PieceReferenceManipulationController";

afterEach(() => vi.unstubAllGlobals());

describe("isolated piece manual reference manipulation", () => {
  it("selects a metadata reference by a click and moves it to a snapped target", () => {
    const callbacks = new Map<string, (event: PointerEvent) => void>();
    const canvas = {
      addEventListener: vi.fn((event: string, cb: (event: PointerEvent)=>void) => callbacks.set(event, cb)),
      removeEventListener: vi.fn(),
      getBoundingClientRect: () => ({left:0,top:0,width:1000,height:1000}),
    } as unknown as HTMLElement;
    vi.stubGlobal("window", {addEventListener: vi.fn(), removeEventListener: vi.fn()});
    let selected: {kind:"AXIS";id:string}|null = null;
    const setReferenceToolMessage = vi.fn();
    const relocatePinnedReference = vi.fn();
    const preparation = {
      isActive: true,
      getPinnedReference: () => selected,
      selectReference: (x: typeof selected) => {selected = x;},
      setReferenceToolMessage,
      relocatePinnedReference,
    };
    const onChanged = vi.fn();
    const snapAt = vi.fn(() => new THREE.Vector3(15, 25, 35));
    const controller = new PieceReferenceManipulationController({
      canvas,
      cameraProvider: () => new THREE.OrthographicCamera(),
      preparation: preparation as unknown as ConstructorParameters<typeof PieceReferenceManipulationController>[0]["preparation"],
      helpers: ({findReferenceAtPointer: () => ({kind:"AXIS",id:"ax-1"})}
        as unknown as ConstructorParameters<typeof PieceReferenceManipulationController>[0]["helpers"]),
      snapAt,
      beforeStart: vi.fn(),
      onChanged,
    });
    const click = (x: number,y: number) => {
      const event = {
        button:0,clientX:x,clientY:y,preventDefault:vi.fn(),stopImmediatePropagation:vi.fn(),
      } as unknown as PointerEvent;
      callbacks.get("pointerdown")?.(event);
      callbacks.get("pointerup")?.(event);
    };
    controller.activate("MOVE");
    click(200,200);
    expect(selected).toEqual({kind:"AXIS",id:"ax-1"});
    expect(relocatePinnedReference).not.toHaveBeenCalled();
    click(400,400);
    expect(relocatePinnedReference).toHaveBeenCalledWith(
      new THREE.Vector3(15,25,35),false,
    );
    expect(onChanged).toHaveBeenCalledOnce();
    expect(controller.isActive).toBe(false);
    controller.dispose();
  });

  it("does not retain an editing tool after cancellation", () => {
    const canvas = {addEventListener:vi.fn(),removeEventListener:vi.fn()} as unknown as HTMLElement;
    vi.stubGlobal("window",{addEventListener:vi.fn(),removeEventListener:vi.fn()});
    const controller = new PieceReferenceManipulationController({
      canvas,
      cameraProvider: () => new THREE.Camera(),
      preparation: {
        isActive:true,getPinnedReference:()=>({kind:"SNAP",id:"s"}),
        setReferenceToolMessage:vi.fn(),
      } as unknown as ConstructorParameters<typeof PieceReferenceManipulationController>[0]["preparation"],
      helpers: {} as unknown as ConstructorParameters<typeof PieceReferenceManipulationController>[0]["helpers"],
      snapAt:vi.fn(()=>null),beforeStart:vi.fn(),onChanged:vi.fn(),
    });
    controller.activate("COPY");
    expect(controller.isActive).toBe(true);
    controller.cancel();
    expect(controller.isActive).toBe(false);
    controller.dispose();
  });
});
