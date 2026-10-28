import * as THREE from "three";

import type {
  DesignModel,
  PieceInstance,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  CadWorkPlaneController,
} from "./CadWorkPlaneController";

import {
  getDesignOrthoController,
} from "./DesignOrthoController";

import type {
  DesignOrthoController,
} from "./DesignOrthoController";

export interface SmartPieceInsertionControllerOptions {
  readonly container: HTMLElement;
  readonly canvas: HTMLElement;
  readonly scene: THREE.Scene;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly workPlane: CadWorkPlaneController;
  readonly findSnapPoint: (
    clientX: number,
    clientY: number,
  ) => THREE.Vector3 | null;
  readonly beforeStart?: () => void;
}

type PlacementStage = "ANCHOR" | "DIRECTION";

/**
 * Inserción CAD 3D de PieceInstance.
 *
 * Dos caminos equivalentes:
 * - XYZ exacto: crea la instancia en las coordenadas indicadas.
 * - Dos puntos: primer clic = punto base; segundo clic = dirección local X.
 *
 * F8/ORTO también gobierna el segundo punto de dirección:
 * - WorkPlane activo: X/Y locales del plano.
 * - WorkPlane OFF: X/Y/Z globales.
 *
 * Con ORTO desactivado la dirección conserva el comportamiento 3D libre.
 * Un SNAP puede estar en cualquier plano; cuando no hay SNAP se usa el
 * WorkPlane activo como fallback de entrada.
 */
export class SmartPieceInsertionController {
  private readonly options: SmartPieceInsertionControllerOptions;
  private readonly panel: HTMLDivElement;
  private readonly status: HTMLSpanElement;
  private readonly inputs: readonly HTMLInputElement[];
  private readonly insertButton: HTMLButtonElement;
  private readonly cancelButton: HTMLButtonElement;
  private readonly ortho: DesignOrthoController;
  private readonly unsubscribeOrtho: () => void;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly helperGeometry = new THREE.BufferGeometry();
  private readonly helperMaterial = new THREE.LineBasicMaterial({
    color: 0x68d7ff,
    depthTest: false,
    transparent: true,
    opacity: 0.9,
  });
  private readonly directionHelper = new THREE.Line(
    this.helperGeometry,
    this.helperMaterial,
  );

  private activeDefinitionId: string | null = null;
  private preview: THREE.Object3D | null = null;
  private stage: PlacementStage = "ANCHOR";
  private anchor: THREE.Vector3 | null = null;
  private currentPoint: THREE.Vector3 | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownActive = false;
  private resolver: ((value: PieceInstance | null) => void) | null = null;
  private disposed = false;

  constructor(
    options: SmartPieceInsertionControllerOptions,
  ) {
    this.options = options;
    this.ortho = getDesignOrthoController(options.canvas);

    const ui = this.createPanel(options.container);
    this.panel = ui.panel;
    this.status = ui.status;
    this.inputs = ui.inputs;
    this.insertButton = ui.insertButton;
    this.cancelButton = ui.cancelButton;

    this.unsubscribeOrtho = this.ortho.subscribe(
      () => {
        this.refreshDirectionFromCurrentPoint();
      },
    );

    this.directionHelper.visible = false;
    this.directionHelper.renderOrder = 999;
    this.directionHelper.name = "FrameLogicInsertionDirection";
    options.scene.add(this.directionHelper);

    options.canvas.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    options.canvas.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    options.canvas.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    this.insertButton.addEventListener(
      "click",
      this.handleInsertCoordinates,
    );
    this.cancelButton.addEventListener(
      "click",
      this.cancel,
    );
  }

  get isActive(): boolean {
    return this.activeDefinitionId !== null;
  }

  start(
    definitionId: string,
  ): Promise<PieceInstance | null> {
    if (this.disposed) {
      return Promise.resolve(null);
    }
    if (this.isActive) {
      this.cancel();
    }

    const definition = this.options.designModel
      .pieceDefinitions
      .get(definitionId);
    if (!definition) {
      throw new Error(
        `Piece definition "${definitionId}" does not exist.`,
      );
    }
    const prototype = this.options.designScene
      .getAssetPrototype(definition.geometryAssetId);
    if (!prototype) {
      throw new Error(
        `No visual prototype exists for asset "${definition.geometryAssetId}".`,
      );
    }

    this.options.beforeStart?.();
    this.activeDefinitionId = definitionId;
    this.stage = "ANCHOR";
    this.anchor = null;
    this.currentPoint = null;
    this.preview = this.createPreview(prototype);
    this.options.scene.add(this.preview);
    this.panel.style.display = "flex";
    this.status.textContent =
      "1º clic: punto base · 2º clic: dirección 3D · F8 ORTO";
    this.options.canvas.style.cursor = "crosshair";

    return new Promise<PieceInstance | null>((resolve) => {
      this.resolver = resolve;
    });
  }

  cancel = (): void => {
    if (!this.isActive) return;
    const resolver = this.resolver;
    this.finish();
    resolver?.(null);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.unsubscribeOrtho();
    this.options.canvas.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.options.canvas.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.options.canvas.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    this.insertButton.removeEventListener(
      "click",
      this.handleInsertCoordinates,
    );
    this.cancelButton.removeEventListener(
      "click",
      this.cancel,
    );
    this.options.scene.remove(this.directionHelper);
    this.helperGeometry.dispose();
    this.helperMaterial.dispose();
    this.panel.remove();
  }

  private createPreview(prototype: THREE.Object3D): THREE.Object3D {
    const preview = prototype.clone(true);
    preview.name = "FrameLogicSmartInsertionPreview";
    preview.visible = false;
    preview.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const make = (source: THREE.Material): THREE.Material => {
        const material = source.clone();
        material.transparent = true;
        material.opacity = 0.38;
        material.depthWrite = false;
        return material;
      };
      child.material = Array.isArray(child.material)
        ? child.material.map(make)
        : make(child.material);
    });
    return preview;
  }

  private disposePreview(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      if (Array.isArray(child.material)) {
        for (const material of child.material) material.dispose();
      }
      else {
        child.material.dispose();
      }
    });
  }

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    if (!this.isActive || !this.preview) return;
    const point = this.pickPoint(event.clientX, event.clientY);
    if (!point) return;
    this.currentPoint = point;

    if (this.stage === "ANCHOR") {
      this.preview.position.copy(point);
      this.preview.visible = true;
      this.preview.updateMatrixWorld(true);
      return;
    }

    this.refreshDirectionFromCurrentPoint();
  };

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (!this.isActive || event.button !== 0) return;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerDownActive = true;
  };

  private readonly handlePointerUp = (
    event: PointerEvent,
  ): void => {
    if (
      !this.isActive
      || event.button !== 0
      || !this.pointerDownActive
    ) {
      return;
    }
    this.pointerDownActive = false;
    if (
      Math.hypot(
        event.clientX - this.pointerDownX,
        event.clientY - this.pointerDownY,
      ) > 5
    ) {
      return;
    }

    const point = this.pickPoint(event.clientX, event.clientY);
    if (!point || !this.preview) return;
    event.preventDefault();
    event.stopPropagation();

    if (this.stage === "ANCHOR") {
      this.anchor = point.clone();
      this.currentPoint = point.clone();
      this.preview.position.copy(point);
      this.preview.visible = true;
      this.stage = "DIRECTION";
      this.status.textContent =
        "Punto base fijado · 2º clic: dirección · F8 ORTO";
      return;
    }

    if (!this.anchor) return;
    const constrainedPoint = this.constrainDirectionPoint(point);
    const direction = constrainedPoint.clone().sub(this.anchor);
    if (direction.lengthSq() <= 1e-12) return;
    const quaternion = this.directionQuaternion(direction);
    this.confirm(this.anchor, quaternion);
  };

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (!this.isActive) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  };

  private readonly handleInsertCoordinates = (): void => {
    if (!this.isActive) return;
    const values = this.inputs.map((input) => Number(input.value));
    if (values.some((value) => !Number.isFinite(value))) {
      this.status.textContent = "XYZ inválido";
      return;
    }
    this.confirm(
      new THREE.Vector3(
        values[0] ?? 0,
        values[1] ?? 0,
        values[2] ?? 0,
      ),
      new THREE.Quaternion(),
    );
  };

  private confirm(
    point: THREE.Vector3,
    quaternion: THREE.Quaternion,
  ): void {
    const definitionId = this.activeDefinitionId;
    if (!definitionId) return;
    const euler = new THREE.Euler()
      .setFromQuaternion(quaternion, "XYZ");
    const instance = this.options.designModel
      .registerPieceInstance({
        definitionId,
        transform: {
          position: {
            x: point.x,
            y: point.y,
            z: point.z,
          },
          rotation: {
            x: euler.x,
            y: euler.y,
            z: euler.z,
          },
        },
        tags: [],
      });
    this.options.designScene.sync();
    const resolver = this.resolver;
    this.finish();
    resolver?.(instance);
  }

  private directionQuaternion(
    direction: THREE.Vector3,
  ): THREE.Quaternion {
    const definition = this.activeDefinitionId
      ? this.options.designModel.pieceDefinitions.get(
          this.activeDefinitionId,
        )
      : undefined;
    const source = definition
      ? new THREE.Vector3(
          definition.coordinateSystem.xAxis.x,
          definition.coordinateSystem.xAxis.y,
          definition.coordinateSystem.xAxis.z,
        )
      : new THREE.Vector3(1, 0, 0);
    if (source.lengthSq() <= 1e-12) source.set(1, 0, 0);
    source.normalize();
    const target = direction.clone().normalize();
    return new THREE.Quaternion().setFromUnitVectors(source, target);
  }

  private constrainDirectionPoint(
    point: THREE.Vector3,
  ): THREE.Vector3 {
    if (!this.anchor || !this.ortho.isEnabled) {
      return point.clone();
    }

    const workPlane = this.options.workPlane.getState();

    if (workPlane.enabled) {
      return this.ortho.constrainPoint(
        this.anchor,
        point,
        {
          axes: ["X", "Y"],
          basis: {
            xAxis: workPlane.xAxis,
            yAxis: workPlane.yAxis,
            zAxis: workPlane.normal,
          },
        },
      );
    }

    return this.ortho.constrainPoint(
      this.anchor,
      point,
      {
        axes: ["X", "Y", "Z"],
      },
    );
  }

  private refreshDirectionFromCurrentPoint(): void {
    if (
      !this.isActive
      || this.stage !== "DIRECTION"
      || !this.preview
      || !this.anchor
      || !this.currentPoint
    ) {
      return;
    }

    const point = this.constrainDirectionPoint(
      this.currentPoint,
    );

    this.preview.position.copy(this.anchor);
    this.applyDirectionToPreview(point);
    this.updateDirectionHelper(this.anchor, point);
  }

  private applyDirectionToPreview(point: THREE.Vector3): void {
    if (!this.preview || !this.anchor) return;
    const direction = point.clone().sub(this.anchor);
    if (direction.lengthSq() <= 1e-12) return;
    this.preview.quaternion.copy(
      this.directionQuaternion(direction),
    );
    this.preview.visible = true;
    this.preview.updateMatrixWorld(true);
  }

  private updateDirectionHelper(
    start: THREE.Vector3,
    end: THREE.Vector3,
  ): void {
    this.helperGeometry.setFromPoints([start, end]);
    this.directionHelper.visible = true;
  }

  private pickPoint(
    clientX: number,
    clientY: number,
  ): THREE.Vector3 | null {
    const snap = this.options.findSnapPoint(clientX, clientY);
    if (snap) return snap.clone();

    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(
      this.pointer,
      this.options.cameraProvider(),
    );

    const state = this.options.workPlane.getState();
    let plane: THREE.Plane;
    if (state.enabled) {
      plane = new THREE.Plane()
        .setFromNormalAndCoplanarPoint(
          state.normal,
          state.origin,
        );
    }
    else {
      const normal = new THREE.Vector3();
      this.options.cameraProvider().getWorldDirection(normal);
      const origin = this.anchor ?? new THREE.Vector3();
      plane = new THREE.Plane()
        .setFromNormalAndCoplanarPoint(normal, origin);
    }
    return this.raycaster.ray.intersectPlane(
      plane,
      new THREE.Vector3(),
    );
  }

  private finish(): void {
    if (this.preview) {
      this.options.scene.remove(this.preview);
      this.disposePreview(this.preview);
    }
    this.preview = null;
    this.activeDefinitionId = null;
    this.stage = "ANCHOR";
    this.anchor = null;
    this.currentPoint = null;
    this.pointerDownActive = false;
    this.directionHelper.visible = false;
    this.panel.style.display = "none";
    this.options.canvas.style.cursor = "";
    this.resolver = null;
  }

  private createPanel(container: HTMLElement): {
    panel: HTMLDivElement;
    status: HTMLSpanElement;
    inputs: readonly HTMLInputElement[];
    insertButton: HTMLButtonElement;
    cancelButton: HTMLButtonElement;
  } {
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "absolute",
      left: "50%",
      bottom: "22px",
      transform: "translateX(-50%)",
      zIndex: "175",
      display: "none",
      alignItems: "center",
      gap: "7px",
      padding: "7px 9px",
      border: "1px solid rgba(255,255,255,0.17)",
      borderRadius: "6px",
      background: "rgba(20,28,34,0.96)",
      color: "#e8f2f6",
      boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
      font: "12px system-ui, sans-serif",
    });
    const title = document.createElement("strong");
    title.textContent = "INSERTAR PIEZA";
    const inputs = ["X", "Y", "Z"].map((axis) => {
      const label = document.createElement("label");
      label.textContent = `${axis} `;
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      input.value = "0";
      input.dataset["cadNumeric"] = "true";
      Object.assign(input.style, {
        width: "72px",
        height: "27px",
        boxSizing: "border-box",
      });
      label.append(input);
      panel.append(label);
      return input;
    });
    const insertButton = document.createElement("button");
    insertButton.type = "button";
    insertButton.textContent = "Insertar XYZ";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancelar";
    const status = document.createElement("span");
    status.style.color = "#9fc3d4";
    status.style.whiteSpace = "nowrap";
    panel.prepend(title);
    panel.append(insertButton, cancelButton, status);
    container.append(panel);
    return {
      panel,
      status,
      inputs,
      insertButton,
      cancelButton,
    };
  }
}
