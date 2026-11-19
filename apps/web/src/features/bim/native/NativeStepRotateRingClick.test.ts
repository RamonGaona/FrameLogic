import { describe, expect, it } from "vitest";

import { NativeStepRotateRingClick } from "./NativeStepRotateRingClick";

describe("native STEP rotation gizmo: +90° by double click", () => {
  it("recognizes two short clicks on the same XYZ ring and instance", () => {
    const clicks = new NativeStepRotateRingClick();
    expect(clicks.shortClick("Z", "partA", 250, 180, 1000)).toBe(false);
    expect(clicks.shortClick("Z", "partA", 253, 184, 1490)).toBe(true);
    // A third click begins a new sequence: no accidental repeated 90° turns.
    expect(clicks.shortClick("Z", "partA", 253, 184, 1550)).toBe(false);
    expect(clicks.shortClick("Z", "partA", 253, 184, 1600)).toBe(true);
  });

  it("rejects different rings, different instances, and distant clicks", () => {
    const clicks = new NativeStepRotateRingClick();
    expect(clicks.shortClick("X", "partA", 100, 100, 100)).toBe(false);
    expect(clicks.shortClick("Y", "partA", 100, 100, 200)).toBe(false);
    expect(clicks.shortClick("Y", "partB", 100, 100, 250)).toBe(false);
    expect(clicks.shortClick("Y", "partB", 116, 100, 290)).toBe(false);
    expect(clicks.shortClick("Y", "partB", 116, 100, 950)).toBe(false);
  });

  it("respects reset and invalid inputs without firing a spurious turn", () => {
    const clicks = new NativeStepRotateRingClick();
    expect(clicks.shortClick("Z", "partA", 300, 300, 100)).toBe(false);
    clicks.reset();
    expect(clicks.shortClick("Z", "partA", 300, 300, 150)).toBe(false);
    expect(clicks.shortClick("Z", "partA", Number.NaN, 300, 180)).toBe(false);
    expect(clicks.shortClick("Z", "partA", 300, 300, 200)).toBe(false);
    expect(clicks.shortClick("Z", "partA", 300, 300, 190)).toBe(false);
  });
});
