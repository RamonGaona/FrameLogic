import * as THREE from "three";

/**
 * Screen-tolerance object-snap tracking on an infinite 3D reference axis.
 * The source point must be an explicitly acquired, geometrically valid snap.
 * Concepts adapted from Cota object snap tracking (Apache-2.0, Christian Orengia).
 */
export interface TrackingAxis {
  readonly name: "X" | "Y";
  readonly direction: THREE.Vector3;
}
export interface TrackingHit {
  readonly point: THREE.Vector3;
  readonly axis: "X" | "Y";
  readonly distancePx: number;
}
export function findTrackingHit(
  anchor: THREE.Vector3,
  ray: THREE.Ray,
  axes: readonly TrackingAxis[],
  project: (point: THREE.Vector3) => { x: number; y: number; visible: boolean },
  cursorX: number,
  cursorY: number,
  tolerancePx = 10,
): TrackingHit | null {
  let best: TrackingHit | null = null;
  for (const axis of axes) {
    const direction = axis.direction.clone().normalize();
    if (!Number.isFinite(direction.lengthSq()) || direction.lengthSq() < 0.9) continue;
    const c = ray.direction.dot(direction);
    const den = 1 - c * c;
    if (den < 1e-8) continue; // Camera ray is parallel to the tracking axis.
    const offset = ray.origin.clone().sub(anchor);
    const t = (offset.dot(direction) - c * offset.dot(ray.direction)) / den;
    const point = anchor.clone().addScaledVector(direction, t);
    const alongRay = point.clone().sub(ray.origin).dot(ray.direction);
    if (alongRay <= 0) continue; // Behind the camera.
    const screen = project(point);
    if (!screen.visible) continue;
    const distance = Math.hypot(cursorX - screen.x, cursorY - screen.y);
    if (distance > tolerancePx || (best && distance >= best.distancePx)) continue;
    best = { point, axis: axis.name, distancePx: distance };
  }
  return best;
}
