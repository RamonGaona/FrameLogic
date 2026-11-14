import { describe, expect, it } from "vitest";
import { transitionOrientationDimensions } from "./DrawingOrientationDimensionState";
import { workshopDimensionKey } from "./WorkshopDimensionLayout";
import type { EngineeringDimensionInstruction } from "./EngineeringAutoDimensionPlanner";

const dimension: EngineeringDimensionInstruction = {
  mode: "HORIZONTAL",
  a: { instanceId: "piece-a", topologyId: "v1", kind: "VERTEX", x: 0, y: 0 },
  b: { instanceId: "piece-a", topologyId: "v2", kind: "VERTEX", x: 30, y: 0 },
  offsetX: 0, offsetY: 0,
};
const key = workshopDimensionKey(dimension);

describe("independent STEP dimension edits by view orientation", () => {
  it("restores manually edited A/B and label offsets on returning to the same geometric view", () => {
    const front = { [key]: { anchorA: { x: 2, y: 3 }, dx: 10 } };
    const top = transitionOrientationDimensions({
      orientationMode: "LONGITUDINAL", dimensionOverrides: front, geometrySignature: "model-1",
    }, "LOCAL_TOP", [dimension], "model-1");
    expect(top.active).toEqual({});
    const again = transitionOrientationDimensions({
      orientationMode: "LOCAL_TOP", dimensionOverrides: top.active,
      orientationDimensionOverrides: top.saved,
      orientationDimensionSignatures: top.signatures,
      geometrySignature: "model-1",
    }, "LONGITUDINAL", [dimension], "model-1");
    expect(again.active).toEqual(front);
    expect(again.warnings).toEqual([]);
    expect(JSON.parse(JSON.stringify(again.saved)).LONGITUDINAL[key]).toEqual(front[key]);
  });

  it("invalidates unsafe manual reference coordinates when model geometry changes", () => {
    const old = { [key]: {
      anchorA: { x: 5, y: 7 }, anchorB: { x: 20, y: 7 }, dy: 12, hidden: false,
    } };
    const changed = transitionOrientationDimensions({
      orientationMode: "LOCAL_BOTTOM", dimensionOverrides: {},
      orientationDimensionOverrides: { LONGITUDINAL: old },
      orientationDimensionSignatures: { LONGITUDINAL: "old-geometry" },
      geometrySignature: "new-geometry",
    }, "LONGITUDINAL", [dimension], "new-geometry");
    expect(changed.active[key]).toEqual({ dy: 12, hidden: false });
    expect(changed.warnings.join(" ")).toContain("referencia(s) A/B");
  });

  it("keeps manually hidden dimensions in their original View only", () => {
    const switched = transitionOrientationDimensions({
      orientationMode: "LONGITUDINAL",
      dimensionOverrides: { [key]: { hidden: true } }, geometrySignature: "stable",
    }, "LOCAL_REAR", [dimension], "stable");
    expect(switched.active).toEqual({});
    expect(switched.saved.LONGITUDINAL?.[key]?.hidden).toBe(true);
    const back = transitionOrientationDimensions({
      orientationMode: "LOCAL_REAR", dimensionOverrides: switched.active,
      orientationDimensionOverrides: switched.saved,
      orientationDimensionSignatures: switched.signatures,
      geometrySignature: "stable",
    }, "LONGITUDINAL", [dimension], "stable");
    expect(back.active[key]?.hidden).toBe(true);
  });

  it("does not reuse orphaned dimension references or numbers in another projection", () => {
    const switched = transitionOrientationDimensions({
      orientationMode: "LOCAL_REAR", dimensionOverrides: { [key]: { dx: 15 } },
      geometrySignature: "stable",
    }, "LOCAL_BOTTOM", [], "stable");
    expect(switched.active).toEqual({});
    expect(switched.saved.LOCAL_REAR?.[key]).toEqual({ dx: 15 });
    expect(switched.warnings).toEqual([]);
  });

  it("does not mutate the state of another View on the same PDF sheet", () => {
    const otherView = { [key]: { dx: 19 } };
    const before = JSON.stringify(otherView);
    transitionOrientationDimensions({
      orientationMode: "LONGITUDINAL", dimensionOverrides: { [key]: { dx: 3 } },
      geometrySignature: "stable",
    }, "LOCAL_END_OPPOSITE", [dimension], "stable");
    expect(JSON.stringify(otherView)).toBe(before);
  });
});
