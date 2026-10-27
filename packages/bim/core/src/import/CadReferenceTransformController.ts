import * as THREE from "three";

import {
  TransformControls,
} from "three/addons/controls/TransformControls.js";

import type {
  DesignLayer,
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

const CAD_LAYER_PREFIX = "CAD ";
const CAD_LAYER_SEPARATOR = " · ";
const PICK_TOLERANCE_PX = 10;

interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface LineSnapshot {
  readonly id: string;
  readonly start: Point3;
  readonly end: Point3;
}

interface PointSnapshot {
  readonly id: string;
  readonly position: Point3;
}

interface TransformSnapshot {
  readonly pivotPosition: THREE.Vector3;
  readonly pivotQuaternion: THREE.Quaternion;
  readonly lines: readonly LineSnapshot[];
  readonly points: readonly PointSnapshot[];
}

export interface CadReferenceTransformControllerOptions {
  readonly container: HTMLElement;
  readonly domElement: HTMLElement;
  readonly scene: THREE.Scene;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly cadLineScene: CadLineSceneController;
  readonly cadPointScene: CadPointSceneController;
  readonly setCameraEnabled: (enabled: boolean) => void;
  readonly clearGeometryQueryCache: () => void;
  readonly clearOtherSelections?: () => void;
}

/**
 * Treats every imported DWG/DXF as one reference block.
 *
 * Internal CAD layers remain locked so individual entities cannot be edited,
 * while the whole reference can be selected, moved and rotated. Geometry is
 * committed back to the native CadLine/CadPoint registries, so project save,
 * autosave and snapping continue to work without a second geometry model.
 */
export class CadReferenceTransformController {
  private readonly options: CadReferenceTransformControllerOptions;
  private readonly controls: TransformControls;
  private readonly helper: THREE.Object3D;
  private readonly pivot = new THREE.Object3D();
  private readonly selectionBox = new THREE.Box3Helper(
    new THREE.Box3(),
    0x6fd6ff,
  );
  private readonly badge: HTMLDivElement;
  private selectedReferenceName: string | null = null;
  private transformSnapshot: TransformSnapshot | null = null;
  private activeMode: "translate" | "rotate" | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownActive = false;
  private disposed = false;

  constructor(
    options: CadReferenceTransformControllerOptions,
  ) {
    this.options = options;
    this.controls = new TransformControls(
      options.cameraProvider(),
      options.domElement,
    );
    this.controls.setSpace("world");
    this.controls.size = 0.8;
    this.helper = this.controls.getHelper();
    this.helper.visible = false;
    this.pivot.name = "FrameLogicCadReferencePivot";
    this.selectionBox.name = "FrameLogicCadReferenceSelection";
    this.selectionBox.visible = false;
    options.scene.add(
      this.helper,
      this.pivot,
      this.selectionBox,
    );

    this.badge = this.createBadge(options.container);

    this.controls.addEventListener(
      "mouseDown",
      this.handleTransformStart,
    );
    this.controls.addEventListener(
      "objectChange",
      this.handleTransformChange,
    );
    this.controls.addEventListener(
      "mouseUp",
      this.handleTransformEnd,
    );

    options.domElement.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    options.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.deactivateTransform();
    this.options.domElement.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.options.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
    );
    this.controls.removeEventListener(
      "mouseDown",
      this.handleTransformStart,
    );
    this.controls.removeEventListener(
      "objectChange",
      this.handleTransformChange,
    );
    this.controls.removeEventListener(
      "mouseUp",
      this.handleTransformEnd,
    );
    this.options.scene.remove(
      this.helper,
      this.pivot,
      this.selectionBox,
    );
    this.selectionBox.dispose();
    this.controls.dispose();
    this.badge.remove();
  }

  getSelectedReferenceName(): string | null {
    return this.selectedReferenceName;
  }

  getSelectedBounds(): THREE.Box3 | null {
    if (!this.selectedReferenceName) return null;
    return this.computeReferenceBounds(
      this.selectedReferenceName,
    );
  }

  selectReference(
    referenceName: string | null,
  ): void {
    if (referenceName === this.selectedReferenceName) {
      this.refreshSelectionVisual();
      return;
    }

    this.deactivateTransform();
    this.selectedReferenceName = referenceName;
    if (referenceName) {
      this.options.clearOtherSelections?.();
      this.badge.textContent =
        `${referenceName} · referencia CAD`;
      this.badge.style.display = "block";
    }
    else {
      this.badge.style.display = "none";
    }
    this.refreshSelectionVisual();
  }

  refresh(): void {
    if (
      this.selectedReferenceName
      && !this.hasReference(
        this.selectedReferenceName,
      )
    ) {
      this.selectReference(null);
      return;
    }
    this.refreshSelectionVisual();
  }

  activateMove(): boolean {
    return this.activateTransform("translate");
  }

  activateRotate(): boolean {
    return this.activateTransform("rotate");
  }

  private activateTransform(
    mode: "translate" | "rotate",
  ): boolean {
    const referenceName = this.selectedReferenceName;
    if (!referenceName) return false;
    const bounds = this.computeReferenceBounds(referenceName);
    if (!bounds) return false;

    this.controls.camera = this.options.cameraProvider();
    this.activeMode = mode;
    this.pivot.position.copy(
      bounds.getCenter(
        new THREE.Vector3(),
      ),
    );
    this.pivot.quaternion.identity();
    this.pivot.updateMatrixWorld(true);

    this.controls.setMode(mode);
    if (mode === "translate") {
      this.controls.showX = true;
      this.controls.showY = true;
      this.controls.showZ = false;
    }
    else {
      this.controls.showX = false;
      this.controls.showY = false;
      this.controls.showZ = true;
    }
    this.controls.attach(this.pivot);
    this.helper.visible = true;
    return true;
  }

  private deactivateTransform(): void {
    this.transformSnapshot = null;
    this.activeMode = null;
    this.controls.detach();
    this.helper.visible = false;
    this.options.setCameraEnabled(true);
  }

  private readonly handleTransformStart = (): void => {
    if (!this.activeMode || !this.selectedReferenceName) return;
    this.transformSnapshot = this.captureReference(
      this.selectedReferenceName,
    );
    this.options.setCameraEnabled(false);
  };

  private readonly handleTransformChange = (): void => {
    const snapshot = this.transformSnapshot;
    if (!snapshot || !this.activeMode) return;

    if (this.activeMode === "translate") {
      const delta = this.pivot.position
        .clone()
        .sub(snapshot.pivotPosition);
      for (const line of snapshot.lines) {
        this.options.designModel.cadLines.updateGeometry(
          line.id,
          addPoint(line.start, delta),
          addPoint(line.end, delta),
        );
      }
      for (const point of snapshot.points) {
        this.options.designModel.cadPoints.updatePosition(
          point.id,
          addPoint(point.position, delta),
        );
      }
    }
    else {
      const inverseStart = snapshot.pivotQuaternion
        .clone()
        .invert();
      const deltaQuaternion = this.pivot.quaternion
        .clone()
        .multiply(inverseStart);
      for (const line of snapshot.lines) {
        this.options.designModel.cadLines.updateGeometry(
          line.id,
          rotatePoint(
            line.start,
            snapshot.pivotPosition,
            deltaQuaternion,
          ),
          rotatePoint(
            line.end,
            snapshot.pivotPosition,
            deltaQuaternion,
          ),
        );
      }
      for (const point of snapshot.points) {
        this.options.designModel.cadPoints.updatePosition(
          point.id,
          rotatePoint(
            point.position,
            snapshot.pivotPosition,
            deltaQuaternion,
          ),
        );
      }
    }

    this.syncGeometry();
    this.refreshSelectionVisual();
  };

  private readonly handleTransformEnd = (): void => {
    this.transformSnapshot = null;
    this.options.setCameraEnabled(true);
    this.syncGeometry();
    this.refreshSelectionVisual();
  };

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (event.button !== 0) return;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerDownActive = true;
  };

  private readonly handlePointerUp = (
    event: PointerEvent,
  ): void => {
    if (
      event.button !== 0
      || !this.pointerDownActive
      || this.controls.dragging
    ) {
      this.pointerDownActive = false;
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

    const referenceName = this.getReferenceAt(
      event.clientX,
      event.clientY,
    );
    if (referenceName) {
      event.preventDefault();
      event.stopPropagation();
      this.selectReference(referenceName);
      return;
    }

    if (!this.activeMode) {
      this.selectReference(null);
    }
  };

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

    if (event.key === "Escape") {
      if (this.activeMode) {
        event.preventDefault();
        event.stopPropagation();
        this.deactivateTransform();
        this.refreshSelectionVisual();
        return;
      }
      if (this.selectedReferenceName) {
        event.preventDefault();
        event.stopPropagation();
        this.selectReference(null);
      }
      return;
    }

    if (!this.selectedReferenceName) return;
    const key = event.key.toLowerCase();
    if (key === "m") {
      if (this.activateMove()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (key === "r") {
      if (this.activateRotate()) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  private captureReference(
    referenceName: string,
  ): TransformSnapshot {
    const layerIds = this.getReferenceLayerIds(referenceName);
    return {
      pivotPosition: this.pivot.position.clone(),
      pivotQuaternion: this.pivot.quaternion.clone(),
      lines: this.options.designModel.cadLines
        .getAll()
        .filter((line) => layerIds.has(line.layerId))
        .map((line) => ({
          id: line.id,
          start: { ...line.start },
          end: { ...line.end },
        })),
      points: this.options.designModel.cadPoints
        .getAll()
        .filter((point) => layerIds.has(point.layerId))
        .map((point) => ({
          id: point.id,
          position: { ...point.position },
        })),
    };
  }

  private computeReferenceBounds(
    referenceName: string,
  ): THREE.Box3 | null {
    const layerIds = this.getReferenceLayerIds(referenceName);
    if (layerIds.size < 1) return null;
    const box = new THREE.Box3();
    let hasPoint = false;
    for (const line of this.options.designModel.cadLines.getAll()) {
      if (!layerIds.has(line.layerId)) continue;
      box.expandByPoint(
        new THREE.Vector3(
          line.start.x,
          line.start.y,
          line.start.z,
        ),
      );
      box.expandByPoint(
        new THREE.Vector3(
          line.end.x,
          line.end.y,
          line.end.z,
        ),
      );
      hasPoint = true;
    }
    for (const point of this.options.designModel.cadPoints.getAll()) {
      if (!layerIds.has(point.layerId)) continue;
      box.expandByPoint(
        new THREE.Vector3(
          point.position.x,
          point.position.y,
          point.position.z,
        ),
      );
      hasPoint = true;
    }
    return hasPoint ? box : null;
  }

  private getReferenceAt(
    clientX: number,
    clientY: number,
  ): string | null {
    const rect = this.options.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const camera = this.options.cameraProvider();
    let bestReference: string | null = null;
    let bestDistance = PICK_TOLERANCE_PX;

    for (const line of this.options.designModel.cadLines.getAll()) {
      const layer = this.options.designModel.layers.get(line.layerId);
      const parsed = layer ? parseCadLayerName(layer) : null;
      if (!parsed || !layer?.visible) continue;
      const start = projectPoint(line.start, camera, rect);
      const end = projectPoint(line.end, camera, rect);
      if (!start || !end) continue;
      const distance = distanceToSegment(
        clientX,
        clientY,
        start.x,
        start.y,
        end.x,
        end.y,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestReference = parsed.referenceName;
      }
    }

    for (const point of this.options.designModel.cadPoints.getAll()) {
      const layer = this.options.designModel.layers.get(point.layerId);
      const parsed = layer ? parseCadLayerName(layer) : null;
      if (!parsed || !layer?.visible) continue;
      const projected = projectPoint(point.position, camera, rect);
      if (!projected) continue;
      const distance = Math.hypot(
        projected.x - clientX,
        projected.y - clientY,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestReference = parsed.referenceName;
      }
    }
    return bestReference;
  }

  private getReferenceLayerIds(
    referenceName: string,
  ): Set<string> {
    const ids = new Set<string>();
    for (const layer of this.options.designModel.layers.getAll()) {
      const parsed = parseCadLayerName(layer);
      if (
        parsed?.referenceName === referenceName
        && layer.visible
      ) {
        ids.add(layer.id);
      }
    }
    return ids;
  }

  private hasReference(
    referenceName: string,
  ): boolean {
    return this.options.designModel.layers
      .getAll()
      .some((layer) =>
        parseCadLayerName(layer)?.referenceName
          === referenceName,
      );
  }

  private refreshSelectionVisual(): void {
    const bounds = this.selectedReferenceName
      ? this.computeReferenceBounds(this.selectedReferenceName)
      : null;
    if (!bounds) {
      this.selectionBox.visible = false;
      return;
    }
    this.selectionBox.box.copy(bounds);
    this.selectionBox.visible = true;
  }

  private syncGeometry(): void {
    this.options.cadLineScene.sync();
    this.options.cadPointScene.sync();
    this.options.clearGeometryQueryCache();
  }

  private createBadge(
    container: HTMLElement,
  ): HTMLDivElement {
    const badge = document.createElement("div");
    Object.assign(
      badge.style,
      {
        position: "absolute",
        left: "50%",
        bottom: "48px",
        transform: "translateX(-50%)",
        zIndex: "155",
        display: "none",
        padding: "4px 8px",
        border: "1px solid rgba(111,214,255,0.55)",
        borderRadius: "4px",
        background: "rgba(18,25,30,0.92)",
        color: "#bfeeff",
        pointerEvents: "none",
        font: "12px system-ui, sans-serif",
      },
    );
    container.append(badge);
    return badge;
  }
}

function parseCadLayerName(
  layer: Pick<DesignLayer, "name">,
): {
  readonly referenceName: string;
  readonly sourceLayerName: string;
} | null {
  if (!layer.name.startsWith(CAD_LAYER_PREFIX)) return null;
  const body = layer.name.slice(CAD_LAYER_PREFIX.length);
  const separator = body.indexOf(CAD_LAYER_SEPARATOR);
  if (separator <= 0) return null;
  const referenceName = body.slice(0, separator).trim();
  const sourceLayerName = body
    .slice(separator + CAD_LAYER_SEPARATOR.length)
    .trim();
  if (!referenceName || !sourceLayerName) return null;
  return { referenceName, sourceLayerName };
}

function addPoint(
  point: Point3,
  delta: THREE.Vector3,
): Point3 {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
    z: point.z + delta.z,
  };
}

function rotatePoint(
  point: Point3,
  center: THREE.Vector3,
  quaternion: THREE.Quaternion,
): Point3 {
  const transformed = new THREE.Vector3(
    point.x,
    point.y,
    point.z,
  )
    .sub(center)
    .applyQuaternion(quaternion)
    .add(center);
  return {
    x: transformed.x,
    y: transformed.y,
    z: transformed.z,
  };
}

function projectPoint(
  point: Point3,
  camera: THREE.Camera,
  rect: DOMRect,
): { x: number; y: number } | null {
  const projected = new THREE.Vector3(
    point.x,
    point.y,
    point.z,
  ).project(camera);
  if (
    !Number.isFinite(projected.x)
    || !Number.isFinite(projected.y)
    || !Number.isFinite(projected.z)
    || projected.z < -1
    || projected.z > 1
  ) {
    return null;
  }
  return {
    x: rect.left + (projected.x + 1) * 0.5 * rect.width,
    y: rect.top + (1 - projected.y) * 0.5 * rect.height,
  };
}

function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const abX = bx - ax;
  const abY = by - ay;
  const lengthSq = abX * abX + abY * abY;
  if (lengthSq <= 1e-12) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((px - ax) * abX + (py - ay) * abY) / lengthSq,
    ),
  );
  const x = ax + t * abX;
  const y = ay + t * abY;
  return Math.hypot(px - x, py - y);
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
