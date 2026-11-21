import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  planRepositoryStepDemoFill,
  REPOSITORY_STEP_EXAMPLES,
} from "../apps/web/src/features/bim/repositoryStepDemo";

const sequence = [
  { code: "REC1500", lengthMm: 1500 },
  { code: "REC3000", lengthMm: 3000 },
  { code: "REC6000", lengthMm: 6000 },
];
const line = (length = 21000) => ({
  start: { x: 0, y: 300, z: 0 },
  end: { x: length, y: 300, z: 0 },
});

describe("bundled repository STEP insertion demo", () => {
  it("ships exactly the three original uploaded STEP files, unmodified", () => {
    const hashes = [
      "c4c61bc791693c2ef1998c5044227d93ee7a0fb09b7f136960e706118f633cc5",
      "9e25fe84d7e868f1d811550013e8c46e9b905cbd8e7ef011da0d8bcfcdf0a5aa",
      "d351329b4ad75e9a48f659853a75d77454d1af8ed2243aa663a22ff2b967668b",
    ];
    expect(REPOSITORY_STEP_EXAMPLES.map(asset => asset.code))
      .toEqual(["REC1500", "REC3000", "REC6000"]);
    for (const [index, item] of REPOSITORY_STEP_EXAMPLES.entries()) {
      expect(item.url).toBe("/examples/step/" + item.fileName);
      const data = readFileSync(new URL("../apps/web/public" + item.url, import.meta.url));
      expect(data.toString("utf8", 0, 13)).toBe("ISO-10303-21;");
      expect(createHash("sha256").update(data).digest("hex")).toBe(hashes[index]);
    }
  });

  it("repeats the three full pieces in upload order without JSONs or cuts", () => {
    const plan = planRepositoryStepDemoFill(line(), sequence);
    expect(plan.segments.map(x => x.code)).toEqual([
      "REC1500", "REC3000", "REC6000",
      "REC1500", "REC3000", "REC6000",
    ]);
    expect(plan.segments.map(x => x.offsetMm))
      .toEqual([0, 1500, 4500, 10500, 12000, 15000]);
    expect(plan.occupiedMm).toBe(21000);
    expect(plan.remainingMm).toBe(0);
  });

  it("uses the real loaded 3D lengths instead of trusting names", () => {
    const actual = [
      { code: "REC1500", lengthMm: 1498.6 },
      { code: "REC3000", lengthMm: 3002 },
      { code: "REC6000", lengthMm: 5999.2 },
    ];
    const plan = planRepositoryStepDemoFill(line(11000), actual);
    expect(plan.segments.map(x => x.lengthMm)).toEqual([1498.6, 3002, 5999.2]);
    expect(plan.remainingMm).toBeCloseTo(5000 * 0 + (11000 - 10499.8), 4);
  });

  it("preserves reversed 3D line direction and never exceeds the endpoint", () => {
    const backwards = {
      start: { x: 10000, y: 20, z: 200 },
      end: { x: -500, y: 20, z: 200 },
    };
    const plan = planRepositoryStepDemoFill(backwards, sequence);
    expect(plan.segments).toHaveLength(3);
    expect(plan.segments[0]?.start).toEqual(backwards.start);
    expect(plan.segments[1]?.start).toEqual({ x: 8500, y: 20, z: 200 });
    expect(plan.remainingMm).toBe(0);
  });

  it("does not insert partial pieces, checks minimum and instance limits", () => {
    const short = planRepositoryStepDemoFill(line(1700), sequence);
    expect(short.segments.map(x => x.code)).toEqual(["REC1500"]);
    expect(short.remainingMm).toBe(200);
    expect(() => planRepositoryStepDemoFill(line(1000), sequence)).toThrow(/no cabe/);
    expect(() => planRepositoryStepDemoFill(line(0), sequence)).toThrow(/mayor a cero/);
    expect(() => planRepositoryStepDemoFill(line(1500), [])).toThrow(/longitudes válidas/);
    const capped = planRepositoryStepDemoFill(line(50000), sequence, 2);
    expect(capped.segments).toHaveLength(2);
    expect(capped.capped).toBe(true);
  });
});
