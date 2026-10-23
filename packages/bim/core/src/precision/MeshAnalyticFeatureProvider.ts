import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  GeometryQueryContext,
  GeometryQueryProvider,
  GeometryQueryResult,
} from "./GeometryQueryEngine";

interface LocalEdge {
  readonly a: THREE.Vector3;
  readonly b: THREE.Vector3;
}

interface LocalCircle {
  readonly center: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly radius: number;
}

interface CachedAnalyticFeatures {
  readonly edges: readonly LocalEdge[];
  readonly circles: readonly LocalCircle[];
}

interface WorldEdge {
  readonly sourceId: string;
  readonly object: THREE.Object3D;
  readonly a: THREE.Vector3;
  readonly b: THREE.Vector3;
}

interface WorldCadLine {
  readonly id: string;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
}

/**
 * Extracts useful analytic-like features from the rendered mesh without
 * pretending that the triangulation is exact CAD geometry. It is intentionally
 * replaceable by a GeometryQueryProvider backed by OpenCascade later.
 */
export class MeshAnalyticFeatureProvider implements GeometryQueryProvider {
  private readonly designModel: DesignModel;
  private readonly designScene: DesignSceneController;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly cache = new Map<string, CachedAnalyticFeatures>();

  constructor(
    designModel: DesignModel,
    designScene: DesignSceneController,
  ) {
    this.designModel = designModel;
    this.designScene = designScene;
  }

  query(
    context: GeometryQueryContext,
  ): readonly GeometryQueryResult[] {
    const results: GeometryQueryResult[] = [];
    const meshes = this.collectNearbyMeshes(context);
    const nearbyEdges: WorldEdge[] = [];

    for (const mesh of meshes) {
      const sourceId = this.findInstanceId(mesh);
      if (
        !sourceId
        || context.excludedSourceIds.has(sourceId)
        || !this.isPieceSnapEnabled(sourceId)
        || !(mesh.geometry instanceof THREE.BufferGeometry)
      ) {
        continue;
      }

      mesh.updateMatrixWorld(true);
      const features = this.getFeatures(mesh.geometry);

      for (const circle of features.circles) {
        const center = circle.center.clone().applyMatrix4(mesh.matrixWorld);
        const normal = circle.normal.clone().transformDirection(mesh.matrixWorld);
        if (normal.lengthSq() <= 1e-20) {
          continue;
        }

        const worldRadiusPoint = circle.center.clone()
          .addScaledVector(circle.normal, circle.radius)
          .applyMatrix4(mesh.matrixWorld);
        const worldRadius = Math.max(
          center.distanceTo(worldRadiusPoint),
          1e-6,
        );
        const axisHalfLength = Math.max(worldRadius * 100, 1);
        const axisStart = center.clone().addScaledVector(normal, -axisHalfLength);
        const axisEnd = center.clone().addScaledVector(normal, axisHalfLength);
        const nearest = new THREE.Vector3();
        context.ray.distanceSqToSegment(
          axisStart,
          axisEnd,
          undefined,
          nearest,
        );
        const screenDistancePx = this.screenDistance(
          nearest,
          context,
        );

        if (screenDistancePx <= context.pixelTolerance) {
          results.push({
            kind: "REFERENCE_AXIS_NEAREST",
            point: nearest,
            sourceId,
            object: mesh,
            screenDistancePx,
            precision: "DERIVED_MESH",
          });
        }
      }

      for (const edge of features.edges) {
        const a = edge.a.clone().applyMatrix4(mesh.matrixWorld);
        const b = edge.b.clone().applyMatrix4(mesh.matrixWorld);
        const projectedA = context.projectWorldPoint(a);
        const projectedB = context.projectWorldPoint(b);
        if (
          !projectedA.visible
          || !projectedB.visible
          || this.screenDistanceToSegment(
            context.clientX,
            context.clientY,
            projectedA.x,
            projectedA.y,
            projectedB.x,
            projectedB.y,
          ) > context.pixelTolerance * 2
        ) {
          continue;
        }
        nearbyEdges.push({
          sourceId,
          object: mesh,
          a,
          b,
        });
      }
    }

    const nearbyCadLines = this.collectNearbyCadLines(context);
    for (const line of nearbyCadLines) {
      for (const edge of nearbyEdges) {
        const point = this.getSegmentIntersection3D(
          line.start,
          line.end,
          edge.a,
          edge.b,
        );
        if (!point) {
          continue;
        }
        const screenDistancePx = this.screenDistance(point, context);
        if (screenDistancePx <= context.pixelTolerance) {
          results.push({
            kind: "CAD_LINE_INTERSECTION",
            point,
            sourceId: line.id,
            relatedSourceIds: [line.id, edge.sourceId],
            object: edge.object,
            screenDistancePx,
            precision: "DERIVED_MESH",
          });
        }
      }
    }

    return results;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private collectNearbyMeshes(
    context: GeometryQueryContext,
  ): Set<THREE.Mesh> {
    const meshes = new Set<THREE.Mesh>();
    const radius = Math.max(4, context.pixelTolerance * 0.8);
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
      this.pointer.x = (
        (context.clientX + offsetX - context.rect.left)
        / context.rect.width
      ) * 2 - 1;
      this.pointer.y = -(
        (context.clientY + offsetY - context.rect.top)
        / context.rect.height
      ) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, context.camera);

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

  private collectNearbyCadLines(
    context: GeometryQueryContext,
  ): WorldCadLine[] {
    const output: WorldCadLine[] = [];

    for (const line of this.designModel.cadLines.getAll()) {
      if (context.excludedSourceIds.has(line.id)) {
        continue;
      }
      const layer = this.designModel.layers.get(line.layerId);
      if (layer?.visible === false || layer?.snapEnabled === false) {
        continue;
      }

      const start = new THREE.Vector3(line.start.x, line.start.y, line.start.z);
      const end = new THREE.Vector3(line.end.x, line.end.y, line.end.z);
      const projectedStart = context.projectWorldPoint(start);
      const projectedEnd = context.projectWorldPoint(end);
      if (
        projectedStart.visible
        && projectedEnd.visible
        && this.screenDistanceToSegment(
          context.clientX,
          context.clientY,
          projectedStart.x,
          projectedStart.y,
          projectedEnd.x,
          projectedEnd.y,
        ) <= context.pixelTolerance * 2
      ) {
        output.push({
          id: line.id,
          start,
          end,
        });
      }
    }

    return output;
  }

  private getFeatures(
    geometry: THREE.BufferGeometry,
  ): CachedAnalyticFeatures {
    const cached = this.cache.get(geometry.uuid);
    if (cached) {
      return cached;
    }

    const edgesGeometry = new THREE.EdgesGeometry(geometry, 20);
    const position = edgesGeometry.getAttribute("position");
    const edges: LocalEdge[] = [];

    if (position && position.itemSize >= 3) {
      for (let index = 0; index + 1 < position.count; index += 2) {
        edges.push({
          a: new THREE.Vector3(
            position.getX(index),
            position.getY(index),
            position.getZ(index),
          ),
          b: new THREE.Vector3(
            position.getX(index + 1),
            position.getY(index + 1),
            position.getZ(index + 1),
          ),
        });
      }
    }

    edgesGeometry.dispose();
    const built: CachedAnalyticFeatures = {
      edges,
      circles: this.findCircularFeatures(edges),
    };
    this.cache.set(geometry.uuid, built);
    return built;
  }

  private findCircularFeatures(
    edges: readonly LocalEdge[],
  ): LocalCircle[] {
    const vertices = new Map<string, THREE.Vector3>();
    const adjacency = new Map<string, Set<string>>();

    for (const edge of edges) {
      const aKey = this.vertexKey(edge.a);
      const bKey = this.vertexKey(edge.b);
      vertices.set(aKey, edge.a);
      vertices.set(bKey, edge.b);
      this.addNeighbor(adjacency, aKey, bKey);
      this.addNeighbor(adjacency, bKey, aKey);
    }

    const visited = new Set<string>();
    const circles: LocalCircle[] = [];

    for (const start of adjacency.keys()) {
      if (visited.has(start)) {
        continue;
      }
      const stack = [start];
      const component: string[] = [];
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
      const circle = this.fitCircle(points);
      if (circle) {
        circles.push(circle);
      }
    }

    return circles;
  }

  private fitCircle(
    points: readonly THREE.Vector3[],
  ): LocalCircle | null {
    if (points.length < 6) {
      return null;
    }

    const center = new THREE.Vector3();
    for (const point of points) {
      center.add(point);
    }
    center.multiplyScalar(1 / points.length);

    const normal = this.findPlaneNormal(points);
    if (!normal) {
      return null;
    }

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
    let maxPlaneError = 0;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const distance = distances[index];
      if (!point || distance === undefined) {
        continue;
      }
      maxRadialError = Math.max(
        maxRadialError,
        Math.abs(distance - radius),
      );
      maxPlaneError = Math.max(
        maxPlaneError,
        Math.abs(point.clone().sub(center).dot(normal)),
      );
    }

    if (
      maxRadialError / radius > 0.02
      || maxPlaneError / radius > 0.01
    ) {
      return null;
    }

    return {
      center,
      normal,
      radius,
    };
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
    const tolerance = 1e-9;
    if (
      firstParameter < -tolerance
      || firstParameter > 1 + tolerance
      || secondParameter < -tolerance
      || secondParameter > 1 + tolerance
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

  private screenDistance(
    point: THREE.Vector3,
    context: GeometryQueryContext,
  ): number {
    const projected = context.projectWorldPoint(point);
    if (!projected.visible) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.hypot(
      context.clientX - projected.x,
      context.clientY - projected.y,
    );
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

  dispose(): void {
    this.cache.clear();
  }
}
