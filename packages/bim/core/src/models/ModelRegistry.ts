import {
  DEFAULT_DESIGN_LAYER_IDS,
} from "@framelogic/domain";

import type {
  LoadedModelInfo,
  ModelRole,
  ModelSource,
} from "./LoadedModel";


interface ModelEntry {

  id: string;

  name: string;

  source: ModelSource;

  role: ModelRole;

  layerId: string;

  visible: boolean;

  layerVisible: boolean;

  setVisible:
    (
      visible: boolean,
    ) => void;

  remove:
    () => void;

}


export interface RegisterModelInput {

  id?: string;

  name: string;

  source: ModelSource;

  role: ModelRole;

  layerId?: string;

  visible?: boolean;

  setVisible:
    (
      visible: boolean,
    ) => void;

  remove:
    () => void;

}


export class ModelRegistry {

  private readonly models =
    new Map<
      string,
      ModelEntry
    >();


  // ====================================================
  // REGISTER
  // ====================================================

  register(
    input: RegisterModelInput,
  ): LoadedModelInfo {

    const id =
      input.id
      ?? crypto.randomUUID();


    if (
      this.models.has(
        id,
      )
    ) {

      throw new Error(
        `A model with id "${id}" is already registered.`,
      );

    }


    const entry:
      ModelEntry = {

        id,

        name:
          input.name,

        source:
          input.source,

        role:
          input.role,

        layerId:
          input.layerId
          ?? DEFAULT_DESIGN_LAYER_IDS
            .EXTERNAL_REFERENCES,

        visible:
          input.visible
          ?? true,

        layerVisible:
          true,

        setVisible:
          input.setVisible,

        remove:
          input.remove,

      };


    this.models.set(
      id,
      entry,
    );


    this.applyVisibility(
      entry,
    );


    return this.toInfo(
      entry,
    );

  }


  // ====================================================
  // GET ALL
  // ====================================================

  getLoadedModels():
    LoadedModelInfo[] {

    return Array.from(
      this.models.values(),
      (
        model,
      ) =>
        this.toInfo(
          model,
        ),
    );

  }


  // ====================================================
  // GET ONE
  // ====================================================

  getModel(
    id: string,
  ):
    LoadedModelInfo
    | undefined {

    const model =
      this.models.get(
        id,
      );


    if (!model) {

      return undefined;

    }


    return this.toInfo(
      model,
    );

  }


  // ====================================================
  // INDIVIDUAL VISIBILITY
  // ====================================================

  setModelVisible(
    id: string,
    visible: boolean,
  ): boolean {

    const model =
      this.models.get(
        id,
      );


    if (!model) {

      return false;

    }


    model.visible =
      visible;


    this.applyVisibility(
      model,
    );


    return true;

  }


  // ====================================================
  // MODEL LAYER
  // ====================================================

  setModelLayerId(
    id: string,
    layerId: string,
  ): boolean {

    const model =
      this.models.get(
        id,
      );


    if (
      !model
    ) {

      return false;

    }


    model.layerId =
      layerId;


    return true;

  }


  // ====================================================
  // LAYER VISIBILITY
  // ====================================================

  setLayerVisible(
    layerId: string,
    visible: boolean,
  ): void {

    for (
      const model
      of this.models.values()
    ) {

      if (
        model.layerId
        !== layerId
      ) {

        continue;

      }


      model.layerVisible =
        visible;


      this.applyVisibility(
        model,
      );

    }

  }


  // ====================================================
  // FIND BY LAYER
  // ====================================================

  findByLayerId(
    layerId: string,
  ):
    LoadedModelInfo[] {

    return Array.from(
      this.models.values(),
    )
      .filter(
        (
          model,
        ) =>
          model.layerId
          === layerId,
      )
      .map(
        (
          model,
        ) =>
          this.toInfo(
            model,
          ),
      );

  }


  // ====================================================
  // REMOVE
  // ====================================================

  removeModel(
    id: string,
  ): boolean {

    const model =
      this.models.get(
        id,
      );


    if (!model) {

      return false;

    }


    model.remove();


    this.models.delete(
      id,
    );


    return true;

  }


  // ====================================================
  // CLEAR
  // ====================================================

  clearModels(): void {

    for (
      const model
      of this.models.values()
    ) {

      model.remove();

    }


    this.models.clear();

  }


  // ====================================================
  // PRIVATE
  // ====================================================

  private applyVisibility(
    model: ModelEntry,
  ): void {

    model.setVisible(
      model.visible
      && model.layerVisible,
    );

  }


  private toInfo(
    model: ModelEntry,
  ): LoadedModelInfo {

    return {

      id:
        model.id,

      name:
        model.name,

      source:
        model.source,

      role:
        model.role,

      layerId:
        model.layerId,

      visible:
        model.visible,

    };

  }

}
