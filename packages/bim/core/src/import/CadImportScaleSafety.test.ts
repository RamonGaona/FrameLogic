import { describe, expect, it } from "vitest";
import { suspiciousDwgMeterScale } from "./CadImportScaleSafety";

const example = (width: number) => ({
  segments: [{ layer: "0", color: "#ffffff",
    start: { x: 0, y: 0, z: 0 }, end: { x: width, y: 0, z: 0 } }],
  points: [],
});

describe("DWG origin-unit safety", () => {
  it("retains the suspicious ×1000 confirmation from worker-only extent metadata", () => {
    expect(suspiciousDwgMeterScale({ segments: [], points: [], rawExtent: 15005.75 }, 1000))
      .toEqual({ rawSpan: 15005.75, resultingSpanMm: 15005750 });
  });

  it("warns before accidentally converting 15,005.75 mm into 15 km", () => {
    expect(suspiciousDwgMeterScale(example(15005.75), 1000)).toEqual({
      rawSpan: 15005.75,
      resultingSpanMm: 15005750,
    });
  });
  it("does not warn for millimetres, normal metre-based dimensions or missing data", () => {
    expect(suspiciousDwgMeterScale(example(15005.75), 1)).toBeNull();
    expect(suspiciousDwgMeterScale(example(15.00575), 1000)).toBeNull();
    expect(suspiciousDwgMeterScale({ segments: [], points: [] }, 1000)).toBeNull();
  });
});
