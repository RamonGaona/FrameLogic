import * as THREE from "three";
import type { DesignModel } from "@framelogic/domain";
import { DesignSceneController } from "../design/DesignSceneController";
import { getPieceDetailGeometry } from "../design/PieceVisualGeometry";

export type ClashKind = "HARD" | "CONTACT" | "CLEARANCE" | "UNCONFIRMED";
export type ClashReviewStatus = "Pendiente" | "Revisado" | "Aceptado" | "Resuelto";

export interface ClashRecord {
  readonly id: string;
  readonly pairKey: string;
  readonly aId: string;
  readonly bId: string;
  readonly aName: string;
  readonly bName: string;
  readonly aCode: string;
  readonly bCode: string;
  readonly aAssembly: string;
  readonly bAssembly: string;
  readonly kind: ClashKind;
  readonly confirmed: boolean;
  readonly location: THREE.Vector3;
  readonly approximateLocation: boolean;
  readonly distanceMm?: number;
  readonly explanation: string;
}

export interface ClashScanOptions {
  readonly selection?: readonly string[];
  readonly toleranceMm: number;
  readonly includeContact: boolean;
  readonly includeClearance: boolean;
  readonly includeHidden?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: (done: number, total: number) => void;
}

export interface ClashScan {
  readonly records: readonly ClashRecord[];
  readonly signature: string;
  readonly pieces: number;
  readonly candidates: number;
}

interface TriangleMesh {
  triangles: THREE.Triangle[];
  vertices: THREE.Vector3[];
  watertight: boolean;
}

interface Part {
  id: string;
  name: string;
  code: string;
  assembly: string;
  bounds: THREE.Box3;
  object: THREE.Object3D;
}

const MAX_TRIANGLES = 4000;
const MAX_VERTICES = 180;
const RAY_DIRECTIONS = [
  new THREE.Vector3(0.913, 0.275, 0.301).normalize(),
  new THREE.Vector3(-0.179, 0.943, 0.281).normalize(),
  new THREE.Vector3(0.217, -0.326, 0.920).normalize(),
];

export function stableClashPair(aId: string, bId: string): string {
  return [aId, bId].sort().join("|");
}

export function clashIdForPair(pair: string): string {
  // Pair-based identity remains stable after sorting, filtering or re-running.
  let hash = 2166136261;
  for (const char of pair) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return "CL-" + (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function isAbortError(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Análisis cancelado", "AbortError");
}

function vertexKey(v: THREE.Vector3): string {
  return [v.x, v.y, v.z].map(n => Math.round(n * 10000)).join(",");
}

function worldTriangles(object: THREE.Object3D): TriangleMesh {
  const triangles: THREE.Triangle[] = [];
  const vertices: THREE.Vector3[] = [];
  const edgeCounts = new Map<string, number>();
  let truncated = false;
  object.updateMatrixWorld(true);
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = getPieceDetailGeometry(child);
    const position = geometry.getAttribute("position");
    if (!position) return;
    const count = geometry.index?.count ?? position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      if (triangles.length >= MAX_TRIANGLES) { truncated = true; return; }
      const get = (index: number): THREE.Vector3 => {
        const j = geometry.index?.getX(index) ?? index;
        return new THREE.Vector3(position.getX(j), position.getY(j), position.getZ(j))
          .applyMatrix4(child.matrixWorld);
      };
      const a = get(i), b = get(i + 1), c = get(i + 2);
      if (new THREE.Triangle(a, b, c).getArea() < 1e-10) continue;
      const triangle = new THREE.Triangle(a, b, c);
      triangles.push(triangle);
      if (vertices.length < MAX_VERTICES) vertices.push(a, b, c);
      const keys = [vertexKey(a), vertexKey(b), vertexKey(c)];
      for (let j = 0; j < 3; j++) {
        const edge = [keys[j]!, keys[(j + 1) % 3]!].sort().join("::");
        edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
      }
    }
  });
  // Non-manifold/open surfaces cannot prove that a sampled point lies in a solid.
  const watertight = !truncated && triangles.length > 3
    && [...edgeCounts.values()].every(count => count === 2);
  return { triangles, vertices, watertight };
}

function pointInsideClosedMesh(point: THREE.Vector3, mesh: TriangleMesh): boolean {
  if (!mesh.watertight) return false;
  for (const direction of RAY_DIRECTIONS) {
    const ray = new THREE.Ray(point, direction);
    const distances: number[] = [];
    for (const triangle of mesh.triangles) {
      const hit = ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, new THREE.Vector3());
      if (hit) {
        const t = hit.distanceTo(point);
        if (t < 0.0001) return false; // On the boundary, not a hard penetration.
        distances.push(t);
      }
    }
    distances.sort((a, b) => a - b);
    const unique: number[] = [];
    for (const distance of distances) {
      if (!unique.length || Math.abs(distance - unique[unique.length - 1]!) > 0.0001) {
        unique.push(distance);
      }
    }
    if (unique.length % 2 !== 1) return false;
  }
  return true;
}

function sampledMinimumDistance(
  a: TriangleMesh, b: TriangleMesh,
): { distance: number; point: THREE.Vector3 } {
  let minimum = Infinity;
  let point = new THREE.Vector3();
  const closest = new THREE.Vector3();
  // This is a conservative candidate estimate, never an exact clearance proof.
  for (const [vertices, faces] of [[a.vertices, b.triangles], [b.vertices, a.triangles]] as const) {
    for (const vertex of vertices) {
      for (const face of faces) {
        face.closestPointToPoint(vertex, closest);
        const distance = vertex.distanceTo(closest);
        if (distance < minimum) {
          minimum = distance;
          point = vertex.clone().add(closest).multiplyScalar(0.5);
          if (minimum <= 0.0001) return { distance: minimum, point };
        }
      }
    }
  }
  return { distance: minimum, point };
}

function classifyPair(
  a: Part, b: Part, geometryA: TriangleMesh, geometryB: TriangleMesh,
  settings: ClashScanOptions,
): ClashRecord | null {
  const pairKey = stableClashPair(a.id, b.id);
  const overlap = a.bounds.clone().intersect(b.bounds);
  const center = overlap.isEmpty()
    ? a.bounds.getCenter(new THREE.Vector3()).add(b.bounds.getCenter(new THREE.Vector3())).multiplyScalar(0.5)
    : overlap.getCenter(new THREE.Vector3());
  const record = (kind: ClashKind, confirmed: boolean, location: THREE.Vector3,
    explanation: string, distanceMm?: number): ClashRecord => ({
    id: clashIdForPair(pairKey), pairKey,
    aId: a.id, bId: b.id, aName: a.name, bName: b.name,
    aCode: a.code, bCode: b.code, aAssembly: a.assembly, bAssembly: b.assembly,
    kind, confirmed, location, approximateLocation: true,
    ...(distanceMm === undefined ? {} : { distanceMm }),
    explanation,
  });

  if (!overlap.isEmpty() && geometryA.watertight && geometryB.watertight) {
    const inner = geometryA.vertices.find(point => pointInsideClosedMesh(point, geometryB))
      ?? geometryB.vertices.find(point => pointInsideClosedMesh(point, geometryA));
    if (inner) {
      return record("HARD", true, inner.clone(),
        "Penetración volumétrica acreditada por un vértice interior de una malla cerrada. Ubicación aproximada; volumen no calculado.");
    }
  }
  const distance = sampledMinimumDistance(geometryA, geometryB);
  const nearContact = distance.distance <= 0.001;
  if (nearContact && settings.includeContact && (overlap.isEmpty()
    || overlap.getSize(new THREE.Vector3()).toArray().some(size => size <= 0.001))) {
    return record("CONTACT", false, distance.point,
      "Posible contacto entre triangulaciones; requiere confirmación B-rep.", distance.distance);
  }
  if (settings.includeClearance && distance.distance > 0.001
    && distance.distance < settings.toleranceMm) {
    return record("CLEARANCE", false, distance.point,
      "Separación estimada mediante puntos y triángulos de detalle; no es una distancia mínima exacta.",
      distance.distance);
  }
  if (!overlap.isEmpty()) {
    // AABB overlap and uncertain mesh geometry must NEVER be reported as a confirmed clash.
    if (geometryA.triangles.length === 0 || geometryB.triangles.length === 0) return null;
    return record("UNCONFIRMED", false, center,
      "Cajas envolventes superpuestas sin penetración demostrada. Revisar la geometría exacta.");
  }
  return null;
}

/** Diagnostic-only engine: never changes the document or persistent instance materials. */
export class ClashDetectionEngine {
  private readonly model: DesignModel;
  private readonly scene: DesignSceneController;
  constructor(model: DesignModel, scene: DesignSceneController) {
    this.model = model;
    this.scene = scene;
  }

  signature(): string {
    return this.model.pieceInstances.getAll().map(instance => {
      const def = this.model.pieceDefinitions.get(instance.definitionId);
      const object = this.scene.getInstanceObject(instance.id);
      object?.updateMatrixWorld(true);
      const meshIds: string[] = [];
      object?.traverse(child => {
        if (child instanceof THREE.Mesh) meshIds.push(getPieceDetailGeometry(child).uuid);
      });
      return [instance.id, instance.definitionId, def?.geometryAssetId,
        instance.layerId, instance.transform.position.x, instance.transform.position.y,
        instance.transform.position.z, instance.transform.rotation.x,
        instance.transform.rotation.y, instance.transform.rotation.z,
        object?.visible, object?.matrixWorld.elements.join(","), meshIds.join(",")].join(":");
    }).join(";");
  }

  private getParts(options: ClashScanOptions): Part[] {
    const selection = options.selection ? new Set(options.selection) : null;
    const owners = new Map<string, string>();
    const assemblies = this.model.assemblies.getAll();
    for (const assembly of assemblies) {
      for (const id of assembly.pieceInstanceIds) {
        const ancestorNames = [assembly.name];
        let parentId = assembly.parentAssemblyId;
        const visited = new Set<string>([assembly.id]);
        while (parentId && !visited.has(parentId)) {
          visited.add(parentId);
          const parent = this.model.assemblies.get(parentId);
          if (!parent) break;
          ancestorNames.unshift(parent.name);
          parentId = parent.parentAssemblyId;
        }
        owners.set(id, ancestorNames.join(" / "));
      }
    }
    return this.model.pieceInstances.getAll().flatMap(instance => {
      if (selection && !selection.has(instance.id)) return [];
      const object = this.scene.getInstanceObject(instance.id);
      if (!object || (!options.includeHidden && !object.visible)) return [];
      const bounds = this.scene.getInstanceWorldBounds(instance.id);
      if (!bounds || bounds.isEmpty()) return [];
      const def = this.model.pieceDefinitions.get(instance.definitionId);
      return [{
        id: instance.id,
        name: instance.name || def?.name || def?.code || instance.id,
        code: def?.code || "",
        assembly: owners.get(instance.id) || "",
        bounds, object,
      }];
    });
  }

  async scan(options: ClashScanOptions): Promise<ClashScan> {
    if (!Number.isFinite(options.toleranceMm) || options.toleranceMm < 0) {
      throw new Error("La tolerancia debe ser un valor no negativo en milímetros.");
    }
    isAbortError(options.signal);
    const signature = this.signature();
    const parts = this.getParts(options).sort((a, b) => a.bounds.min.x - b.bounds.min.x);
    const pairs: Array<[Part, Part]> = [];
    for (let i = 0; i < parts.length; i++) {
      const a = parts[i]!;
      for (let j = i + 1; j < parts.length; j++) {
        const b = parts[j]!;
        if (b.bounds.min.x - options.toleranceMm > a.bounds.max.x) break;
        if (a.bounds.min.y - options.toleranceMm > b.bounds.max.y
          || b.bounds.min.y - options.toleranceMm > a.bounds.max.y
          || a.bounds.min.z - options.toleranceMm > b.bounds.max.z
          || b.bounds.min.z - options.toleranceMm > a.bounds.max.z) continue;
        pairs.push([a, b]);
      }
    }
    const meshCache = new Map<string, TriangleMesh>();
    const meshFor = (part: Part): TriangleMesh => {
      let result = meshCache.get(part.id);
      if (!result) { result = worldTriangles(part.object); meshCache.set(part.id, result); }
      return result;
    };
    const records: ClashRecord[] = [];
    for (let i = 0; i < pairs.length; i++) {
      isAbortError(options.signal);
      if (i % 5 === 0 && this.signature() !== signature) throw new Error("El modelo cambió durante el análisis. Ejecútalo nuevamente.");
      const [a, b] = pairs[i]!;
      const record = classifyPair(a, b, meshFor(a), meshFor(b), options);
      if (record) records.push(record);
      if ((i + 1) % 5 === 0 || i === pairs.length - 1) {
        options.onProgress?.(i + 1, pairs.length);
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }
    if (this.signature() !== signature) throw new Error("El modelo cambió durante el análisis. Ejecútalo nuevamente.");
    return { records, signature, pieces: parts.length, candidates: pairs.length };
  }
}
