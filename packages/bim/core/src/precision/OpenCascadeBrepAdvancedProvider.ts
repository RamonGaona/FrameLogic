import * as THREE from "three";

import {
  getOpenCascadeBrepKernel,
} from "@framelogic/geometry";

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

import {
  getStepBrepDocumentId,
} from "../step/StepEngineeringBridge";

interface ExactLine {
  readonly instanceId: string;
  readonly topologyId: string;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
}

/**
 * Consultas exactas que complementan OpenCascadeBrepGeometryProvider:
 * nearest sobre círculos analíticos e intersecciones de aristas LINE B-Rep.
 */
export class OpenCascadeBrepAdvancedProvider
  implements GeometryQueryProvider {
  constructor(
    private readonly designModel: DesignModel,
    private readonly designScene: DesignSceneController,
  ) {}

  query(
    context: GeometryQueryContext,
  ): readonly GeometryQueryResult[] {
    const result:
      GeometryQueryResult[] = [];
    const lines:
      ExactLine[] = [];
    const kernel =
      getOpenCascadeBrepKernel();

    for (
      const instance
      of this.designModel
        .pieceInstances
        .getAll()
    ) {
      if (
        context.excludedSourceIds.has(
          instance.id,
        )
      ) {
        continue;
      }

      const layer =
        this.designModel.layers.get(
          instance.layerId,
        );

      if (
        layer?.visible === false
        || layer?.snapEnabled === false
      ) {
        continue;
      }

      const documentId =
        getStepBrepDocumentId(
          instance.definitionId,
        );
      const document =
        documentId
          ? kernel.getDocument(
              documentId,
            )
          : undefined;
      const object =
        this.designScene
          .getInstanceObject(
            instance.id,
          );

      if (
        !document
        || !object
        || !object.visible
      ) {
        continue;
      }

      object.updateMatrixWorld(
        true,
      );
      const scale =
        document.modelScale;
      const worldScale =
        new THREE.Vector3();

      object.getWorldScale(
        worldScale,
      );
      const radiusScale =
        (
          Math.abs(worldScale.x)
          + Math.abs(worldScale.y)
          + Math.abs(worldScale.z)
        ) / 3;

      const toWorld = (
        point: {
          readonly x: number;
          readonly y: number;
          readonly z: number;
        },
      ): THREE.Vector3 =>
        new THREE.Vector3(
          point.x * scale,
          point.y * scale,
          point.z * scale,
        ).applyMatrix4(
          object.matrixWorld,
        );

      const normalMatrix =
        new THREE.Matrix3()
          .getNormalMatrix(
            object.matrixWorld,
          );

      for (
        const edge
        of document.edges
      ) {
        if (
          edge.kind === "LINE"
          && edge.start
          && edge.end
        ) {
          lines.push({
            instanceId:
              instance.id,
            topologyId:
              edge.id,
            start:
              toWorld(
                edge.start,
              ),
            end:
              toWorld(
                edge.end,
              ),
          });
        }

        if (!edge.circle) {
          continue;
        }

        const center =
          toWorld(
            edge.circle.center,
          );
        const normal =
          new THREE.Vector3(
            edge.circle.normal.x,
            edge.circle.normal.y,
            edge.circle.normal.z,
          )
            .applyMatrix3(
              normalMatrix,
            )
            .normalize();
        const plane =
          new THREE.Plane()
            .setFromNormalAndCoplanarPoint(
              normal,
              center,
            );
        const hit =
          context.ray.intersectPlane(
            plane,
            new THREE.Vector3(),
          );

        if (!hit) {
          continue;
        }

        const radial =
          hit.clone()
            .sub(
              center,
            );

        if (
          radial.lengthSq()
          <= 1e-18
        ) {
          continue;
        }

        const radius =
          edge.circle.radius
          * scale
          * radiusScale;
        const nearest =
          center.clone()
            .add(
              radial
                .normalize()
                .multiplyScalar(
                  radius,
                ),
            );

        this.pushResult(
          result,
          context,
          nearest,
          instance.id,
          [
            instance.id,
            `BREP:${edge.id}`,
            "BREP:CIRCLE_NEAREST",
          ],
          "EDGE_NEAREST",
          object,
        );
      }
    }

    this.collectLineIntersections(
      lines,
      context,
      result,
    );

    return result;
  }

  private collectLineIntersections(
    lines: readonly ExactLine[],
    context: GeometryQueryContext,
    result: GeometryQueryResult[],
  ): void {
    /*
     * Evita un O(n²) descontrolado en modelos enormes. Los intersections
     * exactos siguen disponibles para la geometría cercana habitual; cuando
     * haya miles de aristas la futura caché espacial sustituirá este límite.
     */
    if (
      lines.length > 420
    ) {
      return;
    }

    for (
      let firstIndex = 0;
      firstIndex < lines.length;
      firstIndex += 1
    ) {
      const first =
        lines[firstIndex];

      if (!first) {
        continue;
      }

      for (
        let secondIndex = firstIndex + 1;
        secondIndex < lines.length;
        secondIndex += 1
      ) {
        const second =
          lines[secondIndex];

        if (!second) {
          continue;
        }

        const intersection =
          closestSegmentIntersection(
            first.start,
            first.end,
            second.start,
            second.end,
          );

        if (!intersection) {
          continue;
        }

        this.pushResult(
          result,
          context,
          intersection,
          first.instanceId,
          [
            first.instanceId,
            second.instanceId,
            `BREP:${first.topologyId}`,
            `BREP:${second.topologyId}`,
            "BREP:EDGE_INTERSECTION",
          ],
          "REFERENCE_POINT",
        );
      }
    }
  }

  private pushResult(
    result: GeometryQueryResult[],
    context: GeometryQueryContext,
    point: THREE.Vector3,
    sourceId: string,
    relatedSourceIds: readonly string[],
    kind: GeometryQueryResult["kind"],
    object?: THREE.Object3D,
  ): void {
    const projected =
      context.projectWorldPoint(
        point,
      );

    if (!projected.visible) {
      return;
    }

    const screenDistancePx =
      Math.hypot(
        projected.x
        - context.clientX,
        projected.y
        - context.clientY,
      );

    if (
      screenDistancePx
      > context.pixelTolerance
    ) {
      return;
    }

    result.push({
      kind,
      point:
        point.clone(),
      sourceId,
      relatedSourceIds,
      object,
      screenDistancePx,
      precision:
        "MODEL_EXACT",
    });
  }
}

function closestSegmentIntersection(
  a0: THREE.Vector3,
  a1: THREE.Vector3,
  b0: THREE.Vector3,
  b1: THREE.Vector3,
): THREE.Vector3 | null {
  const u =
    a1.clone()
      .sub(
        a0,
      );
  const v =
    b1.clone()
      .sub(
        b0,
      );
  const w =
    a0.clone()
      .sub(
        b0,
      );
  const aa =
    u.dot(u);
  const bb =
    u.dot(v);
  const cc =
    v.dot(v);
  const dd =
    u.dot(w);
  const ee =
    v.dot(w);
  const denominator =
    aa * cc
    - bb * bb;

  if (
    aa <= 1e-18
    || cc <= 1e-18
    || Math.abs(denominator)
      <= 1e-18
  ) {
    return null;
  }

  const s =
    (
      bb * ee
      - cc * dd
    ) / denominator;
  const t =
    (
      aa * ee
      - bb * dd
    ) / denominator;

  if (
    s < -1e-8
    || s > 1 + 1e-8
    || t < -1e-8
    || t > 1 + 1e-8
  ) {
    return null;
  }

  const first =
    a0.clone()
      .addScaledVector(
        u,
        s,
      );
  const second =
    b0.clone()
      .addScaledVector(
        v,
        t,
      );
  const tolerance =
    1e-7
    * Math.max(
      1,
      u.length(),
      v.length(),
    );

  if (
    first.distanceTo(
      second,
    )
    > tolerance
  ) {
    return null;
  }

  return first
    .add(
      second,
    )
    .multiplyScalar(
      0.5,
    );
}
