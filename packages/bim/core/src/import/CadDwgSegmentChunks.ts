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
  /**
   * With releaseTransferred=true the worker clears original references only
   * after copying them into a small outbound chunk. The receiving model
   * already owns the exact geometry, so this avoids retaining a second
   * 1.4m-element graph while the next chunks are registered. Never enable
   * this for user-supplied arrays that must remain intact.
   */
  constructor(
    private readonly segments: readonly T[],
    private readonly releaseTransferred = false,
  ) {}

  get total(): number { return this.segments.length; }
  get sent(): number { return this.cursor; }
  next(): readonly T[] | null {
    if (this.cursor >= this.total) return null;
    const chunk = this.segments.slice(
      this.cursor,
      Math.min(this.total, this.cursor + DWG_SEGMENT_CHUNK_SIZE),
    );
    if (this.releaseTransferred) {
      const mutable = this.segments as T[];
      for (let i = this.cursor; i < this.cursor + chunk.length; i++) {
        // Keep array length stable so the advertised total does not change.
        mutable[i] = undefined as T;
      }
    }
    this.cursor += chunk.length;
    return chunk;
  }
}
