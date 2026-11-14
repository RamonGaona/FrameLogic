import { describe, expect, it } from "vitest";
import {
  clipProjectedLineToCircle, cropProjectedDetail, detailLetter,
  nextCircularDetailLetter, paperCircleToProjection, projectionCircleToPaper,
  validDetailAncestry,
} from "./DrawingDetailViewPlanner";

describe("circular detail projected geometry", () => {
  const circle = { x: 50, y: 30, radius: 10 };
  it("converts paper circles through the exact source viewport scale", () => {
    const transform = { originX: 100, originY: 200, drawnHeight: 400, scale: 2 };
    const paper = projectionCircleToPaper(circle, transform);
    expect(paper).toEqual({ x: 200, y: 540, radius: 20 });
    expect(paperCircleToProjection({ x: paper.x, y: paper.y }, paper.radius, transform))
      .toEqual(circle);
    expect(paperCircleToProjection({ x: 0, y: 0 }, 0, transform)).toBeNull();
  });
  it("analytically clips crossing segments, preserving hidden/cut metadata", () => {
    const line = { x1: 20, y1: 30, x2: 80, y2: 30, hidden: true, cut: true };
    const clipped = clipProjectedLineToCircle(line, circle);
    expect(clipped).toEqual({ x1: 40, y1: 30, x2: 60, y2: 30, hidden: true, cut: true });
    expect(line.x1).toBe(20);
    expect(clipProjectedLineToCircle({ x1: 0, y1: 0, x2: 10, y2: 0 }, circle)).toBeNull();
  });
  it("rejects tangent-only contact and retains fully contained lines", () => {
    expect(clipProjectedLineToCircle({ x1: 30, y1: 40, x2: 70, y2: 40 }, circle)).toBeNull();
    expect(clipProjectedLineToCircle({ x1: 48, y1: 30, x2: 52, y2: 30 }, circle))
      .toEqual({ x1: 48, y1: 30, x2: 52, y2: 30 });
  });
  it("builds truly cropped local vector coordinates, not a full-view copy", () => {
    const segments = [
      { x1: 20, y1: 30, x2: 80, y2: 30 },
      { x1: 50, y1: 22, x2: 50, y2: 38, hidden: true },
      { x1: 0, y1: 0, x2: 10, y2: 0 },
    ];
    const result = cropProjectedDetail(segments, circle)!;
    expect(result.width).toBe(20);
    expect(result.height).toBe(20);
    expect(result.offsetX).toBe(40);
    expect(result.offsetY).toBe(20);
    expect(result.segments).toEqual([
      { x1: 0, y1: 10, x2: 20, y2: 10 },
      { x1: 10, y1: 2, x2: 10, y2: 18, hidden: true },
    ]);
    expect(segments[0]!.x1).toBe(20);
  });
  it("recomputes geometry when radius/center changes without touching parent", () => {
    const original = [{ x1: 0, y1: 30, x2: 100, y2: 30 }];
    const small = cropProjectedDetail(original, circle)!;
    const moved = cropProjectedDetail(original, { x: 65, y: 30, radius: 5 })!;
    expect(small.segments[0]).toEqual({ x1: 0, y1: 10, x2: 20, y2: 10 });
    expect(moved.segments[0]).toEqual({ x1: 0, y1: 5, x2: 10, y2: 5 });
    expect(original[0]!.x1).toBe(0);
  });
  it("reuses the exact source local axes, independent of world orientation", () => {
    const basis = { xAxis: { x: 0, y: 1, z: 0 }, yAxis: { x: -1, y: 0, z: 0 } };
    const local = paperCircleToProjection({ x: 160, y: 350 }, 20,
      { originX: 100, originY: 200, drawnHeight: 200, scale: 2 });
    expect(local).toEqual({ x: 30, y: 25, radius: 10 });
    expect(basis.xAxis).toEqual({ x: 0, y: 1, z: 0 });
  });
  it("assigns stable A..Z, AA labels without duplicates", () => {
    expect(detailLetter(0)).toBe("A");
    expect(detailLetter(25)).toBe("Z");
    expect(detailLetter(26)).toBe("AA");
    expect(nextCircularDetailLetter(["A", "B", "D"])).toBe("C");
  });
  it("prevents saved circular dependencies", () => {
    const views = [
      { id: "parent" }, { id: "detailA", sourceViewId: "parent" },
      { id: "detailB", sourceViewId: "detailA" },
    ];
    expect(validDetailAncestry("detailB", "new", views)).toBe(true);
    expect(validDetailAncestry("detailB", "parent", views)).toBe(false);
    expect(validDetailAncestry("absent", "new", views)).toBe(false);
  });
});
