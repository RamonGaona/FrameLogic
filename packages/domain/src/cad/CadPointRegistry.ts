import {
  DEFAULT_DESIGN_LAYER_IDS,
} from "../layers/DesignLayer";

import type {
  CadPoint,
  CadPointPosition,
} from "./CadPoint";


export interface RegisterCadPointInput {

  id?: string;

  layerId?: string;

  position:
    CadPointPosition;

}


export class CadPointRegistry {

  private readonly points =
    new Map<
      string,
      CadPoint
    >();


  register(
    input:
      RegisterCadPointInput,
  ): CadPoint {

    const id =
      input.id
      ?? crypto.randomUUID();


    if (
      this.points.has(
        id,
      )
    ) {

      throw new Error(
        `A CAD point with id "${id}" already exists.`,
      );

    }


    const point:
      CadPoint = {

        id,

        layerId:
          input.layerId
          ?? DEFAULT_DESIGN_LAYER_IDS
            .REFERENCE_CAD,

        position: {
          x:
            input.position.x,
          y:
            input.position.y,
          z:
            input.position.z,
        },

      };


    this.points.set(
      id,
      point,
    );


    return point;

  }


  get(
    id: string,
  ):
    CadPoint
    | undefined {

    return this.points.get(
      id,
    );

  }


  getAll():
    CadPoint[] {

    return Array.from(
      this.points.values(),
    );

  }


  findByLayerId(
    layerId: string,
  ):
    CadPoint[] {

    return this
      .getAll()
      .filter(
        (
          point,
        ) =>
          point.layerId
          === layerId,
      );

  }


  updateLayerId(
    id: string,
    layerId: string,
  ):
    CadPoint
    | undefined {

    const current =
      this.points.get(
        id,
      );


    if (
      !current
    ) {

      return undefined;

    }


    const updated:
      CadPoint = {

        ...current,

        layerId,

      };


    this.points.set(
      id,
      updated,
    );


    return updated;

  }


  remove(
    id: string,
  ): boolean {

    return this.points.delete(
      id,
    );

  }


  clear(): void {

    this.points.clear();

  }


  get count():
    number {

    return this.points.size;

  }

}
