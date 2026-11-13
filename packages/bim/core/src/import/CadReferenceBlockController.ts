import * as THREE from "three";
import { getNearbyCadLines } from "../precision/CadScreenSpatialIndex";
import type { CadReferenceTextSceneController } from "../design/CadReferenceTextSceneController";
import { getActiveCadCircleModelController } from "../interaction/CadCircleModelSpaceController";
import type { CadHistoryController } from "../interaction/CadHistoryController";
import type { RotateNumericAxis } from "../interaction/CadNumericInputController";
import { RotateRingDoubleClick } from "../interaction/RotateRingDoubleClick";
import { installTransformPointerLifecycle, completeRotationRings, pickTranslationGizmoAxis, type TranslationGizmoAxis } from "../interaction/TransformGizmoReliability";
import { CadReferencePivotHandle } from "./CadReferencePivotHandle";
import { copyCadReferenceBlocks, type CadReferenceCopyResult } from "./CadReferenceCopyTransaction";

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
  readonly packed: readonly { id: string; transform: readonly number[] }[];
}

export interface CadReferenceBlockControllerOptions {
  readonly container: HTMLElement;
  readonly domElement: HTMLElement;
  readonly scene: THREE.Scene;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly cadLineScene: CadLineSceneController;
  readonly cadPointScene: CadPointSceneController;
  readonly cadTextScene?: CadReferenceTextSceneController;
  readonly setCameraEnabled: (enabled: boolean) => void;
  readonly clearGeometryQueryCache: () => void;
  readonly clearOtherSelections?: () => void;
  readonly history?: CadHistoryController;
  readonly onRotateAxis?: (axis: RotateNumericAxis) => void;
  readonly onRotateDeactivated?: () => void;
  readonly findSnapPoint?: (clientX: number, clientY: number) => THREE.Vector3 | null;
  /** The LINE tool owns clicks on DWG geometry when it is drawing. */
  readonly isPlacementActive?: () => boolean;
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
  private readonly releasePointerLifecycle: () => void;
  private readonly helper: THREE.Object3D;
  private readonly pivot = new THREE.Object3D();
  private readonly selectionBox = new THREE.Box3Helper(
    new THREE.Box3(),
    0x6fd6ff,
  );
  private readonly badge: HTMLDivElement;
  private readonly pivotHandle: CadReferencePivotHandle;
  private readonly ringRaycaster = new THREE.Raycaster();
  private readonly ringPointer = new THREE.Vector2();
  private pendingDoubleClickTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly selectedReferenceNames = new Set<string>();
  // Preserve per-layer visibility while an entire DWG reference is hidden.
  private readonly hiddenReferenceLayerStates = new Map<string, Map<string, boolean>>();
  /** Last inspected member: read-only measurement, never an editable selection. */
  private inspectedLineId: string | null = null;
  private transformSnapshot: TransformSnapshot | null = null;
  private readonly ringClicks = new RotateRingDoubleClick();
  private ringGesture: { pointerId: number; x: number; y: number;
    axis: RotateNumericAxis | null; dragged: boolean; recorded?: boolean } | null = null;
  private activeMode: "translate" | "rotate" | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownActive = false;
  private interactionEnabled = true;
  private transformPointerActive = false;
  private armedPivot = false;
  private armedMoveAxis: "X" | "Y" | "Z" | "XY" | "XZ" | "YZ" | null = null;
  private armedCopyMove = false;
  private ctrlCopyGesture = false;
  private copyDrag = false;
  private moveDragAxis: "X" | "Y" | "Z" | "XY" | "XZ" | "YZ" | null = null;
  private destinationDown = false;
  private moveGizmoPointer: { pointerId: number; x: number; y: number;
    axis: TranslationGizmoAxis; copy: boolean } | null = null;
  private readonly transformStartPivot = new THREE.Vector3();
  private pivotOnlyDrag = false;
  private disposed = false;
  private readonly startRotateTextCommand = (): boolean => this.activateRotate();

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
    this.releasePointerLifecycle = installTransformPointerLifecycle(options.domElement, this.controls);
    this.helper = this.controls.getHelper();
    completeRotationRings(this.helper);
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
    this.pivotHandle = new CadReferencePivotHandle(
      options.domElement, options.cameraProvider, this.pivot,
      options.setCameraEnabled, () => {
        this.armedPivot = true;
        this.armedMoveAxis = null;
        this.destinationDown = false;
        this.badge.textContent = this.activeMode === "rotate"
          ? "ROTATE DWG · Selecciona SNAP para el centro de giro"
          : "MOVE DWG · Selecciona SNAP para el punto base";
      },
    );

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

    (window as Window & { __frameLogicStartRotateReferenceCommand?: () => boolean })
      .__frameLogicStartRotateReferenceCommand = this.startRotateTextCommand;
    window.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    window.addEventListener(
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
    const runtime = window as Window & { __frameLogicStartRotateReferenceCommand?: () => boolean };
    if (runtime.__frameLogicStartRotateReferenceCommand === this.startRotateTextCommand)
      delete runtime.__frameLogicStartRotateReferenceCommand;
    this.deactivateTransform();
    window.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    window.removeEventListener(
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
    this.pivotHandle.dispose();
    this.releasePointerLifecycle();
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

  /** Read-only picking for window selection: a DWG hit is not empty canvas. */
  getReferenceNameAt(clientX: number, clientY: number): string | null {
    return this.getReferenceAt(clientX, clientY)?.referenceName ?? null;
  }

  getInspectedLineId(): string | null {
    if (!this.inspectedLineId || this.activeMode) return null;
    const line = this.options.designModel.cadLines.get(this.inspectedLineId);
    const layer = line ? this.options.designModel.layers.get(line.layerId) : null;
    const reference = layer ? parseCadLayerName(layer) : null;
    return line && layer?.visible && reference
      && this.selectedReferenceNames.has(reference.referenceName)
      ? line.id : null;
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

  /** Visibility for one imported DWG/DXF, independent from the global eye. */
  isReferenceVisible(referenceName: string): boolean {
    return this.options.designModel.layers.getAll().some((layer) =>
      parseCadLayerName(layer)?.referenceName === referenceName && layer.visible,
    );
  }

  /**
   * Toggle a whole reference without detaching its text or geometries.
   * Restores each layer's previous visible state when shown again.
   */
  setReferenceVisible(referenceName: string, visible: boolean): boolean {
    const layers = this.options.designModel.layers.getAll().filter((layer) =>
      parseCadLayerName(layer)?.referenceName === referenceName,
    );
    if (!layers.length) return false;
    if (!visible) {
      if (!this.hiddenReferenceLayerStates.has(referenceName)) {
        this.hiddenReferenceLayerStates.set(referenceName, new Map(
          layers.map((layer) => [layer.id, layer.visible]),
        ));
      }
      if (this.selectedReferenceNames.delete(referenceName)) {
        this.deactivateTransform();
        this.refreshSelectionVisual();
      }
    }
    const previous = this.hiddenReferenceLayerStates.get(referenceName);
    for (const layer of layers) {
      const target = visible ? (previous?.get(layer.id) ?? true) : false;
      if (layer.visible !== target) {
        this.options.designModel.layers.update(layer.id, { visible: target });
      }
    }
    if (visible) this.hiddenReferenceLayerStates.delete(referenceName);
    this.syncGeometry();
    return true;
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
    // Cache local source bounds. Only eight corners need transformation,
    // not 1.4 million vertices for every gizmo move or rotation.
    for (const packet of this.options.designModel.cadLines.getPackedBatches()) {
      if (!layerIds.has(packet.layerId)) continue;
      const bounds = this.options.designModel.cadLines.getPackedBatchBounds(packet.id);
      if (!bounds) continue;
      const local = new THREE.Box3(
        new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
        new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
      );
      if (packet.transform) local.applyMatrix4(new THREE.Matrix4().fromArray(packet.transform));
      box.union(local);
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
    this.inspectedLineId = null;
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
    this.inspectedLineId = null;
    if (referenceName) getActiveCadCircleModelController()?.selectCircle(null);
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
    this.inspectedLineId = null;
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

  /** COPYBASE and Ctrl+MOVE share the same full-reference copy transaction. */
  copyReferencesByBase(
    names: readonly string[], delta: THREE.Vector3,
  ): CadReferenceCopyResult {
    if (!this.options.history) throw new Error("No está disponible el historial COPY CAD.");
    const result = copyCadReferenceBlocks(
      this.options.designModel, this.options.history, names, delta,
      () => this.syncGeometry(),
      this.options.cadTextScene,
    );
    this.refreshSelectionVisual();
    return result;
  }

  get isMoveActive(): boolean {
    return this.activeMode === "translate" && this.selectedReferenceNames.size > 0;
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
    if (!before.lines.length && !before.points.length && !before.packed.length) return false;
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

  private applyPackedDelta(snapshot: TransformSnapshot, delta: THREE.Matrix4): void {
    for (const packet of snapshot.packed) {
      const next = delta.clone().multiply(new THREE.Matrix4().fromArray(packet.transform));
      this.options.designModel.cadLines.setPackedBatchTransform(packet.id, next.elements);
    }
  }

  private rotateSnapshot(
    snapshot: TransformSnapshot,
    center: THREE.Vector3,
    delta: THREE.Quaternion,
  ): void {
    const matrix = new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(delta))
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    this.applyPackedDelta(snapshot, matrix);
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
    for (const packet of snapshot.packed)
      this.options.designModel.cadLines.setPackedBatchTransform(packet.id, packet.transform);
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

  private recordGeometryHistory(before: TransformSnapshot, label = "ROTATE DWG/DXF"): void {
    if (!this.options.history) return;
    const after = this.captureSelection();
    if (JSON.stringify({ lines: before.lines, points: before.points, packed: before.packed })
      === JSON.stringify({ lines: after.lines, points: after.points, packed: after.packed })) return;
    this.options.history.recordOperation(
      label,
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

    const matrix = new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z);
    for (const packet of this.options.designModel.cadLines.getPackedBatches()) {
      if (!layerIds.has(packet.layerId)) continue;
      this.options.designModel.cadLines.setPackedBatchTransform(
        packet.id, matrix.clone().multiply(
          packet.transform ? new THREE.Matrix4().fromArray(packet.transform) : new THREE.Matrix4(),
        ).elements,
      );
    }
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

    const matrix = new THREE.Matrix4().makeTranslation(toOrigin.x, toOrigin.y, toOrigin.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation))
      .multiply(new THREE.Matrix4().makeTranslation(-fromOrigin.x, -fromOrigin.y, -fromOrigin.z));
    for (const packet of this.options.designModel.cadLines.getPackedBatches()) {
      if (!layerIds.has(packet.layerId)) continue;
      this.options.designModel.cadLines.setPackedBatchTransform(
        packet.id, matrix.clone().multiply(
          packet.transform ? new THREE.Matrix4().fromArray(packet.transform) : new THREE.Matrix4(),
        ).elements,
      );
    }
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
      this.options.designModel.cadLines.removePackedByLayerIds(layerIds);
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
      this.options.cadTextScene?.removeByLayerIds(layerIds);
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
    this.transformPointerActive = false;
    this.armedPivot = false;
    this.armedMoveAxis = null;
    this.armedCopyMove = false;
    this.ctrlCopyGesture = false;
    this.copyDrag = false;
    this.moveDragAxis = null;
    this.destinationDown = false;
    this.moveGizmoPointer = null;
    this.pivotOnlyDrag = false;
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
    this.pivotHandle.activate(mode);
    if (mode === "rotate") this.options.onRotateAxis?.("Z");
    return true;
  }

  private deactivateTransform(): void {
    this.pivotHandle.deactivate();
    if (this.pendingDoubleClickTimer !== null) {
      clearTimeout(this.pendingDoubleClickTimer);
      this.pendingDoubleClickTimer = null;
    }
    const wasRotating = this.activeMode === "rotate";
    this.transformSnapshot = null;
    this.activeMode = null;
    this.transformPointerActive = false;
    this.armedPivot = false;
    this.armedMoveAxis = null;
    this.armedCopyMove = false;
    this.ctrlCopyGesture = false;
    this.copyDrag = false;
    this.moveDragAxis = null;
    this.destinationDown = false;
    this.moveGizmoPointer = null;
    this.pivotOnlyDrag = false;
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
    // A transform click belongs to the gizmo, not the underlying DWG. Without
    // this guard pointerup may reselect the block and erase double-click state.
    this.transformPointerActive = true;
    this.transformStartPivot.copy(this.pivot.position);
    this.pivotOnlyDrag = this.activeMode === "translate" && this.controls.axis === "XYZ";
    if (this.activeMode === "translate") {
      const axis = this.controls.axis;
      this.moveDragAxis = axis === "X" || axis === "Y" || axis === "Z"
        || axis === "XY" || axis === "XZ" || axis === "YZ" ? axis : null;
      this.copyDrag = this.ctrlCopyGesture && this.moveDragAxis !== null;
      this.armedPivot = false;
      this.armedMoveAxis = null;
      this.armedCopyMove = false;
    }
    if (this.activeMode === "rotate") {
      const axis = this.controls.axis;
      // Preserve an axis raycast on pointerdown even if native controls.axis
      // momentarily resolves to E/XYZE/null before the drag is initialized.
      if (this.ringGesture && (axis === "X" || axis === "Y" || axis === "Z")) {
        this.ringGesture.axis = axis;
      }
      if (axis === "X" || axis === "Y" || axis === "Z") this.options.onRotateAxis?.(axis);
    }
    this.options.setCameraEnabled(false);
  };

  private readonly handleTransformChange = (): void => {
    const snapshot = this.transformSnapshot;
    if (!snapshot || !this.activeMode) return;

    if (this.activeMode === "translate") {
      // Center XYZ repositions the base point only, never the DWG geometry.
      if (this.pivotOnlyDrag || this.copyDrag) return;
      const delta = this.pivot.position
        .clone()
        .sub(snapshot.pivotPosition);
      this.applyPackedDelta(snapshot, new THREE.Matrix4().makeTranslation(
        delta.x, delta.y, delta.z,
      ));
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
      const center = snapshot.pivotPosition;
      this.applyPackedDelta(snapshot,
        new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)
          .multiply(new THREE.Matrix4().makeRotationFromQuaternion(deltaQuaternion))
          .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z)),
      );
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

  private readonly handleTransformEnd = (): void => { this.transformEndInternal(); };

  private transformEndInternal(): void {
    const start = this.transformSnapshot;
    if (this.activeMode === "translate" && start) {
      // Fall back to the native axis if Three.js skipped mouseDown while
      // pointer events were retargeted, so a short axis click still arms SNAP.
      const currentAxis = this.controls.axis;
      const axis = this.moveDragAxis ?? (
        currentAxis === "X" || currentAxis === "Y" || currentAxis === "Z"
        || currentAxis === "XY" || currentAxis === "XZ" || currentAxis === "YZ"
          ? currentAxis : null
      );
      const delta = this.pivot.position.clone().sub(this.transformStartPivot);
      const shortClick = delta.lengthSq() <= 1e-16;
      if (this.pivotOnlyDrag) {
        if (shortClick) {
          this.armedPivot = true;
          this.armedMoveAxis = null;
          this.armedCopyMove = false;
        }
      } else if (shortClick && axis) {
        // Ctrl+axis arms a repeatable copy-at-SNAP flow; no clone is created
        // until an actual destination is chosen, as in the 3D gizmo.
        this.armedMoveAxis = axis;
        this.armedCopyMove = this.copyDrag;
        this.armedPivot = false;
      } else if (this.copyDrag) {
        try {
          if (delta.lengthSq() > 1e-18) {
            this.copyReferencesByBase([...this.selectedReferenceNames], delta);
          }
        } catch (error) {
          this.badge.textContent = error instanceof Error ? error.message : String(error);
        } finally {
          // Native gizmo changed its pivot during drag, but original CAD
          // references were never touched. Keep selection and pivot on source.
          this.pivot.position.copy(this.transformStartPivot);
          this.pivot.updateMatrixWorld(true);
        }
        this.armedMoveAxis = null;
        this.armedCopyMove = false;
        this.armedPivot = false;
      } else {
        this.recordGeometryHistory(start, "MOVE DWG/DXF");
        this.armedMoveAxis = null;
        this.armedCopyMove = false;
        this.armedPivot = false;
      }
      this.pivotOnlyDrag = false;
      this.copyDrag = false;
      this.moveDragAxis = null;
      this.ctrlCopyGesture = false;
    }
    if (this.activeMode === "rotate" && this.transformSnapshot) {
      // A pointerup may precede the native TransformControls mouseUp.
      // Commit a ring click once, from either order, independently of dblclick.
      this.recordRingClick();
      const gesture = this.ringGesture;
      if (gesture?.axis && !gesture.dragged) {
        // A short ring click must not apply an accidental fractional drag.
        this.applyGeometrySnapshot(this.transformSnapshot);
      } else {
        this.recordGeometryHistory(this.transformSnapshot, "ROTATE DWG/DXF");
      }
      this.ringGesture = null;
      // ROTATE uses global X/Y/Z; reset only the temporary gizmo orientation.
      this.pivot.quaternion.identity();
      this.pivot.updateMatrixWorld(true);
    }
    this.transformSnapshot = null;
    this.options.setCameraEnabled(true);
    this.syncGeometry();
    this.refreshSelectionVisual();
    if (this.armedPivot) {
      this.badge.textContent = "DWG · Selecciona SNAP para el punto base";
    } else if (this.armedMoveAxis) {
      this.badge.textContent = this.armedCopyMove
        ? `COPY DWG · Ctrl + eje ${this.armedMoveAxis} · SNAP de destino (repetible; Esc termina)`
        : `MOVE DWG · Eje ${this.armedMoveAxis}: selecciona SNAP de destino`;
    }
  }

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
      packed: this.options.designModel.cadLines.getPackedBatches()
        .filter((packet) => layerIds.has(packet.layerId))
        .map((packet) => ({
          id: packet.id, transform: packet.transform
            ? [...packet.transform] : new THREE.Matrix4().toArray(),
        })),
    };
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    this.pointerDownInternal(event);
  };

  private pointerDownInternal(event: PointerEvent): void {
    if (!this.interactionEnabled || event.button !== 0) return;
    if (!this.activeMode && getActiveCadCircleModelController()
      ?.getCircleIdAt(event.clientX, event.clientY)) {
      this.pointerDownActive = false;
      return;
    }
    if (!this.activeMode && this.options.isPlacementActive?.()) {
      this.pointerDownActive = false;
      return;
    }
    const target = event.target;
    if (target && target !== this.options.domElement
      && !(target instanceof Node && this.options.domElement.contains(target))) return;
    if (this.activeMode === "rotate") {
      this.ringGesture = { pointerId: event.pointerId, x: event.clientX,
        y: event.clientY, axis: this.pickRotateRingAxis(event.clientX, event.clientY),
        dragged: false };
    }
    if (this.activeMode === "translate") {
      this.ctrlCopyGesture = event.ctrlKey;
      // Record the actual native picker hit before any mouseDown/mouseUp
      // ordering differences. A short click can arm SNAP even if Three.js
      // never dispatches its transform-start event in this browser.
      this.moveGizmoPointer = !this.armedPivot && !this.armedMoveAxis
        ? (() => {
          const axis = this.pickMoveAxis(event.clientX, event.clientY);
          return axis ? { pointerId: event.pointerId, x: event.clientX,
            y: event.clientY, axis, copy: event.ctrlKey } : null;
        })()
        : null;
    }
    if (this.armedPivot || (this.activeMode === "translate" && this.armedMoveAxis)) {
      // A prior gizmo click can still have a stale transform pointer flag
      // in some browsers. A destination click must be handled first.
      this.transformPointerActive = false;
      this.destinationDown = true;
      this.pointerDownX = event.clientX;
      this.pointerDownY = event.clientY;
      this.pointerDownActive = true;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerDownActive = true;
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.pointerUpInternal(event);
  };

  private pointerUpInternal(event: PointerEvent): void {
    if (!this.activeMode && getActiveCadCircleModelController()
      ?.getCircleIdAt(event.clientX, event.clientY)) {
      this.pointerDownActive = false;
      return;
    }
    if (!this.activeMode && this.options.isPlacementActive?.()) {
      this.pointerDownActive = false;
      return;
    }
    // Pointer releases on the independent HTML pivot marker are never canvas
    // selection clicks; its own handler finalizes them.
    const target = event.target;
    if (target && target !== this.options.domElement
      && !(target instanceof Node && this.options.domElement.contains(target))) {
      this.pointerDownActive = false;
      return;
    }
    if (!this.interactionEnabled || event.button !== 0 || !this.pointerDownActive) {
      this.pointerDownActive = false;
      return;
    }
    this.pointerDownActive = false;

    // Window capture precedes both native canvas pointerup and geometry
    // selectors. Finish the native transform here, then consume ONLY the
    // pointer that started on an actual MOVE picker. This prevents the CAD
    // window selector from starting a selection behind the gizmo.
    const moveClick = this.moveGizmoPointer;
    if (moveClick?.pointerId === event.pointerId && this.activeMode === "translate") {
      this.moveGizmoPointer = null;
      const shortClick = Math.hypot(
        event.clientX - moveClick.x, event.clientY - moveClick.y,
      ) <= 5;
      if (shortClick && this.transformSnapshot) {
        // A tiny pointer wobble (< 5px) is a click, not a real transform.
        // Roll it back before native mouseUp records history.
        if (!this.copyDrag && !this.pivotOnlyDrag) {
          this.applyGeometrySnapshot(this.transformSnapshot);
        }
        this.pivot.position.copy(this.transformStartPivot);
        this.pivot.updateMatrixWorld(true);
      }
      if (this.controls.dragging) this.controls.pointerUp(null);
      if (shortClick) {
        // Fallback when a native mouseDown/mouseUp was lost or retargeted.
        if (!this.armedMoveAxis) {
          this.armedMoveAxis = moveClick.axis;
          this.armedCopyMove = moveClick.copy;
          this.armedPivot = false;
        }
        this.badge.textContent = this.armedCopyMove
          ? `COPY DWG · Ctrl + eje ${this.armedMoveAxis} · SNAP de destino (Esc termina)`
          : `MOVE DWG · Eje ${this.armedMoveAxis} seleccionado · Indica punto SNAP de destino`;
      }
      this.transformPointerActive = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (this.activeMode === "rotate" && this.ringGesture?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - this.ringGesture.x, event.clientY - this.ringGesture.y) > 5) {
        this.ringGesture.dragged = true;
      }
      if (!this.ringGesture.axis && this.controls.dragging) {
        const axis = this.controls.axis;
        if (axis === "X" || axis === "Y" || axis === "Z") this.ringGesture.axis = axis;
      }
      this.recordRingClick();
    }

    // Native mouseUp may happen before or after pointerup, depending on browser.
    // Neither ordering should turn a gizmo click into a new reference selection.
    if ((this.transformPointerActive || this.controls.dragging) && !this.destinationDown) {
      this.transformPointerActive = false;
      return;
    }

    if (this.destinationDown
      && (this.armedPivot || (this.activeMode === "translate" && this.armedMoveAxis))) {
      this.destinationDown = false;
      if (Math.hypot(event.clientX - this.pointerDownX, event.clientY - this.pointerDownY) > 5) return;
      // Even without a valid SNAP, this click belongs to MOVE/PIVOT and
      // must not fall through to model-space selection or camera handlers.
      event.preventDefault();
      event.stopImmediatePropagation();
      const snap = this.options.findSnapPoint?.(event.clientX, event.clientY);
      if (!snap || ![snap.x, snap.y, snap.z].every(Number.isFinite)) return;
      if (this.armedPivot) {
        this.pivot.position.copy(snap); // Pivot only: no model modification.
      } else if (this.armedMoveAxis) {
        const delta = snap.clone().sub(this.pivot.position);
        this.constrainMoveCorrection(delta, this.armedMoveAxis);
        if (delta.lengthSq() <= 1e-18) return; // Preserve axis for another target.
        if (this.armedCopyMove) {
          try {
            const result = this.copyReferencesByBase([...this.selectedReferenceNames], delta);
            this.badge.textContent = `COPY DWG · ${result.referenceNames.join(", ")} · otro SNAP o Esc`;
          } catch (error) {
            this.badge.textContent = `COPY DWG · ${error instanceof Error ? error.message : String(error)}`;
            return;
          }
          // Each repeated copy has the same source and base point. Do not
          // move the reference, pivot or selected names.
          this.pivot.updateMatrixWorld(true);
          return;
        }
        const before = this.captureSelection();
        this.applyPackedDelta(before, new THREE.Matrix4().makeTranslation(
          delta.x, delta.y, delta.z,
        ));
        for (const line of before.lines) {
          this.options.designModel.cadLines.updateGeometry(
            line.id, addPoint(line.start, delta), addPoint(line.end, delta),
          );
        }
        for (const point of before.points) {
          this.options.designModel.cadPoints.updatePosition(
            point.id, addPoint(point.position, delta),
          );
        }
        this.pivot.position.add(delta);
        this.recordGeometryHistory(before, "MOVE DWG/DXF");
        this.syncGeometry();
      }
      this.pivot.updateMatrixWorld(true);
      this.armedPivot = false;
      this.armedMoveAxis = null;
      this.armedCopyMove = false;
      this.refreshSelectionVisual();
      return;
    }
    if (
      Math.hypot(
        event.clientX - this.pointerDownX,
        event.clientY - this.pointerDownY,
      ) > 5
    ) {
      return;
    }

    // While a CAD reference gizmo is active, canvas clicks belong to that
    // tool. Never reselect even if native TransformControls misses a ring.
    // Retain the same block and its two-click gesture state.
    if (this.activeMode) return;

    const hit = this.getReferenceAt(
      event.clientX,
      event.clientY,
    );
    if (hit) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      this.selectReference(
        hit.referenceName,
        event.ctrlKey || event.metaKey,
      );
      // Selecting a member of a locked DWG reference only creates an
      // informational dimension. Its geometry remains owned by the block.
      if (this.selectedReferenceNames.has(hit.referenceName)) {
        this.inspectedLineId = hit.lineId;
      }
      return;
    }

    if (
      !this.activeMode
      && !event.ctrlKey
      && !event.metaKey
    ) {
      this.clearSelection();
    }
  }

  /** Native dblclick is not guaranteed on a WebGL canvas. Both pointerup
   * and mouseUp feed the same tracker; the second confirmed ring click is enough. */
  private recordRingClick(): void {
    const gesture = this.ringGesture;
    if (!gesture || gesture.recorded || this.activeMode !== "rotate") return;
    gesture.recorded = true;
    if (!gesture.axis || gesture.dragged) {
      this.ringClicks.reset();
      return;
    }
    this.ringClicks.record(gesture.axis, gesture.x, gesture.y, Date.now(), false);
    if (!this.ringClicks.pendingAxis || this.pendingDoubleClickTimer !== null) return;
    const x = gesture.x, y = gesture.y;
    // macrotask: let Three.js process pointerup/mouseUp and reset its quaternion
    // before changing the DWG exactly once.
    this.pendingDoubleClickTimer = setTimeout(() => {
      this.pendingDoubleClickTimer = null;
      if (!this.isRotateActive) return;
      const axis = this.ringClicks.take(x, y, Date.now());
      if (axis) {
        this.options.onRotateAxis?.(axis);
        this.applyNumericRotation(axis, 90);
      }
    }, 0);
  }

  private pickRotateRingAxis(x: number, y: number): RotateNumericAxis | null {
    const rect = this.options.domElement.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    this.helper.updateMatrixWorld(true);
    this.ringPointer.set((x - rect.left) / rect.width * 2 - 1,
      -(y - rect.top) / rect.height * 2 + 1);
    this.ringRaycaster.setFromCamera(this.ringPointer, this.options.cameraProvider());
    let picker: THREE.Object3D | null = null;
    this.helper.traverse(child => {
      const gizmo = child as THREE.Object3D & { picker?: { rotate?: THREE.Object3D } };
      if (child.type === "TransformControlsGizmo" && gizmo.picker?.rotate) {
        picker = gizmo.picker.rotate;
      }
    });
    if (picker) {
      const matches = this.ringRaycaster.intersectObjects((picker as THREE.Object3D).children, true);
      for (const match of matches) {
        let node: THREE.Object3D | null = match.object;
        while (node && node !== picker) {
          if (node.name === "X" || node.name === "Y" || node.name === "Z") return node.name;
          node = node.parent;
        }
      }
    }
    // Native controls knows the active handle only during an owned drag.
    // A stale hover axis alone must not trigger a rotation on empty canvas.
    const axis = this.controls.axis;
    return this.controls.dragging
      && (axis === "X" || axis === "Y" || axis === "Z") ? axis : null;
  }

  private pickMoveAxis(clientX: number, clientY: number): TranslationGizmoAxis | null {
    return pickTranslationGizmoAxis(
      this.helper, this.options.cameraProvider(), this.options.domElement,
      clientX, clientY,
    );
  }

  private constrainMoveCorrection(
    correction: THREE.Vector3, axis: "X" | "Y" | "Z" | "XY" | "XZ" | "YZ",
  ): void {
    if (axis === "X") { correction.y = 0; correction.z = 0; }
    else if (axis === "Y") { correction.x = 0; correction.z = 0; }
    else if (axis === "Z") { correction.x = 0; correction.y = 0; }
    else if (axis === "XY") correction.z = 0;
    else if (axis === "XZ") correction.y = 0;
    else if (axis === "YZ") correction.x = 0;
  }

  private readonly handleRingPointerMove = (event: PointerEvent): void => {
    const gesture = this.ringGesture;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) {
      gesture.dragged = true;
    }
  };

  private readonly handleRingDoubleClick = (event: MouseEvent): void => {
    this.ringDoubleClickInternal(event);
  };

  private ringDoubleClickInternal(event: MouseEvent): void {
    if (!this.isRotateActive || event.button !== 0) return;
    const axis = this.ringClicks.take(event.clientX, event.clientY, Date.now());
    if (!axis) return;
    if (this.pendingDoubleClickTimer !== null) {
      clearTimeout(this.pendingDoubleClickTimer);
      this.pendingDoubleClickTimer = null;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.options.onRotateAxis?.(axis);
    this.applyNumericRotation(axis, 90);
  }

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
      if (this.isMoveActive && this.armedCopyMove && this.armedMoveAxis) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        this.armedCopyMove = false;
        this.armedMoveAxis = null;
        this.destinationDown = false;
        this.armedPivot = false;
        this.refreshSelectionVisual();
        return;
      }
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
  ): { referenceName: string; lineId: string | null } | null {
    const rect = this.options.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const camera = this.options.cameraProvider();
    let bestReference: string | null = null;
    let bestLineId: string | null = null;
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
        bestLineId = line.id;
      }
    }

    // SNAP candidates on a compact Cota underlay are virtual, not stored as
    // separate editable CadLine records. Use them to pick the reference.
    for (const line of getNearbyCadLines(
      this.options.designModel, camera, rect, clientX, clientY, PICK_TOLERANCE_PX, 20,
    )) {
      if (!line.id.startsWith("cota:")) continue;
      const layer = this.options.designModel.layers.get(line.layerId);
      const parsed = layer ? parseCadLayerName(layer) : null;
      if (!parsed || !layer?.visible) continue;
      const start = projectPoint(line.start, camera, rect);
      const end = projectPoint(line.end, camera, rect);
      if (!start || !end) continue;
      const distance = distanceToSegment(clientX, clientY, start.x, start.y, end.x, end.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestReference = parsed.referenceName;
        bestLineId = null;
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
        bestLineId = null;
      }
    }
    return bestReference ? { referenceName: bestReference, lineId: bestLineId } : null;
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
    this.options.cadTextScene?.sync();
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
