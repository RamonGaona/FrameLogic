import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { DesignModel } from "@framelogic/domain";
import type { CadLineSceneController } from "../design/CadLineSceneController";
import type { CadPointSceneController } from "../design/CadPointSceneController";
import type { CadLineSelectionController } from "./CadLineSelectionController";
import type { CadPointSelectionController } from "./CadPointSelectionController";
import type { DesignSelectionController } from "./DesignSelectionController";
import type { CadHistoryController } from "./CadHistoryController";
import type { RotateNumericAxis } from "./CadNumericInputController";
import { RotateRingDoubleClick } from "./RotateRingDoubleClick";
import { completeRotationRings, installTransformPointerLifecycle } from "./TransformGizmoReliability";

type Position = { readonly x: number; readonly y: number; readonly z: number };
interface LineState { readonly id: string; readonly start: Position; readonly end: Position }
interface PointState { readonly id: string; readonly position: Position }
interface CadRotateSnapshot {
  readonly lines: readonly LineState[];
  readonly points: readonly PointState[];
}
interface RingGesture {
  readonly pointerId: number; readonly x: number; readonly y: number;
  axis: RotateNumericAxis | null; dragged: boolean;
}
export interface CadEntityRotateOptions {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly canvas: HTMLElement;
  readonly model: DesignModel;
  readonly lineScene: CadLineSceneController;
  readonly pointScene: CadPointSceneController;
  readonly lineSelection: CadLineSelectionController;
  readonly pointSelection: CadPointSelectionController;
  readonly designSelection: DesignSelectionController;
  readonly history: CadHistoryController;
  readonly setCameraEnabled: (enabled: boolean) => void;
  readonly onAxis: (axis: RotateNumericAxis) => void;
  readonly onDeactivate: () => void;
  readonly clearGeometryQueryCache?: () => void;
}

const mapAxis = (axis: RotateNumericAxis): THREE.Vector3 =>
  axis === "X" ? new THREE.Vector3(1, 0, 0)
    : axis === "Y" ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(0, 0, 1);
function rotatePosition(pos: Position, pivot: THREE.Vector3, delta: THREE.Quaternion): Position {
  const result = new THREE.Vector3(pos.x, pos.y, pos.z)
    .sub(pivot).applyQuaternion(delta).add(pivot);
  return { x: result.x, y: result.y, z: result.z };
}
function changed(before: CadRotateSnapshot, after: CadRotateSnapshot): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

/**
 * ROTATE for native CAD entities (lines/points). DWG reference blocks are
 * rotated separately by CadReferenceBlockController to retain block identity.
 * Geometry is transformed around a common center in world coordinates.
 */
export class CadEntityRotateController {
  private readonly options: CadEntityRotateOptions;
  private readonly controls: TransformControls;
  private readonly helper: THREE.Object3D;
  private readonly pivot = new THREE.Object3D();
  private readonly releasePointerLifecycle: () => void;
  private readonly ringClicks = new RotateRingDoubleClick();
  private ringGesture: RingGesture | null = null;
  private dragStart: CadRotateSnapshot | null = null;
  private startQuaternion = new THREE.Quaternion();
  private active = false;
  private disposed = false;

  constructor(options: CadEntityRotateOptions) {
    this.options = options;
    this.controls = new TransformControls(options.camera, options.canvas);
    this.controls.setMode("rotate");
    this.controls.setSpace("world");
    this.controls.size = 0.95;
    this.helper = this.controls.getHelper();
    completeRotationRings(this.helper);
    this.helper.visible = false;
    options.scene.add(this.helper, this.pivot);
    this.releasePointerLifecycle =
      installTransformPointerLifecycle(options.canvas, this.controls);
    this.controls.addEventListener("mouseDown", this.handleStart);
    this.controls.addEventListener("objectChange", this.handleChange);
    this.controls.addEventListener("mouseUp", this.handleEnd);
    options.canvas.addEventListener("pointerdown", this.handlePointerDown, true);
    options.canvas.addEventListener("dblclick", this.handleDoubleClick, true);
    window.addEventListener("pointermove", this.handlePointerMove, true);
    this.controls.detach();
  }

  get isActive(): boolean { return this.active; }

  setCamera(camera: THREE.Camera): void {
    this.controls.camera = camera;
  }

  activate(): boolean {
    if (this.disposed) return false;
    const selected = this.capture();
    if (!selected.lines.length && !selected.points.length) return false;
    const bounds = new THREE.Box3();
    for (const line of selected.lines) {
      bounds.expandByPoint(new THREE.Vector3(line.start.x, line.start.y, line.start.z));
      bounds.expandByPoint(new THREE.Vector3(line.end.x, line.end.y, line.end.z));
    }
    for (const point of selected.points) {
      bounds.expandByPoint(new THREE.Vector3(point.position.x, point.position.y, point.position.z));
    }
    if (bounds.isEmpty()) return false;
    this.active = true;
    this.dragStart = null;
    this.ringGesture = null;
    this.ringClicks.reset();
    this.pivot.position.copy(bounds.getCenter(new THREE.Vector3()));
    this.pivot.quaternion.identity();
    this.pivot.updateMatrixWorld(true);
    this.controls.attach(this.pivot);
    this.helper.visible = true;
    this.options.lineSelection.setEnabled(false);
    this.options.pointSelection.setEnabled(false);
    this.options.designSelection.setEnabled(false);
    this.options.onAxis("Z");
    return true;
  }

  deactivate(): void {
    if (this.controls.dragging) {
      this.controls.reset();
      this.controls.pointerUp(null);
    }
    this.active = false;
    this.dragStart = null;
    this.ringGesture = null;
    this.ringClicks.reset();
    this.controls.detach();
    this.helper.visible = false;
    this.options.setCameraEnabled(true);
    this.options.lineSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.designSelection.setEnabled(true);
    this.options.onDeactivate();
  }

  applyNumericRotation(axis: RotateNumericAxis, degrees: number): boolean {
    if (!this.active || !Number.isFinite(degrees) || degrees === 0) return false;
    const before = this.capture();
    if (!before.lines.length && !before.points.length) return false;
    const delta = new THREE.Quaternion().setFromAxisAngle(
      mapAxis(axis), THREE.MathUtils.degToRad(degrees),
    );
    this.applyDelta(before, this.pivot.position, delta);
    this.recordHistory(before, this.capture());
    return true;
  }

  private capture(): CadRotateSnapshot {
    const lines = this.options.lineSelection.getSelectedIds()
      .map(id => this.options.model.cadLines.get(id))
      .filter((line): line is NonNullable<typeof line> => Boolean(line))
      .map(line => ({ id: line.id, start: { ...line.start }, end: { ...line.end } }));
    const points = this.options.pointSelection.getSelectedIds()
      .map(id => this.options.model.cadPoints.get(id))
      .filter((point): point is NonNullable<typeof point> => Boolean(point))
      .map(point => ({ id: point.id, position: { ...point.position } }));
    return { lines, points };
  }

  private applySnapshot(snapshot: CadRotateSnapshot): void {
    for (const line of snapshot.lines) {
      if (this.options.model.cadLines.get(line.id)) {
        this.options.model.cadLines.updateGeometry(line.id, line.start, line.end);
      }
    }
    for (const point of snapshot.points) {
      if (this.options.model.cadPoints.get(point.id)) {
        this.options.model.cadPoints.updatePosition(point.id, point.position);
      }
    }
    this.sync();
  }

  private applyDelta(before: CadRotateSnapshot, center: THREE.Vector3, delta: THREE.Quaternion): void {
    for (const line of before.lines) {
      this.options.model.cadLines.updateGeometry(
        line.id, rotatePosition(line.start, center, delta),
        rotatePosition(line.end, center, delta),
      );
    }
    for (const point of before.points) {
      this.options.model.cadPoints.updatePosition(
        point.id, rotatePosition(point.position, center, delta),
      );
    }
    this.sync();
  }

  private sync(): void {
    this.options.lineScene.sync();
    this.options.pointScene.sync();
    this.options.clearGeometryQueryCache?.();
  }

  private recordHistory(before: CadRotateSnapshot, after: CadRotateSnapshot): void {
    if (!changed(before, after)) return;
    this.options.history.recordOperation(
      "ROTATE CAD",
      () => this.applySnapshot(before),
      () => this.applySnapshot(after),
    );
  }

  private readonly handleStart = (): void => {
    if (!this.active) return;
    const axis = this.controls.axis;
    if (this.ringGesture) {
      this.ringGesture.axis = axis === "X" || axis === "Y" || axis === "Z" ? axis : null;
    }
    if (axis === "X" || axis === "Y" || axis === "Z") this.options.onAxis(axis);
    this.dragStart = this.capture();
    this.startQuaternion.copy(this.pivot.quaternion);
    this.options.setCameraEnabled(false);
  };
  private readonly handleChange = (): void => {
    if (!this.active || !this.dragStart) return;
    const delta = this.pivot.quaternion.clone().multiply(this.startQuaternion.clone().invert());
    this.applyDelta(this.dragStart, this.pivot.position, delta);
  };
  private readonly handleEnd = (): void => {
    if (!this.active) return;
    const gesture = this.ringGesture;
    this.ringGesture = null;
    if (gesture?.axis) {
      this.ringClicks.record(gesture.axis, gesture.x, gesture.y, Date.now(), gesture.dragged);
    } else this.ringClicks.reset();
    if (this.dragStart) this.recordHistory(this.dragStart, this.capture());
    this.dragStart = null;
    this.pivot.quaternion.identity();
    this.pivot.updateMatrixWorld(true);
    this.options.setCameraEnabled(true);
  };
  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.active || event.button !== 0) return;
    this.ringGesture = { pointerId: event.pointerId, x: event.clientX,
      y: event.clientY, axis: null, dragged: false };
  };
  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.ringGesture || this.ringGesture.pointerId !== event.pointerId) return;
    if (Math.hypot(this.ringGesture.x - event.clientX,
      this.ringGesture.y - event.clientY) > 5) this.ringGesture.dragged = true;
  };
  private readonly handleDoubleClick = (event: MouseEvent): void => {
    if (!this.active || event.button !== 0) return;
    const axis = this.ringClicks.take(event.clientX, event.clientY, Date.now());
    if (!axis) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.options.onAxis(axis);
    this.applyNumericRotation(axis, 90);
  };

  dispose(): void {
    if (this.disposed) return;
    this.deactivate();
    this.disposed = true;
    this.controls.removeEventListener("mouseDown", this.handleStart);
    this.controls.removeEventListener("objectChange", this.handleChange);
    this.controls.removeEventListener("mouseUp", this.handleEnd);
    this.options.canvas.removeEventListener("pointerdown", this.handlePointerDown, true);
    this.options.canvas.removeEventListener("dblclick", this.handleDoubleClick, true);
    window.removeEventListener("pointermove", this.handlePointerMove, true);
    this.controls.dispose();
    this.releasePointerLifecycle();
    this.options.scene.remove(this.helper, this.pivot);
  }
}
