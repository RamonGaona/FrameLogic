import {
  DEFAULT_DESIGN_LAYER_IDS,
} from "../layers/DesignLayer";

import type {
  CadLine,
  CadLinePosition,
} from "./CadLine";


export interface RegisterCadLineInput {

  id?: string;

  layerId?: string;

  start:
    CadLinePosition;

  end:
    CadLinePosition;

}


export interface PackedCadLineBatch {
  readonly id: string;
  readonly layerId: string;
  /** Six coordinates per segment, in model millimetres. */
  readonly positions: Float64Array;
}

export class CadLineRegistry {

  private readonly lines =
    new Map<
      string,
      CadLine
    >();
  private changeRevision = 0;
  private readonly packedBatches = new Map<string, PackedCadLineBatch>();
  private packedSegmentCount = 0;

  /**
   * Fast read-only CAD underlay storage. No per-segment JS objects or UUIDs;
   * preserves the exact double-precision drawing coordinates.
   */
  registerPackedBatch(input: PackedCadLineBatch): void {
    if (input.positions.length === 0 || input.positions.length % 6 !== 0
      || !input.positions.every(Number.isFinite))
      throw new Error("Invalid packed CAD line geometry.");
    if (this.packedBatches.has(input.id))
      throw new Error("Duplicate packed CAD line packet: " + input.id);
    this.packedBatches.set(input.id, input);
    this.packedSegmentCount += input.positions.length / 6;
    this.changeRevision++;
  }

  getPackedBatches(): readonly PackedCadLineBatch[] {
    return Array.from(this.packedBatches.values());
  }

  removePackedByLayerIds(ids: ReadonlySet<string>): void {
    for (const [id, packet] of this.packedBatches) {
      if (!ids.has(packet.layerId)) continue;
      this.packedSegmentCount -= packet.positions.length / 6;
      this.packedBatches.delete(id);
      this.changeRevision++;
    }
  }

  get packedCount(): number { return this.packedSegmentCount; }


  /** Incremented on every geometry mutation for reusable spatial SNAP caches. */
  get revision(): number { return this.changeRevision; }


  register(
    input:
      RegisterCadLineInput,
  ):
    CadLine {

    const id =
      input.id
      ?? crypto.randomUUID();


    if (
      this.lines.has(
        id,
      )
    ) {

      throw new Error(
        `A CAD line with id "${id}" already exists.`,
      );

    }


    const line:
      CadLine = {

        id,

        layerId:
          input.layerId
          ?? DEFAULT_DESIGN_LAYER_IDS
            .REFERENCE_CAD,

        start: {
          x:
            input.start.x,
          y:
            input.start.y,
          z:
            input.start.z,
        },

        end: {
          x:
            input.end.x,
          y:
            input.end.y,
          z:
            input.end.z,
        },

      };


    this.lines.set(
      id,
      line,
    );
    this.changeRevision++;

    return line;

  }


  get(
    id: string,
  ):
    CadLine
    | undefined {

    return this.lines.get(
      id,
    );

  }


  getAll():
    CadLine[] {

    return Array.from(
      this.lines.values(),
    );

  }

  /** Iterate large CAD references without allocating a million-element array. */
  values(): IterableIterator<CadLine> {
    return this.lines.values();
  }


  findByLayerId(
    layerId: string,
  ):
    CadLine[] {

    return this
      .getAll()
      .filter(
        (
          line,
        ) =>
          line.layerId
          === layerId,
      );

  }


  updateLayerId(
    id: string,
    layerId: string,
  ):
    CadLine
    | undefined {

    const current =
      this.lines.get(
        id,
      );


    if (
      !current
    ) {

      return undefined;

    }


    const updated:
      CadLine = {

        ...current,

        layerId,

      };


    this.lines.set(
      id,
      updated,
    );
    this.changeRevision++;

    return updated;

  }


  updateGeometry(
    id: string,
    start:
      CadLinePosition,
    end:
      CadLinePosition,
  ):
    CadLine
    | undefined {

    const current =
      this.lines.get(
        id,
      );


    if (
      !current
    ) {

      return undefined;

    }


    const updated:
      CadLine = {

        ...current,

        start: {
          x:
            start.x,
          y:
            start.y,
          z:
            start.z,
        },

        end: {
          x:
            end.x,
          y:
            end.y,
          z:
            end.z,
        },

      };


    this.lines.set(
      id,
      updated,
    );
    this.changeRevision++;

    return updated;

  }


  remove(
    id: string,
  ):
    boolean {

    const removed = this.lines.delete(id);
    if (removed) this.changeRevision++;
    return removed;

  }


  clear():
    void {

    this.lines.clear();
    this.packedBatches.clear();
    this.packedSegmentCount = 0;
    this.changeRevision++;

  }


  get count():
    number {

    return this.lines.size + this.packedSegmentCount;

  }

}
