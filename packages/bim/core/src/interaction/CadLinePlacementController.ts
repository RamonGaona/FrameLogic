import * as THREE from "three";

/** Ignore mouse movements owned by middle-button orbit or right-button pan. */
export function isCameraNavigationPointerMove(buttons: number): boolean {
  return (buttons & (2 | 4)) !== 0;
}

import { findFirstCadTrajectoryIntersection } from "./CadLineTrajectoryIntersection";

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
  CadWorkPlaneState,
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
  private readonly intersectionMarker: THREE.Points;

  private readonly pointerRaycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly pointerPlane = new THREE.Plane();
  private readonly viewDirection = new THREE.Vector3();

  private startPoint: THREE.Vector3 | null = null;
  private lastDirection: THREE.Vector3 | null = null;

  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownActive = false;

  private lastPointerX = 0;
  private lastPointerY = 0;
  private hasPointerPosition = false;
  private lastPointerAlt = false;

  private active = false;
  private disposed = false;

  // Último segmento CAD realmente registrado durante el comando LINE
  // actual; la línea de vista previa NO cuenta como segmento terminado.
  private lastCreatedLineId: string | null = null;

  get lastCompletedLineId(): string | null {
    return this.lastCreatedLineId;
  }

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

    // Constant-size cyan point at the exact trajectory/geometry crossing,
    // distinct from the ordinary ENDPOINT/MIDPOINT pointer SNAP indicator.
    const markerGeometry = new THREE.BufferGeometry();
    markerGeometry.setAttribute("position",
      new THREE.Float32BufferAttribute([0, 0, 0], 3));
    this.intersectionMarker = new THREE.Points(markerGeometry,
      new THREE.PointsMaterial({
        color: "#00eaff", size: 11, sizeAttenuation: false,
        depthTest: false, depthWrite: false,
      }));
    this.intersectionMarker.name = "FrameLogicLineTrajectoryIntersection";
    this.intersectionMarker.renderOrder = 1002;
    this.intersectionMarker.visible = false;
    this.scene.add(this.intersectionMarker);

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
    this.lastCreatedLineId = null;
    this.startPoint = null;
    this.lastDirection = null;
    this.pointerDownActive = false;
    this.hasPointerPosition = false;
    this.preview.visible = false;
    this.intersectionMarker.visible = false;

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
    this.intersectionMarker.visible = false;

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
    this.rememberPointer(event.clientX, event.clientY, event.altKey ?? false);

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
      event.altKey ?? false,
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
    // Camera navigation must not replace the user's LINE bearing. In
    // particular, a subsequent exact numeric distance uses lastDirection.
    if (!this.active || isCameraNavigationPointerMove(event.buttons ?? 0)) {
      return;
    }

    this.rememberPointer(event.clientX, event.clientY, event.altKey ?? false);

    if (!this.startPoint) {
      this.preview.visible = false;
      this.intersectionMarker.visible = false;
      return;
    }

    const end = this.acquirePointerPoint(
      event.clientX,
      event.clientY,
      event.altKey ?? false,
    );

    if (!end) {
      this.preview.visible = false;
      this.intersectionMarker.visible = false;
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
    alt = false,
  ): void {
    this.lastPointerX = clientX;
    this.lastPointerY = clientY;
    this.lastPointerAlt = alt;
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
      this.lastPointerAlt,
    );

    if (!end) {
      this.preview.visible = false;
      this.intersectionMarker.visible = false;
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
    ignoreIntersections = false,
  ): THREE.Vector3 | null {
    /*
     * El primer punto siempre se conserva exactamente donde fue elegido,
     * incluso si queda fuera del workplane visible.
     *
     * Después del primer punto, un workplane activo define DIRECCIONES:
     * se usa un plano paralelo al workplane que pasa por startPoint.
     * Así, por ejemplo, XY desde (3,3,3) conserva Z=3.
     *
     * - Plano ON + ORTO OFF: dirección libre dentro de ese plano paralelo.
     * - Plano ON + ORTO ON: solo los dos ejes del plano.
     * - Plano OFF + ORTO OFF: 3D libre según la vista.
     * - Plano OFF + ORTO ON: X/Y/Z globales.
     *
     * SNAP se detecta primero. Si ya existe startPoint y hay workplane,
     * el snap se proyecta al plano paralelo permitido.
     */
    const snap = this.snap.findSnap(
      clientX,
      clientY,
    );

    if (snap) {
      return this.snapToLineTrajectory(
        this.resolveCandidate(snap.point, this.startPoint),
        ignoreIntersections,
      );
    }

    const state = this.workPlane.getState();
    let candidate: THREE.Vector3 | null;

    if (state.enabled) {
      candidate = this.intersectPointerWithPlane(
        clientX,
        clientY,
        state.normal,
        this.startPoint ?? state.origin,
      );
    }
    else {
      candidate = this.intersectFree3DPointer(
        clientX,
        clientY,
        this.startPoint ?? state.origin,
      );
    }

    if (!candidate) {
      return null;
    }

    return this.snapToLineTrajectory(
      this.resolveCandidate(candidate, this.startPoint),
      ignoreIntersections,
    );
  }

  /**
   * While LINE previews a segment, use the first actual 3D intersection
   * along its trajectory as the endpoint (CAD or DWG/DXF packed references).
   * Alt temporarily bypasses interception when a line must cross through.
   * Numeric input remains authoritative and never passes through here.
   */
  private snapToLineTrajectory(
    candidate: THREE.Vector3,
    ignoreIntersections = false,
  ): THREE.Vector3 {
    if (this.intersectionMarker) this.intersectionMarker.visible = false;
    if (!this.startPoint || ignoreIntersections) return candidate;
    if (typeof document !== "undefined"
      && document.body?.dataset["framelogicCadImporting"] === "true") return candidate;
    const hit = findFirstCadTrajectoryIntersection(
      this.designModel, this.cameraProvider(),
      this.domElement.getBoundingClientRect(), this.startPoint, candidate,
    );
    if (!hit) return candidate;
    if (this.intersectionMarker) {
      this.intersectionMarker.position.copy(hit.point);
      this.intersectionMarker.visible = true;
    }
    return hit.point.clone();
  }

  private resolveCandidate(
    candidate: THREE.Vector3,
    start: THREE.Vector3 | null,
  ): THREE.Vector3 {
    /*
     * Nunca proyectamos el primer punto. El plano controla el movimiento
     * DESDE ese punto, no la posición absoluta del punto inicial.
     */
    if (!start) {
      return candidate.clone();
    }

    const state = this.workPlane.getState();

    if (state.enabled) {
      const resolved = this.projectPointToParallelWorkPlane(
        candidate,
        state,
        start,
      );

      if (!this.ortho.isEnabled) {
        return resolved;
      }

      /*
       * ORTO dentro de un plano activo nunca utiliza la normal.
       * Para CUSTOM, X/Y representan los dos ejes locales del plano.
       */
      return this.ortho.constrainPoint(
        start,
        resolved,
        {
          axes: ["X", "Y"],
          basis: {
            xAxis: state.xAxis,
            yAxis: state.yAxis,
            zAxis: state.normal,
          },
        },
      );
    }

    if (!this.ortho.isEnabled) {
      return candidate.clone();
    }

    return this.ortho.constrainPoint(
      start,
      candidate,
    );
  }

  private projectPointToParallelWorkPlane(
    point: THREE.Vector3,
    state: CadWorkPlaneState,
    anchor: THREE.Vector3,
  ): THREE.Vector3 {
    const normal = state.normal.clone();

    if (normal.lengthSq() <= 1e-20) {
      return point.clone();
    }

    normal.normalize();

    const distance = point
      .clone()
      .sub(anchor)
      .dot(normal);

    return point
      .clone()
      .addScaledVector(
        normal,
        -distance,
      );
  }

  private intersectPointerWithPlane(
    clientX: number,
    clientY: number,
    normal: THREE.Vector3,
    anchor: THREE.Vector3,
  ): THREE.Vector3 | null {
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const resolvedNormal = normal.clone();
    if (resolvedNormal.lengthSq() <= 1e-20) {
      return null;
    }
    resolvedNormal.normalize();

    this.pointerNdc.x = (
      (clientX - rect.left) / rect.width
    ) * 2 - 1;

    this.pointerNdc.y = -(
      (clientY - rect.top) / rect.height
    ) * 2 + 1;

    this.pointerRaycaster.setFromCamera(
      this.pointerNdc,
      this.cameraProvider(),
    );

    this.pointerPlane.setFromNormalAndCoplanarPoint(
      resolvedNormal,
      anchor,
    );

    return this.pointerRaycaster.ray.intersectPlane(
      this.pointerPlane,
      new THREE.Vector3(),
    );
  }

  private intersectFree3DPointer(
    clientX: number,
    clientY: number,
    anchor: THREE.Vector3,
  ): THREE.Vector3 | null {
    const camera = this.cameraProvider();

    camera.getWorldDirection(
      this.viewDirection,
    );

    if (this.viewDirection.lengthSq() <= 1e-20) {
      return null;
    }

    return this.intersectPointerWithPlane(
      clientX,
      clientY,
      this.viewDirection,
      anchor,
    );
  }

  private acceptPoint(
    point: THREE.Vector3,
  ): boolean {
    const resolvedPoint = this.resolveCandidate(
      point,
      this.startPoint,
    );

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
    else {
      this.lastDirection = null;
    }

    this.startPoint = end;
    this.preview.visible = false;
    this.intersectionMarker.visible = false;
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

    this.lastCreatedLineId = line.id;
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
    this.scene.remove(this.intersectionMarker);
    this.intersectionMarker.geometry.dispose();
    const intersectionMaterial = this.intersectionMarker.material;
    if (Array.isArray(intersectionMaterial)) {
      for (const material of intersectionMaterial) material.dispose();
    } else {
      intersectionMaterial.dispose();
    }

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
