import { describe, it, expect } from "vitest";
import { CadDwgSegmentChunks, DWG_SEGMENT_CHUNK_SIZE } from "./CadDwgSegmentChunks";

describe("DWG segment transfer with backpressure and no file-wide cap", () => {
  it("transmits all 250001 segments in bounded batches with no truncation", () => {
    const input = Array.from({ length: 250_001 }, (_, i) => i);
    const cursor = new CadDwgSegmentChunks(input);
    const output: number[] = [];
    let batches = 0;
    for (let chunk = cursor.next(); chunk; chunk = cursor.next()) {
      expect(chunk.length).toBeLessThanOrEqual(DWG_SEGMENT_CHUNK_SIZE);
      output.push(...chunk);
      batches++;
    }
    expect(batches).toBeGreaterThan(30);
    expect(cursor.sent).toBe(250_001);
    expect(cursor.next()).toBeNull();
    expect(output).toEqual(input);
  });
  it("handles an empty file without sending a batch", () => {
    expect(new CadDwgSegmentChunks([]).next()).toBeNull();
  });
});
