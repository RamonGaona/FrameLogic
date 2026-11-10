import {
  DEFAULT_DESIGN_LAYER_IDS,
} from "../layers/DesignLayer";

import type {
  Assembly,
} from "./Assembly";


export interface RegisterAssemblyInput {

  id?: string;

  name: string;

  layerId?: string;

  classification?: string;

  tags?: string[];

  pieceInstanceIds?: string[];

  parentAssemblyId?: string;

  locked?: boolean;

}


export class AssemblyRegistry {

  private readonly assemblies =
    new Map<
      string,
      Assembly
    >();


  // ==========================================================
  // REGISTER
  // ==========================================================

  register(
    input: RegisterAssemblyInput,
  ): Assembly {

    const id =
      input.id
      ?? crypto.randomUUID();


    if (
      this.assemblies.has(
        id,
      )
    ) {

      throw new Error(
        `An assembly with id "${id}" already exists.`,
      );

    }


    const assembly:
      Assembly = {

        id,

        name:
          input.name,

        layerId:
          input.layerId
          ?? DEFAULT_DESIGN_LAYER_IDS
            .GEOMETRY,

        classification:
          input.classification,

        tags: [
          ...(
            input.tags
            ?? []
          ),
        ],

        pieceInstanceIds: [
          ...(
            input.pieceInstanceIds
            ?? []
          ),
        ],

        ...(input.parentAssemblyId
          ? { parentAssemblyId: input.parentAssemblyId }
          : {}),
        ...(input.locked ? { locked: true } : {}),

      };


    this.assemblies.set(
      id,
      assembly,
    );


    return assembly;

  }


  // ==========================================================
  // GET ONE
  // ==========================================================

  get(
    id: string,
  ):
    Assembly
    | undefined {

    return this.assemblies.get(
      id,
    );

  }


  // ==========================================================
  // GET ALL
  // ==========================================================

  getAll():
    Assembly[] {

    return Array.from(
      this.assemblies.values(),
    );

  }


  // ==========================================================
  // FIND ASSEMBLIES USING INSTANCE
  // ==========================================================

  findByPieceInstanceId(
    pieceInstanceId: string,
  ):
    Assembly[] {

    return this
      .getAll()
      .filter(
        (
          assembly,
        ) =>
          assembly.pieceInstanceIds
            .includes(
              pieceInstanceId,
            ),
      );

  }


  // ==========================================================
  // FIND BY LAYER
  // ==========================================================

  findByLayerId(
    layerId: string,
  ):
    Assembly[] {

    return this
      .getAll()
      .filter(
        (
          assembly,
        ) =>
          assembly.layerId
          === layerId,
      );

  }


  // ==========================================================
  // UPDATE NAME
  // ==========================================================

  updateName(
    id: string,
    name: string,
  ):
    Assembly
    | undefined {

    const current =
      this.assemblies.get(
        id,
      );

    if (!current) {
      return undefined;
    }

    const nextName =
      name.trim();

    if (!nextName) {
      return current;
    }

    const updated:
      Assembly = {
        ...current,
        name: nextName,
      };

    this.assemblies.set(
      id,
      updated,
    );

    return updated;

  }


  // ==========================================================
  // UPDATE PIECES
  // ==========================================================

  updatePieceInstanceIds(
    id: string,
    pieceInstanceIds:
      readonly string[],
  ):
    Assembly
    | undefined {

    const current =
      this.assemblies.get(
        id,
      );


    if (!current) {

      return undefined;

    }


    const updated:
      Assembly = {

        ...current,

        pieceInstanceIds: [
          ...pieceInstanceIds,
        ],

      };


    this.assemblies.set(
      id,
      updated,
    );


    return updated;

  }


  // ==========================================================
  // HIERARCHY / LOCK STATE
  // ==========================================================

  updateParentAssemblyId(
    id: string,
    parentAssemblyId: string | null,
  ): Assembly | undefined {
    const current = this.assemblies.get(id);
    if (!current) return undefined;
    const { parentAssemblyId: _previous, ...withoutParent } = current;
    const updated: Assembly = parentAssemblyId
      ? { ...withoutParent, parentAssemblyId }
      : withoutParent;
    this.assemblies.set(id, updated);
    return updated;
  }

  updateLocked(id: string, locked: boolean): Assembly | undefined {
    const current = this.assemblies.get(id);
    if (!current) return undefined;
    const updated: Assembly = { ...current, locked };
    this.assemblies.set(id, updated);
    return updated;
  }


  // ==========================================================
  // UPDATE LAYER
  // ==========================================================

  updateLayerId(
    id: string,
    layerId: string,
  ):
    Assembly
    | undefined {

    const current =
      this.assemblies.get(
        id,
      );


    if (
      !current
    ) {

      return undefined;

    }


    const updated:
      Assembly = {

        ...current,

        layerId,

      };


    this.assemblies.set(
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

    return this.assemblies.delete(
      id,
    );

  }


  // ==========================================================
  // CLEAR
  // ==========================================================

  clear(): void {

    this.assemblies.clear();

  }


  // ==========================================================
  // COUNT
  // ==========================================================

  get count(): number {

    return this.assemblies.size;

  }

}
