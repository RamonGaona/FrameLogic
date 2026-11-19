import * as THREE from "three";

import {
  NATIVE_MOVE_AXES,
  type NativeMoveAxis,
} from "./NativeStepMoveController";

export interface NativeMoveGizmo {
  readonly group: THREE.Group;
  readonly axisLengthMm: number;
  readonly centerHandle: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  dispose(): void;
}

const CENTER_BASE_COLOR = 0xf7e6a0;
const CENTER_HOVER_COLOR = 0xfff16b;
const CENTER_MIN_HIT_RADIUS_PX = 13;
const CENTER_MAX_HIT_RADIUS_PX = 24;

const COLORS: Readonly<Record<NativeMoveAxis, number>> = {
  X: 0xf06464,
  Y: 0x65d482,
  Z: 0x6aa7ff,
};

/** Three native mesh handles, separate from STEP geometry and raycast root. */
export function createNativeMoveGizmo(
  pivot: THREE.Vector3,
  modelDiagonalMm: number,
): NativeMoveGizmo {
  const group = new THREE.Group();
  group.name = "Gizmo de desplazamiento STEP (experimental)";
  group.position.copy(pivot);
  // Keep gizmo usable on mm-scale parts, without changing camera projection.
  const length = THREE.MathUtils.clamp(modelDiagonalMm * 0.2, 10, 1000);
  const radius = Math.max(0.5, length * 0.025);
  const centerHandle = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(radius * 2.8, length * 0.058), 16, 12),
    new THREE.MeshBasicMaterial({
      color: CENTER_BASE_COLOR, depthTest: false, depthWrite: false,
      transparent: true, opacity: 0.98,
    }),
  );
  centerHandle.name = "Centro XYZ · punto base del gizmo";
  centerHandle.userData["nativeMovePivotCenter"] = true;
  // Always render centre after XYZ arrows. DOM snap markers overlapping the
  // centre are suppressed separately in NativeStepViewer.
  centerHandle.renderOrder = 100;
  // Keep the neutral pivot visible and selectable without altering geometry.
  group.add(centerHandle);

  for (const axis of ["X", "Y", "Z"] as const) {
    const direction = NATIVE_MOVE_AXES[axis];
    const handle = new THREE.Group();
    handle.name = `Movimiento ${axis}`;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length * 0.76, 10),
      new THREE.MeshBasicMaterial({
        color: COLORS[axis], depthTest: false, transparent: true, opacity: 0.95,
      }),
    );
    shaft.position.set(0, length * 0.38, 0);
    shaft.userData["nativeMoveAxis"] = axis;
    handle.add(shaft);

    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(radius * 3, length * 0.24, 12),
      new THREE.MeshBasicMaterial({
        color: COLORS[axis], depthTest: false, transparent: true, opacity: 0.95,
      }),
    );
    tip.position.set(0, length * 0.88, 0);
    tip.userData["nativeMoveAxis"] = axis;
    handle.add(tip);
    handle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    group.add(handle);
  }

  return {
    group,
    axisLengthMm: length,
    centerHandle,
    dispose: () => {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        for (const mat of mats) mat.dispose();
      });
      group.removeFromParent();
      group.clear();
    },
  };
}

/** Centre appearance changes only; the handle never transforms the STEP geometry. */
export function setNativeMoveCenterHovered(
  gizmo: NativeMoveGizmo,
  hovered: boolean,
): void {
  gizmo.centerHandle.material.color.setHex(
    hovered ? CENTER_HOVER_COLOR : CENTER_BASE_COLOR,
  );
  gizmo.centerHandle.material.opacity = hovered ? 1 : 0.98;
  gizmo.centerHandle.scale.setScalar(hovered ? 1.6 : 1);
}

/** Screen-space centre picker stays usable when the gizmo is very small. */
export function getNativeMoveCenterScreenPosition(
  gizmo: NativeMoveGizmo,
  camera: THREE.OrthographicCamera,
  rect: Pick<DOMRect, "width" | "height">,
): { x: number; y: number; hitRadiusPx: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  camera.updateMatrixWorld(true);
  gizmo.group.updateMatrixWorld(true);
  const point = gizmo.centerHandle.getWorldPosition(new THREE.Vector3()).project(camera);
  if (![point.x, point.y, point.z].every(Number.isFinite)
    || point.z < -1 || point.z > 1) return null;

  const spanX = camera.right - camera.left;
  if (!(spanX > 0) || !(camera.zoom > 0)) return null;
  const worldRadius = gizmo.centerHandle.geometry.parameters.radius
    * gizmo.group.getWorldScale(new THREE.Vector3()).x;
  const projectedRadiusPx = worldRadius * camera.zoom * rect.width / spanX;
  return {
    x: (point.x + 1) * rect.width * 0.5,
    y: (1 - point.y) * rect.height * 0.5,
    hitRadiusPx: THREE.MathUtils.clamp(
      projectedRadiusPx + 4,
      CENTER_MIN_HIT_RADIUS_PX,
      CENTER_MAX_HIT_RADIUS_PX,
    ),
  };
}

/** A SNAP coincident with the gizmo centre must not cover it in the DOM. */
export function isNativeSnapCoveredByMoveCenter(
  gizmo: NativeMoveGizmo,
  camera: THREE.OrthographicCamera,
  snap: Pick<{ screenX: number; screenY: number }, "screenX" | "screenY">,
  rect: Pick<DOMRect, "width" | "height">,
): boolean {
  const center = getNativeMoveCenterScreenPosition(gizmo, camera, rect);
  if (!center) return false;
  return Math.hypot(snap.screenX - center.x, snap.screenY - center.y)
    <= center.hitRadiusPx + 7;
}

/** Centre has pointer priority over a coincident B-Rep SNAP and nearby axes. */
export function pickNativeMoveCenter(
  gizmo: NativeMoveGizmo,
  camera: THREE.OrthographicCamera,
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): boolean {
  const center = getNativeMoveCenterScreenPosition(gizmo, camera, rect);
  if (!center) return false;
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return Math.hypot(x - center.x, y - center.y) <= center.hitRadiusPx;
}

export function pickNativeMoveAxis(
  gizmo: NativeMoveGizmo,
  camera: THREE.OrthographicCamera,
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): NativeMoveAxis | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  camera.updateMatrixWorld(true);
  gizmo.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
  for (const hit of ray.intersectObject(gizmo.group, true)) {
    const axis = hit.object.userData["nativeMoveAxis"];
    if (axis === "X" || axis === "Y" || axis === "Z") return axis;
  }
  return null;
}

/**
 * World millimetres along an axis from screen-pointer displacement.
 * If an axis looks directly into camera, skip drag and use numeric input.
 */
export function nativeMoveAxisDistanceFromPixels(
  camera: THREE.OrthographicCamera,
  pivot: THREE.Vector3,
  axis: NativeMoveAxis,
  axisLengthMm: number,
  pixelDx: number,
  pixelDy: number,
  viewportWidth: number,
  viewportHeight: number,
): number | null {
  if (viewportWidth <= 0 || viewportHeight <= 0 || axisLengthMm <= 0) return null;
  camera.updateMatrixWorld(true);
  const start = pivot.clone().project(camera);
  const end = pivot.clone().addScaledVector(NATIVE_MOVE_AXES[axis], axisLengthMm).project(camera);
  const dx = (end.x - start.x) * viewportWidth * 0.5;
  const dy = -(end.y - start.y) * viewportHeight * 0.5;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 25) return null;
  return (pixelDx * dx + pixelDy * dy) * axisLengthMm / lengthSq;
}
