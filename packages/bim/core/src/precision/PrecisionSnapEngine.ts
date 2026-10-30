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
    const sourceObjects =
      new Map<string, THREE.Object3D>();
    const legacy = this.legacyFindSnap(clientX, clientY);

    /*
     * REFERENCE no representa una ubicación geométrica singular.
     * Puede ser simplemente el punto más cercano sobre una arista/eje,
     * por lo que no debe presentarse como un SNAP seleccionable.
     *
     * Las referencias siguen disponibles mediante queryGeometry() para
     * cálculos, inferencias y herramientas futuras.
     */
    if (
      legacy
      && legacy.type !== "REFERENCE"
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

    for (const geometry of geometryCandidates) {
      if (
        geometry.object
        && !sourceObjects.has(
          geometry.sourceId,
        )
      ) {
        sourceObjects.set(
          geometry.sourceId,
          geometry.object,
        );
      }

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

    /*
     * En Sólido / Sólido + aristas un punto detrás de una cara opaca no es
     * accesible visualmente y, por tanto, tampoco debe convertirse en SNAP.
     *
     * No acoplamos el motor al selector de render: inspeccionamos los
     * materiales que realmente están en escena. WIREFRAME y TRANSPARENT usan
     * materiales transparentes/colorWrite=false, de modo que deliberadamente
     * no actúan como oclusores y permiten trabajar "a través" del modelo.
     */
    for (const candidate of candidates) {
      const sourceObject =
        candidate.geometry?.object
        ?? sourceObjects.get(
          candidate.snap.instanceId,
        )
        ?? null;

      if (
        this.isVisibleFromCamera(
          candidate.snap.point,
          sourceObject,
        )
      ) {
        return candidate;
      }
    }

    return null;
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

  private isVisibleFromCamera(
    point: THREE.Vector3,
    sourceObject: THREE.Object3D | null,
  ): boolean {
    if (!sourceObject) {
      return true;
    }

    let root:
      THREE.Object3D =
        sourceObject;

    while (root.parent) {
      root = root.parent;
    }

    const camera =
      this.cameraProvider();
    const projected =
      point.clone().project(
        camera,
      );

    if (
      projected.z < -1
      || projected.z > 1
      || !Number.isFinite(projected.x)
      || !Number.isFinite(projected.y)
    ) {
      return false;
    }

    const raycaster =
      new THREE.Raycaster();

    raycaster.setFromCamera(
      new THREE.Vector2(
        projected.x,
        projected.y,
      ),
      camera,
    );

    const toPoint =
      point.clone().sub(
        raycaster.ray.origin,
      );
    const pointDistance =
      toPoint.dot(
        raycaster.ray.direction,
      );

    if (
      !Number.isFinite(pointDistance)
      || pointDistance <= 0
    ) {
      return false;
    }

    const epsilon =
      Math.max(
        0.5,
        pointDistance * 1e-6,
      );

    raycaster.near =
      0;
    raycaster.far =
      pointDistance + epsilon;

    const intersections =
      raycaster.intersectObject(
        root,
        true,
      );

    for (const intersection of intersections) {
      if (
        !(intersection.object
          instanceof THREE.Mesh)
        || !this.isOpaqueOccluder(
          intersection.object,
        )
      ) {
        continue;
      }

      if (
        intersection.distance
        < pointDistance - epsilon
      ) {
        return false;
      }

      /*
       * Las intersecciones están ordenadas por distancia. Si la primera cara
       * opaca ya coincide con el punto (dentro de tolerancia), no existe una
       * pared opaca anterior que pueda ocultarlo.
       */
      return true;
    }

    return true;
  }

  private isOpaqueOccluder(
    mesh: THREE.Mesh,
  ): boolean {
    if (!mesh.visible) {
      return false;
    }

    const materials =
      Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

    return materials.some(
      (
        material,
      ) =>
        material.visible
        && material.colorWrite !== false
        && !material.transparent
        && material.opacity >= 0.95,
    );
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

      /*
       * Estos resultados siguen siendo útiles para GeometryQuery,
       * pero no son puntos singulares de SNAP.
       */
      case "REFERENCE_AXIS_ORIGIN":
      case "REFERENCE_AXIS_NEAREST":
      case "EDGE_NEAREST":
      case "CAD_LINE_NEAREST":
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
