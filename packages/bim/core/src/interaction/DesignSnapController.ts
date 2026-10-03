import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";


export type DesignSnapType =
  | "ENDPOINT"
  | "MIDPOINT"
  | "CENTER"
  | "POINT";


export interface DesignSnapResult {

  readonly type:
    DesignSnapType;

  readonly point:
    THREE.Vector3;

  readonly instanceId:
    string;

}


interface LocalSnapCandidate {

  type:
    DesignSnapType;

  point:
    THREE.Vector3;

}


interface EdgeRecord {

  aKey:
    string;

  bKey:
    string;

  a:
    THREE.Vector3;

  b:
    THREE.Vector3;

  normals:
    THREE.Vector3[];

}


interface CachedGeometrySnaps {

  candidates:
    LocalSnapCandidate[];

}


export class DesignSnapController {

  private readonly domElement:
    HTMLElement;


  private readonly cameraProvider:
    () => THREE.Camera;


  private readonly designScene:
    DesignSceneController;


  private readonly designModel:
    DesignModel
    | null;


  private readonly raycaster =
    new THREE.Raycaster();


  private readonly pointer =
    new THREE.Vector2();


  private readonly geometryCache =
    new Map<
      string,
      CachedGeometrySnaps
    >();


  private readonly marker:
    HTMLDivElement;


  private enabled =
    true;


  private currentSnap:
    DesignSnapResult
    | null =
      null;


  private readonly excludedInstanceIds =
    new Set<string>();


  private lastClientX =
    0;


  private lastClientY =
    0;


  private hasPointer =
    false;


  private readonly pixelTolerance =
    14;


  constructor(
    domElement:
      HTMLElement,

    cameraProvider:
      () => THREE.Camera,

    designScene:
      DesignSceneController,

    designModel?:
      DesignModel,
  ) {

    this.domElement =
      domElement;


    this.cameraProvider =
      cameraProvider;


    this.designScene =
      designScene;


    this.designModel =
      designModel
      ?? null;


    this.marker =
      document.createElement(
        "div",
      );


    this.marker.style.position =
      "fixed";


    this.marker.style.display =
      "none";


    this.marker.style.zIndex =
      "1000";


    this.marker.style.pointerEvents =
      "none";


    this.marker.style.padding =
      "3px 6px";


    this.marker.style.border =
      "1px solid currentColor";


    this.marker.style.borderRadius =
      "4px";


    this.marker.style.background =
      "rgba(20, 20, 24, 0.92)";


    this.marker.style.color =
      "#ffffff";


    this.marker.style.fontFamily =
      "system-ui, sans-serif";


    this.marker.style.fontSize =
      "11px";


    this.marker.style.fontWeight =
      "700";


    this.marker.style.letterSpacing =
      "0.03em";


    this.marker.style.transform =
      "translate(10px, 10px)";


    document.body.append(
      this.marker,
    );


    this.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
    );


    this.domElement.addEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );

  }


  setEnabled(
    enabled:
      boolean,
  ): void {

    this.enabled =
      enabled;


    if (
      !enabled
    ) {

      this.clearCurrentSnap();

    }

  }


  get isEnabled():
    boolean {

    return this.enabled;

  }


  setExcludedInstanceIds(
    instanceIds:
      readonly string[],
  ): void {

    this.excludedInstanceIds.clear();


    for (
      const instanceId
      of instanceIds
    ) {

      this.excludedInstanceIds.add(
        instanceId,
      );

    }


    if (
      this.hasPointer
    ) {

      this.updateCurrentSnap(
        this.lastClientX,
        this.lastClientY,
      );

    }

  }


  clearExcludedInstanceIds():
    void {

    if (
      this.excludedInstanceIds.size
      === 0
    ) {

      return;

    }


    this.excludedInstanceIds.clear();


    if (
      this.hasPointer
    ) {

      this.updateCurrentSnap(
        this.lastClientX,
        this.lastClientY,
      );

    }

  }


  getSnapAtCurrentPointer():
    DesignSnapResult
    | null {

    if (
      !this.hasPointer
    ) {

      return null;

    }


    return this.findSnap(
      this.lastClientX,
      this.lastClientY,
    );

  }


  getCurrentSnap():
    DesignSnapResult
    | null {

    if (
      !this.currentSnap
    ) {

      return null;

    }


    return {
      type:
        this.currentSnap.type,

      point:
        this.currentSnap.point
          .clone(),

      instanceId:
        this.currentSnap.instanceId,
    };

  }


  findSnap(
    clientX:
      number,

    clientY:
      number,
  ):
    DesignSnapResult
    | null {

    if (
      !this.enabled
    ) {

      return null;

    }


    const rect =
      this.domElement
        .getBoundingClientRect();


    if (
      rect.width <= 0
      || rect.height <= 0
    ) {

      return null;

    }


    this.pointer.x =
      (
        (
          clientX
          - rect.left
        )
        / rect.width
      )
      * 2
      - 1;


    this.pointer.y =
      -(
        (
          clientY
          - rect.top
        )
        / rect.height
      )
      * 2
      + 1;


    const camera =
      this.cameraProvider();


    const cadPointSnap =
      this.findCadPointSnap(
        clientX,
        clientY,
        rect,
        camera,
      );


    if (
      cadPointSnap
    ) {

      return cadPointSnap;

    }


    this.raycaster.setFromCamera(
      this.pointer,
      camera,
    );


    const intersections =
      this.raycaster
        .intersectObjects(
          this.designScene
            .getInstanceObjects(),
          true,
        );


    if (
      intersections.length < 1
    ) {

      return null;

    }


    /*
     * Revisamos los primeros objetos visibles bajo el cursor.
     * Esto mantiene el coste controlado incluso con modelos
     * de muchas piezas.
     */
    const candidateMeshes =
      new Set<
        THREE.Mesh
      >();


    for (
      const intersection
      of intersections.slice(
        0,
        6,
      )
    ) {

      if (
        intersection.object
        instanceof THREE.Mesh
      ) {

        candidateMeshes.add(
          intersection.object,
        );

      }

    }


    let best:
      DesignSnapResult
      | null =
        null;


    let bestPixels =
      this.pixelTolerance;


    for (
      const mesh
      of candidateMeshes
    ) {

      const geometry =
        mesh.geometry;


      if (
        !(geometry instanceof THREE.BufferGeometry)
      ) {

        continue;

      }


      const instanceId =
        this.findInstanceId(
          mesh,
        );


      if (
        !instanceId
        || this.excludedInstanceIds.has(
          instanceId,
        )
      ) {

        continue;

      }


      if (
        this.designModel
      ) {

        const instance =
          this.designModel
            .pieceInstances
            .get(
              instanceId,
            );


        const layer =
          instance
            ? this.designModel
                .layers
                .get(
                  instance.layerId,
                )
            : undefined;


        if (
          !instance
          || layer?.visible === false
          || layer?.snapEnabled === false
        ) {

          continue;

        }

      }


      const cached =
        this.getGeometrySnaps(
          geometry,
        );


      for (
        const candidate
        of cached.candidates
      ) {

        const worldPoint =
          candidate.point
            .clone()
            .applyMatrix4(
              mesh.matrixWorld,
            );


        const projected =
          worldPoint
            .clone()
            .project(
              camera,
            );


        if (
          projected.z < -1
          || projected.z > 1
        ) {

          continue;

        }


        const screenX =
          rect.left
          + (
            projected.x
            + 1
          )
          * 0.5
          * rect.width;


        const screenY =
          rect.top
          + (
            1
            - projected.y
          )
          * 0.5
          * rect.height;


        const pixels =
          Math.hypot(
            clientX
            - screenX,
            clientY
            - screenY,
          );


        if (
          pixels
          >= bestPixels
        ) {

          continue;

        }


        bestPixels =
          pixels;


        best = {
          type:
            candidate.type,

          point:
            worldPoint,

          instanceId,
        };

      }

    }


    return best;

  }


  private findCadPointSnap(
    clientX: number,
    clientY: number,
    rect: DOMRect,
    camera: THREE.Camera,
  ):
    DesignSnapResult
    | null {

    if (
      !this.designModel
    ) {

      return null;

    }


    let best:
      DesignSnapResult
      | null =
        null;


    let bestPixels =
      this.pixelTolerance;


    for (
      const cadPoint
      of this.designModel
        .cadPoints
        .getAll()
    ) {

      const layer =
        this.designModel
          .layers
          .get(
            cadPoint.layerId,
          );


      if (
        layer?.visible === false
        || layer?.snapEnabled === false
      ) {

        continue;

      }


      const worldPoint =
        new THREE.Vector3(
          cadPoint.position.x,
          cadPoint.position.y,
          cadPoint.position.z,
        );


      const projected =
        worldPoint
          .clone()
          .project(
            camera,
          );


      if (
        projected.z < -1
        || projected.z > 1
      ) {

        continue;

      }


      const screenX =
        rect.left
        + (
          projected.x
          + 1
        )
        * 0.5
        * rect.width;


      const screenY =
        rect.top
        + (
          1
          - projected.y
        )
        * 0.5
        * rect.height;


      const pixels =
        Math.hypot(
          clientX
          - screenX,
          clientY
          - screenY,
        );


      if (
        pixels
        >= bestPixels
      ) {

        continue;

      }


      bestPixels =
        pixels;


      best = {
        type:
          "POINT",

        point:
          worldPoint,

        instanceId:
          cadPoint.id,
      };

    }


    return best;

  }


  private readonly handlePointerMove =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !this.enabled
      ) {

        return;

      }


      this.lastClientX =
        event.clientX;


      this.lastClientY =
        event.clientY;


      this.hasPointer =
        true;


      this.updateCurrentSnap(
        event.clientX,
        event.clientY,
      );

    };


  private updateCurrentSnap(
    clientX:
      number,

    clientY:
      number,
  ): void {

    const snap =
      this.findSnap(
        clientX,
        clientY,
      );


    this.currentSnap =
      snap;


    if (
      !snap
    ) {

      this.marker.style.display =
        "none";


      return;

    }


    this.marker.textContent =
      snap.type;


    this.marker.style.left =
      `${clientX}px`;


    this.marker.style.top =
      `${clientY}px`;


    this.marker.style.display =
      "block";

  }


  private readonly handlePointerLeave =
    (): void => {

      this.hasPointer =
        false;


      this.clearCurrentSnap();

    };


  private clearCurrentSnap():
    void {

    this.currentSnap =
      null;


    this.marker.style.display =
      "none";

  }


  private getGeometrySnaps(
    geometry:
      THREE.BufferGeometry,
  ):
    CachedGeometrySnaps {

    const cached =
      this.geometryCache.get(
        geometry.uuid,
      );


    if (
      cached
    ) {

      return cached;

    }


    const built =
      this.buildGeometrySnaps(
        geometry,
      );


    this.geometryCache.set(
      geometry.uuid,
      built,
    );


    return built;

  }


  private buildGeometrySnaps(
    geometry:
      THREE.BufferGeometry,
  ):
    CachedGeometrySnaps {

    const position =
      geometry.getAttribute(
        "position",
      );


    if (
      !(position instanceof THREE.BufferAttribute)
      || position.count < 3
    ) {

      return {
        candidates:
          [],
      };

    }


    const vertices =
      new Map<
        string,
        THREE.Vector3
      >();


    const edges =
      new Map<
        string,
        EdgeRecord
      >();


    const index =
      geometry.index;


    const triangleCount =
      index
        ? Math.floor(
            index.count
            / 3,
          )
        : Math.floor(
            position.count
            / 3,
          );


    const readVertex =
      (
        vertexIndex:
          number,
      ):
        THREE.Vector3 => {

        return new THREE.Vector3(
          position.getX(
            vertexIndex,
          ),
          position.getY(
            vertexIndex,
          ),
          position.getZ(
            vertexIndex,
          ),
        );

      };


    for (
      let triangleIndex = 0;
      triangleIndex < triangleCount;
      triangleIndex += 1
    ) {

      const ia =
        index
          ? index.getX(
              triangleIndex
              * 3,
            )
          : triangleIndex
            * 3;


      const ib =
        index
          ? index.getX(
              triangleIndex
              * 3
              + 1,
            )
          : triangleIndex
            * 3
            + 1;


      const ic =
        index
          ? index.getX(
              triangleIndex
              * 3
              + 2,
            )
          : triangleIndex
            * 3
            + 2;


      const a =
        readVertex(
          ia,
        );


      const b =
        readVertex(
          ib,
        );


      const c =
        readVertex(
          ic,
        );


      const aKey =
        this.vertexKey(
          a,
        );


      const bKey =
        this.vertexKey(
          b,
        );


      const cKey =
        this.vertexKey(
          c,
        );


      vertices.set(
        aKey,
        a,
      );


      vertices.set(
        bKey,
        b,
      );


      vertices.set(
        cKey,
        c,
      );


      const normal =
        b.clone()
          .sub(
            a,
          )
          .cross(
            c.clone()
              .sub(
                a,
              ),
          )
          .normalize();


      this.addEdge(
        edges,
        aKey,
        bKey,
        a,
        b,
        normal,
      );


      this.addEdge(
        edges,
        bKey,
        cKey,
        b,
        c,
        normal,
      );


      this.addEdge(
        edges,
        cKey,
        aKey,
        c,
        a,
        normal,
      );

    }


    const semanticEdges:
      EdgeRecord[] =
        [];


    const creaseThreshold =
      THREE.MathUtils.degToRad(
        20,
      );


    for (
      const edge
      of edges.values()
    ) {

      if (
        edge.normals.length === 1
      ) {

        semanticEdges.push(
          edge,
        );


        continue;

      }


      let isCrease =
        false;


      for (
        let i = 0;
        i < edge.normals.length
          && !isCrease;
        i += 1
      ) {

        for (
          let j = i + 1;
          j < edge.normals.length;
          j += 1
        ) {

          const dot =
            THREE.MathUtils.clamp(
              edge.normals[i]
                .dot(
                  edge.normals[j],
                ),
              -1,
              1,
            );


          const angle =
            Math.acos(
              dot,
            );


          if (
            angle
            >= creaseThreshold
          ) {

            isCrease =
              true;


            break;

          }

        }

      }


      if (
        isCrease
      ) {

        semanticEdges.push(
          edge,
        );

      }

    }


    const candidates:
      LocalSnapCandidate[] =
        [];


    const endpointKeys =
      new Set<
        string
      >();


    for (
      const edge
      of semanticEdges
    ) {

      endpointKeys.add(
        edge.aKey,
      );


      endpointKeys.add(
        edge.bKey,
      );


      candidates.push({
        type:
          "MIDPOINT",

        point:
          edge.a.clone()
            .add(
              edge.b,
            )
            .multiplyScalar(
              0.5,
            ),
      });

    }


    for (
      const key
      of endpointKeys
    ) {

      const point =
        vertices.get(
          key,
        );


      if (
        point
      ) {

        candidates.push({
          type:
            "ENDPOINT",

          point:
            point.clone(),
        });

      }

    }


    for (
      const center
      of this.findCircularCenters(
        semanticEdges,
        vertices,
      )
    ) {

      candidates.push({
        type:
          "CENTER",

        point:
          center,
      });

    }


    return {
      candidates,
    };

  }


  private addEdge(
    edges:
      Map<
        string,
        EdgeRecord
      >,

    aKey:
      string,

    bKey:
      string,

    a:
      THREE.Vector3,

    b:
      THREE.Vector3,

    normal:
      THREE.Vector3,
  ): void {

    const firstKey =
      aKey < bKey
        ? aKey
        : bKey;


    const secondKey =
      aKey < bKey
        ? bKey
        : aKey;


    const key =
      `${firstKey}|${secondKey}`;


    const current =
      edges.get(
        key,
      );


    if (
      current
    ) {

      current.normals.push(
        normal.clone(),
      );


      return;

    }


    edges.set(
      key,
      {
        aKey:
          firstKey,

        bKey:
          secondKey,

        a:
          (
            firstKey === aKey
          )
            ? a.clone()
            : b.clone(),

        b:
          (
            secondKey === bKey
          )
            ? b.clone()
            : a.clone(),

        normals: [
          normal.clone(),
        ],
      },
    );

  }


  private findCircularCenters(
    edges:
      readonly EdgeRecord[],

    vertices:
      ReadonlyMap<
        string,
        THREE.Vector3
      >,
  ):
    THREE.Vector3[] {

    const adjacency =
      new Map<
        string,
        Set<string>
      >();


    for (
      const edge
      of edges
    ) {

      this.addNeighbor(
        adjacency,
        edge.aKey,
        edge.bKey,
      );


      this.addNeighbor(
        adjacency,
        edge.bKey,
        edge.aKey,
      );

    }


    const visited =
      new Set<
        string
      >();


    const centers:
      THREE.Vector3[] =
        [];


    for (
      const start
      of adjacency.keys()
    ) {

      if (
        visited.has(
          start,
        )
      ) {

        continue;

      }


      const component:
        string[] =
          [];


      const stack = [
        start,
      ];


      while (
        stack.length > 0
      ) {

        const current =
          stack.pop();


        if (
          !current
          || visited.has(
            current,
          )
        ) {

          continue;

        }


        visited.add(
          current,
        );


        component.push(
          current,
        );


        for (
          const neighbor
          of adjacency.get(
            current,
          )
          ?? []
        ) {

          if (
            !visited.has(
              neighbor,
            )
          ) {

            stack.push(
              neighbor,
            );

          }

        }

      }


      if (
        component.length < 6
      ) {

        continue;

      }


      const isSimpleLoop =
        component.every(
          (
            key,
          ) =>
            (
              adjacency.get(
                key,
              )?.size
              ?? 0
            )
            === 2,
        );


      if (
        !isSimpleLoop
      ) {

        continue;

      }


      const points =
        component
          .map(
            (
              key,
            ) =>
              vertices.get(
                key,
              ),
          )
          .filter(
            (
              point,
            ):
              point is THREE.Vector3 =>
                point
                !== undefined,
          );


      const center =
        this.fitCircularLoop(
          points,
        );


      if (
        center
      ) {

        centers.push(
          center,
        );

      }

    }


    return centers;

  }


  private fitCircularLoop(
    points:
      readonly THREE.Vector3[],
  ):
    THREE.Vector3
    | null {

    if (
      points.length < 6
    ) {

      return null;

    }


    const center =
      new THREE.Vector3();


    for (
      const point
      of points
    ) {

      center.add(
        point,
      );

    }


    center.multiplyScalar(
      1 / points.length,
    );


    let radius =
      0;


    const distances:
      number[] =
        [];


    for (
      const point
      of points
    ) {

      const distance =
        point.distanceTo(
          center,
        );


      distances.push(
        distance,
      );


      radius +=
        distance;

    }


    radius /=
      points.length;


    if (
      radius <= 1e-9
    ) {

      return null;

    }


    let maxRadialError =
      0;


    for (
      const distance
      of distances
    ) {

      maxRadialError =
        Math.max(
          maxRadialError,
          Math.abs(
            distance
            - radius,
          ),
        );

    }


    if (
      maxRadialError
      / radius
      > 0.035
    ) {

      return null;

    }


    const normal =
      this.findPlaneNormal(
        points,
      );


    if (
      !normal
    ) {

      return null;

    }


    let maxPlaneError =
      0;


    for (
      const point
      of points
    ) {

      const planeError =
        Math.abs(
          point.clone()
            .sub(
              center,
            )
            .dot(
              normal,
            ),
        );


      maxPlaneError =
        Math.max(
          maxPlaneError,
          planeError,
        );

    }


    if (
      maxPlaneError
      / radius
      > 0.02
    ) {

      return null;

    }


    return center;

  }


  private findPlaneNormal(
    points:
      readonly THREE.Vector3[],
  ):
    THREE.Vector3
    | null {

    const origin =
      points[0];


    if (
      !origin
    ) {

      return null;

    }


    for (
      let i = 1;
      i < points.length - 1;
      i += 1
    ) {

      const a =
        points[i];


      const b =
        points[i + 1];


      if (
        !a
        || !b
      ) {

        continue;

      }


      const normal =
        a.clone()
          .sub(
            origin,
          )
          .cross(
            b.clone()
              .sub(
                origin,
              ),
          );


      if (
        normal.lengthSq()
        > 1e-12
      ) {

        return normal.normalize();

      }

    }


    return null;

  }


  private addNeighbor(
    adjacency:
      Map<
        string,
        Set<string>
      >,

    key:
      string,

    neighbor:
      string,
  ): void {

    let neighbors =
      adjacency.get(
        key,
      );


    if (
      !neighbors
    ) {

      neighbors =
        new Set();


      adjacency.set(
        key,
        neighbors,
      );

    }


    neighbors.add(
      neighbor,
    );

  }


  private vertexKey(
    point:
      THREE.Vector3,
  ): string {

    return [
      point.x,
      point.y,
      point.z,
    ]
      .map(
        (
          value,
        ) =>
          value.toFixed(
            6,
          ),
      )
      .join(
        ",",
      );

  }


  private findInstanceId(
    object:
      THREE.Object3D,
  ):
    string
    | null {

    let current:
      THREE.Object3D
      | null =
        object;


    while (
      current
    ) {

      const frameLogic =
        current.userData[
          "frameLogic"
        ];


      if (
        frameLogic
        && frameLogic.entityType
          === "PieceInstance"
        && typeof frameLogic.instanceId
          === "string"
      ) {

        return frameLogic.instanceId;

      }


      current =
        current.parent;

    }


    return null;

  }


  dispose(): void {

    this.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
    );


    this.domElement.removeEventListener(
      "pointerleave",
      this.handlePointerLeave,
    );


    this.geometryCache.clear();


    this.marker.remove();


    this.currentSnap =
      null;


    this.excludedInstanceIds.clear();


    this.hasPointer =
      false;

  }

}
