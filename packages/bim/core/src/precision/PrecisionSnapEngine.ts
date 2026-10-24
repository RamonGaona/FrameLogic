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
  private readonly pointMarker: HTMLDivElement;
  private disposed = false;

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
    this.excludedSourceIdsProvider = excludedSourceIdsProvider ?? (() => []);
    this.enabledProvider = enabledProvider ?? (() => true);
    this.pixelTolerance = Math.max(1, pixelTolerance);

    /*
     * Confirmación visual del punto geométrico real.
     *
     * La etiqueta ENDPOINT/CENTER/... continúa siguiendo al cursor en
     * DesignSnapController. Este marcador, en cambio, se proyecta desde
     * snap.point y por eso indica exactamente qué coordenada 3D se usará.
     *
     * Es HTML para conservar un tamaño constante en píxeles tanto en cámara
     * ortográfica como en perspectiva y no participa en ningún raycast.
     */
    this.pointMarker = document.createElement(
      "div",
    );
    this.pointMarker.setAttribute(
      "aria-hidden",
      "true",
    );
    this.pointMarker.style.position =
      "fixed";
    this.pointMarker.style.display =
      "none";
    this.pointMarker.style.zIndex =
      "1001";
    this.pointMarker.style.pointerEvents =
      "none";
    this.pointMarker.style.width =
      "8px";
    this.pointMarker.style.height =
      "8px";
    this.pointMarker.style.boxSizing =
      "border-box";
    this.pointMarker.style.borderRadius =
      "50%";
    this.pointMarker.style.background =
      "#ffd54a";
    this.pointMarker.style.border =
      "2px solid #111820";
    this.pointMarker.style.boxShadow =
      "0 0 0 1px rgba(255,255,255,0.95), 0 0 5px rgba(255,213,74,0.85)";
    this.pointMarker.style.transform =
      "translate(-50%, -50%)";

    document.body.append(
      this.pointMarker,
    );

    this.domElement.addEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );

    this.domElement.addEventListener(
      "pointercancel",
      this.handlePointerLeave,
    );
  }

  findSnap(
    clientX: number,
    clientY: number,
  ): DesignSnapResult | null {
    const details =
      this.findSnapDetails(
        clientX,
        clientY,
      );

    this.updatePointMarker(
      details?.snap.point
      ?? null,
    );

    return details?.snap
      ?? null;
  }

  findSnapDetails(
    clientX: number,
    clientY: number,
  ): PrecisionSnapDetails | null {
    if (!this.enabledProvider()) {
      return null;
    }

    const candidates: PrecisionSnapDetails[] = [];
    const legacy = this.legacyFindSnap(clientX, clientY);

    if (legacy) {
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

    for (const geometry of geometryCandidates) {
      const snapType = this.mapGeometryKind(geometry);
      if (!snapType) {
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

    candidates.sort((first, second) => {
      const priorityDelta = SNAP_PRIORITY[first.snap.type]
        - SNAP_PRIORITY[second.snap.type];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const geometryRankDelta = this.geometryRank(first.geometry)
        - this.geometryRank(second.geometry);
      if (geometryRankDelta !== 0) {
        return geometryRankDelta;
      }

      return first.screenDistancePx - second.screenDistancePx;
    });

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

  dispose(): void {
    if (
      this.disposed
    ) {
      return;
    }

    this.disposed = true;

    this.domElement.removeEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );
    this.domElement.removeEventListener(
      "pointercancel",
      this.handlePointerLeave,
    );

    this.pointMarker.remove();
  }

  private readonly handlePointerLeave = (): void => {
    this.hidePointMarker();
  };

  private updatePointMarker(
    point: THREE.Vector3 | null,
  ): void {
    if (
      this.disposed
      || !point
      || !this.enabledProvider()
    ) {
      this.hidePointMarker();
      return;
    }

    const rect =
      this.domElement.getBoundingClientRect();

    if (
      rect.width <= 0
      || rect.height <= 0
    ) {
      this.hidePointMarker();
      return;
    }

    const projected =
      point.clone().project(
        this.cameraProvider(),
      );

    if (
      projected.z < -1
      || projected.z > 1
    ) {
      this.hidePointMarker();
      return;
    }

    const screenX =
      rect.left
      + (projected.x + 1)
        * 0.5
        * rect.width;
    const screenY =
      rect.top
      + (1 - projected.y)
        * 0.5
        * rect.height;

    if (
      screenX < rect.left
      || screenX > rect.right
      || screenY < rect.top
      || screenY > rect.bottom
    ) {
      this.hidePointMarker();
      return;
    }

    this.pointMarker.style.left =
      `${screenX}px`;
    this.pointMarker.style.top =
      `${screenY}px`;
    this.pointMarker.style.display =
      "block";
  }

  private hidePointMarker(): void {
    this.pointMarker.style.display =
      "none";
  }

  private mapGeometryKind(
    geometry: GeometryQueryResult,
  ): DesignSnapType | null {
    switch (geometry.kind) {
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
      case "REFERENCE_AXIS_ORIGIN":
      case "REFERENCE_AXIS_NEAREST":
      case "EDGE_NEAREST":
      case "CAD_LINE_NEAREST":
        return "REFERENCE";
      case "REFERENCE_POINT":
      case "FACE_POINT":
        return null;
      default:
        return null;
    }
  }

  private geometryRank(
    geometry: GeometryQueryResult | null,
  ): number {
    if (!geometry) {
      return 0;
    }
    if (geometry.precision === "MODEL_EXACT") {
      return 0;
    }
    if (geometry.precision === "DERIVED_MESH") {
      return 1;
    }
    return 2;
  }

  private screenDistance(
    point: THREE.Vector3,
    clientX: number,
    clientY: number,
  ): number {
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    const projected = point.clone().project(this.cameraProvider());
    if (projected.z < -1 || projected.z > 1) {
      return Number.POSITIVE_INFINITY;
    }

    const screenX = rect.left + (projected.x + 1) * 0.5 * rect.width;
    const screenY = rect.top + (1 - projected.y) * 0.5 * rect.height;
    return Math.hypot(clientX - screenX, clientY - screenY);
  }
}
