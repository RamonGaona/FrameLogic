import * as THREE from "three";

import type {
  DesignSnapResult,
  DesignSnapType,
} from "../interaction/DesignSnapController";

import type {
  GeometryQueryResult,
} from "./GeometryQueryEngine";

import {
  GeometryQueryEngine,
} from "./GeometryQueryEngine";


export interface PrecisionSnapDetails {
  readonly snap: DesignSnapResult;
  readonly geometry: GeometryQueryResult | null;
  readonly screenDistancePx: number;
  readonly source: "LEGACY" | "PRECISION";
}


const SNAP_PRIORITY: Readonly<Record<DesignSnapType, number>> = {
  CUSTOM: 0,
  CONNECTION: 0,
  ORIGIN: 0,
  INTERSECTION: 1,
  CENTER: 2,
  ENDPOINT: 3,
  POINT: 3,
  MIDPOINT: 4,
  REFERENCE: 5,
};


export class PrecisionSnapEngine {
  private readonly domElement: HTMLElement;
  private readonly cameraProvider: () => THREE.Camera;
  private readonly geometryQuery: GeometryQueryEngine;
  private readonly legacyFindSnap: (
    clientX: number,
    clientY: number,
  ) => DesignSnapResult | null;
  private readonly excludedSourceIdsProvider: () => readonly string[];
  private readonly enabledProvider: () => boolean;
  private readonly pixelTolerance: number;


  constructor(
    domElement: HTMLElement,
    cameraProvider: () => THREE.Camera,
    geometryQuery: GeometryQueryEngine,
    legacyFindSnap: (
      clientX: number,
      clientY: number,
    ) => DesignSnapResult | null,
    excludedSourceIdsProvider?: () => readonly string[],
    enabledProvider?: () => boolean,
    pixelTolerance = 14,
  ) {
    this.domElement = domElement;
    this.cameraProvider = cameraProvider;
    this.geometryQuery = geometryQuery;
    this.legacyFindSnap = legacyFindSnap;
    this.excludedSourceIdsProvider = excludedSourceIdsProvider
      ?? (() => []);
    this.enabledProvider = enabledProvider
      ?? (() => true);
    this.pixelTolerance = Math.max(
      1,
      pixelTolerance,
    );
  }


  findSnap(
    clientX: number,
    clientY: number,
  ): DesignSnapResult | null {
    return this.findSnapDetails(
      clientX,
      clientY,
    )?.snap ?? null;
  }


  findSnapDetails(
    clientX: number,
    clientY: number,
  ): PrecisionSnapDetails | null {
    if (
      !this.enabledProvider()
    ) {
      return null;
    }

    const candidates: PrecisionSnapDetails[] = [];
    const legacy = this.legacyFindSnap(
      clientX,
      clientY,
    );

    if (
      legacy
    ) {
      candidates.push({
        snap: {
          type: legacy.type,
          point: legacy.point.clone(),
          instanceId: legacy.instanceId,
        },
        geometry: null,
        screenDistancePx: this.screenDistance(
          legacy.point,
          clientX,
          clientY,
        ),
        source: "LEGACY",
      });
    }

    const geometryCandidates = this.geometryQuery.queryAt(
      clientX,
      clientY,
      {
        pixelTolerance: this.pixelTolerance,
        maxResults: 24,
        includeSurface: true,
        excludedSourceIds: this.excludedSourceIdsProvider(),
      },
    );

    for (
      const geometry
      of geometryCandidates
    ) {
      const snapType = this.mapGeometryKind(
        geometry,
      );

      if (
        !snapType
      ) {
        continue;
      }

      candidates.push({
        snap: {
          type: snapType,
          point: geometry.point.clone(),
          instanceId: geometry.sourceId,
        },
        geometry,
        screenDistancePx: geometry.screenDistancePx,
        source: "PRECISION",
      });
    }

    candidates.sort(
      (
        first,
        second,
      ) => {
        const priorityDelta = SNAP_PRIORITY[first.snap.type]
          - SNAP_PRIORITY[second.snap.type];

        if (
          priorityDelta !== 0
        ) {
          return priorityDelta;
        }

        if (
          first.source !== second.source
        ) {
          if (
            first.geometry?.precision === "MODEL_EXACT"
          ) {
            return -1;
          }

          if (
            second.geometry?.precision === "MODEL_EXACT"
          ) {
            return 1;
          }
        }

        return first.screenDistancePx
          - second.screenDistancePx;
      },
    );

    return candidates[0] ?? null;
  }


  queryGeometry(
    clientX: number,
    clientY: number,
  ): GeometryQueryResult[] {
    return this.geometryQuery.queryAt(
      clientX,
      clientY,
      {
        pixelTolerance: this.pixelTolerance,
        excludedSourceIds: this.excludedSourceIdsProvider(),
      },
    );
  }


  private mapGeometryKind(
    geometry: GeometryQueryResult,
  ): DesignSnapType | null {
    switch (
      geometry.kind
    ) {
      case "CAD_LINE_INTERSECTION":
        return "INTERSECTION";

      case "CIRCLE_CENTER":
        return "CENTER";

      case "VERTEX":
      case "CAD_LINE_ENDPOINT":
        return "ENDPOINT";

      case "CAD_POINT":
        return "POINT";

      case "EDGE_MIDPOINT":
      case "CAD_LINE_MIDPOINT":
        return "MIDPOINT";

      case "REFERENCE_POINT":
        return "CUSTOM";

      case "REFERENCE_AXIS_ORIGIN":
      case "REFERENCE_AXIS_NEAREST":
      case "EDGE_NEAREST":
      case "CAD_LINE_NEAREST":
      case "FACE_POINT":
        return "REFERENCE";

      default:
        return null;
    }
  }


  private screenDistance(
    point: THREE.Vector3,
    clientX: number,
    clientY: number,
  ): number {
    const rect = this.domElement.getBoundingClientRect();

    if (
      rect.width <= 0
      || rect.height <= 0
    ) {
      return Number.POSITIVE_INFINITY;
    }

    const camera = this.cameraProvider();
    const projected = point.clone()
      .project(camera);

    if (
      projected.z < -1
      || projected.z > 1
    ) {
      return Number.POSITIVE_INFINITY;
    }

    const screenX = rect.left
      + (projected.x + 1)
      * 0.5
      * rect.width;
    const screenY = rect.top
      + (1 - projected.y)
      * 0.5
      * rect.height;

    return Math.hypot(
      clientX - screenX,
      clientY - screenY,
    );
  }
}
