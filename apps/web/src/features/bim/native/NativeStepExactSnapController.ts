import * as THREE from "three";

import type { OpenCascadeBrepSnapshot } from "@framelogic/geometry";

export type NativeExactSnapKind =
  | "VERTEX"
  | "EDGE_MIDPOINT"
  | "CIRCLE_CENTER"
  | "AXIS_ORIGIN";

export interface NativeExactSnapPoint {
  readonly id: string;
  /** The actual OpenCascade document, not an ambiguous filename. */
  readonly brepDocumentId: string;
  readonly sourceFileName: string;
  readonly kind: NativeExactSnapKind;
  readonly point: THREE.Vector3;
}

export interface NativeExactSnapHit extends NativeExactSnapPoint {
  readonly screenX: number;
  readonly screenY: number;
  readonly screenDistancePx: number;
}

const PRIORITY: Readonly<Record<NativeExactSnapKind, number>> = {
  VERTEX: 0,
  CIRCLE_CENTER: 1,
  EDGE_MIDPOINT: 2,
  AXIS_ORIGIN: 3,
};

export const NATIVE_SNAP_LABELS: Readonly<Record<NativeExactSnapKind, string>> = {
  VERTEX: "Vértice",
  EDGE_MIDPOINT: "Punto medio",
  CIRCLE_CENTER: "Centro de círculo",
  AXIS_ORIGIN: "Origen de eje",
};

/**
 * Extract positional snaps only from OCCT's exact B-Rep index.
 * The display mesh is NEVER used as a source of snap coordinates.
 *
 * Document.modelScale normalizes the native STEP units to Model Space mm.
 * This snapshot is indexed at load time, not queried through WASM on hover.
 * Topology belongs to the whole STEP file; mesh-level B-Rep ownership is not
 * yet available, so callers must scope queries to the selected document id.
 */
export function indexNativeBrepSnapPoints(
  document: OpenCascadeBrepSnapshot,
): readonly NativeExactSnapPoint[] {
  const points: NativeExactSnapPoint[] = [];
  const scale = document.modelScale;
  if (!Number.isFinite(scale) || scale <= 0) return points;

  const push = (
    id: string,
    kind: NativeExactSnapKind,
    point: { readonly x: number; readonly y: number; readonly z: number },
  ) => {
    const p = new THREE.Vector3(point.x * scale, point.y * scale, point.z * scale);
    if (![p.x, p.y, p.z].every(Number.isFinite)) return;
    points.push({
      id, kind, point: p,
      brepDocumentId: document.id,
      sourceFileName: document.sourceFileName,
    });
  };

  for (const vertex of document.vertices) push(vertex.id, "VERTEX", vertex.point);

  for (const edge of document.edges) {
    if (edge.midpoint) push(`${edge.id}:midpoint`, "EDGE_MIDPOINT", edge.midpoint);
    if (edge.circle) push(`${edge.id}:center`, "CIRCLE_CENTER", edge.circle.center);
  }

  for (const cylinder of document.cylinders) {
    push(`${cylinder.id}:axis`, "AXIS_ORIGIN", cylinder.axisOrigin);
  }
  return points;
}

/**
 * Screen-space nearest point on an orthographic camera, in CSS pixels.
 * Only exact B-Rep points of the selected source document are eligible.
 * Candidates outside the camera clip volume are rejected.
 */
export function findNativeExactSnap(
  points: readonly NativeExactSnapPoint[],
  selectedDocumentId: string,
  camera: THREE.OrthographicCamera,
  clientX: number,
  clientY: number,
  canvasRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  tolerancePx = 13,
  /** Optional exact-candidate gate for product bounds and visibility. */
  acceptCandidate?: (candidate: NativeExactSnapPoint) => boolean,
  /** Visual placement transform of an isolated STEP document (never changes B-Rep). */
  worldTransform?: THREE.Matrix4,
): NativeExactSnapHit | null {
  if (!selectedDocumentId || canvasRect.width <= 0 || canvasRect.height <= 0
    || !Number.isFinite(tolerancePx) || tolerancePx <= 0) return null;
  const screenX = clientX - canvasRect.left;
  const screenY = clientY - canvasRect.top;
  if (screenX < 0 || screenY < 0 || screenX > canvasRect.width
    || screenY > canvasRect.height) return null;

  camera.updateMatrixWorld(true);
  const ndc = new THREE.Vector3();
  let best: NativeExactSnapHit | null = null;

  for (const candidate of points) {
    if (candidate.brepDocumentId !== selectedDocumentId) continue;
    ndc.copy(candidate.point);
    if (worldTransform) ndc.applyMatrix4(worldTransform);
    ndc.project(camera);
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)
      || ndc.z < -1 || ndc.z > 1) continue;
    const candidateX = canvasRect.left + (ndc.x + 1) * 0.5 * canvasRect.width;
    const candidateY = canvasRect.top + (1 - ndc.y) * 0.5 * canvasRect.height;
    const distance = Math.hypot(candidateX - clientX, candidateY - clientY);
    if (distance > tolerancePx) continue;
    // If the whole STEP file is visually placed elsewhere, retain native B-Rep
    // coordinates and transform only projected world-space candidates.
    const worldCandidate = worldTransform
      ? { ...candidate, point: candidate.point.clone().applyMatrix4(worldTransform) }
      : candidate;
    // Evaluate expensive scope/occlusion gates only for nearby points.
    if (acceptCandidate && !acceptCandidate(worldCandidate)) continue;
    if (best && distance > best.screenDistancePx + 0.25) continue;
    if (best && Math.abs(distance - best.screenDistancePx) <= 0.25
      && PRIORITY[candidate.kind] >= PRIORITY[best.kind]) continue;
    best = {
      ...worldCandidate,
      screenX: candidateX - canvasRect.left,
      screenY: candidateY - canvasRect.top,
      screenDistancePx: distance,
    };
  }

  return best;
}
