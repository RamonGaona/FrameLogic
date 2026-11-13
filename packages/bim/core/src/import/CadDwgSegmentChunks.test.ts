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
  it("releases worker-only segment objects after copying to outbound batches", () => {
    const input = Array.from({ length: DWG_SEGMENT_CHUNK_SIZE + 5 }, (_, i) => ({
      id: i, positions: [i, i + 1],
    }));
    const stream = new CadDwgSegmentChunks(input, true);
    const first = stream.next()!;
    expect(first).toHaveLength(DWG_SEGMENT_CHUNK_SIZE);
    expect(first[0]?.id).toBe(0);
    expect(input[0]).toBeUndefined();
    expect(input[DWG_SEGMENT_CHUNK_SIZE]).toBeDefined();
    const last = stream.next()!;
    expect(last).toHaveLength(5);
    expect(last.at(-1)?.id).toBe(DWG_SEGMENT_CHUNK_SIZE + 4);
    expect(input.at(-1)).toBeUndefined();
    expect(stream.sent).toBe(input.length);
    expect(stream.next()).toBeNull();
  });

  it("handles an empty file without sending a batch", () => {
    expect(new CadDwgSegmentChunks([]).next()).toBeNull();
  });
});
