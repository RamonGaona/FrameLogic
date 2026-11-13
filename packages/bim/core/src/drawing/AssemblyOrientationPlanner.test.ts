import { describe, expect, it } from "vitest";
import { inferAssemblyLongitudinalFrame, type OrientationPoint3 } from "./AssemblyOrientationPlanner";
import { planSmartAssemblyViews } from "./AutoDrawingPlanner";

const dot = (a: OrientationPoint3, b: OrientationPoint3) =>
  a.x * b.x + a.y * b.y + a.z * b.z;

// A 6 m long beam rotated relative to the global X/Y axes.
function rotatedBeamPoints(angle: number): OrientationPoint3[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  const points: OrientationPoint3[] = [];
  for (const u of [-3, 3]) for (const v of [-0.16, 0.16])
    for (const z of [-0.22, 0.22])
      points.push({ x: 8 + u * c - v * s, y: 5 + u * s + v * c, z });
  return points;
}

describe("geometry-driven assembly view orientation", () => {
  it("detects a rotated longitudinal axis rather than the global AABB axis", () => {
    const points = rotatedBeamPoints(Math.PI / 4);
    const frame = inferAssemblyLongitudinalFrame(points);
    expect(frame).not.toBeNull();
    expect(frame!.xAxis.x).toBeCloseTo(Math.SQRT1_2, 6);
    expect(frame!.xAxis.y).toBeCloseTo(Math.SQRT1_2, 6);
    expect(frame!.xAxis.z).toBeCloseTo(0, 6);
    expect(dot(frame!.xAxis, frame!.normal)).toBeCloseTo(0, 8);
    expect(dot(frame!.xAxis, frame!.yAxis)).toBeCloseTo(0, 8);
    expect(dot(frame!.yAxis, frame!.normal)).toBeCloseTo(0, 8);

    const views = planSmartAssemblyViews({
      min: { x: 5, y: 2, z: -0.22 },
      max: { x: 11, y: 8, z: 0.22 },
    }, 3, points);
    expect(views.map((view) => view.code)).toEqual(["FRONT", "RIGHT", "ISO"]);
    const front = views[0]!, end = views[1]!;
    expect(dot(front.xAxis, frame!.xAxis)).toBeCloseTo(1, 6);
    expect(dot(end.normal, frame!.xAxis)).toBeCloseTo(1, 6);
    expect(front.width).toBeGreaterThan(6);
    expect(front.width).toBeLessThan(7);
    expect(end.width).toBeLessThan(1);
  });

  it("uses a stable vertical frame for a vertical post", () => {
    const points: OrientationPoint3[] = [];
    for (const x of [-0.1, 0.1]) for (const y of [-0.2, 0.2])
      for (const z of [-5, 5]) points.push({ x, y, z });
    const frame = inferAssemblyLongitudinalFrame(points);
    expect(frame).not.toBeNull();
    expect(frame!.xAxis.z).toBeCloseTo(1, 6);
    expect(frame!.normal.x).toBeCloseTo(-1, 6);
    expect(dot(frame!.normal, frame!.yAxis)).toBeCloseTo(0, 8);
  });

  it("does not force an arbitrary longitudinal direction onto a cube", () => {
    const points: OrientationPoint3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1])
      for (const z of [-1, 1]) points.push({ x, y, z });
    expect(inferAssemblyLongitudinalFrame(points)).toBeNull();
    const views = planSmartAssemblyViews({
      min: { x: -1, y: -1, z: -1 },
      max: { x: 1, y: 1, z: 1 },
    }, 8, points);
    expect(views.map((view) => view.code)).toEqual(["FRONT", "RIGHT", "TOP", "ISO"]);
    expect(views[0]?.xAxis).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("rejects degenerate, invalid, and undersampled geometry", () => {
    const same = Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0 }));
    expect(inferAssemblyLongitudinalFrame(same)).toBeNull();
    expect(inferAssemblyLongitudinalFrame(rotatedBeamPoints(0).slice(0, 7))).toBeNull();
    const invalid = rotatedBeamPoints(0);
    invalid[0] = { x: Number.NaN, y: 0, z: 0 };
    expect(inferAssemblyLongitudinalFrame(invalid)).toBeNull();
    expect(inferAssemblyLongitudinalFrame(rotatedBeamPoints(0), Number.NaN)).toBeNull();
  });
});
