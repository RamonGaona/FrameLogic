import * as THREE from "three";
import {
  allowPerspectiveDistance,
  allowZoomOutTo,
  getOrthographicZoomForBounds,
} from "./ModelSpaceCameraZoomPolicy";

import type {
  LoadedModelInfo,
} from "../models/LoadedModel";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

interface CameraControlsLike {
  readonly minDistance: number;
  minZoom?: number;
  maxDistance?: number;
  setLookAt(
    positionX: number,
    positionY: number,
    positionZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    enableTransition?: boolean,
  ): Promise<void>;
  zoomTo(
    zoom: number,
    enableTransition?: boolean,
  ): Promise<void>;
  fitToBox?: (
    box: THREE.Box3,
    enableTransition: boolean,
    options?: {
      readonly cover?: boolean;
      readonly paddingLeft?: number;
      readonly paddingRight?: number;
      readonly paddingTop?: number;
      readonly paddingBottom?: number;
    },
  ) => Promise<unknown>;
}

export interface ModelSpaceZoomExtentsControllerOptions {
  readonly container: HTMLElement;
  readonly scene: THREE.Scene;
  readonly cameraProvider: () => THREE.Camera;
  readonly controls: CameraControlsLike;
  readonly designScene: DesignSceneController;
  readonly cadLineScene: CadLineSceneController;
  readonly cadPointScene: CadPointSceneController;
  readonly getLoadedModels: () => readonly LoadedModelInfo[];
  readonly getSelectedObjects?: () => readonly THREE.Object3D[];
  readonly getSelectedCadReferenceBounds?: () => THREE.Box3 | null;
}

const COMMAND_TIMEOUT_MS = 1800;

/**
 * Zoom commands estilo AutoCAD:
 *   Z -> E = Extents
 *   Z -> O = Object / selección
 *
 * Todas las distancias geométricas están expresadas en milímetros.
 */
export class ModelSpaceZoomExtentsController {
  private readonly options: ModelSpaceZoomExtentsControllerOptions;
  private readonly hint: HTMLDivElement;
  private zoomCommandExpiresAt = 0;
  private disposed = false;

  constructor(
    options: ModelSpaceZoomExtentsControllerOptions,
  ) {
    this.options = options;
    this.hint = this.createHint(options.container);
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    this.hint.remove();
  }

  async zoomExtents(): Promise<void> {
    const bounds = this.getModelSpaceBounds();
    if (!bounds) {
      await this.options.controls.setLookAt(
        6000,
        6000,
        6000,
        0,
        0,
        0,
        true,
      );
      return;
    }
    await this.focusBounds(bounds);
    this.showHint(
      "Zoom Extents",
      900,
    );
  }

  async zoomSelected(): Promise<boolean> {
    const bounds = this.getSelectedBounds();
    if (!bounds) {
      this.showHint(
        "Zoom Object: no hay selección",
        1200,
      );
      return false;
    }
    await this.focusBounds(bounds);
    this.showHint(
      "Zoom Object",
      900,
    );
    return true;
  }

  private async focusBounds(
    bounds: THREE.Box3,
  ): Promise<void> {
    const controls = this.options.controls;
    const sphere = bounds.getBoundingSphere(
      new THREE.Sphere(),
    );
    const radius = Math.max(
      sphere.radius,
      50,
    );
    const camera = this.options.cameraProvider();

    // DWG plans can span 226 000 mm or much more. CameraControls.fitToBox
    // clamps the result at its fixed minZoom; in a narrow viewport that can
    // leave geometry off screen. Compute the actual projected size, relax
    // only the zoom-out bound, and frame the real geometry without guessing
    // a distance-to-width conversion.
    if (camera instanceof THREE.OrthographicCamera) {
      const desiredZoom = getOrthographicZoomForBounds(camera, bounds);
      allowZoomOutTo(controls, desiredZoom);
      const center = sphere.center;
      const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
      if (forward.lengthSq() <= 1e-12) forward.set(-1, -1, -1).normalize();
      const distance = Math.max(radius * 2.5, controls.minDistance * 4, 500);
      const position = center.clone().addScaledVector(forward, -distance);
      await controls.setLookAt(
        position.x, position.y, position.z,
        center.x, center.y, center.z, false,
      );
      await controls.zoomTo(desiredZoom, false);
      return;
    }

    // In perspective, allow the camera to back away as far as needed.
    const verticalFov = camera instanceof THREE.PerspectiveCamera
      ? THREE.MathUtils.degToRad(camera.fov) : Math.PI / 3;
    const horizontalFov = camera instanceof THREE.PerspectiveCamera
      ? 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(camera.aspect, 1e-6))
      : verticalFov;
    allowPerspectiveDistance(
      controls,
      radius / Math.sin(Math.max(0.01, Math.min(verticalFov, horizontalFov)) / 2) * 1.4,
    );

    if (typeof controls.fitToBox === "function") {
      const padding = Math.max(
        radius * 0.16,
        10,
      );
      await controls.fitToBox(
        bounds.clone(),
        true,
        {
          cover: false,
          paddingLeft: padding,
          paddingRight: padding,
          paddingTop: padding,
          paddingBottom: padding,
        },
      );
      return;
    }

    const center = sphere.center;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    if (forward.lengthSq() <= 1e-12) {
      forward.set(-1, -1, -1).normalize();
    }
    else {
      forward.normalize();
    }

    let distance = Math.max(
      radius * 2.5,
      controls.minDistance * 4,
      500,
    );

    if (camera instanceof THREE.PerspectiveCamera) {
      const verticalFov = THREE.MathUtils.degToRad(
        camera.fov,
      );
      const horizontalFov = 2 * Math.atan(
        Math.tan(verticalFov / 2)
        * Math.max(camera.aspect, 1e-6),
      );
      const limitingFov = Math.max(
        0.01,
        Math.min(
          verticalFov,
          horizontalFov,
        ),
      );
      distance = Math.max(
        radius / Math.sin(limitingFov / 2) * 1.15,
        radius * 1.5,
        controls.minDistance * 4,
      );
    }

    const position = center.clone()
      .addScaledVector(
        forward,
        -distance,
      );

    await controls.setLookAt(
      position.x,
      position.y,
      position.z,
      center.x,
      center.y,
      center.z,
      true,
    );

  }

  private getSelectedBounds(): THREE.Box3 | null {
    const bounds = new THREE.Box3();
    let hasBounds = false;

    const includeBox = (
      box: THREE.Box3,
    ): void => {
      if (
        box.isEmpty()
        || !isFiniteBox(box)
      ) {
        return;
      }
      if (!hasBounds) {
        bounds.copy(box);
        hasBounds = true;
      }
      else {
        bounds.union(box);
      }
    };

    for (
      const object
      of this.options.getSelectedObjects?.()
      ?? []
    ) {
      if (!isEffectivelyVisible(object)) continue;
      object.updateWorldMatrix(true, true);
      includeBox(
        new THREE.Box3().setFromObject(
          object,
          true,
        ),
      );
    }

    const cadBounds =
      this.options.getSelectedCadReferenceBounds?.()
      ?? null;
    if (cadBounds) {
      includeBox(cadBounds);
    }

    return hasBounds
      ? bounds
      : null;
  }

  private getModelSpaceBounds(): THREE.Box3 | null {
    const bounds = new THREE.Box3();
    let hasBounds = false;
    const included = new Set<THREE.Object3D>();

    const includeObject = (
      object: THREE.Object3D,
    ): void => {
      if (
        included.has(object)
        || !isEffectivelyVisible(object)
      ) {
        return;
      }
      included.add(object);
      object.updateWorldMatrix(true, true);
      const objectBounds = new THREE.Box3()
        .setFromObject(
          object,
          true,
        );
      if (
        objectBounds.isEmpty()
        || !isFiniteBox(objectBounds)
      ) {
        return;
      }
      if (!hasBounds) {
        bounds.copy(objectBounds);
        hasBounds = true;
      }
      else {
        bounds.union(objectBounds);
      }
    };

    for (
      const object
      of this.options.designScene.getInstanceObjects()
    ) {
      includeObject(object);
    }

    for (
      const object
      of this.options.cadLineScene.getLineObjects()
    ) {
      includeObject(object);
    }

    for (
      const object
      of this.options.cadPointScene.getPointObjects()
    ) {
      includeObject(object);
    }

    for (const model of this.options.getLoadedModels()) {
      if (!model.visible) continue;
      const object = findReferenceModelObject(
        this.options.scene,
        model.id,
      );
      if (object) includeObject(object);
    }

    return hasBounds
      ? bounds
      : null;
  }

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (
      this.disposed
      || isEditableTarget(event.target)
      || event.ctrlKey
      || event.metaKey
      || event.altKey
    ) {
      return;
    }

    const key = event.key.toLowerCase();
    const now = performance.now();

    if (key === "z") {
      this.zoomCommandExpiresAt =
        now + COMMAND_TIMEOUT_MS;
      event.preventDefault();
      event.stopPropagation();
      this.showHint(
        "ZOOM — E = Extents · O = Object",
        COMMAND_TIMEOUT_MS,
      );
      return;
    }

    if (
      now <= this.zoomCommandExpiresAt
      && (key === "e" || key === "o")
    ) {
      this.zoomCommandExpiresAt = 0;
      event.preventDefault();
      event.stopPropagation();
      const operation = key === "e"
        ? this.zoomExtents()
        : this.zoomSelected();
      void operation.catch((error) => {
        console.error(
          key === "e"
            ? "Zoom Extents failed:"
            : "Zoom Object failed:",
          error,
        );
      });
      return;
    }

    this.zoomCommandExpiresAt = 0;
  };

  private createHint(
    container: HTMLElement,
  ): HTMLDivElement {
    const hint = document.createElement("div");
    Object.assign(
      hint.style,
      {
        position: "absolute",
        left: "50%",
        bottom: "18px",
        transform: "translateX(-50%)",
        zIndex: "160",
        display: "none",
        padding: "5px 9px",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: "5px",
        background: "rgba(18,25,30,0.92)",
        color: "#eaf2f6",
        pointerEvents: "none",
        font: "12px system-ui, sans-serif",
      },
    );
    container.append(hint);
    return hint;
  }

  private showHint(
    message: string,
    duration: number,
  ): void {
    this.hint.textContent = message;
    this.hint.style.display = "block";
    const expected = message;
    window.setTimeout(() => {
      if (this.hint.textContent === expected) {
        this.hint.style.display = "none";
      }
    }, duration);
  }
}

function isEditableTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable
    || target.tagName === "INPUT"
    || target.tagName === "TEXTAREA"
    || target.tagName === "SELECT"
  );
}

function isEffectivelyVisible(
  object: THREE.Object3D,
): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function isFiniteBox(
  box: THREE.Box3,
): boolean {
  return [
    box.min.x,
    box.min.y,
    box.min.z,
    box.max.x,
    box.max.y,
    box.max.z,
  ].every(Number.isFinite);
}

function findReferenceModelObject(
  scene: THREE.Scene,
  modelId: string,
): THREE.Object3D | null {
  const stack: THREE.Object3D[] = [
    ...scene.children,
  ];
  let match: THREE.Object3D | null = null;

  while (stack.length > 0) {
    const object = stack.pop();
    if (!object) continue;
    if (
      object.name === modelId
      || object.name.includes(modelId)
      || userDataContainsId(
        object.userData,
        modelId,
      )
    ) {
      match = object;
      break;
    }
    stack.push(...object.children);
  }

  if (!match) return null;
  let root: THREE.Object3D = match;
  while (
    root.parent
    && root.parent !== scene
  ) {
    root = root.parent;
  }
  return root;
}

function userDataContainsId(
  value: unknown,
  modelId: string,
  depth = 0,
): boolean {
  if (depth > 3) return false;
  if (typeof value === "string") {
    return (
      value === modelId
      || value.includes(modelId)
    );
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  for (
    const child
    of Object.values(
      value as Record<string, unknown>,
    )
  ) {
    if (
      userDataContainsId(
        child,
        modelId,
        depth + 1,
      )
    ) {
      return true;
    }
  }
  return false;
}
