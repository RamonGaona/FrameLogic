import * as THREE from "three";


export type TranslationGizmoAxis = "X" | "Y" | "Z" | "XY" | "XZ" | "YZ";

/**
 * Read the native TransformControls translation picker on pointerdown, before
 * another canvas controller can replace the selection on pointerup.
 * Unlike controls.axis (hover state), this is tied to the actual click.
 */
export function pickTranslationGizmoAxis(
  helper: THREE.Object3D,
  camera: THREE.Camera,
  element: Pick<HTMLElement, "getBoundingClientRect">,
  clientX: number,
  clientY: number,
): TranslationGizmoAxis | null {
  const rect = element.getBoundingClientRect();
  if (!(rect.width > 0 && rect.height > 0)) return null;
  const point = new THREE.Vector2(
    (clientX - rect.left) / rect.width * 2 - 1,
    -(clientY - rect.top) / rect.height * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(point, camera);
  helper.updateMatrixWorld(true);
  let picker: THREE.Object3D | null = null;
  helper.traverse((child) => {
    const gizmo = child as THREE.Object3D & { picker?: { translate?: THREE.Object3D } };
    if (child.type === "TransformControlsGizmo" && gizmo.picker?.translate) {
      picker = gizmo.picker.translate;
    }
  });
  if (!picker) return null;
  const matches = raycaster.intersectObjects((picker as THREE.Object3D).children, true);
  for (const hit of matches) {
    let node: THREE.Object3D | null = hit.object;
    while (node && node !== picker) {
      const name = node.name;
      if (name === "X" || name === "Y" || name === "Z"
        || name === "XY" || name === "XZ" || name === "YZ") return name;
      node = node.parent;
    }
  }
  return null;
}

interface PointerControls {
  dragging: boolean;
  axis: string | null;
  pointerUp(pointer: null): void;
  reset(): void;
}

/** Keep native TransformControls tied to a physical primary-pointer gesture.
 * Release is deferred until existing canvas handlers have committed history.
 */
export function installTransformPointerLifecycle(
  element: HTMLElement,
  controls: PointerControls,
  target: Window = window,
  onCancel?: () => void,
): () => void {
  let pointerId: number | null = null;
  let startX = 0, startY = 0, distance = 0;
  let disposed = false;
  let generation = 0;

  const finish = (cancel: boolean): void => {
    const releasedId = pointerId;
    pointerId = null;
    generation++;
    if (controls.dragging) {
      if (cancel) {
        onCancel?.();
        controls.reset();
      }
      controls.pointerUp(null);
    }
    if (releasedId !== null && element.hasPointerCapture?.(releasedId)) {
      element.releasePointerCapture(releasedId);
    }
  };
  const down = (event: PointerEvent): void => {
    if (disposed || event.button !== 0 || event.isPrimary === false || pointerId !== null) return;

    // A previous native drag must never survive without a physical pointer owner.
    // Repair that stale state before accepting a new primary gesture.
    if (controls.dragging) controls.pointerUp(null);

    pointerId = event.pointerId;
    startX = event.clientX; startY = event.clientY; distance = 0;
    generation++;
  };
  const move = (event: PointerEvent): void => {
    if (disposed || !controls.dragging) return;

    if (pointerId !== null && event.pointerId !== pointerId) {
      // A second touch/pen must not transform the first pointer's selection.
      event.stopImmediatePropagation();
      return;
    }

    // Physical button state is authoritative. This also repairs the rare case
    // where native TransformControls remains dragging after pointer ownership
    // has already been lost.
    if ((event.buttons & 1) === 0) {
      finish(false);
      return;
    }

    // Never let an unowned native drag continue transforming the model.
    if (pointerId === null) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    distance = Math.max(distance, Math.hypot(event.clientX - startX, event.clientY - startY));
    if (distance <= 5) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const release = (event: PointerEvent): void => {
    if (disposed) return;
    if (pointerId !== event.pointerId) {
      // If native state is stale but no pointer is owned anymore, a real
      // primary release must still terminate the transform immediately.
      if (pointerId === null && controls.dragging && event.isPrimary !== false) {
        finish(event.type === "pointercancel");
      }
      return;
    }
    const token = generation;
    queueMicrotask(() => {
      if (!disposed && token === generation) finish(event.type === "pointercancel");
    });
  };
  const mouseUp = (event: MouseEvent): void => {
    // Mouse compatibility fallback: browsers/extensions can occasionally
    // interrupt the PointerEvent release path while still emitting mouseup.
    if (!disposed && event.button === 0 && controls.dragging) finish(false);
  };
  const blur = (): void => {
    if (!disposed) finish(true);
  };

  element.addEventListener("pointerdown", down, true);
  target.addEventListener("pointermove", move, true);
  target.addEventListener("pointerup", release, true);
  target.addEventListener("pointercancel", release, true);
  target.addEventListener("mouseup", mouseUp, true);
  element.addEventListener("lostpointercapture", release, true);
  target.addEventListener("blur", blur);
  return () => {
    if (disposed) return;
    finish(true);
    disposed = true;
    element.removeEventListener("pointerdown", down, true);
    target.removeEventListener("pointermove", move, true);
    target.removeEventListener("pointerup", release, true);
    target.removeEventListener("pointercancel", release, true);
    target.removeEventListener("mouseup", mouseUp, true);
    element.removeEventListener("lostpointercapture", release, true);
    target.removeEventListener("blur", blur);
  };
}

/** Numeric fields may appear on mouseDown, but must not steal focus while
 * the gizmo still owns the pointer. Only the most recent request can focus.
 */
export class PointerFocusGate {
  private pointerId: number | null = null;
  private pending: (() => void) | null = null;
  private generation = 0;
  private disposed = false;

  private readonly target: Window;

  constructor(target: Window = window) {
    this.target = target;
    target.addEventListener("pointerdown", this.down, true);
    target.addEventListener("pointerup", this.up, true);
    target.addEventListener("pointercancel", this.cancel, true);
    target.addEventListener("blur", this.clear);
  }

  request(focus: () => void): void {
    const token = ++this.generation;
    const apply = (): void => { if (!this.disposed && token === this.generation) focus(); };
    if (this.pointerId !== null) this.pending = apply;
    else queueMicrotask(apply);
  }

  private readonly down = (event: PointerEvent): void => {
    if (event.button === 0 && event.isPrimary !== false) this.pointerId = event.pointerId;
  };
  private readonly up = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) return;
    this.pointerId = null;
    const focus = this.pending;
    this.pending = null;
    if (focus) queueMicrotask(focus);
  };
  private readonly cancel = (event: PointerEvent): void => {
    if (this.pointerId === event.pointerId) this.clear();
  };
  private readonly clear = (): void => {
    this.pointerId = null; this.pending = null; this.generation++;
  };

  dispose(): void {
    this.disposed = true;
    this.clear();
    this.target.removeEventListener("pointerdown", this.down, true);
    this.target.removeEventListener("pointerup", this.up, true);
    this.target.removeEventListener("pointercancel", this.cancel, true);
    this.target.removeEventListener("blur", this.clear);
  }
}

/** Native pickers already span 360 degrees. Match the visible X/Y/Z rings to
 * them, retaining native orientation, highlighting and disposal ownership.
 */
export function completeRotationRings(helper: THREE.Object3D): void {
  helper.traverse((object) => {
    if (object.type !== "TransformControlsGizmo") return;
    const gizmo = object as THREE.Object3D & { gizmo?: { rotate?: THREE.Object3D } };
    for (const ring of gizmo.gizmo?.rotate?.children ?? []) {
      if (!(ring instanceof THREE.Mesh) || !["X", "Y", "Z"].includes(ring.name)) continue;
      const geometry = new THREE.TorusGeometry(0.5, 0.012, 6, 128);
      geometry.rotateY(Math.PI / 2);
      geometry.rotateX(Math.PI / 2);
      if (ring.name === "Y") geometry.rotateZ(-Math.PI / 2);
      if (ring.name === "Z") geometry.rotateY(Math.PI / 2);
      ring.geometry.dispose();
      ring.geometry = geometry;
    }
  });
}
