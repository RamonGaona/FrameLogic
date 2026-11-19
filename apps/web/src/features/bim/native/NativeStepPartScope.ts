import * as THREE from "three";

/**
 * Every imported STEP document owns its own B-Rep id. STEP product nodes can
 * label one or more visual meshes, but the current OCCT topology snapshot
 * does NOT identify which B-Rep edge belongs to each product.
 *
 * These scopes therefore permit a useful conservative spatial restriction,
 * not a claim of exact topological ownership per subassembly.
 */
export interface NativeStepPartScope {
  readonly key: string;
  readonly kind: "STEP_PRODUCT" | "VISUAL_MESH";
  readonly documentId: string;
  readonly productId: string | null;
  readonly productName: string | null;
  readonly meshes: readonly THREE.Mesh[];
  readonly bounds: THREE.Box3;
  /** Read-only pivot to prepare later translation/rotation gizmos. */
  readonly pivot: THREE.Vector3;
}

/** Select all meshes of the same uniquely identified product and document. */
export function resolveNativeStepPartScope(
  modelRoot: THREE.Object3D,
  selected: THREE.Mesh,
): NativeStepPartScope | null {
  const documentId = selected.userData["brepDocumentId"];
  if (typeof documentId !== "string" || !documentId) return null;
  const productId = selected.userData["stepProductId"];
  const validProductId = typeof productId === "string" && productId.length > 0
    && selected.userData["stepProductAmbiguous"] !== true
    ? productId : null;
  const meshes: THREE.Mesh[] = [];

  if (validProductId) {
    modelRoot.traverse((child) => {
      if (child instanceof THREE.Mesh
        && child.userData["brepDocumentId"] === documentId
        && child.userData["stepProductId"] === validProductId
        && child.userData["stepProductAmbiguous"] !== true) meshes.push(child);
    });
  }
  if (meshes.length === 0) meshes.push(selected);

  // A single fallback mesh is not a semantic STEP piece. Its UUID is
  // session-local and must never be persisted as a manufacturing identity.
  const bounds = new THREE.Box3().makeEmpty();
  for (const mesh of meshes) bounds.expandByObject(mesh);
  const pivot = bounds.getCenter(new THREE.Vector3());
  const productName = validProductId && typeof selected.userData["stepProductName"] === "string"
    ? selected.userData["stepProductName"] as string : null;

  return {
    key: validProductId ? `${documentId}:product:${validProductId}`
      : `${documentId}:visual:${selected.uuid}`,
    kind: validProductId ? "STEP_PRODUCT" : "VISUAL_MESH",
    documentId,
    productId: validProductId,
    productName,
    meshes,
    bounds,
    pivot,
  };
}

/** A geometric prefilter. This is NOT a B-Rep product/edge ownership map. */
export function isSnapWithinNativePartScope(
  candidate: THREE.Vector3,
  scope: NativeStepPartScope,
): boolean {
  if (scope.bounds.isEmpty()) return false;
  // Tolerate minor OCCT/visual tessellation discrepancies in millimetres,
  // but keep the margin small to avoid importing unrelated nearby features.
  const diagonal = scope.bounds.getSize(new THREE.Vector3()).length();
  const marginMm = Math.min(0.1, Math.max(0.00001, diagonal * 0.000001));
  return scope.bounds.clone().expandByScalar(marginMm).containsPoint(candidate);
}

/**
 * Test visibility at the candidate's own screen projection (not a nearby
 * pointer position). A ray hit substantially ahead of an exact B-Rep point
 * means the point is behind visible STEP triangles.
 *
 * For a circle centre through a real hole, no surface should occlude it.
 * The tolerance prevents rejecting an exact vertex on a triangulated face.
 */
export function isNativeSnapVisible(
  point: THREE.Vector3,
  camera: THREE.OrthographicCamera,
  modelRoot: THREE.Object3D,
  toleranceMm = 0.05,
): boolean {
  camera.updateMatrixWorld(true);
  modelRoot.updateMatrixWorld(true);
  const clip = point.clone().project(camera);
  if (!Number.isFinite(clip.x) || !Number.isFinite(clip.y)
    || clip.z < -1 || clip.z > 1) return false;

  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(clip.x, clip.y), camera);
  const distanceToPoint = point.clone().sub(ray.ray.origin).dot(ray.ray.direction);
  if (distanceToPoint < 0) return false;

  const hits = ray.intersectObject(modelRoot, true);
  const frontSurface = hits.find((hit) => hit.object.visible && hit.distance >= 0);
  if (!frontSurface) return true;
  return frontSurface.distance + Math.max(0.001, toleranceMm) >= distanceToPoint;
}

/** Non-mutating selection target for future native translation/rotation gizmos. */
export interface NativeStepTransformTarget {
  readonly key: string;
  readonly documentId: string;
  readonly productId: string | null;
  readonly pivot: THREE.Vector3;
  readonly affectedMeshCount: number;
  readonly editable: false;
}

export function prepareNativeStepTransformTarget(
  scope: NativeStepPartScope,
): NativeStepTransformTarget {
  return {
    key: scope.key,
    documentId: scope.documentId,
    productId: scope.productId,
    pivot: scope.pivot.clone(),
    affectedMeshCount: scope.meshes.length,
    // Real editing needs exact topology ownership plus undo/redo first.
    editable: false,
  };
}
