import * as THREE from "three";
import {
  allowPerspectiveDistance,
  allowZoomOutTo,
  getOrthographicZoomForBounds,
} from "./ModelSpaceCameraZoomPolicy";
import { getModelSpaceZoomWindowFrame } from "./ModelSpaceZoomWindowGeometry";

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
  enabled?: boolean;
  /** CameraControls target, used as the depth plane for window zoom. */
  getTarget?(target: THREE.Vector3): THREE.Vector3;
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
  /** Canvas receives pointer positions; popover stays next to this cursor. */
  readonly domElement?: HTMLElement;
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

const COMMAND_TIMEOUT_MS = 8000;
type ZoomChoice = "e" | "o" | "s";
type ZoomStage = "idle" | "await-enter" | "choices" | "window-first" | "window-second";
const WINDOW_MIN_PX = 6;

/** Keep a cursor-anchored command menu inside the visible browser viewport. */
export function getZoomHintPosition(
  x: number, y: number,
  viewportWidth: number, viewportHeight: number,
  popupWidth = 288, popupHeight = 118,
): { left: number; top: number } {
  const gap = 16;
  const margin = 12;
  const maxLeft = Math.max(margin, viewportWidth - popupWidth - margin);
  const maxTop = Math.max(margin, viewportHeight - popupHeight - margin);
  const proposedTop = y + gap + popupHeight + margin > viewportHeight
    ? y - popupHeight - gap : y + gap;
  return {
    left: THREE.MathUtils.clamp(x + gap, margin, maxLeft),
    top: THREE.MathUtils.clamp(proposedTop, margin, maxTop),
  };
}

/** One menu updates for every zoom keystroke instead of a clipped bottom hint. */
export function formatZoomChoices(selected: ZoomChoice): string {
  return [
    "Z · ZOOM",
    `${selected === "e" ? "›" : " "} E · Extensión (todo el modelo)`,
    `${selected === "o" ? "›" : " "} O · Objeto (selección)`,
    `${selected === "s" ? "›" : " "} S · Seleccionar área (ventana)`,
    "↑↓ / Tab elegir · Enter aplicar · Esc cancelar",
  ].join("\n");
}

/**
 * Zoom commands estilo AutoCAD:
 *   Z -> Enter -> E = Extents
 *   Z -> Enter -> O = Object / selección
 *   Z -> Enter -> S = Seleccionar área (ventana)
 *
 * Todas las distancias geométricas están expresadas en milímetros.
 */
export class ModelSpaceZoomExtentsController {
  private readonly options: ModelSpaceZoomExtentsControllerOptions;
  private readonly hint: HTMLDivElement;
  private readonly zoomWindowOverlay: HTMLDivElement;
  private zoomStage: ZoomStage = "idle";
  private zoomCommandExpiresAt = 0;
  private zoomChoice: ZoomChoice = "e";
  private firstX = 0;
  private firstY = 0;
  private lastX = 0;
  private lastY = 0;
  private zoomPointerId: number | null = null;
  private previousCameraEnabled: boolean | null = null;
  private pointerX = typeof window !== "undefined" ? window.innerWidth / 2 : 320;
  private pointerY = typeof window !== "undefined" ? window.innerHeight / 2 : 240;
  private hintTimeout: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    options: ModelSpaceZoomExtentsControllerOptions,
  ) {
    this.options = options;
    this.hint = this.createHint(options.container);
    this.zoomWindowOverlay = this.createZoomWindowOverlay();
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    (this.options.domElement ?? this.options.container).addEventListener(
      "pointermove", this.handlePointerMove, true,
    );
    // Capture before existing CAD/DWG selection handlers to ensure the
    // zoom window NEVER selects or modifies model entities.
    window.addEventListener("pointerdown", this.handleZoomWindowDown, true);
    window.addEventListener("pointermove", this.handleZoomWindowMove, true);
    window.addEventListener("pointerup", this.handleZoomWindowUp, true);
    window.addEventListener("pointercancel", this.handleZoomWindowCancel, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    (this.options.domElement ?? this.options.container).removeEventListener(
      "pointermove", this.handlePointerMove, true,
    );
    window.removeEventListener("pointerdown", this.handleZoomWindowDown, true);
    window.removeEventListener("pointermove", this.handleZoomWindowMove, true);
    window.removeEventListener("pointerup", this.handleZoomWindowUp, true);
    window.removeEventListener("pointercancel", this.handleZoomWindowCancel, true);
    this.cancelZoomWindow();
    this.cancelHintTimer();
    this.zoomWindowOverlay.remove();
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

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    if (this.hint.style.display !== "none") this.positionHint();
  };

  private positionHint(): void {
    const box = this.hint.getBoundingClientRect();
    const sizeWidth = box.width > 0 ? box.width : 288;
    const sizeHeight = box.height > 0 ? box.height : 118;
    const position = getZoomHintPosition(
      this.pointerX, this.pointerY,
      window.innerWidth, window.innerHeight, sizeWidth, sizeHeight,
    );
    this.hint.style.left = `${position.left}px`;
    this.hint.style.top = `${position.top}px`;
  }

  private cancelHintTimer(): void {
    if (this.hintTimeout !== null) {
      clearTimeout(this.hintTimeout);
      this.hintTimeout = null;
    }
  }

  private hideHint(): void {
    this.cancelHintTimer();
    this.hint.style.display = "none";
  }

  private showZoomChoices(): void {
    this.showHint(formatZoomChoices(this.zoomChoice), COMMAND_TIMEOUT_MS);
  }

  private executeZoomChoice(choice: ZoomChoice): void {
    this.zoomCommandExpiresAt = 0;
    this.zoomStage = "idle";
    this.hideHint();
    if (choice === "s") {
      this.startZoomWindow();
      return;
    }
    const operation = choice === "e" ? this.zoomExtents() : this.zoomSelected();
    void operation.catch((error: unknown) => {
      console.error(
        choice === "e" ? "Zoom Extents failed:" : "Zoom Object failed:", error,
      );
      this.showHint("ZOOM · No fue posible completar la operación", 1400);
    });
  }

  private startZoomWindow(): void {
    this.zoomStage = "window-first";
    this.zoomPointerId = null;
    this.zoomWindowOverlay.style.display = "none";
    const controls = this.options.controls;
    this.previousCameraEnabled = typeof controls.enabled === "boolean"
      ? controls.enabled : null;
    if (typeof controls.enabled === "boolean") controls.enabled = false;
    this.showHint("ZOOM · Seleccionar área\nPrimera esquina: clic o arrastra una ventana · Esc cancela", 0);
  }

  private cancelZoomWindow(): void {
    this.zoomPointerId = null;
    this.zoomWindowOverlay.style.display = "none";
    if (this.previousCameraEnabled !== null) {
      this.options.controls.enabled = this.previousCameraEnabled;
      this.previousCameraEnabled = null;
    }
    this.zoomStage = "idle";
    this.zoomCommandExpiresAt = 0;
    this.hideHint();
  }

  private getCanvasRect(): DOMRect {
    return (this.options.domElement ?? this.options.container).getBoundingClientRect();
  }

  private insideCanvas(target: EventTarget | null): boolean {
    const canvas = this.options.domElement ?? this.options.container;
    return target === canvas || (target instanceof Node && canvas.contains(target));
  }

  private clampedWindowPoint(x: number, y: number): { x: number; y: number } {
    const rect = this.getCanvasRect();
    return {
      x: THREE.MathUtils.clamp(x, rect.left, rect.right),
      y: THREE.MathUtils.clamp(y, rect.top, rect.bottom),
    };
  }

  private updateZoomWindowOverlay(x: number, y: number): void {
    const current = this.clampedWindowPoint(x, y);
    this.lastX = current.x;
    this.lastY = current.y;
    const left = Math.min(this.firstX, this.lastX);
    const top = Math.min(this.firstY, this.lastY);
    const width = Math.abs(this.lastX - this.firstX);
    const height = Math.abs(this.lastY - this.firstY);
    this.zoomWindowOverlay.style.left = `${left}px`;
    this.zoomWindowOverlay.style.top = `${top}px`;
    this.zoomWindowOverlay.style.width = `${width}px`;
    this.zoomWindowOverlay.style.height = `${height}px`;
    this.zoomWindowOverlay.style.display = "block";
  }

  private readonly handleZoomWindowDown = (event: PointerEvent): void => {
    if ((this.zoomStage !== "window-first" && this.zoomStage !== "window-second")
      || event.button !== 0 || !this.insideCanvas(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const p = this.clampedWindowPoint(event.clientX, event.clientY);
    this.zoomPointerId = event.pointerId;
    if (this.zoomStage === "window-first") {
      this.firstX = p.x;
      this.firstY = p.y;
      this.lastX = p.x;
      this.lastY = p.y;
      this.zoomWindowOverlay.style.display = "none";
    } else {
      this.updateZoomWindowOverlay(p.x, p.y);
    }
  };

  private readonly handleZoomWindowMove = (event: PointerEvent): void => {
    if (this.zoomStage !== "window-first" && this.zoomStage !== "window-second")
      return;
    if (this.zoomPointerId !== null && this.zoomPointerId !== event.pointerId)
      return;
    // After the first click, the opposite corner follows the free cursor.
    if (this.zoomStage === "window-first" && this.zoomPointerId === null)
      return;
    this.updateZoomWindowOverlay(event.clientX, event.clientY);
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly handleZoomWindowUp = (event: PointerEvent): void => {
    if ((this.zoomStage !== "window-first" && this.zoomStage !== "window-second")
        || this.zoomPointerId === null || this.zoomPointerId !== event.pointerId)
      return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.updateZoomWindowOverlay(event.clientX, event.clientY);
    this.zoomPointerId = null;
    const width = Math.abs(this.lastX - this.firstX);
    const height = Math.abs(this.lastY - this.firstY);
    if (this.zoomStage === "window-first"
        && (width < WINDOW_MIN_PX || height < WINDOW_MIN_PX)) {
      this.zoomStage = "window-second";
      this.showHint("ZOOM · Seleccionar área\nSegunda esquina: clic para encuadrar · Esc cancela", 0);
      return;
    }
    if (width < WINDOW_MIN_PX || height < WINDOW_MIN_PX) {
      this.showHint("ZOOM · Área muy pequeña; elige otra esquina · Esc cancela", 0);
      this.zoomStage = "window-second";
      return;
    }
    const bounds = {
      x1: this.firstX, y1: this.firstY,
      x2: this.lastX, y2: this.lastY,
    };
    this.cancelZoomWindow();
    void this.zoomToWindow(bounds).catch(error => {
      console.error("Zoom Window failed:", error);
      this.showHint("ZOOM · No fue posible encuadrar el área", 1400);
    });
  };

  private readonly handleZoomWindowCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.zoomPointerId) return;
    this.zoomPointerId = null;
    if (this.zoomStage === "window-first") {
      this.zoomWindowOverlay.style.display = "none";
    }
  };

  /** Frame a viewport region, without selecting model objects or exploding DWG. */
  async zoomToWindow(bounds: { x1: number; y1: number; x2: number; y2: number }): Promise<boolean> {
    const camera = this.options.cameraProvider();
    const controls = this.options.controls;
    const viewTarget = new THREE.Vector3();
    if (controls.getTarget) controls.getTarget(viewTarget);
    else {
      camera.getWorldDirection(viewTarget);
      viewTarget.multiplyScalar(Math.max(500, controls.minDistance * 4))
        .add(camera.position);
    }
    const frame = getModelSpaceZoomWindowFrame(
      camera, viewTarget, this.getCanvasRect(), bounds,
    );
    if (!frame) return false;

    if (camera instanceof THREE.PerspectiveCamera)
      allowPerspectiveDistance(controls, frame.position.distanceTo(frame.target));
    if (frame.orthographicZoom !== null)
      allowZoomOutTo(controls, frame.orthographicZoom);
    await controls.setLookAt(
      frame.position.x, frame.position.y, frame.position.z,
      frame.target.x, frame.target.y, frame.target.z, false,
    );
    if (frame.orthographicZoom !== null)
      await controls.zoomTo(frame.orthographicZoom, false);
    return true;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.disposed || isEditableTarget(event.target)
      || event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    const now = performance.now();

    if (key === "z") {
      if (this.zoomStage === "window-first" || this.zoomStage === "window-second")
        this.cancelZoomWindow();
      this.zoomStage = "await-enter";
      this.zoomCommandExpiresAt = now + COMMAND_TIMEOUT_MS;
      this.zoomChoice = "e";
      event.preventDefault();
      event.stopImmediatePropagation();
      this.showHint("Z · Enter para abrir ZOOM · Esc cancela", COMMAND_TIMEOUT_MS);
      return;
    }

    if (this.zoomStage === "window-first" || this.zoomStage === "window-second") {
      if (key === "escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cancelZoomWindow();
      }
      // Other shortcuts are not captured by the camera window.
      return;
    }

    if (this.zoomStage === "idle") return;
    if (now > this.zoomCommandExpiresAt) {
      this.zoomStage = "idle";
      this.zoomCommandExpiresAt = 0;
      this.hideHint();
      return;
    }

    if (key === "escape") {
      this.zoomStage = "idle";
      this.zoomCommandExpiresAt = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.hideHint();
      return;
    }

    if (this.zoomStage === "await-enter") {
      if (key === "enter") {
        this.zoomStage = "choices";
        this.zoomCommandExpiresAt = now + COMMAND_TIMEOUT_MS;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.showZoomChoices();
      } else {
        this.zoomStage = "idle";
        this.hideHint();
      }
      return;
    }

    if (key === "arrowdown" || key === "arrowup" || key === "tab") {
      const choices: ZoomChoice[] = ["e", "o", "s"];
      const direction = key === "arrowup" ? -1 : 1;
      const current = choices.indexOf(this.zoomChoice);
      this.zoomChoice = choices[(current + direction + choices.length) % choices.length]!;
      this.zoomCommandExpiresAt = now + COMMAND_TIMEOUT_MS;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.showZoomChoices();
      return;
    }

    if (key === "e" || key === "o" || key === "s" || key === "enter") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.executeZoomChoice(key === "enter" ? this.zoomChoice : key as ZoomChoice);
      return;
    }
    this.zoomStage = "idle";
    this.zoomCommandExpiresAt = 0;
    this.hideHint();
  };

  private createZoomWindowOverlay(): HTMLDivElement {
    const overlay = document.createElement("div");
    overlay.dataset["framelogicZoomWindow"] = "true";
    Object.assign(overlay.style, {
      position: "fixed",
      display: "none",
      pointerEvents: "none",
      boxSizing: "border-box",
      border: "1px solid #5fd3ef",
      background: "rgba(33, 166, 221, 0.10)",
      zIndex: "2147482498",
    });
    document.body.append(overlay);
    return overlay;
  }

  private createHint(_container: HTMLElement): HTMLDivElement {
    const hint = document.createElement("div");
    hint.dataset["framelogicZoomChoices"] = "true";
    Object.assign(hint.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      zIndex: "2147482501",
      display: "none",
      width: "max-content",
      maxWidth: "min(310px, calc(100vw - 24px))",
      whiteSpace: "pre-line",
      lineHeight: "1.55",
      padding: "7px 10px",
      border: "1px solid rgba(154,215,238,0.65)",
      borderRadius: "5px",
      background: "rgba(20,29,38,0.97)",
      boxShadow: "0 5px 14px rgba(0,0,0,0.45)",
      color: "#eaf2f6",
      pointerEvents: "none",
      userSelect: "none",
      font: "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    });
    hint.setAttribute("role", "status");
    document.body.append(hint);
    return hint;
  }

  private showHint(message: string, duration: number): void {
    this.cancelHintTimer();
    this.hint.textContent = message;
    this.hint.style.display = "block";
    this.positionHint();
    if (duration <= 0) return;
    this.hintTimeout = setTimeout(() => {
      this.hintTimeout = null;
      this.hint.style.display = "none";
      if (this.zoomCommandExpiresAt > 0
        && performance.now() >= this.zoomCommandExpiresAt) {
        this.zoomCommandExpiresAt = 0;
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
