import * as THREE from "three";

/** Right-handed world axes shared by STEP and FrameLogic CAD. */
export type NativeProjectRotateAxis = "X" | "Y" | "Z";
export const NATIVE_PROJECT_ROTATE_AXIS: Readonly<Record<NativeProjectRotateAxis, THREE.Vector3>> = {
  X: new THREE.Vector3(1, 0, 0),
  Y: new THREE.Vector3(0, 1, 0),
  Z: new THREE.Vector3(0, 0, 1),
};
const COLORS = { X: 0xf06464, Y: 0x65d482, Z: 0x6aa7ff } as const;

/**
 * Standalone rotation rings; TransformControls on the *main* canvas cannot
 * receive pointer input from the inspector's canvas. The secondary viewer
 * must pick these rings using its own orthographic camera.
 */
export function createNativeProjectRotationRings(): {
  readonly group: THREE.Group;
  dispose(): void;
} {
  const group = new THREE.Group();
  group.name = "FrameLogic · anillos de rotación interactivos";
  for (const axis of ["X", "Y", "Z"] as const) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(72, 2.5, 10, 96),
      new THREE.MeshBasicMaterial({
        color: COLORS[axis], depthTest: false, depthWrite: false,
        transparent: true, opacity: 0.98, side: THREE.DoubleSide,
      }),
    );
    ring.name = `Rotar ${axis}`;
    ring.userData["nativeProjectRotateAxis"] = axis;
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), NATIVE_PROJECT_ROTATE_AXIS[axis]);
    ring.renderOrder = 200;
    const hitArea = new THREE.Mesh(
      new THREE.TorusGeometry(72, 9, 6, 96),
      new THREE.MeshBasicMaterial({
        color: COLORS[axis], depthTest: false, depthWrite: false,
        transparent: true, opacity: 0, side: THREE.DoubleSide,
      }),
    );
    hitArea.userData["nativeProjectRotateAxis"] = axis;
    ring.add(hitArea);
    group.add(ring);
  }
  return {
    group,
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

/**
 * Scale the 72-unit geometry to a near-constant 72 CSS-pixel radius on screen.
 * This follows the active orthographic zoom but does not mutate CAD meshes.
 */
export function sizeNativeProjectRotationRings(
  group: THREE.Group,
  camera: THREE.OrthographicCamera,
  canvasHeightPx: number,
): void {
  if (!(canvasHeightPx > 0) || !(camera.zoom > 0)) return;
  const mmPerCssPx = (camera.top - camera.bottom) / camera.zoom / canvasHeightPx;
  group.scale.setScalar(mmPerCssPx);
  camera.updateMatrixWorld(true);
  const viewDirection = camera.getWorldDirection(new THREE.Vector3());
  for (const child of group.children) {
    const axis: unknown = child.userData["nativeProjectRotateAxis"];
    if (axis === "X" || axis === "Y" || axis === "Z") {
      // An edge-on ring is not reliably clickable or draggable; hide it
      // rather than teasing a dead tool. Numeric ±90 rotations remain usable.
      child.visible = Math.abs(viewDirection.dot(NATIVE_PROJECT_ROTATE_AXIS[axis])) >= 0.12;
    }
  }
  group.updateMatrixWorld(true);
}

export function pickNativeProjectRotationRing(
  group: THREE.Group,
  camera: THREE.OrthographicCamera,
  x: number,
  y: number,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): NativeProjectRotateAxis | null {
  if (!group.visible || rect.width <= 0 || rect.height <= 0) return null;
  const nx = ((x - rect.left) / rect.width) * 2 - 1;
  const ny = -((y - rect.top) / rect.height) * 2 + 1;
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || Math.abs(nx) > 1 || Math.abs(ny) > 1) return null;
  camera.updateMatrixWorld(true);
  group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const hits = raycaster.intersectObject(group, true);
  for (const hit of hits) {
    if (!hit.object.visible) continue;
    const axis: unknown = hit.object.userData["nativeProjectRotateAxis"];
    if (axis === "X" || axis === "Y" || axis === "Z") {
      // An edge-on torus collapses into a line on screen and can raycast over
      // the gizmo centre, causing a no-op/incorrect-axis rotation. Never arm
      // an axis whose rotation plane is nearly parallel to the view ray.
      // The exact +90-degree toolbar actions remain available for that axis.
      if (Math.abs(raycaster.ray.direction.dot(NATIVE_PROJECT_ROTATE_AXIS[axis])) < 0.12) {
        continue;
      }
      return axis;
    }
  }
  return null;
}

/**
 * Screen-to-world signed angle from two ray-plane intersections. Projected
 * screen X/Y increments are incorrect for different camera directions.
 */
export function nativeProjectRotationDragAngle(
  camera: THREE.OrthographicCamera,
  pivot: THREE.Vector3,
  axis: NativeProjectRotateAxis,
  start: readonly [number, number],
  end: readonly [number, number],
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
): number | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  camera.updateMatrixWorld(true);
  const normal = NATIVE_PROJECT_ROTATE_AXIS[axis];
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pivot);
  const ray = new THREE.Raycaster();
  const project = ([x, y]: readonly [number, number]): THREE.Vector3 | null => {
    const nx = ((x - rect.left) / rect.width) * 2 - 1;
    const ny = -((y - rect.top) / rect.height) * 2 + 1;
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
    ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  };
  const from = project(start), to = project(end);
  if (!from || !to) return null;
  const a = from.sub(pivot).projectOnPlane(normal);
  const b = to.sub(pivot).projectOnPlane(normal);
  if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) return null;
  a.normalize(); b.normalize();
  const angle = Math.atan2(normal.dot(a.clone().cross(b)), a.dot(b));
  return Number.isFinite(angle) ? angle : null;
}

export function nativeProjectRotationFromStart(
  startingWorldQuaternion: THREE.Quaternion,
  axis: NativeProjectRotateAxis,
  radians: number,
): THREE.Quaternion | null {
  if (!Number.isFinite(radians)) return null;
  return new THREE.Quaternion()
    .setFromAxisAngle(NATIVE_PROJECT_ROTATE_AXIS[axis], radians)
    .multiply(startingWorldQuaternion);
}
