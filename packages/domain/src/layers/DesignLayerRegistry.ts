import type {
  DesignLayer,
} from "./DesignLayer";

import {
  DEFAULT_DESIGN_LAYER_IDS,
} from "./DesignLayer";


export interface CreateDesignLayerInput {

  id?: string;

  name: string;

  visible?: boolean;

  locked?: boolean;

  snapEnabled?: boolean;

}


export interface UpdateDesignLayerInput {

  name?: string;

  visible?: boolean;

  locked?: boolean;

  snapEnabled?: boolean;

}


export type DesignLayerListener =
  () => void;


export class DesignLayerRegistry {

  private readonly layers =
    new Map<
      string,
      DesignLayer
    >();


  private readonly listeners =
    new Set<
      DesignLayerListener
    >();


  private activeLayerIdValue =
    DEFAULT_DESIGN_LAYER_IDS
      .REFERENCE_CAD;


  constructor() {

    this.createDefaultLayers();

  }


  // ==========================================================
  // DEFAULT LAYERS
  // ==========================================================

  private createDefaultLayers(): void {

    this.layers.set(
      DEFAULT_DESIGN_LAYER_IDS.GEOMETRY,
      {
        id:
          DEFAULT_DESIGN_LAYER_IDS.GEOMETRY,
        name:
          "Geometry",
        visible:
          true,
        locked:
          false,
        snapEnabled:
          true,
        system:
          true,
      },
    );


    this.layers.set(
      DEFAULT_DESIGN_LAYER_IDS.REFERENCE_CAD,
      {
        id:
          DEFAULT_DESIGN_LAYER_IDS.REFERENCE_CAD,
        name:
          "Reference CAD",
        visible:
          true,
        locked:
          false,
        snapEnabled:
          true,
        system:
          true,
      },
    );


    this.layers.set(
      DEFAULT_DESIGN_LAYER_IDS.SNAP_MANUAL,
      {
        id:
          DEFAULT_DESIGN_LAYER_IDS.SNAP_MANUAL,
        name:
          "Snap Manual",
        visible:
          true,
        locked:
          false,
        snapEnabled:
          true,
        system:
          true,
      },
    );


    this.layers.set(
      DEFAULT_DESIGN_LAYER_IDS.REFERENCE_AXES,
      {
        id:
          DEFAULT_DESIGN_LAYER_IDS.REFERENCE_AXES,
        name:
          "Reference Axes",
        visible:
          true,
        locked:
          false,
        snapEnabled:
          true,
        system:
          true,
      },
    );


    this.layers.set(
      DEFAULT_DESIGN_LAYER_IDS.EXTERNAL_REFERENCES,
      {
        id:
          DEFAULT_DESIGN_LAYER_IDS.EXTERNAL_REFERENCES,
        name:
          "External References",
        visible:
          true,
        locked:
          true,
        snapEnabled:
          true,
        system:
          true,
      },
    );

  }


  // ==========================================================
  // CREATE
  // ==========================================================

  create(
    input: CreateDesignLayerInput,
  ): DesignLayer {

    const name =
      input.name.trim();


    if (
      name.length === 0
    ) {

      throw new Error(
        "A layer name is required.",
      );

    }


    const id =
      input.id
      ?? crypto.randomUUID();


    if (
      this.layers.has(
        id,
      )
    ) {

      throw new Error(
        `A layer with id "${id}" already exists.`,
      );

    }


    const duplicateName =
      this.getAll()
        .some(
          (
            layer,
          ) =>
            layer.name
              .trim()
              .toLowerCase()
            === name.toLowerCase(),
        );


    if (
      duplicateName
    ) {

      throw new Error(
        `A layer named "${name}" already exists.`,
      );

    }


    const layer:
      DesignLayer = {

        id,

        name,

        visible:
          input.visible
          ?? true,

        locked:
          input.locked
          ?? false,

        snapEnabled:
          input.snapEnabled
          ?? true,

        system:
          false,

      };


    this.layers.set(
      id,
      layer,
    );


    this.notify();


    return layer;

  }


  // ==========================================================
  // UPDATE
  // ==========================================================

  update(
    id: string,
    input: UpdateDesignLayerInput,
  ):
    DesignLayer
    | undefined {

    const current =
      this.layers.get(
        id,
      );


    if (
      !current
    ) {

      return undefined;

    }


    const name =
      input.name === undefined
        ? current.name
        : input.name.trim();


    if (
      name.length === 0
    ) {

      throw new Error(
        "A layer name is required.",
      );

    }


    const duplicateName =
      this.getAll()
        .some(
          (
            layer,
          ) =>
            layer.id !== id
            && layer.name
              .trim()
              .toLowerCase()
              === name.toLowerCase(),
        );


    if (
      duplicateName
    ) {

      throw new Error(
        `A layer named "${name}" already exists.`,
      );

    }


    const updated:
      DesignLayer = {

        ...current,

        name,

        visible:
          input.visible
          ?? current.visible,

        locked:
          input.locked
          ?? current.locked,

        snapEnabled:
          input.snapEnabled
          ?? current.snapEnabled,

      };


    this.layers.set(
      id,
      updated,
    );


    this.notify();


    return updated;

  }


  // ==========================================================
  // GET
  // ==========================================================

  get(
    id: string,
  ):
    DesignLayer
    | undefined {

    return this.layers.get(
      id,
    );

  }


  getAll():
    DesignLayer[] {

    return Array.from(
      this.layers.values(),
    );

  }


  // ==========================================================
  // ACTIVE LAYER
  // ==========================================================

  get activeLayerId():
    string {

    return this.activeLayerIdValue;

  }


  get activeLayer():
    DesignLayer {

    const layer =
      this.layers.get(
        this.activeLayerIdValue,
      );


    if (
      !layer
    ) {

      throw new Error(
        `Active layer "${this.activeLayerIdValue}" does not exist.`,
      );

    }


    return layer;

  }


  setActiveLayer(
    layerId: string,
  ): boolean {

    if (
      !this.layers.has(
        layerId,
      )
    ) {

      return false;

    }


    if (
      this.activeLayerIdValue
      === layerId
    ) {

      return true;

    }


    this.activeLayerIdValue =
      layerId;


    this.notify();


    return true;

  }


  // ==========================================================
  // REMOVE
  // ==========================================================

  remove(
    id: string,
  ): boolean {

    const layer =
      this.layers.get(
        id,
      );


    if (
      !layer
    ) {

      return false;

    }


    if (
      layer.system
    ) {

      throw new Error(
        `System layer "${layer.name}" cannot be removed.`,
      );

    }


    if (
      this.activeLayerIdValue
      === id
    ) {

      this.activeLayerIdValue =
        DEFAULT_DESIGN_LAYER_IDS
          .REFERENCE_CAD;

    }


    this.layers.delete(
      id,
    );


    this.notify();


    return true;

  }


  // ==========================================================
  // SUBSCRIBE
  // ==========================================================

  subscribe(
    listener: DesignLayerListener,
  ): () => void {

    this.listeners.add(
      listener,
    );


    listener();


    return () => {

      this.listeners.delete(
        listener,
      );

    };

  }


  private notify(): void {

    for (
      const listener
      of this.listeners
    ) {

      listener();

    }

  }


  // ==========================================================
  // RESET
  // ==========================================================

  reset(): void {

    this.layers.clear();


    this.activeLayerIdValue =
      DEFAULT_DESIGN_LAYER_IDS
        .REFERENCE_CAD;


    this.createDefaultLayers();


    this.notify();

  }

}
