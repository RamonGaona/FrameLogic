import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadCircleSceneController,
} from "../design/CadCircleSceneController";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";


const DEFAULT_CAD_LAYER_COLOR =
  "#e5e7eb";
const SELECTED_CAD_COLOR =
  0xffc533;
const LAYER_COLOR_EVENT =
  "framelogic:layer-color-change";


interface LayerColorEventDetail {
  readonly layerId: string;
  readonly color: string;
}


export interface CadLayerColorControllerOptions {
  readonly designModel: DesignModel;
  readonly lineScene: CadLineSceneController;
  readonly pointScene: CadPointSceneController;
  readonly circleScene: CadCircleSceneController;
  readonly lineSelection: CadLineSelectionController;
  readonly pointSelection: CadPointSelectionController;
}


function layerColor(
  value: string | undefined,
): string {
  return /^#[0-9a-fA-F]{6}$/.test(
    value ?? "",
  )
    ? value!
    : DEFAULT_CAD_LAYER_COLOR;
}


/**
 * Apariencia CAD por layer.
 *
 * El color pertenece al DesignLayer y no a cada entidad. LINE, POLYLINE,
 * RECTANGLE, POINT y CIRCLE lo consultan visualmente. Las piezas 3D/IFC no
 * son modificadas por este controlador.
 */
export class CadLayerColorController {
  private readonly options:
    CadLayerColorControllerOptions;

  private readonly originalLineSync:
    () => void;
  private readonly originalPointSync:
    () => void;
  private readonly originalCircleSync:
    () => void;

  private readonly lineSyncBridge:
    () => void;
  private readonly pointSyncBridge:
    () => void;
  private readonly circleSyncBridge:
    () => void;

  private readonly unsubscribeLayers:
    () => void;
  private readonly unsubscribeLines:
    () => void;
  private readonly unsubscribePoints:
    () => void;

  private disposed = false;


  constructor(
    options: CadLayerColorControllerOptions,
  ) {
    this.options = options;

    this.originalLineSync =
      options.lineScene.sync.bind(
        options.lineScene,
      );
    this.originalPointSync =
      options.pointScene.sync.bind(
        options.pointScene,
      );
    this.originalCircleSync =
      options.circleScene.sync.bind(
        options.circleScene,
      );

    this.lineSyncBridge = () => {
      this.originalLineSync();
      this.applyLineColors();
    };
    this.pointSyncBridge = () => {
      this.originalPointSync();
      this.applyPointColors();
    };
    this.circleSyncBridge = () => {
      this.originalCircleSync();
      this.applyCircleColors();
    };

    options.lineScene.sync =
      this.lineSyncBridge;
    options.pointScene.sync =
      this.pointSyncBridge;
    options.circleScene.sync =
      this.circleSyncBridge;

    this.unsubscribeLayers =
      options.designModel.layers.subscribe(
        () => this.applyAll(),
      );
    this.unsubscribeLines =
      options.lineSelection.subscribe(
        () => this.applyLineColors(),
      );
    this.unsubscribePoints =
      options.pointSelection.subscribe(
        () => this.applyPointColors(),
      );

    window.addEventListener(
      LAYER_COLOR_EVENT,
      this.handleLayerColorEvent,
    );

    this.applyAll();
  }


  sync(): void {
    this.applyAll();
  }


  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener(
      LAYER_COLOR_EVENT,
      this.handleLayerColorEvent,
    );

    this.unsubscribePoints();
    this.unsubscribeLines();
    this.unsubscribeLayers();

    if (
      this.options.lineScene.sync
      === this.lineSyncBridge
    ) {
      this.options.lineScene.sync =
        this.originalLineSync;
    }
    if (
      this.options.pointScene.sync
      === this.pointSyncBridge
    ) {
      this.options.pointScene.sync =
        this.originalPointSync;
    }
    if (
      this.options.circleScene.sync
      === this.circleSyncBridge
    ) {
      this.options.circleScene.sync =
        this.originalCircleSync;
    }
  }


  private readonly handleLayerColorEvent =
    (
      event: Event,
    ): void => {
      const detail =
        (
          event as CustomEvent<LayerColorEventDetail>
        ).detail;

      if (
        !detail
        || typeof detail.layerId !== "string"
        || typeof detail.color !== "string"
      ) {
        return;
      }

      try {
        this.options.designModel.layers.update(
          detail.layerId,
          {
            color:
              detail.color,
          },
        );
      }
      catch (error) {
        console.error(
          "FrameLogic layer color update failed:",
          error,
        );
      }
    };


  private applyAll(): void {
    if (this.disposed) return;
    this.applyLineColors();
    this.applyPointColors();
    this.applyCircleColors();
  }


  private applyLineColors(): void {
    if (this.disposed) return;

    for (
      const [id, object]
      of this.options.lineScene.getLineEntries()
    ) {
      const line =
        this.options.designModel.cadLines.get(id);
      if (!line) continue;

      const layer =
        this.options.designModel.layers.get(
          line.layerId,
        );
      const selected =
        this.options.lineSelection.isSelected(id);

      this.setLineMaterialColor(
        object.material,
        selected
          ? SELECTED_CAD_COLOR
          : layerColor(layer?.color),
      );
    }
    // Imported references use ONE batched LineSegments per CAD sublayer.
    // Recolour the batches directly; their members are never independently
    // selected or turned into thousands of THREE.Line objects.
    for (const [layerId, object] of this.options.lineScene.getReferenceBatchEntries()) {
      const layer = this.options.designModel.layers.get(layerId);
      this.setLineMaterialColor(object.material, layerColor(layer?.color));
    }
  }


  private applyPointColors(): void {
    if (this.disposed) return;

    for (
      const point
      of this.options.designModel.cadPoints.getAll()
    ) {
      const object =
        this.options.pointScene.getPointObject(
          point.id,
        );
      if (!object) continue;

      const layer =
        this.options.designModel.layers.get(
          point.layerId,
        );
      const selected =
        this.options.pointSelection.isSelected(
          point.id,
        );

      const materials =
        Array.isArray(object.material)
          ? object.material
          : [object.material];

      for (const material of materials) {
        if (
          material
          instanceof THREE.PointsMaterial
        ) {
          material.color.set(
            selected
              ? SELECTED_CAD_COLOR
              : layerColor(layer?.color),
          );
          material.needsUpdate = true;
        }
      }
    }
  }


  private applyCircleColors(): void {
    if (this.disposed) return;

    for (
      const circle
      of this.options.circleScene.getAll()
    ) {
      const object =
        this.options.circleScene.getCircleObject(
          circle.id,
        );
      if (!object) continue;

      const layer =
        this.options.designModel.layers.get(
          circle.layerId,
        );

      this.setLineMaterialColor(
        object.material,
        layerColor(layer?.color),
      );
    }
  }


  private setLineMaterialColor(
    source:
      THREE.Material
      | THREE.Material[],
    color: string | number,
  ): void {
    const materials =
      Array.isArray(source)
        ? source
        : [source];

    for (const material of materials) {
      if (
        material
        instanceof THREE.LineBasicMaterial
      ) {
        material.color.set(color);
        material.needsUpdate = true;
      }
    }
  }
}
