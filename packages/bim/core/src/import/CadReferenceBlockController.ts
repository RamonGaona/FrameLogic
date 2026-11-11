import * as THREE from "three";
import type { CadHistoryController } from "../interaction/CadHistoryController";
import type { RotateNumericAxis } from "../interaction/CadNumericInputController";
import { RotateRingDoubleClick } from "../interaction/RotateRingDoubleClick";

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

export interface CadReferenceBlockControllerOptions {
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
  readonly history?: CadHistoryController;
  readonly onRotateAxis?: (axis: RotateNumericAxis) => void;
  readonly onRotateDeactivated?: () => void;
}

/**
 * Controla cada DWG/DXF importado como una referencia CAD única.
 *
 * Las entidades internas continúan bloqueadas/no editables, pero el bloque
 * completo puede seleccionarse, moverse, rotarse en X/Y/Z y eliminarse.
 * Varias referencias pueden seleccionarse con Ctrl y se transforman juntas.
 */
export class CadReferenceBlockController {
  private readonly options: CadReferenceBlockControllerOptions;
  private readonly controls: TransformControls;
  private readonly helper: THREE.Object3D;
  private readonly pivot = new THREE.Object3D();
  private readonly selectionBox = new THREE.Box3Helper(
    new THREE.Box3(),
    0x6fd6ff,
  );
  private readonly badge: HTMLDivElement;
  private readonly selectedReferenceNames = new Set<string>();
  private transformSnapshot: TransformSnapshot | null = null;
  private readonly ringClicks = new RotateRingDoubleClick();
  private ringGesture: { pointerId: number; x: number; y: number;
    axis: RotateNumericAxis | null; dragged: boolean } | null = null;
  private activeMode: "translate" | "rotate" | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownActive = false;
  private interactionEnabled = true;
  private disposed = false;

  constructor(
    options: CadReferenceBlockControllerOptions,
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
    this.pivot.name = "FrameLogicCadReferenceBlockPivot";
    this.selectionBox.name = "FrameLogicCadReferenceBlockSelection";
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
    options.domElement.addEventListener("dblclick", this.handleRingDoubleClick, true);
    window.addEventListener("pointermove", this.handleRingPointerMove, true);
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
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
    this.options.domElement.removeEventListener("dblclick", this.handleRingDoubleClick, true);
    window.removeEventListener("pointermove", this.handleRingPointerMove, true);
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
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

  setInteractionEnabled(enabled: boolean): void {
    this.interactionEnabled = enabled;
    if (!enabled) {
      this.pointerDownActive = false;
      this.deactivateTransform();
    }
  }

  getSelectedReferenceNames(): readonly string[] {
    return Array.from(this.selectedReferenceNames);
  }

  getSelectedBounds(): THREE.Box3 | null {
    const bounds = new THREE.Box3();
    let hasBounds = false;
    for (const referenceName of this.selectedReferenceNames) {
      const current = this.getReferenceBounds(
        referenceName,
        false,
      );
      if (!current) continue;
      if (!hasBounds) {
        bounds.copy(current);
        hasBounds = true;
      }
      else {
        bounds.union(current);
      }
    }
    return hasBounds ? bounds : null;
  }

  getReferenceNames(): readonly string[] {
    const result = new Set<string>();
    for (const layer of this.options.designModel.layers.getAll()) {
      const parsed = parseCadLayerName(layer);
      if (parsed) result.add(parsed.referenceName);
    }
    return Array.from(result);
  }

  getReferenceBounds(
    referenceName: string,
    includeHidden = true,
  ): THREE.Box3 | null {
    const layerIds = this.getReferenceLayerIds(
      referenceName,
      includeHidden,
    );
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

  setSelection(
    referenceNames: readonly string[],
    preserveOtherSelections = false,
  ): void {
    this.deactivateTransform();
    this.selectedReferenceNames.clear();
    for (const referenceName of referenceNames) {
      if (this.hasReference(referenceName)) {
        this.selectedReferenceNames.add(referenceName);
      }
    }
    if (
      this.selectedReferenceNames.size > 0
      && !preserveOtherSelections
    ) {
      this.options.clearOtherSelections?.();
    }
    this.refreshSelectionVisual();
  }

  selectReference(
    referenceName: string | null,
    additive = false,
  ): void {
    if (!referenceName) {
      if (!additive) this.clearSelection();
      return;
    }
    if (!this.hasReference(referenceName)) return;

    this.deactivateTransform();
    if (!additive) {
      this.selectedReferenceNames.clear();
      this.options.clearOtherSelections?.();
      this.selectedReferenceNames.add(referenceName);
    }
    else if (this.selectedReferenceNames.has(referenceName)) {
      this.selectedReferenceNames.delete(referenceName);
    }
    else {
      this.selectedReferenceNames.add(referenceName);
    }
    this.refreshSelectionVisual();
  }

  clearSelection(): void {
    if (this.selectedReferenceNames.size < 1) return;
    this.deactivateTransform();
    this.selectedReferenceNames.clear();
    this.refreshSelectionVisual();
  }

  refresh(): void {
    for (const referenceName of [...this.selectedReferenceNames]) {
      if (!this.hasReference(referenceName)) {
        this.selectedReferenceNames.delete(referenceName);
      }
    }
    this.refreshSelectionVisual();
  }

  activateMove(): boolean {
    return this.activateTransform("translate");
  }

  get isRotateActive(): boolean {
    return this.activeMode === "rotate" && this.selectedReferenceNames.size > 0;
  }

  activateRotate(): boolean {
    return this.activateTransform("rotate");
  }

  /** Rotate all entities in the selected DWG/DXF reference(s), without
   * editing or unlocking the reference's internal geometry individually. */
  applyNumericRotation(axis: RotateNumericAxis, degrees: number): boolean {
    if (!this.isRotateActive || !Number.isFinite(degrees) || degrees === 0) return false;
    const before = this.captureSelection();
    if (!before.lines.length && !before.points.length) return false;
    const vector = axis === "X" ? new THREE.Vector3(1, 0, 0)
      : axis === "Y" ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(0, 0, 1);
    const delta = new THREE.Quaternion().setFromAxisAngle(
      vector, THREE.MathUtils.degToRad(degrees),
    );
    this.rotateSnapshot(before, before.pivotPosition, delta);
    this.recordGeometryHistory(before);
    return true;
  }

  private rotateSnapshot(
    snapshot: TransformSnapshot,
    center: THREE.Vector3,
    delta: THREE.Quaternion,
  ): void {
    for (const line of snapshot.lines) {
      this.options.designModel.cadLines.updateGeometry(
        line.id, rotatePoint(line.start, center, delta), rotatePoint(line.end, center, delta),
      );
    }
    for (const point of snapshot.points) {
      this.options.designModel.cadPoints.updatePosition(
        point.id, rotatePoint(point.position, center, delta),
      );
    }
    this.syncGeometry();
    this.refreshSelectionVisual();
  }

  private applyGeometrySnapshot(snapshot: TransformSnapshot): void {
    for (const line of snapshot.lines) {
      if (this.options.designModel.cadLines.get(line.id)) {
        this.options.designModel.cadLines.updateGeometry(line.id, line.start, line.end);
      }
    }
    for (const point of snapshot.points) {
      if (this.options.designModel.cadPoints.get(point.id)) {
        this.options.designModel.cadPoints.updatePosition(point.id, point.position);
      }
    }
    this.syncGeometry();
    this.refreshSelectionVisual();
  }

  private recordGeometryHistory(before: TransformSnapshot): void {
    if (!this.options.history) return;
    const after = this.captureSelection();
    if (JSON.stringify({ lines: before.lines, points: before.points })
      === JSON.stringify({ lines: after.lines, points: after.points })) return;
    this.options.history.recordOperation(
      "ROTATE DWG/DXF",
      () => this.applyGeometrySnapshot(before),
      () => this.applyGeometrySnapshot(after),
    );
  }

  translateReference(
    referenceName: string,
    delta: THREE.Vector3,
  ): boolean {
    if (delta.lengthSq() <= 1e-18) return true;
    const layerIds = this.getReferenceLayerIds(
      referenceName,
      true,
    );
    if (layerIds.size < 1) return false;

    for (const line of this.options.designModel.cadLines.getAll()) {
      if (!layerIds.has(line.layerId)) continue;
      this.options.designModel.cadLines.updateGeometry(
        line.id,
        addPoint(line.start, delta),
        addPoint(line.end, delta),
      );
    }
    for (const point of this.options.designModel.cadPoints.getAll()) {
      if (!layerIds.has(point.layerId)) continue;
      this.options.designModel.cadPoints.updatePosition(
        point.id,
        addPoint(point.position, delta),
      );
    }
    this.syncGeometry();
    this.refreshSelectionVisual();
    return true;
  }

  /**
   * Aplica un transform rígido P1->P2 + rotación a toda la referencia.
   * Se usa por ALINEAR 4 puntos sin editar sus entidades internas.
   */
  transformReference(
    referenceName: string,
    fromOrigin: THREE.Vector3,
    toOrigin: THREE.Vector3,
    rotation: THREE.Quaternion,
  ): boolean {
    const layerIds = this.getReferenceLayerIds(
      referenceName,
      true,
    );
    if (layerIds.size < 1) return false;

    for (const line of this.options.designModel.cadLines.getAll()) {
      if (!layerIds.has(line.layerId)) continue;
      this.options.designModel.cadLines.updateGeometry(
        line.id,
        rigidTransformPoint(
          line.start,
          fromOrigin,
          toOrigin,
          rotation,
        ),
        rigidTransformPoint(
          line.end,
          fromOrigin,
          toOrigin,
          rotation,
        ),
      );
    }

    for (const point of this.options.designModel.cadPoints.getAll()) {
      if (!layerIds.has(point.layerId)) continue;
      this.options.designModel.cadPoints.updatePosition(
        point.id,
        rigidTransformPoint(
          point.position,
          fromOrigin,
          toOrigin,
          rotation,
        ),
      );
    }

    this.syncGeometry();
    this.refreshSelectionVisual();
    return true;
  }

  deleteSelectedReferences(): boolean {
    const selected = [...this.selectedReferenceNames];
    if (selected.length < 1) return false;

    this.deactivateTransform();
    for (const referenceName of selected) {
      const layerIds = this.getReferenceLayerIds(
        referenceName,
        true,
      );
      for (const line of this.options.designModel.cadLines.getAll()) {
        if (layerIds.has(line.layerId)) {
          this.options.designModel.cadLines.remove(line.id);
        }
      }
      for (const point of this.options.designModel.cadPoints.getAll()) {
        if (layerIds.has(point.layerId)) {
          this.options.designModel.cadPoints.remove(point.id);
        }
      }
      for (const layerId of layerIds) {
        this.options.designModel.layers.remove(layerId);
      }
    }

    this.selectedReferenceNames.clear();
    this.syncGeometry();
    this.refreshSelectionVisual();
    return true;
  }

  private activateTransform(
    mode: "translate" | "rotate",
  ): boolean {
    if (!this.interactionEnabled) return false;
    const bounds = this.getSelectedBounds();
    if (!bounds) return false;

    this.controls.camera = this.options.cameraProvider();
    this.activeMode = mode;
    this.ringGesture = null;
    this.ringClicks.reset();
    this.pivot.position.copy(
      bounds.getCenter(new THREE.Vector3()),
    );
    this.pivot.quaternion.identity();
    this.pivot.updateMatrixWorld(true);

    this.controls.setMode(mode);
    this.controls.showX = true;
    this.controls.showY = true;
    this.controls.showZ = true;
    this.controls.attach(this.pivot);
    this.helper.visible = true;
    if (mode === "rotate") this.options.onRotateAxis?.("Z");
    return true;
  }

  private deactivateTransform(): void {
    const wasRotating = this.activeMode === "rotate";
    this.transformSnapshot = null;
    this.activeMode = null;
    this.ringGesture = null;
    this.ringClicks.reset();
    if (wasRotating) this.options.onRotateDeactivated?.();
    this.controls.detach();
    this.helper.visible = false;
    this.options.setCameraEnabled(true);
  }

  private readonly handleTransformStart = (): void => {
    if (
      !this.interactionEnabled
      || !this.activeMode
      || this.selectedReferenceNames.size < 1
    ) return;
    this.transformSnapshot = this.captureSelection();
    if (this.activeMode === "rotate") {
      const axis = this.controls.axis;
      if (this.ringGesture) {
        this.ringGesture.axis = axis === "X" || axis === "Y" || axis === "Z" ? axis : null;
      }
      if (axis === "X" || axis === "Y" || axis === "Z") this.options.onRotateAxis?.(axis);
    }
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
    if (this.activeMode === "rotate" && this.transformSnapshot) {
      const gesture = this.ringGesture;
      this.ringGesture = null;
      if (gesture?.axis) this.ringClicks.record(
        gesture.axis, gesture.x, gesture.y, Date.now(), gesture.dragged,
      );
      else this.ringClicks.reset();
      this.recordGeometryHistory(this.transformSnapshot);
      // ROTATE uses global X/Y/Z; reset only the temporary gizmo orientation.
      this.pivot.quaternion.identity();
      this.pivot.updateMatrixWorld(true);
    }
    this.transformSnapshot = null;
    this.options.setCameraEnabled(true);
    this.syncGeometry();
    this.refreshSelectionVisual();
  };

  private captureSelection(): TransformSnapshot {
    const layerIds = new Set<string>();
    for (const referenceName of this.selectedReferenceNames) {
      for (
        const layerId
        of this.getReferenceLayerIds(referenceName, true)
      ) {
        layerIds.add(layerId);
      }
    }
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

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (!this.interactionEnabled || event.button !== 0) return;
    if (this.activeMode === "rotate") {
      this.ringGesture = { pointerId: event.pointerId, x: event.clientX,
        y: event.clientY, axis: null, dragged: false };
    }
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerDownActive = true;
  };

  private readonly handlePointerUp = (
    event: PointerEvent,
  ): void => {
    if (
      !this.interactionEnabled
      || event.button !== 0
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
      event.stopImmediatePropagation();
      this.selectReference(
        referenceName,
        event.ctrlKey || event.metaKey,
      );
      return;
    }

    if (
      !this.activeMode
      && !event.ctrlKey
      && !event.metaKey
    ) {
      this.clearSelection();
    }
  };

  private readonly handleRingPointerMove = (event: PointerEvent): void => {
    const gesture = this.ringGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) {
      gesture.dragged = true;
    }
  };

  private readonly handleRingDoubleClick = (event: MouseEvent): void => {
    if (!this.isRotateActive || event.button !== 0) return;
    const axis = this.ringClicks.take(event.clientX, event.clientY, Date.now());
    if (!axis) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.options.onRotateAxis?.(axis);
    this.applyNumericRotation(axis, 90);
  };

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (
      !this.interactionEnabled
      || this.disposed
      || isEditableTarget(event.target)
      || event.ctrlKey
      || event.metaKey
      || event.altKey
    ) {
      return;
    }

    if (event.key === "Delete" && this.selectedReferenceNames.size > 0) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.deleteSelectedReferences();
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
      if (this.selectedReferenceNames.size > 0) {
        event.preventDefault();
        event.stopPropagation();
        this.clearSelection();
      }
      return;
    }

    if (this.selectedReferenceNames.size < 1) return;
    const key = event.key.toLowerCase();
    if (key === "m") {
      if (this.activateMove()) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (key === "r") {
      if (this.activateRotate()) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }
  };

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
    includeHidden: boolean,
  ): Set<string> {
    const ids = new Set<string>();
    for (const layer of this.options.designModel.layers.getAll()) {
      const parsed = parseCadLayerName(layer);
      if (
        parsed?.referenceName === referenceName
        && (includeHidden || layer.visible)
      ) {
        ids.add(layer.id);
      }
    }
    return ids;
  }

  private hasReference(referenceName: string): boolean {
    return this.options.designModel.layers
      .getAll()
      .some((layer) =>
        parseCadLayerName(layer)?.referenceName === referenceName,
      );
  }

  private refreshSelectionVisual(): void {
    const bounds = this.getSelectedBounds();
    if (!bounds) {
      this.selectionBox.visible = false;
      this.badge.style.display = "none";
      return;
    }

    this.selectionBox.box.copy(bounds);
    this.selectionBox.visible = true;
    const names = [...this.selectedReferenceNames];
    this.badge.textContent = names.length === 1
      ? `${names[0]} · referencia CAD`
      : `${names.length} referencias CAD seleccionadas`;
    this.badge.style.display = "block";
  }

  private syncGeometry(): void {
    this.options.cadLineScene.sync();
    this.options.cadPointScene.sync();
    this.options.clearGeometryQueryCache();
  }

  private createBadge(container: HTMLElement): HTMLDivElement {
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

export function parseCadReferenceLayerName(
  layer: Pick<DesignLayer, "name">,
): {
  readonly referenceName: string;
  readonly sourceLayerName: string;
} | null {
  return parseCadLayerName(layer);
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

function rigidTransformPoint(
  point: Point3,
  fromOrigin: THREE.Vector3,
  toOrigin: THREE.Vector3,
  quaternion: THREE.Quaternion,
): Point3 {
  const transformed = new THREE.Vector3(
    point.x,
    point.y,
    point.z,
  )
    .sub(fromOrigin)
    .applyQuaternion(quaternion)
    .add(toOrigin);
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
