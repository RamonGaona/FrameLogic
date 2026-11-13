import { describe, expect, it } from "vitest";
import { cropAssemblyDetail, planSectionStations, planSectionDetailSheetSlots } from "./AssemblySectionDetailPlanner";

describe("automatic A-A/B-B section markers", () => {
  const lines = [
    { x1: 0, y1: 0, x2: 100, y2: 0 },
    { x1: 100, y1: 0, x2: 100, y2: 20 },
    { x1: 100, y1: 20, x2: 0, y2: 20 },
    { x1: 0, y1: 20, x2: 0, y2: 0 },
  ];
  it("chooses independent stations inside the measured projected silhouette", () => {
    expect(planSectionStations(lines)).toEqual([
      { label: "A-A", fraction: 0.2, x: 20, yMin: 0, yMax: 20 },
      { label: "B-B", fraction: 0.8, x: 80, yMin: 0, yMax: 20 },
    ]);
    expect(planSectionStations([])).toEqual([]);
    expect(planSectionStations([{ x1: 0, y1: 0, x2: 10, y2: 0 }])).toEqual([]);
    expect(planSectionStations([{ x1: 0, y1: 0, x2: NaN, y2: 2 }])).toEqual([]);
  });
  it("clips linework to an enlarged region without modifying visibility or dimensions", () => {
    const crop = cropAssemblyDetail([
      { x1: 0, y1: 5, x2: 100, y2: 5 },
      { x1: 48, y1: 0, x2: 48, y2: 10, hidden: true },
      { x1: 2, y1: 20, x2: 6, y2: 20 },
    ], 50, 5, 20, 10);
    expect(crop?.window).toEqual({ x: 40, y: 0, width: 20, height: 10 });
    expect(crop?.segments).toEqual([
      { x1: 0, y1: 5, x2: 20, y2: 5 },
      { x1: 8, y1: 0, x2: 8, y2: 10, hidden: true },
    ]);
    expect(cropAssemblyDetail(lines, 30, 30, 10, 10)).toBeNull();
    expect(cropAssemblyDetail(lines, 5, 5, -1, 10)).toBeNull();
  });
  it("lays out up to four nonoverlapping views above the A3 title block", () => {
    const slots = planSectionDetailSheetSlots(4);
    expect(slots).toHaveLength(4);
    expect(slots.every((s) => s.y + s.height <= 614 && s.x + s.width <= 1068)).toBe(true);
    for (const [i, s] of slots.entries()) {
      for (const t of slots.slice(i + 1)) {
        const overlapX = Math.max(0, Math.min(s.x + s.width, t.x + t.width) - Math.max(s.x, t.x));
        const overlapY = Math.max(0, Math.min(s.y + s.height, t.y + t.height) - Math.max(s.y, t.y));
        expect(overlapX * overlapY).toBe(0);
      }
    }
    expect(planSectionDetailSheetSlots(5)).toEqual([]);
  });
});
