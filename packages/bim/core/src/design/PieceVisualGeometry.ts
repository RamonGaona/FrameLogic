import * as THREE from "three";

export type PieceVisualLevel = "LOW" | "WORK" | "DETAIL";
interface VisualGeometry {
  readonly detail: THREE.BufferGeometry;
  readonly work: THREE.BufferGeometry;
  readonly low: THREE.BufferGeometry;
}

// Visual approximations never become a source for engineering measurements.
const visuals = new WeakMap<THREE.BufferGeometry, VisualGeometry>();
const registeredMeshes = new WeakSet<THREE.Mesh>();

export function registerPieceVisualLevels(
  detail: THREE.BufferGeometry, work: THREE.BufferGeometry, low: THREE.BufferGeometry,
): void {
  const data = { detail, work, low };
  for (const geometry of new Set([detail, work, low])) visuals.set(geometry, data);
}

export function getPieceDetailGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  return visuals.get(mesh.geometry)?.detail ?? mesh.geometry;
}

/** Vertex clustering is a visual approximation, in native asset coordinates.
 * Multi-material, textured and animated geometry is kept intact.
 */
function cluster(source: THREE.BufferGeometry, divisions: number): THREE.BufferGeometry {
  const position = source.getAttribute("position");
  const count = source.index?.count ?? position?.count ?? 0;
  if (!position || count < 6000 || source.groups.length > 1
    || source.getAttribute("uv") || source.getAttribute("skinIndex")
    || Object.keys(source.morphAttributes).length) return source;
  source.computeBoundingBox();
  const bounds = source.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3());
  const cell = Math.max(size.x, size.y, size.z) / divisions;
  if (!Number.isFinite(cell) || cell <= 0) return source;
  const cells = new Map<string, number>();
  const points: number[] = [];
  const remap = new Uint32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const key = `${Math.round((x - bounds.min.x) / cell)},${Math.round((y - bounds.min.y) / cell)},${Math.round((z - bounds.min.z) / cell)}`;
    let index = cells.get(key);
    if (index === undefined) {
      index = points.length / 3;
      cells.set(key, index);
      // Keep an original vertex rather than inventing measurement coordinates.
      points.push(x, y, z);
    }
    remap[i] = index;
  }
  const indices: number[] = [];
  const seen = new Set<string>();
  for (let i = 0; i + 2 < count; i += 3) {
    const a = remap[source.index?.getX(i) ?? i]!;
    const b = remap[source.index?.getX(i + 1) ?? i + 1]!;
    const c = remap[source.index?.getX(i + 2) ?? i + 2]!;
    if (a === b || b === c || c === a) continue;
    const key = [a, b, c].sort((x, y) => x - y).join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    indices.push(a, b, c);
  }
  // Reject collapsed or ineffective approximations.
  if (indices.length < 12 || indices.length >= count * 0.9) return source;
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  result.setIndex(indices);
  result.computeVertexNormals();
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

export function setPieceVisualLevel(mesh: THREE.Mesh, level: PieceVisualLevel): void {
  let data = visuals.get(mesh.geometry);
  if (!data) {
    const detail = mesh.geometry;
    data = { detail, work: cluster(detail, 160), low: cluster(detail, 40) };
    for (const geometry of new Set([data.detail, data.work, data.low])) visuals.set(geometry, data);
  }
  if (!registeredMeshes.has(mesh)) {
    registeredMeshes.add(mesh);
    const originalRaycast = mesh.raycast;
    mesh.raycast = function (raycaster, intersections) {
      const displayed = this.geometry;
      this.geometry = getPieceDetailGeometry(this);
      try { originalRaycast.call(this, raycaster, intersections); }
      finally { this.geometry = displayed; }
    };
  }
  mesh.geometry = level === "DETAIL" ? data.detail : level === "WORK" ? data.work : data.low;
}

export function getPieceVisualGeometries(geometry: THREE.BufferGeometry): readonly THREE.BufferGeometry[] {
  const data = visuals.get(geometry);
  return data ? [data.detail, data.work, data.low] : [geometry];
}
