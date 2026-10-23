import * as THREE from "three";

import type {
  DesignModel,
  PieceDefinition,
  PieceVector3Data,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

export type GeometryQueryKind =
  | "VERTEX"
  | "EDGE_MIDPOINT"
  | "EDGE_NEAREST"
  | "FACE_POINT"
  | "CIRCLE_CENTER"
  | "CAD_POINT"
  | "CAD_LINE_ENDPOINT"
  | "CAD_LINE_MIDPOINT"
  | "CAD_LINE_NEAREST"
  | "CAD_LINE_INTERSECTION"
  | "REFERENCE_POINT"
  | "REFERENCE_AXIS_ORIGIN"
  | "REFERENCE_AXIS_NEAREST";

export type GeometryPrecision =
  | "MODEL_EXACT"
  | "DERIVED_MESH"
  | "TRIANGULATED_SURFACE";

export interface GeometryQueryResult {
  readonly kind: GeometryQueryKind;
  readonly point: THREE.Vector3;
  readonly sourceId: string;
  readonly relatedSourceIds?: readonly string[];
  readonly object?: THREE.Object3D;
  readonly screenDistancePx: number;
  readonly precision: GeometryPrecision;
}

export interface GeometryQueryOptions {
  readonly pixelTolerance?: number;
  readonly maxResults?: number;
  readonly includeSurface?: boolean;
  readonly excludedSourceIds?: readonly string[];
}

export interface GeometryQueryContext {
  readonly clientX: number;
  readonly clientY: number;
  readonly rect: DOMRect;
  readonly camera: THREE.Camera;
  readonly ray: THREE.Ray;
  readonly pixelTolerance: number;
  readonly excludedSourceIds: ReadonlySet<string>;
  readonly projectWorldPoint: (
    point: THREE.Vector3,
  ) => {
    readonly x: number;
    readonly y: number;
    readonly visible: boolean;
  };
}

/**
 * Extension point for exact geometry sources (for example a future
 * OpenCascade/STEP adapter). Providers are synchronous because snapping
 * runs inside pointer interaction; expensive CAD parsing must be cached
 * before query().
 */
export interface GeometryQueryProvider {
  query(
    context: GeometryQueryContext,
  ): readonly GeometryQueryResult[];
}

interface EdgeRecord {
  readonly aKey: string;
  readonly bKey: string;
  readonly a: THREE.Vector3;
  readonly b: THREE.Vector3;
  readonly normals: THREE.Vector3[];
}

interface MeshFeatureCache {
  readonly vertices: readonly THREE.Vector3[];
  readonly edges: readonly EdgeRecord[];
  readonly centers: readonly THREE.Vector3[];
}

interface NearbyCadLine {
  readonly id: string;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
}

const QUERY_PRIORITY: Readonly<Record<GeometryQueryKind, number>> = {
  CAD_LINE_INTERSECTION: 0,
  REFERENCE_POINT: 1,
  CIRCLE_CENTER: 2,
  VERTEX: 3,
  CAD_POINT: 3,
  CAD_LINE_ENDPOINT: 3,
  EDGE_MIDPOINT: 4,
  CAD_LINE_MIDPOINT: 4,
  REFERENCE_AXIS_ORIGIN: 4,
  REFERENCE_AXIS_NEAREST: 5,
  EDGE_NEAREST: 6,
  CAD_LINE_NEAREST: 6,
  FACE_POINT: 7,
};

export class GeometryQueryEngine {
  private readonly domElement: HTMLElement;
  private readonly cameraProvider: () => THREE.Camera;
  private readonly designScene: DesignSceneController;
  private readonly designModel: DesignModel;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly geometryCache = new Map<string, MeshFeatureCache>();
  private readonly providers = new Set<GeometryQueryProvider>();

  constructor(
    domElement: HTMLElement,
    cameraProvider: () => THREE.Camera,
    designScene: DesignSceneController,
    designModel: DesignModel,
  ) {
    this.domElement = domElement;
    this.cameraProvider = cameraProvider;
    this.designScene = designScene;
    this.designModel = designModel;
  }

  addProvider(
    provider: GeometryQueryProvider,
  ): () => void {
    this.providers.add(provider);
    return () => {
      this.providers.delete(provider);
    };
  }

  clearCache(): void {
    this.geometryCache.clear();
  }

  queryAt(
    clientX: number,
    clientY: number,
    options?: GeometryQueryOptions,
  ): GeometryQueryResult[] {
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return [];
    }

    const camera = this.cameraProvider();
    const pixelTolerance = Math.max(1, options?.pixelTolerance ?? 14);
    const maxResults = Math.max(1, Math.floor(options?.maxResults ?? 32));
    const excludedSourceIds = new Set(options?.excludedSourceIds ?? []);

    this.setPointerFromClient(clientX, clientY, rect);
    this.raycaster.setFromCamera(this.pointer, camera);
    const ray = this.raycaster.ray.clone();
    const results: GeometryQueryResult[] = [];

    this.collectReferenceCandidates(
      results,
      clientX,
      clientY,
      rect,
      camera,
      ray,
      pixelTolerance,
      excludedSourceIds,
    );
    this.collectCadCandidates(
      results,
      clientX,
      clientY,
      rect,
      camera,
      ray,
      pixelTolerance,
      excludedSourceIds,
    );
    this.collectMeshCandidates(
      results,
      clientX,
      clientY,
      rect,
      camera,
      ray,
      pixelTolerance,
      excludedSourceIds,
      options?.includeSurface ?? true,
    );

    const context: GeometryQueryContext = {
      clientX,
      clientY,
      rect,
      camera,
      ray: ray.clone(),
      pixelTolerance,
      excludedSourceIds,
      projectWorldPoint: (point) => this.projectWorldPoint(point, rect, camera),
    };

    for (const provider of this.providers) {
      for (const result of provider.query(context)) {
        if (
          excludedSourceIds.has(result.sourceId)
          || !Number.isFinite(result.screenDistancePx)
          || result.screenDistancePx > pixelTolerance
        ) {
          continue;
        }
        results.push({
          ...result,
          point: result.point.clone(),
        });
      }
    }

    results.sort((first, second) => {
      const priorityDelta = QUERY_PRIORITY[first.kind] - QUERY_PRIORITY[second.kind];
      return priorityDelta !== 0
        ? priorityDelta
        : first.screenDistancePx - second.screenDistancePx;
    });

    return this.dedupeResults(results).slice(0, maxResults);
  }

  findBest(
    clientX: number,
    clientY: number,
    options?: GeometryQueryOptions,
  ): GeometryQueryResult | null {
    return this.queryAt(clientX, clientY, {
      ...options,
      maxResults: 1,
    })[0] ?? null;
  }

  private collectReferenceCandidates(
    results: GeometryQueryResult[],
    clientX: number,
    clientY: number,
    rect: DOMRect,
    camera: THREE.Camera,
    ray: THREE.Ray,
    pixelTolerance: number,
    excludedSourceIds: ReadonlySet<string>,
  ): void {
    for (const instance of this.designModel.pieceInstances.getAll()) {
      if (excludedSourceIds.has(instance.id)) {
        continue;
      }

      const layer = this.designModel.layers.get(instance.layerId);
      if (layer?.visible === false || layer?.snapEnabled === false) {
        continue;
      }

      const object = this.designScene.getInstanceObject(instance.id);
      const definition = this.designModel.pieceDefinitions.get(instance.definitionId);
      if (!object || !object.visible || !definition) {
        continue;
      }

      object.updateMatrixWorld(true);

      for (const snap of definition.snapPoints) {
        const point = this.definitionLocalToWorld(snap.position, definition, object);
        const screenDistancePx = this.screenDistance(
          point,
          clientX,
          clientY,
          rect,
          camera,
        );
        if (screenDistancePx <= pixelTolerance) {
          results.push({
            kind: "REFERENCE_POINT",
            point,
            sourceId: instance.id,
            object,
            screenDistancePx,
            precision: "MODEL_EXACT",
          });
        }
      }

      for (const axis of definition.referenceGeometry.axisLines) {
        const axisOrigin = this.definitionLocalToWorld(axis.origin, definition, object);
        const axisLength = axis.length ?? 1000;
        const axisEndLocal: PieceVector3Data = {
          x: axis.origin.x + axis.direction.x * axisLength,
          y: axis.origin.y + axis.direction.y * axisLength,
          z: axis.origin.z + axis.direction.z * axisLength,
        };
        const axisEnd = this.definitionLocalToWorld(axisEndLocal, definition, object);
        const originDistance = this.screenDistance(
          axisOrigin,
          clientX,
          clientY,
          rect,
          camera,
        );

        if (originDistance <= pixelTolerance) {
          results.push({
            kind: "REFERENCE_AXIS_ORIGIN",
            point: axisOrigin,
            sourceId: instance.id,
            object,
            screenDistancePx: originDistance,
            precision: "MODEL_EXACT",
          });
        }

        const nearest = new THREE.Vector3();
        ray.distanceSqToSegment(axisOrigin, axisEnd, undefined, nearest);
        const nearestDistance = this.screenDistance(
          nearest,
          clientX,
          clientY,
          rect,
          camera,
        );
        if (nearestDistance <= pixelTolerance) {
          results.push({
            kind: "REFERENCE_AXIS_NEAREST",
            point: nearest,
            sourceId: instance.id,
            object,
            screenDistancePx: nearestDistance,
            precision: "MODEL_EXACT",
          });
        }
      }
    }
  }

  private collectCadCandidates(
    results: GeometryQueryResult[],
    clientX: number,
    clientY: number,
    rect: DOMRect,
    camera: THREE.Camera,
    ray: THREE.Ray,
    pixelTolerance: number,
    excludedSourceIds: ReadonlySet<string>,
  ): void {
    for (const cadPoint of this.designModel.cadPoints.getAll()) {
      if (excludedSourceIds.has(cadPoint.id)) {
        continue;
      }
      const layer = this.designModel.layers.get(cadPoint.layerId);
      if (layer?.visible === false || layer?.snapEnabled === false) {
        continue;
      }

      const point = new THREE.Vector3(
        cadPoint.position.x,
        cadPoint.position.y,
        cadPoint.position.z,
      );
      const screenDistancePx = this.screenDistance(
        point,
        clientX,
        clientY,
        rect,
        camera,
      );
      if (screenDistancePx <= pixelTolerance) {
        results.push({
          kind: "CAD_POINT",
          point,
          sourceId: cadPoint.id,
          screenDistancePx,
          precision: "MODEL_EXACT",
        });
      }
    }

    const nearbyLines: NearbyCadLine[] = [];

    for (const line of this.designModel.cadLines.getAll()) {
      if (excludedSourceIds.has(line.id)) {
        continue;
      }
      const layer = this.designModel.layers.get(line.layerId);
      if (layer?.visible === false || layer?.snapEnabled === false) {
        continue;
      }

      const start = new THREE.Vector3(line.start.x, line.start.y, line.start.z);
      const end = new THREE.Vector3(line.end.x, line.end.y, line.end.z);
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const projectedStart = this.projectWorldPoint(start, rect, camera);
      const projectedEnd = this.projectWorldPoint(end, rect, camera);

      if (
        projectedStart.visible
        && projectedEnd.visible
        && this.screenDistanceToSegment(
          clientX,
          clientY,
          projectedStart.x,
          projectedStart.y,
          projectedEnd.x,
          projectedEnd.y,
        ) <= pixelTolerance * 2
      ) {
        nearbyLines.push({ id: line.id, start, end });
      }

      for (const point of [start, end]) {
        const screenDistancePx = this.screenDistance(
          point,
          clientX,
          clientY,
          rect,
          camera,
        );
        if (screenDistancePx <= pixelTolerance) {
          results.push({
            kind: "CAD_LINE_ENDPOINT",
            point,
            sourceId: line.id,
            screenDistancePx,
            precision: "MODEL_EXACT",
          });
        }
      }

      const midpointDistance = this.screenDistance(
        midpoint,
        clientX,
        clientY,
        rect,
        camera,
      );
      if (midpointDistance <= pixelTolerance) {
        results.push({
          kind: "CAD_LINE_MIDPOINT",
          point: midpoint,
          sourceId: line.id,
          screenDistancePx: midpointDistance,
          precision: "MODEL_EXACT",
        });
      }

      const nearest = new THREE.Vector3();
      ray.distanceSqToSegment(start, end, undefined, nearest);
      const nearestDistance = this.screenDistance(
        nearest,
        clientX,
        clientY,
        rect,
        camera,
      );
      if (nearestDistance <= pixelTolerance) {
        results.push({
          kind: "CAD_LINE_NEAREST",
          point: nearest,
          sourceId: line.id,
          screenDistancePx: nearestDistance,
          precision: "MODEL_EXACT",
        });
      }
    }

    for (let firstIndex = 0; firstIndex < nearbyLines.length; firstIndex += 1) {
      const first = nearbyLines[firstIndex];
      if (!first) {
        continue;
      }
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < nearbyLines.length;
        secondIndex += 1
      ) {
        const second = nearbyLines[secondIndex];
        if (!second) {
          continue;
        }
        const point = this.getSegmentIntersection3D(
          first.start,
          first.end,
          second.start,
          second.end,
        );
        if (!point) {
          continue;
        }
        const screenDistancePx = this.screenDistance(
          point,
          clientX,
          clientY,
          rect,
          camera,
        );
        if (screenDistancePx <= pixelTolerance) {
          results.push({
            kind: "CAD_LINE_INTERSECTION",
            point,
            sourceId: first.id,
            relatedSourceIds: [first.id, second.id],
            screenDistancePx,
            precision: "MODEL_EXACT",
          });
        }
      }
    }
  }

  private collectMeshCandidates(
    results: GeometryQueryResult[],
    clientX: number,
    clientY: number,
    rect: DOMRect,
    camera: THREE.Camera,
    ray: THREE.Ray,
    pixelTolerance: number,
    excludedSourceIds: ReadonlySet<string>,
    includeSurface: boolean,
  ): void {
    this.setPointerFromClient(clientX, clientY, rect);
    this.raycaster.setFromCamera(this.pointer, camera);

    if (includeSurface) {
      const directIntersections = this.raycaster.intersectObjects(
        this.designScene.getInstanceObjects(),
        true,
      );
      for (const intersection of directIntersections.slice(0, 3)) {
        const sourceId = this.findInstanceId(intersection.object);
        if (
          !sourceId
          || excludedSourceIds.has(sourceId)
          || !this.isPieceSnapEnabled(sourceId)
        ) {
          continue;
        }
        results.push({
          kind: "FACE_POINT",
          point: intersection.point.clone(),
          sourceId,
          object: intersection.object,
          screenDistancePx: 0,
          precision: "TRIANGULATED_SURFACE",
        });
      }
    }

    const meshes = this.collectNearbyMeshes(
      clientX,
      clientY,
      rect,
      camera,
      pixelTolerance,
    );

    for (const mesh of meshes) {
      const sourceId = this.findInstanceId(mesh);
      if (
        !sourceId
        || excludedSourceIds.has(sourceId)
        || !this.isPieceSnapEnabled(sourceId)
      ) {
        continue;
      }
      if (!(mesh.geometry instanceof THREE.BufferGeometry)) {
        continue;
      }

      mesh.updateMatrixWorld(true);
      const cached = this.getMeshFeatures(mesh.geometry);

      for (const localPoint of cached.vertices) {
        const point = localPoint.clone().applyMatrix4(mesh.matrixWorld);
        const screenDistancePx = this.screenDistance(
          point,
          clientX,
          clientY,
          rect,
          camera,
        );
        if (screenDistancePx <= pixelTolerance) {
          results.push({
            kind: "VERTEX",
            point,
            sourceId,
            object: mesh,
            screenDistancePx,
            precision: "DERIVED_MESH",
          });
        }
      }

      for (const localCenter of cached.centers) {
        const point = localCenter.clone().applyMatrix4(mesh.matrixWorld);
        const screenDistancePx = this.screenDistance(
          point,
          clientX,
          clientY,
          rect,
          camera,
        );
        if (screenDistancePx <= pixelTolerance) {
          results.push({
            kind: "CIRCLE_CENTER",
            point,
            sourceId,
            object: mesh,
            screenDistancePx,
            precision: "DERIVED_MESH",
          });
        }
      }

      for (const edge of cached.edges) {
        const a = edge.a.clone().applyMatrix4(mesh.matrixWorld);
        const b = edge.b.clone().applyMatrix4(mesh.matrixWorld);
        const midpoint = a.clone().add(b).multiplyScalar(0.5);
        const midpointDistance = this.screenDistance(
          midpoint,
          clientX,
          clientY,
          rect,
          camera,
        );
        if (midpointDistance <= pixelTolerance) {
          results.push({
            kind: "EDGE_MIDPOINT",
            point: midpoint,
            sourceId,
            object: mesh,
            screenDistancePx: midpointDistance,
            precision: "DERIVED_MESH",
          });
        }

        const nearest = new THREE.Vector3();
        ray.distanceSqToSegment(a, b, undefined, nearest);
        const nearestDistance = this.screenDistance(
          nearest,
          clientX,
          clientY,
          rect,
          camera,
        );
        if (nearestDistance <= pixelTolerance) {
          results.push({
            kind: "EDGE_NEAREST",
            point: nearest,
            sourceId,
            object: mesh,
            screenDistancePx: nearestDistance,
            precision: "DERIVED_MESH",
          });
        }
      }
    }
  }

  private collectNearbyMeshes(
    clientX: number,
    clientY: number,
    rect: DOMRect,
    camera: THREE.Camera,
    pixelTolerance: number,
  ): Set<THREE.Mesh> {
    const meshes = new Set<THREE.Mesh>();
    const radius = Math.max(4, pixelTolerance * 0.8);
    const diagonal = radius * Math.SQRT1_2;
    const offsets: readonly [number, number][] = [
      [0, 0],
      [radius, 0],
      [-radius, 0],
      [0, radius],
      [0, -radius],
      [diagonal, diagonal],
      [-diagonal, diagonal],
      [diagonal, -diagonal],
      [-diagonal, -diagonal],
    ];

    for (const [offsetX, offsetY] of offsets) {
      this.setPointerFromClient(clientX + offsetX, clientY + offsetY, rect);
      this.raycaster.setFromCamera(this.pointer, camera);
      const intersections = this.raycaster.intersectObjects(
        this.designScene.getInstanceObjects(),
        true,
      );
      for (const intersection of intersections.slice(0, 6)) {
        if (intersection.object instanceof THREE.Mesh) {
          meshes.add(intersection.object);
        }
      }
    }
    return meshes;
  }

  private getMeshFeatures(
    geometry: THREE.BufferGeometry,
  ): MeshFeatureCache {
    const cached = this.geometryCache.get(geometry.uuid);
    if (cached) {
      return cached;
    }
    const built = this.buildMeshFeatures(geometry);
    this.geometryCache.set(geometry.uuid, built);
    return built;
  }

  private buildMeshFeatures(
    geometry: THREE.BufferGeometry,
  ): MeshFeatureCache {
    const position = geometry.getAttribute("position");
    if (!position || position.itemSize < 3 || position.count < 3) {
      return { vertices: [], edges: [], centers: [] };
    }

    const vertices = new Map<string, THREE.Vector3>();
    const edges = new Map<string, EdgeRecord>();
    const index = geometry.index;
    const triangleCount = index
      ? Math.floor(index.count / 3)
      : Math.floor(position.count / 3);
    const readVertex = (vertexIndex: number): THREE.Vector3 => new THREE.Vector3(
      position.getX(vertexIndex),
      position.getY(vertexIndex),
      position.getZ(vertexIndex),
    );

    for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
      const ia = index ? index.getX(triangleIndex * 3) : triangleIndex * 3;
      const ib = index ? index.getX(triangleIndex * 3 + 1) : triangleIndex * 3 + 1;
      const ic = index ? index.getX(triangleIndex * 3 + 2) : triangleIndex * 3 + 2;
      const a = readVertex(ia);
      const b = readVertex(ib);
      const c = readVertex(ic);
      const aKey = this.vertexKey(a);
      const bKey = this.vertexKey(b);
      const cKey = this.vertexKey(c);
      vertices.set(aKey, a);
      vertices.set(bKey, b);
      vertices.set(cKey, c);

      const normal = b.clone().sub(a).cross(c.clone().sub(a));
      if (normal.lengthSq() > 1e-20) {
        normal.normalize();
      }
      this.addEdge(edges, aKey, bKey, a, b, normal);
      this.addEdge(edges, bKey, cKey, b, c, normal);
      this.addEdge(edges, cKey, aKey, c, a, normal);
    }

    const creaseThreshold = THREE.MathUtils.degToRad(20);
    const semanticEdges: EdgeRecord[] = [];
    for (const edge of edges.values()) {
      if (edge.normals.length === 1) {
        semanticEdges.push(edge);
        continue;
      }
      let isCrease = false;
      for (
        let firstIndex = 0;
        firstIndex < edge.normals.length && !isCrease;
        firstIndex += 1
      ) {
        for (
          let secondIndex = firstIndex + 1;
          secondIndex < edge.normals.length;
          secondIndex += 1
        ) {
          const first = edge.normals[firstIndex];
          const second = edge.normals[secondIndex];
          if (!first || !second) {
            continue;
          }
          const dot = THREE.MathUtils.clamp(first.dot(second), -1, 1);
          if (Math.acos(dot) >= creaseThreshold) {
            isCrease = true;
            break;
          }
        }
      }
      if (isCrease) {
        semanticEdges.push(edge);
      }
    }

    const endpointKeys = new Set<string>();
    for (const edge of semanticEdges) {
      endpointKeys.add(edge.aKey);
      endpointKeys.add(edge.bKey);
    }
    const semanticVertices: THREE.Vector3[] = [];
    for (const key of endpointKeys) {
      const point = vertices.get(key);
      if (point) {
        semanticVertices.push(point.clone());
      }
    }

    return {
      vertices: semanticVertices,
      edges: semanticEdges,
      centers: this.findCircularCenters(semanticEdges, vertices),
    };
  }

  private addEdge(
    edges: Map<string, EdgeRecord>,
    aKey: string,
    bKey: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    normal: THREE.Vector3,
  ): void {
    const firstKey = aKey < bKey ? aKey : bKey;
    const secondKey = aKey < bKey ? bKey : aKey;
    const key = `${firstKey}|${secondKey}`;
    const current = edges.get(key);
    if (current) {
      if (normal.lengthSq() > 0) {
        current.normals.push(normal.clone());
      }
      return;
    }
    edges.set(key, {
      aKey: firstKey,
      bKey: secondKey,
      a: firstKey === aKey ? a.clone() : b.clone(),
      b: secondKey === bKey ? b.clone() : a.clone(),
      normals: normal.lengthSq() > 0 ? [normal.clone()] : [],
    });
  }

  private findCircularCenters(
    edges: readonly EdgeRecord[],
    vertices: ReadonlyMap<string, THREE.Vector3>,
  ): THREE.Vector3[] {
    const adjacency = new Map<string, Set<string>>();
    for (const edge of edges) {
      this.addNeighbor(adjacency, edge.aKey, edge.bKey);
      this.addNeighbor(adjacency, edge.bKey, edge.aKey);
    }

    const visited = new Set<string>();
    const centers: THREE.Vector3[] = [];
    for (const start of adjacency.keys()) {
      if (visited.has(start)) {
        continue;
      }
      const component: string[] = [];
      const stack = [start];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || visited.has(current)) {
          continue;
        }
        visited.add(current);
        component.push(current);
        for (const neighbor of adjacency.get(current) ?? []) {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }

      if (
        component.length < 6
        || !component.every((key) => (adjacency.get(key)?.size ?? 0) === 2)
      ) {
        continue;
      }
      const points = component
        .map((key) => vertices.get(key))
        .filter((point): point is THREE.Vector3 => point !== undefined);
      const center = this.fitCircularLoop(points);
      if (center) {
        centers.push(center);
      }
    }
    return centers;
  }

  private fitCircularLoop(
    points: readonly THREE.Vector3[],
  ): THREE.Vector3 | null {
    if (points.length < 6) {
      return null;
    }
    const center = new THREE.Vector3();
    for (const point of points) {
      center.add(point);
    }
    center.multiplyScalar(1 / points.length);

    let radius = 0;
    const distances: number[] = [];
    for (const point of points) {
      const distance = point.distanceTo(center);
      distances.push(distance);
      radius += distance;
    }
    radius /= points.length;
    if (radius <= 1e-9) {
      return null;
    }

    let maxRadialError = 0;
    for (const distance of distances) {
      maxRadialError = Math.max(maxRadialError, Math.abs(distance - radius));
    }
    if (maxRadialError / radius > 0.02) {
      return null;
    }

    const normal = this.findPlaneNormal(points);
    if (!normal) {
      return null;
    }
    let maxPlaneError = 0;
    for (const point of points) {
      maxPlaneError = Math.max(
        maxPlaneError,
        Math.abs(point.clone().sub(center).dot(normal)),
      );
    }
    return maxPlaneError / radius <= 0.01 ? center : null;
  }

  private findPlaneNormal(
    points: readonly THREE.Vector3[],
  ): THREE.Vector3 | null {
    const origin = points[0];
    if (!origin) {
      return null;
    }
    for (let index = 1; index < points.length - 1; index += 1) {
      const first = points[index];
      const second = points[index + 1];
      if (!first || !second) {
        continue;
      }
      const normal = first.clone().sub(origin).cross(second.clone().sub(origin));
      if (normal.lengthSq() > 1e-12) {
        return normal.normalize();
      }
    }
    return null;
  }

  private getSegmentIntersection3D(
    firstStart: THREE.Vector3,
    firstEnd: THREE.Vector3,
    secondStart: THREE.Vector3,
    secondEnd: THREE.Vector3,
  ): THREE.Vector3 | null {
    const firstDirection = firstEnd.clone().sub(firstStart);
    const secondDirection = secondEnd.clone().sub(secondStart);
    const relativeStart = firstStart.clone().sub(secondStart);
    const firstLengthSquared = firstDirection.lengthSq();
    const secondLengthSquared = secondDirection.lengthSq();
    if (firstLengthSquared <= 1e-18 || secondLengthSquared <= 1e-18) {
      return null;
    }

    const firstSecondDot = firstDirection.dot(secondDirection);
    const firstRelativeDot = firstDirection.dot(relativeStart);
    const secondRelativeDot = secondDirection.dot(relativeStart);
    const denominator = firstLengthSquared * secondLengthSquared
      - firstSecondDot * firstSecondDot;
    if (
      Math.abs(denominator)
      <= 1e-14 * firstLengthSquared * secondLengthSquared
    ) {
      return null;
    }

    const firstParameter = (
      firstSecondDot * secondRelativeDot
      - secondLengthSquared * firstRelativeDot
    ) / denominator;
    const secondParameter = (
      firstLengthSquared * secondRelativeDot
      - firstSecondDot * firstRelativeDot
    ) / denominator;
    const parameterTolerance = 1e-9;
    if (
      firstParameter < -parameterTolerance
      || firstParameter > 1 + parameterTolerance
      || secondParameter < -parameterTolerance
      || secondParameter > 1 + parameterTolerance
    ) {
      return null;
    }

    const firstPoint = firstStart.clone().addScaledVector(
      firstDirection,
      THREE.MathUtils.clamp(firstParameter, 0, 1),
    );
    const secondPoint = secondStart.clone().addScaledVector(
      secondDirection,
      THREE.MathUtils.clamp(secondParameter, 0, 1),
    );
    const scale = Math.max(
      1,
      Math.sqrt(firstLengthSquared),
      Math.sqrt(secondLengthSquared),
    );
    const worldTolerance = Math.max(1e-8, scale * 1e-9);
    if (
      firstPoint.distanceToSquared(secondPoint)
      > worldTolerance * worldTolerance
    ) {
      return null;
    }
    return firstPoint.add(secondPoint).multiplyScalar(0.5);
  }

  private definitionLocalToWorld(
    local: PieceVector3Data,
    definition: PieceDefinition,
    object: THREE.Object3D,
  ): THREE.Vector3 {
    const coordinateSystem = definition.coordinateSystem;
    const point = new THREE.Vector3(
      coordinateSystem.origin.x,
      coordinateSystem.origin.y,
      coordinateSystem.origin.z,
    );
    point
      .addScaledVector(
        new THREE.Vector3(
          coordinateSystem.xAxis.x,
          coordinateSystem.xAxis.y,
          coordinateSystem.xAxis.z,
        ),
        local.x,
      )
      .addScaledVector(
        new THREE.Vector3(
          coordinateSystem.yAxis.x,
          coordinateSystem.yAxis.y,
          coordinateSystem.yAxis.z,
        ),
        local.y,
      )
      .addScaledVector(
        new THREE.Vector3(
          coordinateSystem.zAxis.x,
          coordinateSystem.zAxis.y,
          coordinateSystem.zAxis.z,
        ),
        local.z,
      );
    return point.applyMatrix4(object.matrixWorld);
  }

  private isPieceSnapEnabled(
    instanceId: string,
  ): boolean {
    const instance = this.designModel.pieceInstances.get(instanceId);
    if (!instance) {
      return false;
    }
    const layer = this.designModel.layers.get(instance.layerId);
    return layer?.visible !== false && layer?.snapEnabled !== false;
  }

  private screenDistance(
    point: THREE.Vector3,
    clientX: number,
    clientY: number,
    rect: DOMRect,
    camera: THREE.Camera,
  ): number {
    const projected = this.projectWorldPoint(point, rect, camera);
    if (!projected.visible) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.hypot(clientX - projected.x, clientY - projected.y);
  }

  private projectWorldPoint(
    point: THREE.Vector3,
    rect: DOMRect,
    camera: THREE.Camera,
  ): {
    readonly x: number;
    readonly y: number;
    readonly visible: boolean;
  } {
    const cameraPoint = point.clone().applyMatrix4(camera.matrixWorldInverse);
    const projected = point.clone().project(camera);
    return {
      x: rect.left + (projected.x + 1) * 0.5 * rect.width,
      y: rect.top + (1 - projected.y) * 0.5 * rect.height,
      visible: cameraPoint.z < 0 && projected.z >= -1 && projected.z <= 1,
    };
  }

  private screenDistanceToSegment(
    x: number,
    y: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): number {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared <= 1e-12) {
      return Math.hypot(x - ax, y - ay);
    }
    const parameter = THREE.MathUtils.clamp(
      ((x - ax) * dx + (y - ay) * dy) / lengthSquared,
      0,
      1,
    );
    return Math.hypot(
      x - (ax + parameter * dx),
      y - (ay + parameter * dy),
    );
  }

  private setPointerFromClient(
    clientX: number,
    clientY: number,
    rect: DOMRect,
  ): void {
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private findInstanceId(
    object: THREE.Object3D,
  ): string | null {
    let current: THREE.Object3D | null = object;
    while (current) {
      const frameLogic = current.userData["frameLogic"];
      if (
        frameLogic
        && frameLogic.entityType === "PieceInstance"
        && typeof frameLogic.instanceId === "string"
      ) {
        return frameLogic.instanceId;
      }
      current = current.parent;
    }
    return null;
  }

  private vertexKey(
    point: THREE.Vector3,
  ): string {
    return [point.x, point.y, point.z]
      .map((value) => value.toFixed(8))
      .join(",");
  }

  private addNeighbor(
    adjacency: Map<string, Set<string>>,
    key: string,
    neighbor: string,
  ): void {
    let neighbors = adjacency.get(key);
    if (!neighbors) {
      neighbors = new Set<string>();
      adjacency.set(key, neighbors);
    }
    neighbors.add(neighbor);
  }

  private dedupeResults(
    results: readonly GeometryQueryResult[],
  ): GeometryQueryResult[] {
    const output: GeometryQueryResult[] = [];
    for (const result of results) {
      const duplicate = output.some(
        (current) => current.kind === result.kind
          && current.sourceId === result.sourceId
          && current.point.distanceToSquared(result.point) <= 1e-16,
      );
      if (!duplicate) {
        output.push(result);
      }
    }
    return output;
  }

  dispose(): void {
    this.geometryCache.clear();
    this.providers.clear();
  }
}
