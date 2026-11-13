import * as THREE from "three";

export interface ModelSpaceZoomWindowBounds {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface ModelSpaceZoomWindowFrame {
  readonly target: THREE.Vector3;
  readonly position: THREE.Vector3;
  /** Apply via CameraControls.zoomTo() for orthographic projection. */
  readonly orthographicZoom: number | null;
  readonly viewScale: number;
}

/**
 * Frames a screen-space rectangle on the camera's current target plane.
 *
 * A zoom window is a viewport operation, NOT a 3D object selection. This
 * avoids traversing millions of DWG line segments or changing the model.
 * In 3D, using the plane through CameraControls' target retains the view
 * orientation; for orthographic cameras the result is exact at every depth.
 */
export function getModelSpaceZoomWindowFrame(
  camera: THREE.Camera,
  currentTarget: THREE.Vector3,
  viewport: Pick<DOMRect, "left" | "top" | "width" | "height">,
  window: ModelSpaceZoomWindowBounds,
  paddingFactor = 0.92,
): ModelSpaceZoomWindowFrame | null {
  if (!(camera instanceof THREE.PerspectiveCamera)
      && !(camera instanceof THREE.OrthographicCamera)) return null;
  const { left, top, width, height } = viewport;
  if (!(width > 0 && height > 0)
      || ![left, top, width, height, window.x1, window.y1, window.x2, window.y2,
        currentTarget.x, currentTarget.y, currentTarget.z].every(Number.isFinite)) return null;

  const aX = THREE.MathUtils.clamp(Math.min(window.x1, window.x2), left, left + width);
  const bX = THREE.MathUtils.clamp(Math.max(window.x1, window.x2), left, left + width);
  const aY = THREE.MathUtils.clamp(Math.min(window.y1, window.y2), top, top + height);
  const bY = THREE.MathUtils.clamp(Math.max(window.y1, window.y2), top, top + height);
  const selectedWidth = bX - aX;
  const selectedHeight = bY - aY;
  // Never zoom a single click or near-zero rectangle to infinity.
  if (selectedWidth < 6 || selectedHeight < 6) return null;

  const ratio = Math.max(selectedWidth / width, selectedHeight / height);
  const scale = ratio / THREE.MathUtils.clamp(paddingFactor, 0.1, 1);
  if (!(scale > 0 && Number.isFinite(scale))) return null;
  const screenX = (aX + bX) * 0.5;
  const screenY = (aY + bY) * 0.5;
  const ndc = new THREE.Vector2(
    ((screenX - left) / width) * 2 - 1,
    1 - ((screenY - top) / height) * 2,
  );
  camera.updateMatrixWorld(true);
  const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
  if (forward.lengthSq() < 1e-12) return null;

  const targetPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(forward, currentTarget);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const center = raycaster.ray.intersectPlane(targetPlane, new THREE.Vector3());
  if (!center || ![center.x, center.y, center.z].every(Number.isFinite)) return null;

  const currentDistance = camera.position.distanceTo(currentTarget);
  if (!Number.isFinite(currentDistance) || currentDistance <= 1e-9) return null;
  const desiredDistance = camera instanceof THREE.PerspectiveCamera
    ? Math.max(1e-5, currentDistance * scale)
    : currentDistance;
  const position = center.clone().addScaledVector(forward, -desiredDistance);
  const orthographicZoom = camera instanceof THREE.OrthographicCamera
    ? camera.zoom / scale : null;
  if (orthographicZoom !== null && !(orthographicZoom > 0 && Number.isFinite(orthographicZoom)))
    return null;
  return { target: center, position, orthographicZoom, viewScale: scale };
}
