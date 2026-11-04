import { describe, expect, it, vi } from "vitest";
import { configureMoveDestinationSnaps } from "./MoveSnapDestinationPolicy";

function snapRuntime() {
  const excluded = new Set<string>();
  return {
    setExcludedInstanceIds: vi.fn((ids: readonly string[]) => {
      excluded.clear();
      for (const id of ids) excluded.add(id);
    }),
    clearExcludedInstanceIds: vi.fn(() => excluded.clear()),
    findSnap: (instanceId: string) => excluded.has(instanceId) ? null : { instanceId },
  };
}

describe("MOVE axis armed destination SNAP ownership", () => {
  it("allows selecting another SNAP on the same piece after re-positioning the pivot", () => {
    const snap = snapRuntime();
    configureMoveDestinationSnaps(snap, ["piece-1"], "DRAGGING");
    expect(snap.findSnap("piece-1")).toBeNull();
    configureMoveDestinationSnaps(snap, ["piece-1"], "PICK_DESTINATION");
    expect(snap.findSnap("piece-1")).toEqual({ instanceId: "piece-1" });
    expect(snap.clearExcludedInstanceIds).toHaveBeenCalledOnce();
  });

  it("keeps external CAD or other-piece SNAP destinations available", () => {
    const snap = snapRuntime();
    configureMoveDestinationSnaps(snap, ["piece-1"], "DRAGGING");
    expect(snap.findSnap("external-cad-point")).toEqual({ instanceId: "external-cad-point" });
    expect(snap.findSnap("piece-2")).toEqual({ instanceId: "piece-2" });
    configureMoveDestinationSnaps(snap, ["piece-1"], "PICK_DESTINATION");
    expect(snap.findSnap("external-cad-point")).toEqual({ instanceId: "external-cad-point" });
  });

  it("reapplies exclusion when a true drag starts after a previous armed click", () => {
    const snap = snapRuntime();
    configureMoveDestinationSnaps(snap, ["piece-1"], "PICK_DESTINATION");
    configureMoveDestinationSnaps(snap, ["piece-1"], "DRAGGING");
    expect(snap.findSnap("piece-1")).toBeNull();
    expect(snap.setExcludedInstanceIds).toHaveBeenCalledWith(["piece-1"]);
  });
});
