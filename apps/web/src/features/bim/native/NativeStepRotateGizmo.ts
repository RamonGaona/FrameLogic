import * as THREE from "three";

import {
  NATIVE_MOVE_AXES,
  type NativeMoveAxis,
} from "./NativeStepMoveController";
import type { NativeMoveGizmo } from "./NativeStepMoveGizmo";

/**
 * Rotation rings share the movement gizmo's centre picker, hover feedback
 * and constant-size orthographic scaling. They are display-only Three meshes,
 * never members of the imported STEP/B-Rep root.
 */
export function createNativeRotateGizmo(
  pivot: THREE.Vector3,
  modelDiagonalMm: number,
): NativeMoveGizmo {
  const group = new THREE.Group();
  group.name = "Gizmo de rotación STEP (experimental)";
  group.position.copy(pivot);
  const length = THREE.MathUtils.clamp(modelDiagonalMm * 0.2, 10, 1000);
  const radius = Math.max(0.5, length * 0.025);
  const centerHandle = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(radius * 2.8, length * 0.058), 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xf7e6a0, depthTest: false, depthWrite: false,
      transparent: true, opacity: 0.98,
    }),
  );
  centerHandle.name = "Centro XYZ · pivote de rotación";
  centerHandle.userData["nativeMovePivotCenter"] = true;
  centerHandle.renderOrder = 100;
  group.add(centerHandle);

  const colors: Readonly<Record<NativeMoveAxis, number>> = {
    X: 0xf06464, Y: 0x65d482, Z: 0x6aa7ff,
  };
  for (const axis of ["X", "Y", "Z"] as const) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(length * 0.82, Math.max(radius * 1.35, length * 0.022), 12, 96),
      new THREE.MeshBasicMaterial({
        color: colors[axis], depthTest: false, depthWrite: false,
        transparent: true, opacity: 0.94, side: THREE.DoubleSide,
      }),
    );
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), NATIVE_MOVE_AXES[axis]);
    ring.name = `Rotación ${axis}`;
    ring.userData["nativeRotateAxis"] = axis;
    // The visible torus is thin. A larger *transparent* raycast target gives
    // each ring a comfortable hit tolerance at the constant screen size.
    const hitArea = new THREE.Mesh(
      new THREE.TorusGeometry(length * 0.82, length * 0.075, 8, 96),
      new THREE.MeshBasicMaterial({
        color: colors[axis], transparent: true, opacity: 0,
        depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    hitArea.name = `Zona de selección rotación ${axis}`;
    hitArea.userData["nativeRotateAxis"] = axis;
    ring.add(hitArea);
    group.add(ring);
  }
  return {
    group, axisLengthMm: length, centerHandle,
    dispose: () => {
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      });
      group.removeFromParent();
      group.clear();
    },
  };
}

export interface NativeRotateRingHit {
  readonly axis: NativeMoveAxis;
  readonly worldPoint: THREE.Vector3;
}

export function pickNativeRotateRing(
  gizmo: NativeMoveGizmo,
  camera: THREE.OrthographicCamera,
  clientX: number,
  clientY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): NativeRotateRingHit | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  camera.updateMatrixWorld(true);
  gizmo.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(x * 2 - 1, 1 - y * 2), camera);
  for (const hit of ray.intersectObject(gizmo.group, true)) {
    const axis = hit.object.userData["nativeRotateAxis"];
    if (axis === "X" || axis === "Y" || axis === "Z") {
      return { axis, worldPoint: hit.point.clone() };
    }
  }
  return null;
}

/** Default angular starting direction for the toolbar's HASTA command. */
export function nativeRotationStartReference(
  pivot: THREE.Vector3,
  axis: NativeMoveAxis,
): THREE.Vector3 {
  const direction = axis === "X" ? new THREE.Vector3(0, 1, 0)
    : axis === "Y" ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(1, 0, 0);
  return pivot.clone().add(direction);
}

/** Signed shortest right-handed angle about a fixed global axis. */
export function nativeRotationAngleToReference(
  pivot: THREE.Vector3,
  axis: NativeMoveAxis,
  from: THREE.Vector3,
  to: THREE.Vector3,
): number | null {
  if (![...pivot.toArray(), ...from.toArray(), ...to.toArray()].every(Number.isFinite)) {
    return null;
  }
  const normal = NATIVE_MOVE_AXES[axis];
  const a = from.clone().sub(pivot).addScaledVector(
    normal, -from.clone().sub(pivot).dot(normal),
  );
  const b = to.clone().sub(pivot).addScaledVector(
    normal, -to.clone().sub(pivot).dot(normal),
  );
  if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) return null;
  a.normalize();
  b.normalize();
  const angle = Math.atan2(normal.dot(a.clone().cross(b)), a.dot(b)) * 180 / Math.PI;
  return Number.isFinite(angle) && Math.abs(angle) > 1e-6 ? angle : null;
}

/**
 * Drag angle uses ray-plane intersections, not a constant screen X/Y
 * coefficient, so the rotation follows the chosen 3D axis and camera view.
 * When viewed edge-on the ring is geometrically degenerate; decline drag.
 */
export function nativeRotationDegreesFromPixels(
  camera: THREE.OrthographicCamera,
  pivot: THREE.Vector3,
  axis: NativeMoveAxis,
  startX: number, startY: number, endX: number, endY: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): number | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  camera.updateMatrixWorld(true);
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(NATIVE_MOVE_AXES[axis], pivot);
  const raycaster = new THREE.Raycaster();
  const hit = (x: number, y: number): THREE.Vector3 | null => {
    const px = (x - rect.left) / rect.width;
    const py = (y - rect.top) / rect.height;
    if (px < 0 || px > 1 || py < 0 || py > 1) return null;
    raycaster.setFromCamera(new THREE.Vector2(px * 2 - 1, 1 - py * 2), camera);
    return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  };
  const from = hit(startX, startY);
  const to = hit(endX, endY);
  if (!from || !to) return null;
  return nativeRotationAngleToReference(pivot, axis, from, to) ?? 0;
}
