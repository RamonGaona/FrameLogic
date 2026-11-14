import { describe, expect, it } from "vitest";
import { resolveAssemblyViewBasis } from "./AssemblyViewOrientationControls";

const rotatedBeam = (angleDegrees: number, length = 10) => {
  const a = angleDegrees * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [-length / 2, length / 2].flatMap((x) =>
    [-0.12, 0.12].flatMap((y) =>
      [-0.09, 0.09].map((z) => ({
        x: x * c - y * s,
        y: x * s + y * c,
        z,
      }))));
};
const dot = (a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }) =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });

describe("PDF View local/global orientations", () => {
  it("makes an X-aligned long member exactly horizontal in the paper even with slight geometry skew", () => {
    const result = resolveAssemblyViewBasis("LONGITUDINAL", rotatedBeam(5));
    expect(result?.xAxis.x).toBe(1);
    expect(result?.xAxis.y).toBe(0);
    expect(result?.xAxis.z).toBe(0);
    expect(result?.yAxis.z).toBe(1);
    expect(result?.normal.y).toBe(-1);
  });
  it("keeps a genuinely rotated beam aligned with its OWN axis, not the world axes", () => {
    const frame = resolveAssemblyViewBasis("LONGITUDINAL", rotatedBeam(37));
    expect(frame).not.toBeNull();
    expect(frame!.xAxis.x).toBeCloseTo(Math.cos(37 * Math.PI / 180), 3);
    expect(frame!.xAxis.y).toBeCloseTo(Math.sin(37 * Math.PI / 180), 3);
    expect(frame!.yAxis.z).toBeCloseTo(1, 3);
    expect(dot(cross(frame!.xAxis, frame!.yAxis), frame!.normal)).toBeCloseTo(1, 8);
  });
  it("offers local plan, end and isometric right-handed bases without modifying points", () => {
    const points = rotatedBeam(27);
    for (const mode of ["LONGITUDINAL", "LOCAL_TOP", "LOCAL_END", "LOCAL_ISO"] as const) {
      const frame = resolveAssemblyViewBasis(mode, points);
      expect(frame).not.toBeNull();
      expect(dot(frame!.xAxis, frame!.yAxis)).toBeCloseTo(0, 8);
      expect(dot(frame!.xAxis, frame!.normal)).toBeCloseTo(0, 8);
      expect(dot(frame!.yAxis, frame!.normal)).toBeCloseTo(0, 8);
      expect(dot(cross(frame!.xAxis, frame!.yAxis), frame!.normal)).toBeCloseTo(1, 8);
    }
    expect(points).toEqual(rotatedBeam(27));
  });
  it("keeps world orthographic presets independent of local geometry and rejects undefined own axis", () => {
    const front = resolveAssemblyViewBasis("WORLD_FRONT", []);
    const top = resolveAssemblyViewBasis("WORLD_TOP", []);
    const right = resolveAssemblyViewBasis("WORLD_RIGHT", []);
    expect(front).toEqual({
      xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 0, z: 1 },
      normal: { x: 0, y: -1, z: 0 },
    });
    expect(top?.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(right?.normal).toEqual({ x: 1, y: 0, z: 0 });
    expect(resolveAssemblyViewBasis("WORLD_ISO", [])).not.toBeNull();
    expect(resolveAssemblyViewBasis("LONGITUDINAL", [])).toBeNull();
    expect(resolveAssemblyViewBasis("CURRENT", rotatedBeam(0))).toBeNull();
  });
});
