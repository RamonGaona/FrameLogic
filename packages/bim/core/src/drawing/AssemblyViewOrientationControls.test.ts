import { describe, expect, it } from "vitest";
import { ASSEMBLY_VIEW_ORIENTATION_OPTIONS, resolveAssemblyViewBasis, type AssemblyViewOrientationMode } from "./AssemblyViewOrientationControls";

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
  it.each([0.5, 3, 5, 7.5, -6, 12])(
    "aligns a beam rotated %s degrees horizontally in OWN TOP even near XYZ",
    (angle) => {
      const points = rotatedBeam(angle);
      const own = resolveAssemblyViewBasis("LOCAL_TOP", points)!;
      const global = resolveAssemblyViewBasis("WORLD_TOP", points)!;
      const a = points[0]!, b = points[4]!; // Same beam corner, opposite ends.
      const direction = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
      const ownVerticalRun = dot(direction, own.yAxis);
      const globalVerticalRun = dot(direction, global.yAxis);
      expect(Math.abs(ownVerticalRun)).toBeLessThan(0.0001);
      expect(Math.abs(globalVerticalRun)).toBeGreaterThan(0.05);
      // Projection bases are right-handed and never change source geometry.
      expect(dot(cross(own.xAxis, own.yAxis), own.normal)).toBeCloseTo(1, 8);
      expect(points).toEqual(rotatedBeam(angle));
    },
  );
  it("restores own top orientation after switching to world axes without changing geometry", () => {
    const points = rotatedBeam(7.5, 12);
    const original = JSON.parse(JSON.stringify(points));
    const ownBefore = resolveAssemblyViewBasis("LOCAL_TOP", points);
    const world = resolveAssemblyViewBasis("WORLD_TOP", points);
    const ownAfter = resolveAssemblyViewBasis("LOCAL_TOP", points);
    expect(ownAfter).toEqual(ownBefore);
    expect(ownAfter).not.toEqual(world);
    expect(points).toEqual(original);
  });

  it("keeps a perfectly world-X member horizontal without artificial rotation", () => {
    const own = resolveAssemblyViewBasis("LOCAL_TOP", rotatedBeam(0));
    expect(own?.xAxis.x).toBeCloseTo(1, 10);
    expect(own?.xAxis.y).toBeCloseTo(0, 10);
  });
  it("chooses the long beam direction even with a short anchorage plate near one end", () => {
    const beam = rotatedBeam(6, 12);
    const a = 6 * Math.PI / 180;
    const c = Math.cos(a), s = Math.sin(a);
    const plate = [-0.15, 0.15].flatMap((x) =>
      [-0.45, 0.45].flatMap((y) =>
        [-0.45, 0.45].map((z) => ({
          x: (6 + x) * c - y * s,
          y: (6 + x) * s + y * c,
          z,
        }))));
    const own = resolveAssemblyViewBasis("LOCAL_TOP", [...beam, ...plate]);
    const global = resolveAssemblyViewBasis("WORLD_TOP", [...beam, ...plate]);
    expect(own).not.toBeNull();
    const direction = { x: 12 * c, y: 12 * s, z: 0 };
    expect(Math.abs(dot(direction, own!.yAxis))).toBeLessThan(0.3);
    expect(Math.abs(dot(direction, global!.yAxis))).toBeGreaterThan(1);
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

  it("offers all six own orthographic views, local isometric and only three world views", () => {
    expect(ASSEMBLY_VIEW_ORIENTATION_OPTIONS).toEqual([
      ["CURRENT", "Actual / WorkPlane original"],
      ["LONGITUDINAL", "Alzado · eje propio"],
      ["LOCAL_REAR", "Posterior · eje propio"],
      ["LOCAL_TOP", "Planta · eje propio"],
      ["LOCAL_BOTTOM", "Inferior · eje propio"],
      ["LOCAL_END", "Extremo · eje propio"],
      ["LOCAL_END_OPPOSITE", "Extremo opuesto · eje propio"],
      ["LOCAL_ISO", "Isométrica · eje propio"],
      ["WORLD_FRONT", "Alzado · ejes globales"],
      ["WORLD_TOP", "Planta · ejes globales"],
      ["WORLD_ISO", "Isométrica · ejes globales"],
    ]);
  });

  it.each([
    ["LONGITUDINAL", "LOCAL_REAR", "yAxis"],
    ["LOCAL_TOP", "LOCAL_BOTTOM", "xAxis"],
    ["LOCAL_END", "LOCAL_END_OPPOSITE", "yAxis"],
  ] as const)("projects %s and its opposite %s from opposite sides", (frontMode, rearMode, stableAxis) => {
    const points = rotatedBeam(31);
    const front = resolveAssemblyViewBasis(frontMode, points)!;
    const rear = resolveAssemblyViewBasis(rearMode, points)!;
    expect(dot(front.normal, rear.normal)).toBeCloseTo(-1, 8);
    expect(dot(front[stableAxis], rear[stableAxis])).toBeCloseTo(1, 8);
    for (const basis of [front, rear]) {
      expect(dot(basis.xAxis, basis.yAxis)).toBeCloseTo(0, 8);
      expect(dot(basis.xAxis, basis.normal)).toBeCloseTo(0, 8);
      expect(dot(basis.yAxis, basis.normal)).toBeCloseTo(0, 8);
      expect(dot(cross(basis.xAxis, basis.yAxis), basis.normal)).toBeCloseTo(1, 8);
    }
    const asymmetric = { x: 4, y: 2, z: 3 };
    expect(dot(asymmetric, front.normal)).toBeCloseTo(-dot(asymmetric, rear.normal), 8);
    expect(points).toEqual(rotatedBeam(31));
  });

  it("changes repeatedly between rotated assembly own axes and world axes without touching geometry", () => {
    const points = rotatedBeam(27, 12);
    const original = JSON.stringify(points);
    const modes: AssemblyViewOrientationMode[] = [
      "LONGITUDINAL", "LOCAL_REAR", "LOCAL_TOP", "LOCAL_BOTTOM",
      "LOCAL_END", "LOCAL_END_OPPOSITE", "LOCAL_ISO",
      "WORLD_FRONT", "WORLD_TOP", "WORLD_ISO", "LOCAL_TOP", "LOCAL_REAR",
    ];
    const frames = modes.map((mode) => resolveAssemblyViewBasis(mode, points));
    expect(frames.every(Boolean)).toBe(true);
    expect(frames[2]).toEqual(frames[10]);
    expect(frames[1]).toEqual(frames[11]);
    expect(frames[2]).not.toEqual(frames[8]);
    expect(JSON.stringify(points)).toEqual(original);
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
