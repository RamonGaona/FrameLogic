import * as THREE from "three";
import { getActiveCadReferenceBlockController } from "../import/CadReferenceTransformController";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  CadWorkPlaneController,
} from "./CadWorkPlaneController";


export interface CadLineTemporaryDimensionControllerOptions {
  readonly domElement: HTMLElement;
  readonly scene: THREE.Scene;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly lineSelection: CadLineSelectionController;
  readonly workPlane: CadWorkPlaneController;
  readonly isLinePlacementActive: () => boolean;
}

interface Segment {
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly source: "PREVIEW" | "SELECTION";
}

const TEMP_DIMENSION_COLOR = 0x72e6ff;
const OFFSET_PIXELS = 30;
const TICK_PIXELS = 5;

/**
 * Cota informativa temporal para líneas CAD del Model Space.
 *
 * - Una línea seleccionada muestra su longitud sin crear una anotación.
 * - Mientras LINE espera el segundo punto, mide el preview en tiempo real.
 * - Durante el preview también muestra el ángulo respecto al eje X del
 *   WorkPlane activo (o X global si el WorkPlane está desactivado).
 * - La separación respecto a la línea se mantiene aproximadamente constante
 *   en pantalla, independientemente del zoom y de la longitud en milímetros.
 */
export class CadLineTemporaryDimensionController {
  private readonly domElement: HTMLElement;
  private readonly scene: THREE.Scene;
  private readonly cameraProvider: () => THREE.Camera;
  private readonly designModel: DesignModel;
  private readonly lineSelection: CadLineSelectionController;
  private readonly workPlane: CadWorkPlaneController;
  private readonly isLinePlacementActive: () => boolean;

  private readonly material = new THREE.LineBasicMaterial({
    color: TEMP_DIMENSION_COLOR,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.88,
  });

  private readonly geometry = new THREE.BufferGeometry();
  private readonly dimensionLines: THREE.LineSegments;
  private readonly label: HTMLDivElement;
  private readonly angleLabel: HTMLDivElement;

  private animationFrame: number | null = null;
  private disposed = false;

  constructor(
    options: CadLineTemporaryDimensionControllerOptions,
  ) {
    this.domElement = options.domElement;
    this.scene = options.scene;
    this.cameraProvider = options.cameraProvider;
    this.designModel = options.designModel;
    this.lineSelection = options.lineSelection;
    this.workPlane = options.workPlane;
    this.isLinePlacementActive = options.isLinePlacementActive;

    this.dimensionLines = new THREE.LineSegments(
      this.geometry,
      this.material,
    );
    this.dimensionLines.name =
      "FrameLogicCadLineTemporaryDimension";
    this.dimensionLines.renderOrder = 2200;
    this.dimensionLines.visible = false;
    this.scene.add(this.dimensionLines);

    this.label = this.createLabel();
    this.label.style.display = "none";

    this.angleLabel = this.createLabel();
    this.angleLabel.dataset[
      "framelogicTemporaryLineAngle"
    ] = "true";
    this.angleLabel.style.padding = "2px 5px";
    this.angleLabel.style.borderColor =
      "rgba(220,235,242,0.75)";
    this.angleLabel.style.color = "#eef8fb";
    this.angleLabel.style.display = "none";

    this.scheduleSync();
  }

  private scheduleSync(): void {
    const tick = (): void => {
      if (this.disposed) return;

      this.sync();
      this.animationFrame =
        window.requestAnimationFrame(tick);
    };

    this.animationFrame =
      window.requestAnimationFrame(tick);
  }

  private sync(): void {
    const rect = this.domElement.getBoundingClientRect();
    if (
      rect.width <= 0
      || rect.height <= 0
      || !this.domElement.isConnected
    ) {
      this.hide();
      return;
    }

    const segment = this.getActiveSegment();
    if (!segment) {
      this.hide();
      return;
    }

    const distance = segment.start.distanceTo(segment.end);
    if (!Number.isFinite(distance) || distance <= 1e-9) {
      this.hide();
      return;
    }

    const midpoint = segment.start.clone()
      .lerp(segment.end, 0.5);
    const camera = this.cameraProvider();
    const worldPerPixel = this.getWorldUnitsPerPixel(
      camera,
      midpoint,
      rect,
    );
    if (!Number.isFinite(worldPerPixel) || worldPerPixel <= 0) {
      this.hide();
      return;
    }

    const direction = segment.end.clone()
      .sub(segment.start)
      .normalize();
    const offsetDirection =
      this.getScreenUpPerpendicular(camera, direction);

    const offset = offsetDirection.clone()
      .multiplyScalar(worldPerPixel * OFFSET_PIXELS);
    const dimensionStart = segment.start.clone().add(offset);
    const dimensionEnd = segment.end.clone().add(offset);

    const tickDirection = offsetDirection.clone()
      .multiplyScalar(worldPerPixel * TICK_PIXELS);

    const points = [
      segment.start,
      dimensionStart,
      segment.end,
      dimensionEnd,
      dimensionStart,
      dimensionEnd,
      dimensionStart.clone().sub(tickDirection),
      dimensionStart.clone().add(tickDirection),
      dimensionEnd.clone().sub(tickDirection),
      dimensionEnd.clone().add(tickDirection),
    ];

    this.geometry.setFromPoints(points);
    this.geometry.computeBoundingSphere();
    this.dimensionLines.visible = true;

    const labelPoint = dimensionStart.clone()
      .lerp(dimensionEnd, 0.5);
    this.label.textContent = this.formatDistance(distance);
    this.syncLabel(labelPoint, rect, camera);

    if (segment.source === "PREVIEW") {
      const angle = this.getWorkPlaneAngle(
        segment.start,
        segment.end,
      );

      if (angle !== null) {
        this.angleLabel.textContent = `${angle}°`;
        this.syncAngleLabel(
          segment.start,
          rect,
          camera,
        );
      }
      else {
        this.angleLabel.style.display = "none";
      }
    }
    else {
      this.angleLabel.style.display = "none";
    }
  }

  private getActiveSegment(): Segment | null {
    if (this.isLinePlacementActive()) {
      return this.getLinePreviewSegment();
    }

    if (!this.lineSelection.isEnabled) {
      return null;
    }

    const selectedIds = this.lineSelection.getSelectedIds();
    // A reference block is selected as one object. A click on a member
    // exposes only its read-only measured length, not an editable CAD line.
    const referenceLineId = getActiveCadReferenceBlockController()?.getInspectedLineId() ?? null;
    const lineId = referenceLineId ?? (selectedIds.length === 1 ? selectedIds[0] : null);
    if (!lineId) return null;

    const line = this.designModel.cadLines.get(lineId);
    if (!line) return null;

    return {
      start: new THREE.Vector3(
        line.start.x,
        line.start.y,
        line.start.z,
      ),
      end: new THREE.Vector3(
        line.end.x,
        line.end.y,
        line.end.z,
      ),
      source: "SELECTION",
    };
  }

  private getLinePreviewSegment(): Segment | null {
    const preview = this.scene.getObjectByName(
      "FrameLogicCadLinePreview",
    );

    if (
      !(preview instanceof THREE.Line)
      || !preview.visible
    ) {
      return null;
    }

    const position = preview.geometry.getAttribute("position");
    if (!position || position.count < 2) {
      return null;
    }

    preview.updateWorldMatrix(true, false);

    return {
      start: new THREE.Vector3()
        .fromBufferAttribute(position, 0)
        .applyMatrix4(preview.matrixWorld),
      end: new THREE.Vector3()
        .fromBufferAttribute(position, 1)
        .applyMatrix4(preview.matrixWorld),
      source: "PREVIEW",
    };
  }

  private getWorkPlaneAngle(
    start: THREE.Vector3,
    end: THREE.Vector3,
  ): number | null {
    const state = this.workPlane.getState();
    const xAxis = state.enabled
      ? state.xAxis.clone().normalize()
      : new THREE.Vector3(1, 0, 0);
    const yAxis = state.enabled
      ? state.yAxis.clone().normalize()
      : new THREE.Vector3(0, 1, 0);

    const direction = end.clone().sub(start);
    const x = direction.dot(xAxis);
    const y = direction.dot(yAxis);

    if (
      !Number.isFinite(x)
      || !Number.isFinite(y)
      || Math.hypot(x, y) <= 1e-9
    ) {
      return null;
    }

    let degrees = THREE.MathUtils.radToDeg(
      Math.atan2(y, x),
    );

    if (degrees < 0) {
      degrees += 360;
    }

    const rounded = Math.round(degrees) % 360;
    return rounded === 360 ? 0 : rounded;
  }

  private getScreenUpPerpendicular(
    camera: THREE.Camera,
    lineDirection: THREE.Vector3,
  ): THREE.Vector3 {
    const screenUp = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(camera.quaternion)
      .normalize();

    screenUp.addScaledVector(
      lineDirection,
      -screenUp.dot(lineDirection),
    );

    if (screenUp.lengthSq() > 1e-12) {
      return screenUp.normalize();
    }

    const screenRight = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(camera.quaternion)
      .normalize();
    screenRight.addScaledVector(
      lineDirection,
      -screenRight.dot(lineDirection),
    );

    if (screenRight.lengthSq() > 1e-12) {
      return screenRight.normalize();
    }

    const fallback = new THREE.Vector3(0, 0, 1);
    fallback.addScaledVector(
      lineDirection,
      -fallback.dot(lineDirection),
    );

    return fallback.lengthSq() > 1e-12
      ? fallback.normalize()
      : new THREE.Vector3(0, 1, 0);
  }

  private getWorldUnitsPerPixel(
    camera: THREE.Camera,
    point: THREE.Vector3,
    rect: DOMRect,
  ): number {
    if (camera instanceof THREE.OrthographicCamera) {
      const visibleHeight =
        Math.abs(camera.top - camera.bottom)
        / Math.max(camera.zoom, 1e-12);
      return visibleHeight / Math.max(rect.height, 1);
    }

    if (camera instanceof THREE.PerspectiveCamera) {
      const distance = camera.position.distanceTo(point);
      const visibleHeight =
        2
        * distance
        * Math.tan(
          THREE.MathUtils.degToRad(camera.fov) / 2,
        );
      return visibleHeight / Math.max(rect.height, 1);
    }

    return 1;
  }

  private syncLabel(
    point: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
  ): void {
    const projected = point.clone().project(camera);

    if (
      !Number.isFinite(projected.x)
      || !Number.isFinite(projected.y)
      || !Number.isFinite(projected.z)
      || projected.z < -1
      || projected.z > 1
    ) {
      this.label.style.display = "none";
      return;
    }

    this.label.style.left = `${
      rect.left + (projected.x + 1) * 0.5 * rect.width
    }px`;
    this.label.style.top = `${
      rect.top + (1 - projected.y) * 0.5 * rect.height
    }px`;
    this.label.style.display = "block";
  }

  private syncAngleLabel(
    point: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
  ): void {
    const projected = point.clone().project(camera);

    if (
      !Number.isFinite(projected.x)
      || !Number.isFinite(projected.y)
      || !Number.isFinite(projected.z)
      || projected.z < -1
      || projected.z > 1
    ) {
      this.angleLabel.style.display = "none";
      return;
    }

    this.angleLabel.style.left = `${
      rect.left
      + (projected.x + 1) * 0.5 * rect.width
      + 18
    }px`;
    this.angleLabel.style.top = `${
      rect.top
      + (1 - projected.y) * 0.5 * rect.height
      + 22
    }px`;
    this.angleLabel.style.display = "block";
  }

  private createLabel(): HTMLDivElement {
    const label = document.createElement("div");
    label.dataset["framelogicTemporaryLineDimension"] = "true";

    Object.assign(label.style, {
      position: "fixed",
      zIndex: "1650",
      pointerEvents: "none",
      transform: "translate(-50%, -150%)",
      padding: "3px 7px",
      border: "1px solid rgba(114,230,255,0.9)",
      borderRadius: "3px",
      background: "rgba(8,18,24,0.9)",
      color: "#dff9ff",
      font: "600 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      lineHeight: "1.2",
      whiteSpace: "nowrap",
      boxShadow: "0 1px 5px rgba(0,0,0,0.4)",
      userSelect: "none",
    });

    document.body.append(label);
    return label;
  }

  private formatDistance(distance: number): string {
    return `${distance.toLocaleString("es-CO", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })} mm`;
  }

  private hide(): void {
    this.dimensionLines.visible = false;
    this.label.style.display = "none";
    this.angleLabel.style.display = "none";
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.animationFrame !== null) {
      window.cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    this.scene.remove(this.dimensionLines);
    this.geometry.dispose();
    this.material.dispose();
    this.label.remove();
    this.angleLabel.remove();
  }
}
