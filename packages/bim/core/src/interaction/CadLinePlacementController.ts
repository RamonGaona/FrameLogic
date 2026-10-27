import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadHistoryController,
} from "./CadHistoryController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  CadWorkPlaneController,
} from "./CadWorkPlaneController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  DesignSnapController,
} from "./DesignSnapController";

import {
  getDesignOrthoController,
} from "./DesignOrthoController";

import type {
  DesignOrthoController,
} from "./DesignOrthoController";

import {
  CAD_LINE_DISTANCE_APPLY_EVENT,
  CAD_LINE_DISTANCE_END_EVENT,
  CAD_LINE_DISTANCE_MODE_EVENT,
} from "./CadNumericInputController";

import type {
  CadLineDistanceApplyDetail,
  CadLineDistanceModeDetail,
} from "./CadNumericInputController";

export class CadLinePlacementController {
  private readonly scene: THREE.Scene;
  private readonly domElement: HTMLElement;
  private readonly cameraProvider: () => THREE.Camera;
  private readonly designModel: DesignModel;
  private readonly lineScene: CadLineSceneController;
  private readonly snap: DesignSnapController;
  private readonly workPlane: CadWorkPlaneController;
  private readonly ortho: DesignOrthoController;
  private readonly history: CadHistoryController;
  private readonly designSelection: DesignSelectionController;
  private readonly pointSelection: CadPointSelectionController;
  private readonly lineSelection: CadLineSelectionController;
  private readonly preview: THREE.Line;

  private readonly freeRaycaster = new THREE.Raycaster();
  private readonly freePointer = new THREE.Vector2();
  private readonly freePlane = new THREE.Plane();
  private readonly viewDirection = new THREE.Vector3();

  private startPoint: THREE.Vector3 | null = null;
  private lastDirection: THREE.Vector3 | null = null;

  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownActive = false;

  private lastPointerX = 0;
  private lastPointerY = 0;
  private hasPointerPosition = false;

  private active = false;
  private disposed = false;

  private unsubscribeOrtho: (() => void) | null = null;
  private unsubscribeWorkPlane: (() => void) | null = null;

  constructor(
    scene: THREE.Scene,
    domElement: HTMLElement,
    cameraProvider: () => THREE.Camera,
    designModel: DesignModel,
    lineScene: CadLineSceneController,
    snap: DesignSnapController,
    workPlane: CadWorkPlaneController,
    history: CadHistoryController,
    designSelection: DesignSelectionController,
    pointSelection: CadPointSelectionController,
    lineSelection: CadLineSelectionController,
  ) {
    this.scene = scene;
    this.domElement = domElement;
    this.cameraProvider = cameraProvider;
    this.designModel = designModel;
    this.lineScene = lineScene;
    this.snap = snap;
    this.workPlane = workPlane;
    this.ortho = getDesignOrthoController(domElement);
    this.history = history;
    this.designSelection = designSelection;
    this.pointSelection = pointSelection;
    this.lineSelection = lineSelection;

    const previewGeometry = new THREE.BufferGeometry();
    const previewMaterial = new THREE.LineDashedMaterial({
      dashSize: 0.15,
      gapSize: 0.08,
      depthTest: false,
    });

    this.preview = new THREE.Line(
      previewGeometry,
      previewMaterial,
    );
    this.preview.name = "FrameLogicCadLinePreview";
    this.preview.visible = false;
    this.preview.renderOrder = 1000;
    this.scene.add(this.preview);

    this.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );

    document.addEventListener(
      CAD_LINE_DISTANCE_APPLY_EVENT,
      this.handleNumericDistanceApply,
    );

    this.unsubscribeOrtho = this.ortho.subscribe(
      () => {
        this.refreshPreviewFromLastPointer();
      },
    );

    this.unsubscribeWorkPlane = this.workPlane.subscribe(
      () => {
        this.refreshPreviewFromLastPointer();
      },
    );
  }

  get isActive(): boolean {
    return this.active;
  }

  get hasStartPoint(): boolean {
    return this.startPoint !== null;
  }

  activate(): boolean {
    if (this.disposed) {
      return false;
    }

    const layer = this.designModel.layers.activeLayer;
    if (layer.locked) {
      return false;
    }

    this.active = true;
    this.startPoint = null;
    this.lastDirection = null;
    this.pointerDownActive = false;
    this.hasPointerPosition = false;
    this.preview.visible = false;

    this.designSelection.setEnabled(false);
    this.pointSelection.setEnabled(false);
    this.lineSelection.setEnabled(false);

    return true;
  }

  deactivate(): void {
    this.active = false;
    this.startPoint = null;
    this.lastDirection = null;
    this.pointerDownActive = false;
    this.hasPointerPosition = false;
    this.preview.visible = false;

    this.designSelection.setEnabled(true);
    this.pointSelection.setEnabled(true);
    this.lineSelection.setEnabled(true);

    this.endDistanceInput();
  }

  createAtCoordinates(
    x: number,
    y: number,
    z: number,
  ): boolean {
    if (
      !this.active
      || !Number.isFinite(x)
      || !Number.isFinite(y)
      || !Number.isFinite(z)
    ) {
      return false;
    }

    return this.acceptPoint(
      new THREE.Vector3(x, y, z),
    );
  }

  createAtDistance(distance: number): boolean {
    if (
      !this.active
      || !this.startPoint
      || !this.lastDirection
      || !Number.isFinite(distance)
      || Math.abs(distance) <= 1e-12
    ) {
      return false;
    }

    const end = this.startPoint
      .clone()
      .addScaledVector(
        this.lastDirection,
        distance,
      );

    return this.acceptPoint(end);
  }

  private readonly handleNumericDistanceApply = (
    event: Event,
  ): void => {
    const detail = (
      event as CustomEvent<
        CadLineDistanceApplyDetail
      >
    ).detail;

    if (
      !detail
      || !detail.container.contains(
        this.domElement,
      )
    ) {
      return;
    }

    this.createAtDistance(detail.distance);
  };

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (!this.active || event.button !== 0) {
      return;
    }

    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerDownActive = true;
  };

  private readonly handlePointerUp = (
    event: PointerEvent,
  ): void => {
    if (
      !this.active
      || !this.pointerDownActive
      || event.button !== 0
    ) {
      return;
    }

    this.pointerDownActive = false;
    this.rememberPointer(event.clientX, event.clientY);

    const movement = Math.hypot(
      event.clientX - this.pointerDownX,
      event.clientY - this.pointerDownY,
    );

    if (movement > 5) {
      return;
    }

    const point = this.acquirePointerPoint(
      event.clientX,
      event.clientY,
    );

    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.acceptPoint(point);
  };

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    if (!this.active) {
      return;
    }

    this.rememberPointer(event.clientX, event.clientY);

    if (!this.startPoint) {
      this.preview.visible = false;
      return;
    }

    const end = this.acquirePointerPoint(
      event.clientX,
      event.clientY,
    );

    if (!end) {
      this.preview.visible = false;
      return;
    }

    this.updatePreview(
      this.startPoint,
      end,
    );
  };

  private rememberPointer(
    clientX: number,
    clientY: number,
  ): void {
    this.lastPointerX = clientX;
    this.lastPointerY = clientY;
    this.hasPointerPosition = true;
  }

  private refreshPreviewFromLastPointer(): void {
    if (
      !this.active
      || !this.startPoint
      || !this.hasPointerPosition
    ) {
      return;
    }

    const end = this.acquirePointerPoint(
      this.lastPointerX,
      this.lastPointerY,
    );

    if (!end) {
      this.preview.visible = false;
      this.lastDirection = null;
      return;
    }

    this.updatePreview(
      this.startPoint,
      end,
    );
  }

  private acquirePointerPoint(
    clientX: number,
    clientY: number,
  ): THREE.Vector3 | null {
    /*
     * Prioridad de precisión:
     * SNAP exacto -> ORTO 3D -> plano activo -> 3D libre.
     *
     * ORTO ignora la limitación del plano para poder elegir
     * X, Y o Z global aun cuando el plano visible sea XY/XZ/YZ.
     */
    const snap = this.snap.findSnap(
      clientX,
      clientY,
    );

    if (snap) {
      const candidate = snap.point.clone();

      if (!this.startPoint) {
        return candidate;
      }

      return this.ortho.constrainPoint(
        this.startPoint,
        candidate,
      );
    }

    if (!this.startPoint) {
      if (this.workPlane.enabled) {
        return this.workPlane.intersectPointer(
          clientX,
          clientY,
          this.cameraProvider(),
          this.domElement,
        );
      }

      return this.intersectFree3DPointer(
        clientX,
        clientY,
        this.workPlane.getState().origin,
      );
    }

    if (this.ortho.isEnabled) {
      const freeCandidate = this.intersectFree3DPointer(
        clientX,
        clientY,
        this.startPoint,
      );

      if (!freeCandidate) {
        return null;
      }

      return this.ortho.constrainPoint(
        this.startPoint,
        freeCandidate,
      );
    }

    if (this.workPlane.enabled) {
      return this.workPlane.intersectPointer(
        clientX,
        clientY,
        this.cameraProvider(),
        this.domElement,
      );
    }

    return this.intersectFree3DPointer(
      clientX,
      clientY,
      this.startPoint,
    );
  }

  private intersectFree3DPointer(
    clientX: number,
    clientY: number,
    anchor: THREE.Vector3,
  ): THREE.Vector3 | null {
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.freePointer.x = (
      (clientX - rect.left) / rect.width
    ) * 2 - 1;

    this.freePointer.y = -(
      (clientY - rect.top) / rect.height
    ) * 2 + 1;

    const camera = this.cameraProvider();
    this.freeRaycaster.setFromCamera(
      this.freePointer,
      camera,
    );

    camera.getWorldDirection(
      this.viewDirection,
    );

    if (this.viewDirection.lengthSq() <= 1e-20) {
      return null;
    }

    this.viewDirection.normalize();
    this.freePlane.setFromNormalAndCoplanarPoint(
      this.viewDirection,
      anchor,
    );

    return this.freeRaycaster.ray.intersectPlane(
      this.freePlane,
      new THREE.Vector3(),
    );
  }

  private acceptPoint(
    point: THREE.Vector3,
  ): boolean {
    const resolvedPoint = this.startPoint
      ? this.ortho.constrainPoint(
          this.startPoint,
          point,
        )
      : point.clone();

    if (!this.startPoint) {
      this.startPoint = resolvedPoint.clone();
      this.lastDirection = null;
      this.preview.visible = false;
      this.requestDistanceInput();
      this.refreshPreviewFromLastPointer();
      return true;
    }

    if (
      this.startPoint.distanceToSquared(
        resolvedPoint,
      ) <= 1e-12
    ) {
      return false;
    }

    const start = this.startPoint.clone();
    const end = resolvedPoint.clone();

    if (!this.createLine(start, end)) {
      return false;
    }

    const direction = end.clone().sub(start);
    if (direction.lengthSq() > 1e-20) {
      this.lastDirection = direction.normalize();
    }

    this.startPoint = end;
    this.preview.visible = false;
    this.requestDistanceInput();
    this.refreshPreviewFromLastPointer();
    return true;
  }

  private createLine(
    start: THREE.Vector3,
    end: THREE.Vector3,
  ): boolean {
    const layerId = this.designModel.layers.activeLayerId;

    const line = this.designModel.registerCadLine({
      layerId,
      start: {
        x: start.x,
        y: start.y,
        z: start.z,
      },
      end: {
        x: end.x,
        y: end.y,
        z: end.z,
      },
    });

    this.lineScene.sync();

    const snapshot = {
      id: line.id,
      layerId: line.layerId,
      start: {
        x: line.start.x,
        y: line.start.y,
        z: line.start.z,
      },
      end: {
        x: line.end.x,
        y: line.end.y,
        z: line.end.z,
      },
    };

    this.history.recordOperation(
      "LINE",
      () => {
        this.designModel.removeCadLine(
          snapshot.id,
        );
        this.lineScene.sync();
      },
      () => {
        if (
          this.designModel.cadLines.get(
            snapshot.id,
          )
        ) {
          return;
        }

        this.designModel.registerCadLine({
          id: snapshot.id,
          layerId: snapshot.layerId,
          start: {
            ...snapshot.start,
          },
          end: {
            ...snapshot.end,
          },
        });

        this.lineScene.sync();
      },
    );

    return true;
  }

  private updatePreview(
    start: THREE.Vector3,
    end: THREE.Vector3,
  ): void {
    const direction = end.clone().sub(start);

    if (direction.lengthSq() > 1e-20) {
      this.lastDirection = direction.normalize();
    }
    else {
      this.lastDirection = null;
    }

    this.preview.geometry.setFromPoints([
      start,
      end,
    ]);
    this.preview.computeLineDistances();
    this.preview.visible = true;
  }

  private requestDistanceInput(): void {
    const detail: CadLineDistanceModeDetail = {
      domElement: this.domElement,
    };

    document.dispatchEvent(
      new CustomEvent<CadLineDistanceModeDetail>(
        CAD_LINE_DISTANCE_MODE_EVENT,
        { detail },
      ),
    );
  }

  private endDistanceInput(): void {
    const detail: CadLineDistanceModeDetail = {
      domElement: this.domElement,
    };

    document.dispatchEvent(
      new CustomEvent<CadLineDistanceModeDetail>(
        CAD_LINE_DISTANCE_END_EVENT,
        { detail },
      ),
    );
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.deactivate();

    this.unsubscribeOrtho?.();
    this.unsubscribeOrtho = null;

    this.unsubscribeWorkPlane?.();
    this.unsubscribeWorkPlane = null;

    this.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );

    document.removeEventListener(
      CAD_LINE_DISTANCE_APPLY_EVENT,
      this.handleNumericDistanceApply,
    );

    this.scene.remove(this.preview);
    this.preview.geometry.dispose();

    if (Array.isArray(this.preview.material)) {
      for (const material of this.preview.material) {
        material.dispose();
      }
    }
    else {
      this.preview.material.dispose();
    }
  }
}
