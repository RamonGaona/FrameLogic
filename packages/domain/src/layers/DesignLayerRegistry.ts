import type {
  DesignLayer,
} from "./DesignLayer";

import {
  DEFAULT_DESIGN_LAYER_COLOR,
  DEFAULT_DESIGN_LAYER_IDS,
} from "./DesignLayer";


export interface CreateDesignLayerInput {
  id?: string;
  name: string;
  color?: string;
  visible?: boolean;
  locked?: boolean;
  snapEnabled?: boolean;
}


export interface UpdateDesignLayerInput {
  name?: string;
  color?: string;
  visible?: boolean;
  locked?: boolean;
  snapEnabled?: boolean;
}


export type DesignLayerListener =
  () => void;


function normalizeColor(
  value: string | undefined,
  fallback = DEFAULT_DESIGN_LAYER_COLOR,
): string {
  const candidate =
    value?.trim()
    || fallback;
  const normalized =
    candidate.startsWith("#")
      ? candidate
      : `#${candidate}`;

  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(
      "Layer color must use hexadecimal #RRGGBB format.",
    );
  }

  return normalized.toLowerCase();
}


export class DesignLayerRegistry {

  private readonly layers =
    new Map<string, DesignLayer>();

  private readonly listeners =
    new Set<DesignLayerListener>();

  private activeLayerIdValue =
    DEFAULT_DESIGN_LAYER_IDS.REFERENCE_CAD;


  constructor() {
    this.createDefaultLayers();
  }


  private createDefaultLayers(): void {
    this.addSystemLayer(
      DEFAULT_DESIGN_LAYER_IDS.GEOMETRY,
      "Geometry",
    );
    this.addSystemLayer(
      DEFAULT_DESIGN_LAYER_IDS.REFERENCE_CAD,
      "Reference CAD",
    );
    this.addSystemLayer(
      DEFAULT_DESIGN_LAYER_IDS.SNAP_MANUAL,
      "Snap Manual",
    );
    this.addSystemLayer(
      DEFAULT_DESIGN_LAYER_IDS.REFERENCE_AXES,
      "Reference Axes",
    );
    this.addSystemLayer(
      DEFAULT_DESIGN_LAYER_IDS.EXTERNAL_REFERENCES,
      "External References",
      true,
    );
  }


  private addSystemLayer(
    id: string,
    name: string,
    locked = false,
  ): void {
    this.layers.set(
      id,
      {
        id,
        name,
        color:
          DEFAULT_DESIGN_LAYER_COLOR,
        visible: true,
        locked,
        snapEnabled: true,
        system: true,
      },
    );
  }


  create(
    input: CreateDesignLayerInput,
  ): DesignLayer {
    const name =
      input.name.trim();

    if (name.length === 0) {
      throw new Error(
        "A layer name is required.",
      );
    }

    const id =
      input.id
      ?? crypto.randomUUID();

    if (this.layers.has(id)) {
      throw new Error(
        `A layer with id "${id}" already exists.`,
      );
    }

    const duplicateName =
      this.getAll().some(
        (layer) =>
          layer.name
            .trim()
            .toLowerCase()
          === name.toLowerCase(),
      );

    if (duplicateName) {
      throw new Error(
        `A layer named "${name}" already exists.`,
      );
    }

    const layer: DesignLayer = {
      id,
      name,
      color:
        normalizeColor(input.color),
      visible:
        input.visible
        ?? true,
      locked:
        input.locked
        ?? false,
      snapEnabled:
        input.snapEnabled
        ?? true,
      system: false,
    };

    this.layers.set(
      id,
      layer,
    );
    this.notify();
    return layer;
  }


  update(
    id: string,
    input: UpdateDesignLayerInput,
  ): DesignLayer | undefined {
    const current =
      this.layers.get(id);

    if (!current) {
      return undefined;
    }

    const name =
      input.name === undefined
        ? current.name
        : input.name.trim();

    if (name.length === 0) {
      throw new Error(
        "A layer name is required.",
      );
    }

    const duplicateName =
      this.getAll().some(
        (layer) =>
          layer.id !== id
          && layer.name
            .trim()
            .toLowerCase()
          === name.toLowerCase(),
      );

    if (duplicateName) {
      throw new Error(
        `A layer named "${name}" already exists.`,
      );
    }

    const updated: DesignLayer = {
      ...current,
      name,
      color:
        input.color === undefined
          ? current.color
            ?? DEFAULT_DESIGN_LAYER_COLOR
          : normalizeColor(
              input.color,
              current.color
              ?? DEFAULT_DESIGN_LAYER_COLOR,
            ),
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


  get(
    id: string,
  ): DesignLayer | undefined {
    return this.layers.get(id);
  }


  getAll(): DesignLayer[] {
    return Array.from(
      this.layers.values(),
    );
  }


  get activeLayerId(): string {
    return this.activeLayerIdValue;
  }


  get activeLayer(): DesignLayer {
    const layer =
      this.layers.get(
        this.activeLayerIdValue,
      );

    if (!layer) {
      throw new Error(
        `Active layer "${this.activeLayerIdValue}" does not exist.`,
      );
    }

    return layer;
  }


  setActiveLayer(
    layerId: string,
  ): boolean {
    if (!this.layers.has(layerId)) {
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


  remove(
    id: string,
  ): boolean {
    const layer =
      this.layers.get(id);

    if (!layer) {
      return false;
    }

    if (layer.system) {
      throw new Error(
        `System layer "${layer.name}" cannot be removed.`,
      );
    }

    if (
      this.activeLayerIdValue
      === id
    ) {
      this.activeLayerIdValue =
        DEFAULT_DESIGN_LAYER_IDS.REFERENCE_CAD;
    }

    this.layers.delete(id);
    this.notify();
    return true;
  }


  subscribe(
    listener: DesignLayerListener,
  ): () => void {
    this.listeners.add(listener);
    listener();

    return () => {
      this.listeners.delete(listener);
    };
  }


  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }


  reset(): void {
    this.layers.clear();
    this.activeLayerIdValue =
      DEFAULT_DESIGN_LAYER_IDS.REFERENCE_CAD;
    this.createDefaultLayers();
    this.notify();
  }

}
