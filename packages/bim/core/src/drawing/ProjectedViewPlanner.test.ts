import { describe, expect, it } from "vitest";
import type { AssemblyViewBasis } from "./AssemblyViewOrientationControls";
import {
  placeProjectedViewport, projectedViewLabel, projectedViewportOverlaps,
  projectedViewportSize, projectionDirectionFromPointer, resolveProjectedViewBasis,
  type ProjectedViewDirection, type ProjectionStandard,
} from "./ProjectedViewPlanner";

const xy: AssemblyViewBasis = {
  xAxis: { x: 1, y: 0, z: 0 },
  yAxis: { x: 0, y: 1, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
};
const rx = (degrees: number): AssemblyViewBasis => {
  const angle = degrees * Math.PI / 180;
  return {
    xAxis: { x: Math.cos(angle), y: Math.sin(angle), z: 0 },
    yAxis: { x: -Math.sin(angle), y: Math.cos(angle), z: 0 },
    normal: { x: 0, y: 0, z: 1 },
  };
};
const vec = (x: number, y: number, z: number) => ({ x, y, z });
const dot = (a: ReturnType<typeof vec>, b: ReturnType<typeof vec>) =>
  a.x*b.x + a.y*b.y + a.z*b.z;
const cross = (a: ReturnType<typeof vec>, b: ReturnType<typeof vec>) =>
  vec(a.y*b.z-a.z*b.y,a.z*b.x-a.x*b.z,a.x*b.y-a.y*b.x);

describe("projected CAD Views", () => {
  it("preserves the source rotated local frame without snapping to XYZ", () => {
    const parent = rx(7);
    const right = resolveProjectedViewBasis(parent, "RIGHT", "ISO_A")!;
    expect(right.normal.x).toBeCloseTo(Math.cos(7*Math.PI/180), 8);
    expect(right.normal.y).toBeCloseTo(Math.sin(7*Math.PI/180), 8);
    expect(right.xAxis).toEqual({ x: -parent.normal.x, y: -parent.normal.y, z: -parent.normal.z });
    for (const side of ["RIGHT","LEFT","UP","DOWN","ISO_NE","ISO_NW","ISO_SE","ISO_SW"] as ProjectedViewDirection[]) {
      const b = resolveProjectedViewBasis(parent,side,"ISO_E")!;
      expect(dot(b.xAxis,b.yAxis)).toBeCloseTo(0,8);
      expect(dot(b.xAxis,b.normal)).toBeCloseTo(0,8);
      expect(dot(b.yAxis,b.normal)).toBeCloseTo(0,8);
      expect(dot(cross(b.xAxis,b.yAxis),b.normal)).toBeCloseTo(1,8);
    }
  });
  it("respects ISO E / ISO A opposite projections on all four sides", () => {
    for (const side of ["RIGHT","LEFT","UP","DOWN"] as ProjectedViewDirection[]) {
      const first=resolveProjectedViewBasis(xy,side,"ISO_E")!;
      const third=resolveProjectedViewBasis(xy,side,"ISO_A")!;
      expect(dot(first.normal,third.normal)).toBeCloseTo(-1,10);
    }
    expect(resolveProjectedViewBasis(xy,"RIGHT","ISO_A")?.normal).toEqual(vec(1,0,0));
    expect(resolveProjectedViewBasis(xy,"RIGHT","ISO_E")?.normal).toEqual(vec(-1,0,0));
    expect(projectedViewLabel("RIGHT","ISO_E")).toBe("Vista lateral izquierda");
    expect(projectedViewLabel("DOWN","ISO_E")).toBe("Vista superior");
  });
  it("rejects invalid / left-handed source frames", () => {
    expect(resolveProjectedViewBasis({
      xAxis: xy.xAxis, yAxis: xy.yAxis, normal: vec(0,0,-1),
    },"UP","ISO_E")).toBeNull();
  });
  it("selects ortho or isometric direction from placement pointer", () => {
    const parent={x:200,y:200,width:220,height:140};
    expect(projectionDirectionFromPointer(parent,{x:230,y:230})).toBeNull();
    expect(projectionDirectionFromPointer(parent,{x:470,y:270})).toBe("RIGHT");
    expect(projectionDirectionFromPointer(parent,{x:60,y:270})).toBe("LEFT");
    expect(projectionDirectionFromPointer(parent,{x:310,y:70})).toBe("UP");
    expect(projectionDirectionFromPointer(parent,{x:310,y:450})).toBe("DOWN");
    expect(projectionDirectionFromPointer(parent,{x:515,y:40})).toBe("ISO_NE");
    expect(projectionDirectionFromPointer(parent,{x:40,y:490})).toBe("ISO_SW");
  });
  it("keeps drawing scale and orthographic center alignment", () => {
    const size=projectedViewportSize(
      {x:100,y:100,width:350,height:200},
      {width:3000,height:1000},{width:1000,height:1000},0.08,
    );
    expect(size).toEqual({width:100, height:114});
    const source={x:120,y:200,width:200,height:200};
    const placed=placeProjectedViewport(source,{width:140,height:120},
      "RIGHT",{x:400,y:330},{width:1120,height:792})!;
    expect(placed.x).toBe(400);
    expect(placed.y+placed.height/2).toBe(source.y+source.height/2);
    expect(projectedViewportOverlaps(placed,[source])).toBe(false);
    expect(projectedViewportOverlaps(placed,[{...placed,x:placed.x+10}])).toBe(true);
  });
  it("never forces projected views off page or silently overlaps parent", () => {
    expect(placeProjectedViewport(
      {x:900,y:200,width:200,height:200},{width:200,height:150},
      "RIGHT",{x:1110,y:300},{width:1120,height:792},
    )).toBeNull();
    expect(placeProjectedViewport(
      {x:100,y:200,width:200,height:200},{width:200,height:150},
      "LEFT",{x:20,y:300},{width:1120,height:792},
    )).toBeNull();
    expect(projectedViewportSize({x:0,y:0,width:10,height:10},
      {width:10,height:10},{width:10,height:10},Number.NaN)).toBeNull();
  });
});
