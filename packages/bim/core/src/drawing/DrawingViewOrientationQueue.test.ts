import { describe, expect, it } from "vitest";
import { DrawingViewOrientationQueue } from "./DrawingViewOrientationQueue";

const request = (mode: "LOCAL_TOP" | "WORLD_TOP" | "WORLD_FRONT", viewId = "view-1") =>
  ({ sheetId: "sheet-1", viewId, mode });

describe("Paper Space View orientation selection during projection", () => {
  it("switches from global axes back to own axes, keeping the latest selected mode", () => {
    const queue = new DrawingViewOrientationQueue();
    expect(queue.startOrQueue(request("WORLD_TOP"))).toBe(true);
    expect(queue.displayedMode("sheet-1", "view-1", "LOCAL_TOP")).toBe("WORLD_TOP");

    // The user changes their mind while projectAssembly is still calculating.
    expect(queue.startOrQueue(request("WORLD_FRONT"))).toBe(false);
    expect(queue.startOrQueue(request("LOCAL_TOP"))).toBe(false);
    expect(queue.displayedMode("sheet-1", "view-1", "WORLD_TOP")).toBe("LOCAL_TOP");

    expect(queue.complete()).toEqual(request("LOCAL_TOP"));
    expect(queue.startOrQueue(request("LOCAL_TOP"))).toBe(true);
    expect(queue.complete()).toBeNull();
    expect(queue.displayedMode("sheet-1", "view-1", "LOCAL_TOP")).toBe("LOCAL_TOP");
  });

  it("never changes the displayed mode of another View", () => {
    const queue = new DrawingViewOrientationQueue();
    queue.startOrQueue(request("WORLD_TOP"));
    queue.startOrQueue(request("WORLD_FRONT"));
    expect(queue.displayedMode("sheet-1", "view-2", "LOCAL_TOP")).toBe("LOCAL_TOP");
    expect(queue.displayedMode("other-sheet", "view-1", "LOCAL_TOP")).toBe("LOCAL_TOP");
    expect(queue.complete()).toEqual(request("WORLD_FRONT"));
  });

  it("queues only the final request, and allows a fresh choice after failure", () => {
    const queue = new DrawingViewOrientationQueue();
    queue.startOrQueue(request("WORLD_TOP"));
    queue.startOrQueue(request("WORLD_FRONT"));
    queue.startOrQueue(request("LOCAL_TOP"));
    expect(queue.complete()?.mode).toBe("LOCAL_TOP");
    expect(queue.startOrQueue(request("WORLD_TOP"))).toBe(true);
    expect(queue.complete()).toBeNull();
  });
});
