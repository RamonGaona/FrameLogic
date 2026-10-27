import * as THREE from "three";

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
}

const COMMAND_TIMEOUT_MS =
  1800;

/**
 * Zoom Extents estilo AutoCAD:
 *   Z -> E
 *
 * Conserva la orientación actual de cámara y encuadra toda la geometría
 * física visible del Model Space: PieceInstance, líneas/puntos CAD y modelos
 * de referencia IFC que puedan localizarse dentro de la escena Three.js.
 */
export class ModelSpaceZoomExtentsController {
  private readonly options:
    ModelSpaceZoomExtentsControllerOptions;
  private readonly hint:
    HTMLDivElement;
  private zoomCommandExpiresAt =
    0;
  private disposed =
    false;

  constructor(
    options:
      ModelSpaceZoomExtentsControllerOptions,
  ) {
    this.options =
      options;
    this.hint =
      this.createHint(
        options.container,
      );
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed =
      true;
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    this.hint.remove();
  }

  async zoomExtents():
    Promise<void> {
    const bounds =
      this.getModelSpaceBounds();
    const controls =
      this.options.controls;

    if (!bounds) {
      await controls.setLookAt(
        6,
        6,
        6,
        0,
        0,
        0,
        true,
      );
      return;
    }

    const sphere =
      bounds.getBoundingSphere(
        new THREE.Sphere(),
      );
    const center =
      sphere.center;
    const radius =
      Math.max(
        sphere.radius,
        0.05,
      );
    const camera =
      this.options.cameraProvider();
    const forward =
      new THREE.Vector3();
    camera.getWorldDirection(
      forward,
    );
    if (
      forward.lengthSq()
      <= 1e-12
    ) {
      forward.set(
        -1,
        -1,
        -1,
      ).normalize();
    }
    else {
      forward.normalize();
    }

    let distance =
      Math.max(
        radius * 2.5,
        controls.minDistance * 4,
        0.5,
      );

    if (
      camera
      instanceof THREE.PerspectiveCamera
    ) {
      const verticalFov =
        THREE.MathUtils.degToRad(
          camera.fov,
        );
      const horizontalFov =
        2
        * Math.atan(
            Math.tan(
              verticalFov / 2,
            )
            * Math.max(
                camera.aspect,
                1e-6,
              ),
          );
      const limitingFov =
        Math.max(
          0.01,
          Math.min(
            verticalFov,
            horizontalFov,
          ),
        );
      distance =
        Math.max(
          radius
          / Math.sin(
              limitingFov / 2,
            )
          * 1.15,
          radius * 1.5,
          controls.minDistance * 4,
        );
    }

    const position =
      center.clone()
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

    if (
      camera
      instanceof THREE.OrthographicCamera
    ) {
      const size =
        bounds.getSize(
          new THREE.Vector3(),
        );
      const boxDiameter =
        Math.max(
          size.length(),
          radius * 2,
          0.1,
        );
      const availableWidth =
        Math.max(
          Math.abs(
            camera.right
            - camera.left,
          ),
          1e-6,
        );
      const availableHeight =
        Math.max(
          Math.abs(
            camera.top
            - camera.bottom,
          ),
          1e-6,
        );
      const desiredZoom =
        Math.max(
          0.01,
          Math.min(
            availableWidth
            / (boxDiameter * 1.12),
            availableHeight
            / (boxDiameter * 1.12),
          ),
        );
      await controls.zoomTo(
        desiredZoom,
        true,
      );
    }

    this.showHint(
      "Zoom Extents",
      900,
    );
  }

  private getModelSpaceBounds():
    THREE.Box3 | null {
    const bounds =
      new THREE.Box3();
    let hasBounds =
      false;
    const included =
      new Set<THREE.Object3D>();

    const includeObject =
      (
        object:
          THREE.Object3D,
      ):
        void => {
        if (
          included.has(object)
          || !isEffectivelyVisible(object)
        ) {
          return;
        }
        included.add(object);
        object.updateWorldMatrix(
          true,
          true,
        );
        const objectBounds =
          new THREE.Box3()
            .setFromObject(
              object,
              true,
            );
        if (
          objectBounds.isEmpty()
          || !isFiniteBox(
            objectBounds,
          )
        ) {
          return;
        }
        if (!hasBounds) {
          bounds.copy(
            objectBounds,
          );
          hasBounds =
            true;
        }
        else {
          bounds.union(
            objectBounds,
          );
        }
      };

    for (
      const object
      of this.options.designScene
        .getInstanceObjects()
    ) {
      includeObject(object);
    }

    for (
      const object
      of this.options.cadLineScene
        .getLineObjects()
    ) {
      includeObject(object);
    }

    for (
      const object
      of this.options.cadPointScene
        .getPointObjects()
    ) {
      includeObject(object);
    }

    for (
      const model
      of this.options.getLoadedModels()
    ) {
      if (!model.visible) {
        continue;
      }
      const object =
        findReferenceModelObject(
          this.options.scene,
          model.id,
        );
      if (object) {
        includeObject(object);
      }
    }

    return hasBounds
      ? bounds
      : null;
  }

  private readonly handleKeyDown =
    (
      event:
        KeyboardEvent,
    ): void => {
      if (
        this.disposed
        || isEditableTarget(
          event.target,
        )
        || event.ctrlKey
        || event.metaKey
        || event.altKey
      ) {
        return;
      }

      const key =
        event.key.toLowerCase();
      const now =
        performance.now();

      if (key === "z") {
        this.zoomCommandExpiresAt =
          now
          + COMMAND_TIMEOUT_MS;
        event.preventDefault();
        event.stopPropagation();
        this.showHint(
          "ZOOM — E = Extents",
          COMMAND_TIMEOUT_MS,
        );
        return;
      }

      if (
        key === "e"
        && now
          <= this.zoomCommandExpiresAt
      ) {
        this.zoomCommandExpiresAt =
          0;
        event.preventDefault();
        event.stopPropagation();
        void this.zoomExtents()
          .catch(
            (
              error,
            ) => {
              console.error(
                "Zoom Extents failed:",
                error,
              );
            },
          );
        return;
      }

      this.zoomCommandExpiresAt =
        0;
    };

  private createHint(
    container:
      HTMLElement,
  ):
    HTMLDivElement {
    const hint =
      document.createElement("div");
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
    message:
      string,
    duration:
      number,
  ): void {
    this.hint.textContent =
      message;
    this.hint.style.display =
      "block";
    const expected =
      message;
    window.setTimeout(
      () => {
        if (
          this.hint.textContent
          === expected
        ) {
          this.hint.style.display =
            "none";
        }
      },
      duration,
    );
  }
}

function isEditableTarget(
  target:
    EventTarget | null,
): boolean {
  if (
    !(target
      instanceof HTMLElement)
  ) {
    return false;
  }
  return (
    target.isContentEditable
    || target.tagName === "INPUT"
    || target.tagName === "TEXTAREA"
    || target.tagName === "SELECT"
  );
}

function isEffectivelyVisible(
  object:
    THREE.Object3D,
): boolean {
  let current:
    THREE.Object3D | null =
      object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current =
      current.parent;
  }
  return true;
}

function isFiniteBox(
  box:
    THREE.Box3,
): boolean {
  return [
    box.min.x,
    box.min.y,
    box.min.z,
    box.max.x,
    box.max.y,
    box.max.z,
  ].every(
    Number.isFinite,
  );
}

function findReferenceModelObject(
  scene:
    THREE.Scene,
  modelId:
    string,
): THREE.Object3D | null {
  let match:
    THREE.Object3D | null =
      null;

  scene.traverse(
    (
      object,
    ) => {
      if (
        match
        || object.name === modelId
        || object.name.includes(modelId)
        || userDataContainsId(
          object.userData,
          modelId,
        )
      ) {
        if (!match) {
          match =
            object;
        }
      }
    },
  );

  if (!match) {
    return null;
  }

  let root =
    match;
  while (
    root.parent
    && root.parent !== scene
  ) {
    root =
      root.parent;
  }
  return root;
}

function userDataContainsId(
  value:
    unknown,
  modelId:
    string,
  depth =
    0,
): boolean {
  if (depth > 3) {
    return false;
  }
  if (typeof value === "string") {
    return (
      value === modelId
      || value.includes(modelId)
    );
  }
  if (
    !value
    || typeof value !== "object"
  ) {
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
