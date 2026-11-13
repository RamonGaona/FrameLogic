/**
 * Transfer large DWG drawings from the worker to the UI in acknowledged
 * batches. No geometry is discarded and there is no maximum batch count.
 *
 * Posting the entire parsed DWG at once duplicates a huge object graph in
 * the structured-clone queue, which can freeze/out-of-memory on Firefox.
 */
export const DWG_SEGMENT_CHUNK_SIZE = 8192;

export class CadDwgSegmentChunks<T> {
  private cursor = 0;
  constructor(private readonly segments: readonly T[]) {}

  get total(): number { return this.segments.length; }
  get sent(): number { return this.cursor; }
  next(): readonly T[] | null {
    if (this.cursor >= this.total) return null;
    const chunk = this.segments.slice(
      this.cursor,
      Math.min(this.total, this.cursor + DWG_SEGMENT_CHUNK_SIZE),
    );
    this.cursor += chunk.length;
    return chunk;
  }
}
