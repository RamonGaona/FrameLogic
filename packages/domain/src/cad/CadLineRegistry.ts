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


export class CadLineRegistry {

  private readonly lines =
    new Map<
      string,
      CadLine
    >();
  private changeRevision = 0;

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
    this.changeRevision++;

  }


  get count():
    number {

    return this.lines.size;

  }

}
