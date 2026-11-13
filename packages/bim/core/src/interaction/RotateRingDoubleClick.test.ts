import { describe, expect, it } from "vitest";
import { RotateRingDoubleClick } from "./RotateRingDoubleClick";

describe("RotateRingDoubleClick", () => {
  it("recognizes two short clicks on the same ring", () => {
    const tracker = new RotateRingDoubleClick();
    tracker.record("X", 140, 55, 1000, false);
    tracker.record("X", 142, 55, 1180, false);
    expect(tracker.take(143, 56, 1190)).toBe("X");
    expect(tracker.take(143, 56, 1200)).toBeNull();
  });
  it("allows a deliberate 600 ms double click and 13 pixel pointer drift", () => {
    const tracker = new RotateRingDoubleClick();
    tracker.record("Y", 140, 55, 1000, false);
    tracker.record("Y", 153, 55, 1600, false);
    expect(tracker.take(154, 55, 1610)).toBe("Y");
  });

  it("ignores different axes even on the same canvas element", () => {
    const tracker = new RotateRingDoubleClick();
    tracker.record("X", 140, 55, 1000, false);
    tracker.record("Y", 140, 55, 1180, false);
    expect(tracker.take(140, 55, 1190)).toBeNull();
  });
  it("ignores spatially separated or delayed click pairs", () => {
    const tracker = new RotateRingDoubleClick();
    tracker.record("Z", 100, 100, 1000, false);
    tracker.record("Z", 119, 100, 1100, false);
    expect(tracker.take(119, 100, 1110)).toBeNull();
    tracker.record("Z", 119, 100, 1800, false);
    expect(tracker.take(119, 100, 1810)).toBeNull();
  });
  it("never rotates after a drag gesture", () => {
    const tracker = new RotateRingDoubleClick();
    tracker.record("Z", 100, 100, 1000, false);
    tracker.record("Z", 101, 101, 1200, true);
    expect(tracker.take(101, 101, 1210)).toBeNull();
  });
  it("refuses stale dblclick events and resets after selection is changed", () => {
    const tracker = new RotateRingDoubleClick();
    tracker.record("Y", 20, 20, 1000, false);
    tracker.record("Y", 20, 21, 1200, false);
    expect(tracker.take(20, 21, 1900)).toBeNull();
    tracker.record("Y", 20, 20, 2000, false);
    tracker.reset();
    tracker.record("Y", 20, 20, 2100, false);
    expect(tracker.take(20, 20, 2200)).toBeNull();
  });
});
