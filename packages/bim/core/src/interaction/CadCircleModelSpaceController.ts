import * as THREE from "three";
import type { DesignModel } from "@framelogic/domain";
import type { CadHistoryController } from "./CadHistoryController";
import type { DesignSnapResult } from "./DesignSnapController";
import type { CadCircle, CadCircleSceneController } from "../design/CadCircleSceneController";
import type { CadWorkPlaneController } from "./CadWorkPlaneController";

type Cardinal = "E" | "N" | "W" | "S";
const CARDINALS: readonly Cardinal[] = ["E", "N", "W", "S"];
const TOLERANCE_PX = 12;

interface Options {
  readonly domElement: HTMLElement;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly circles: CadCircleSceneController;
  readonly workPlane: CadWorkPlaneController;
  readonly history: CadHistoryController;
  readonly isToolBusy: () => boolean;
  readonly findSnapPoint: (x: number, y: number) => THREE.Vector3 | null;
  readonly clearGeometryQueryCache: () => void;
}

let activeController: CadCircleModelSpaceController | null = null;

export function getActiveCadCircleModelController(): CadCircleModelSpaceController | null {
  return activeController;
}

function vector(point: { readonly x: number; readonly y: number; readonly z: number }): THREE.Vector3 {
  return new THREE.Vector3(point.x, point.y, point.z);
}

export function circleCardinals(circle: CadCircle): Readonly<Record<Cardinal, THREE.Vector3>> {
  const center = vector(circle.center);
  const x = vector(circle.xAxis).normalize().multiplyScalar(circle.radius);
  const y = vector(circle.yAxis).normalize().multiplyScalar(circle.radius);
  return {
    E: center.clone().add(x),
    N: center.clone().add(y),
    W: center.clone().sub(x),
    S: center.clone().sub(y),
  };
}

function project(point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect): THREE.Vector2 | null {
  const p = point.clone().project(camera);
  if (![p.x, p.y, p.z].every(Number.isFinite) || p.z < -1 || p.z > 1) return null;
  return new THREE.Vector2(
    rect.left + (p.x + 1) * 0.5 * rect.width,
    rect.top + (1 - p.y) * 0.5 * rect.height,
  );
}

function distanceToSegment(x: number, y: number, a: THREE.Vector2, b: THREE.Vector2): number {
  const delta = b.clone().sub(a);
  const lenSq = delta.lengthSq();
  const t = lenSq > 1e-12
    ? THREE.MathUtils.clamp((new THREE.Vector2(x, y).sub(a)).dot(delta) / lenSq, 0, 1) : 0;
  return new THREE.Vector2(x, y).distanceTo(a.clone().addScaledVector(delta, t));
}

/**
 * Model Space selection and editing for CAD circles. Keeps native circle
 * geometry independent (no tessellated CadLine segments), adds CENTER and
 * cardinal SNAPs, read-only live dimensions, and four draggable radius grips.
 */
export class CadCircleModelSpaceController {
  private readonly options: Options;
  private selectedCircleId: string | null = null;
  private readonly grips: HTMLDivElement[] = [];
  private readonly label: HTMLDivElement;
  private drag: { id: string; pointerId: number; before: number } | null = null;
  private raf: number | null = null;
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.label = document.createElement("div");
    this.label.dataset["framelogicCircleDimension"] = "true";
    Object.assign(this.label.style, {
      position: "fixed", zIndex: "2147482402", display: "none",
      pointerEvents: "none", padding: "4px 7px",
      font: "12px ui-monospace, monospace", color: "#a6edff",
      background: "rgba(9,20,27,0.92)", border: "1px solid #6bd9f1",
      borderRadius: "4px", whiteSpace: "nowrap",
    });
    document.body.append(this.label);
    CARDINALS.forEach((cardinal) => {
      const grip = document.createElement("div");
      grip.dataset["framelogicCircleGrip"] = cardinal;
      grip.title = `Círculo · ajustar radio desde ${cardinal}`;
      Object.assign(grip.style, {
        position: "fixed", zIndex: "2147482403", display: "none",
        width: "12px", height: "12px", border: "1px solid #a6edff",
        borderRadius: "3px", background: "#38bdf8",
        cursor: "crosshair", transform: "translate(-50%, -50%)",
        touchAction: "none",
      });
      grip.addEventListener("pointerdown", (event) => {
        const circle = this.getSelectedCircle();
        if (!circle || this.options.designModel.layers.get(circle.layerId)?.locked) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.drag = { id: circle.id, pointerId: event.pointerId, before: circle.radius };
      });
      document.body.append(grip);
      this.grips.push(grip);
    });
    window.addEventListener("pointerup", this.handlePointerUp, true);
    window.addEventListener("pointermove", this.handlePointerMove, true);
    window.addEventListener("keydown", this.handleKeyDown, true);
    activeController = this;
    this.scheduleSync();
  }

  getSelectedCircle(): CadCircle | null {
    const circle = this.selectedCircleId ? this.options.circles.get(this.selectedCircleId) : undefined;
    if (!circle || this.options.designModel.layers.get(circle.layerId)?.visible === false) return null;
    return circle;
  }

  selectCircle(id: string | null): void {
    this.selectedCircleId = id && this.options.circles.get(id) ? id : null;
    this.syncUI();
  }

  private isCircleInActiveSnapPlane(point: THREE.Vector3, radius: number): boolean {
    const state = this.options.workPlane.getState();
    if (!state.enabled) return true;
    const distance = Math.abs(point.clone().sub(state.origin).dot(state.normal));
    return distance <= Math.max(1e-5, radius * 1e-9);
  }

  /** All circles remain selectable as true CAD entities, with five SNAPs. */
  findSnap(clientX: number, clientY: number): DesignSnapResult | null {
    const rect = this.options.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const camera = this.options.cameraProvider();
    camera.updateMatrixWorld(true);
    let best: DesignSnapResult | null = null;
    let bestPixels = TOLERANCE_PX;
    for (const circle of this.options.circles.getAll()) {
      const layer = this.options.designModel.layers.get(circle.layerId);
      if (!layer || !layer.visible || !layer.snapEnabled) continue;
      const candidates: Array<[string, THREE.Vector3]> = [
        ["CENTER", vector(circle.center)],
        ...CARDINALS.map((c): [string, THREE.Vector3] => [c, circleCardinals(circle)[c]]),
      ];
      for (const [name, point] of candidates) {
        if (!this.isCircleInActiveSnapPlane(point, circle.radius)) continue;
        const screen = project(point, camera, rect);
        if (!screen) continue;
        const pixels = screen.distanceTo(new THREE.Vector2(clientX, clientY));
        if (pixels >= bestPixels) continue;
        bestPixels = pixels;
        best = {
          type: name === "CENTER" ? "CENTER" : "REFERENCE",
          point, instanceId: circle.id,
        };
      }
    }
    return best;
  }

  /** Pixel-accurate arc hit-test, including circles on inclined planes. */
  getCircleIdAt(clientX: number, clientY: number): string | null {
    const rect = this.options.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const camera = this.options.cameraProvider();
    camera.updateMatrixWorld(true);
    let bestId: string | null = null;
    let bestDistance = TOLERANCE_PX;
    for (const circle of this.options.circles.getAll()) {
      const layer = this.options.designModel.layers.get(circle.layerId);
      if (!layer?.visible) continue;
      const center = vector(circle.center);
      const x = vector(circle.xAxis).normalize();
      const y = vector(circle.yAxis).normalize();
      let previous: THREE.Vector2 | null = null;
      let first: THREE.Vector2 | null = null;
      for (let i = 0; i <= 96; i++) {
        const angle = i / 96 * Math.PI * 2;
        const point = center.clone().addScaledVector(x, circle.radius * Math.cos(angle))
          .addScaledVector(y, circle.radius * Math.sin(angle));
        const screen = project(point, camera, rect);
        if (i === 0) first = screen;
        if (previous && screen) {
          const distance = distanceToSegment(clientX, clientY, previous, screen);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestId = circle.id;
          }
        }
        previous = screen;
      }
      void first;
    }
    return bestId;
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.drag?.pointerId === event.pointerId) {
      const drag = this.drag;
      this.drag = null;
      const after = this.options.circles.get(drag.id)?.radius;
      if (after !== undefined && Math.abs(after - drag.before) > 1e-9) {
        this.options.history.recordOperation("EDIT CIRCLE RADIUS",
          () => { this.options.circles.updateRadius(drag.id, drag.before); this.options.clearGeometryQueryCache(); },
          () => { this.options.circles.updateRadius(drag.id, after); this.options.clearGeometryQueryCache(); });
      }
      this.syncUI();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (this.disposed || this.options.isToolBusy() || event.button !== 0
      || event.target !== this.options.domElement) return;
    const hit = this.getCircleIdAt(event.clientX, event.clientY);
    if (hit) {
      this.selectCircle(hit);
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    else if (this.selectedCircleId) {
      this.selectCircle(null);
    }
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const circle = this.options.circles.get(drag.id);
    if (!circle) return;
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      vector(circle.normal).normalize(), vector(circle.center),
    );
    const rect = this.options.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const camera = this.options.cameraProvider();
    camera.updateMatrixWorld(true);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1,
    ), camera);
    const snapped = this.options.findSnapPoint(event.clientX, event.clientY);
    const candidate = snapped ?? raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!candidate) return;
    const delta = candidate.clone().sub(vector(circle.center));
    const normal = vector(circle.normal).normalize();
    delta.addScaledVector(normal, -delta.dot(normal));
    if (delta.lengthSq() <= 1e-12) return;
    this.options.circles.updateRadius(circle.id, delta.length());
    this.options.clearGeometryQueryCache();
    this.syncUI();
    event.preventDefault();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !this.drag) return;
    const drag = this.drag;
    this.drag = null;
    this.options.circles.updateRadius(drag.id, drag.before);
    this.options.clearGeometryQueryCache();
    this.syncUI();
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private scheduleSync(): void {
    const tick = () => {
      if (this.disposed) return;
      this.syncUI();
      this.raf = window.requestAnimationFrame(tick);
    };
    this.raf = window.requestAnimationFrame(tick);
  }

  private syncUI(): void {
    const circle = this.getSelectedCircle();
    const rect = this.options.domElement.getBoundingClientRect();
    if (!circle || rect.width <= 0 || rect.height <= 0) {
      this.label.style.display = "none";
      this.grips.forEach((g) => { g.style.display = "none"; });
      return;
    }
    const camera = this.options.cameraProvider();
    camera.updateMatrixWorld(true);
    const points = circleCardinals(circle);
    const locked = this.options.designModel.layers.get(circle.layerId)?.locked;
    CARDINALS.forEach((cardinal, i) => {
      const grip = this.grips[i]!;
      const position = project(points[cardinal], camera, rect);
      grip.style.display = position && !locked && !this.options.isToolBusy() ? "block" : "none";
      if (position) {
        grip.style.left = `${position.x}px`;
        grip.style.top = `${position.y}px`;
      }
    });
    const top = project(points.N, camera, rect);
    if (!top) { this.label.style.display = "none"; return; }
    this.label.style.left = `${Math.min(top.x + 15, window.innerWidth - 250)}px`;
    this.label.style.top = `${Math.max(8, top.y - 35)}px`;
    this.label.textContent = `CÍRCULO · R ${circle.radius.toFixed(2)} · Ø ${(2 * circle.radius).toFixed(2)} · Perímetro ${(2 * Math.PI * circle.radius).toFixed(2)} mm`;
    this.label.style.display = this.options.isToolBusy() ? "none" : "block";
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (activeController === this) activeController = null;
    window.removeEventListener("pointerup", this.handlePointerUp, true);
    window.removeEventListener("pointermove", this.handlePointerMove, true);
    window.removeEventListener("keydown", this.handleKeyDown, true);
    if (this.raf !== null) window.cancelAnimationFrame(this.raf);
    this.grips.forEach((g) => g.remove());
    this.label.remove();
  }
}
