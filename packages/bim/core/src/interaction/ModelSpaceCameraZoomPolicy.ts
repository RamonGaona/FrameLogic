import * as THREE from "three";

/**
 * For orthographic Model Space the visible width/height is the unscaled camera
 * frustum divided by zoom. A hardcoded minZoom may clip imported drawings
 * hundreds of thousands of millimetres across, especially in narrow viewports.
 *
 * Compute the real projected bounds in the CURRENT camera orientation.
 * This also works for inclined 3D assemblies and rectangles with zero depth.
 */
export function getOrthographicZoomForBounds(
  camera: THREE.OrthographicCamera,
  bounds: THREE.Box3,
  paddingFactor = 1.16,
): number {
  if (bounds.isEmpty()) return 1;
  camera.updateMatrixWorld(true);

  const size = bounds.getSize(new THREE.Vector3());
  const quaternion = camera.getWorldQuaternion(new THREE.Quaternion());
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);

  // Projection of an axis-aligned world bounding box onto camera axes.
  const projectedWidth = Math.abs(size.x * cameraRight.x)
    + Math.abs(size.y * cameraRight.y)
    + Math.abs(size.z * cameraRight.z);
  const projectedHeight = Math.abs(size.x * cameraUp.x)
    + Math.abs(size.y * cameraUp.y)
    + Math.abs(size.z * cameraUp.z);

  const width = Math.max(Math.abs(camera.right - camera.left), 1e-12);
  const height = Math.max(Math.abs(camera.top - camera.bottom), 1e-12);
  const padding = Math.max(1, paddingFactor);
  const zoom = Math.min(
    width / (Math.max(projectedWidth, 1) * padding),
    height / (Math.max(projectedHeight, 1) * padding),
  );
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

export interface MutableCameraZoomLimits {
  minZoom?: number;
  maxDistance?: number;
}

/**
 * Always let Z→E fit the complete imported geometry, even if the user has
 * reached the previous zoom-out stop. This only RELAXES limits; it never
 * changes the close-up accuracy or forces additional zoom-in.
 */
export function allowZoomOutTo(
  limits: MutableCameraZoomLimits,
  desiredZoom: number,
): void {
  if (!Number.isFinite(desiredZoom) || desiredZoom <= 0) return;
  if (typeof limits.minZoom === "number" && limits.minZoom > desiredZoom) {
    limits.minZoom = Math.max(desiredZoom * 0.5, Number.MIN_VALUE);
  }
}

export function allowPerspectiveDistance(
  limits: MutableCameraZoomLimits,
  requiredDistance: number,
): void {
  if (!Number.isFinite(requiredDistance) || requiredDistance <= 0) return;
  if (typeof limits.maxDistance === "number"
    && Number.isFinite(limits.maxDistance)
    && limits.maxDistance < requiredDistance) {
    limits.maxDistance = requiredDistance * 1.5;
  }
}
