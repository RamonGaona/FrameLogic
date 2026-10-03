import {
  createIdentityTransform3D,
} from "@framelogic/geometry";

import type {
  Transform3D,
} from "@framelogic/geometry";

import {
  DEFAULT_DESIGN_LAYER_IDS,
} from "../layers/DesignLayer";

import type {
  PieceInstance,
} from "./PieceInstance";


export interface RegisterPieceInstanceInput {

  id?: string;

  definitionId: string;

  layerId?: string;

  transform?: Transform3D;

  tags?: string[];

}


export class PieceInstanceRegistry {

  private readonly instances =
    new Map<
      string,
      PieceInstance
    >();


  // ==========================================================
  // REGISTER
  // ==========================================================

  register(
    input: RegisterPieceInstanceInput,
  ): PieceInstance {

    const id =
      input.id
      ?? crypto.randomUUID();


    if (
      this.instances.has(
        id,
      )
    ) {

      throw new Error(
        `A piece instance with id "${id}" already exists.`,
      );

    }


    const transform =
      input.transform
      ?? createIdentityTransform3D();


    const instance:
      PieceInstance = {

        id,

        definitionId:
          input.definitionId,

        layerId:
          input.layerId
          ?? DEFAULT_DESIGN_LAYER_IDS
            .GEOMETRY,

        transform:
          this.cloneTransform(
            transform,
          ),

        tags: [
          ...(
            input.tags
            ?? []
          ),
        ],

      };


    this.instances.set(
      id,
      instance,
    );


    return instance;

  }


  // ==========================================================
  // GET ONE
  // ==========================================================

  get(
    id: string,
  ):
    PieceInstance
    | undefined {

    return this.instances.get(
      id,
    );

  }


  // ==========================================================
  // GET ALL
  // ==========================================================

  getAll():
    PieceInstance[] {

    return Array.from(
      this.instances.values(),
    );

  }


  // ==========================================================
  // FIND BY DEFINITION
  // ==========================================================

  findByDefinitionId(
    definitionId: string,
  ):
    PieceInstance[] {

    return this
      .getAll()
      .filter(
        (
          instance,
        ) =>
          instance.definitionId
          === definitionId,
      );

  }


  // ==========================================================
  // FIND BY LAYER
  // ==========================================================

  findByLayerId(
    layerId: string,
  ):
    PieceInstance[] {

    return this
      .getAll()
      .filter(
        (
          instance,
        ) =>
          instance.layerId
          === layerId,
      );

  }


  // ==========================================================
  // UPDATE TRANSFORM
  // ==========================================================

  updateTransform(
    id: string,
    transform: Transform3D,
  ):
    PieceInstance
    | undefined {

    const current =
      this.instances.get(
        id,
      );


    if (!current) {

      return undefined;

    }


    const updated:
      PieceInstance = {

        ...current,

        transform:
          this.cloneTransform(
            transform,
          ),

      };


    this.instances.set(
      id,
      updated,
    );


    return updated;

  }


  // ==========================================================
  // UPDATE LAYER
  // ==========================================================

  updateLayerId(
    id: string,
    layerId: string,
  ):
    PieceInstance
    | undefined {

    const current =
      this.instances.get(
        id,
      );


    if (
      !current
    ) {

      return undefined;

    }


    const updated:
      PieceInstance = {

        ...current,

        layerId,

      };


    this.instances.set(
      id,
      updated,
    );


    return updated;

  }


  // ==========================================================
  // UPDATE TAGS
  // ==========================================================

  updateTags(
    id: string,
    tags: readonly string[],
  ):
    PieceInstance
    | undefined {

    const current =
      this.instances.get(
        id,
      );


    if (!current) {

      return undefined;

    }


    const updated:
      PieceInstance = {

        ...current,

        tags: [
          ...tags,
        ],

      };


    this.instances.set(
      id,
      updated,
    );


    return updated;

  }


  // ==========================================================
  // REMOVE
  // ==========================================================

  remove(
    id: string,
  ): boolean {

    return this.instances.delete(
      id,
    );

  }


  // ==========================================================
  // CLEAR
  // ==========================================================

  clear(): void {

    this.instances.clear();

  }


  // ==========================================================
  // COUNT
  // ==========================================================

  get count(): number {

    return this.instances.size;

  }


  // ==========================================================
  // PRIVATE
  // ==========================================================

  private cloneTransform(
    transform: Transform3D,
  ):
    Transform3D {

    return {

      position: {

        x:
          transform.position.x,

        y:
          transform.position.y,

        z:
          transform.position.z,

      },

      rotation: {

        x:
          transform.rotation.x,

        y:
          transform.rotation.y,

        z:
          transform.rotation.z,

      },

    };

  }

}
