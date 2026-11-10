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


/**
 * GeometryQueryProvider exacto para STEP.
 *
 * Three.js únicamente aporta matrixWorld y proyección a pantalla. Las
 * coordenadas candidatas proceden del TopoDS_Shape vivo de OpenCascade.
 */
export class OpenCascadeBrepGeometryProvider
  implements GeometryQueryProvider {
  private readonly designModel:
    DesignModel;

  private readonly designScene:
    DesignSceneController;

  private readonly definitionDocuments =
    new Map<
      string,
      string
    >();


  constructor(
    designModel: DesignModel,
    designScene: DesignSceneController,
  ) {
    this.designModel =
      designModel;
    this.designScene =
      designScene;
  }


  bindDefinition(
    pieceDefinitionId: string,
    brepDocumentId: string,
  ): void {
    this.definitionDocuments.set(
      pieceDefinitionId,
      brepDocumentId,
    );
  }


  unbindDefinition(
    pieceDefinitionId: string,
  ): void {
    this.definitionDocuments.delete(
      pieceDefinitionId,
    );
  }


  clear(): void {
    this.definitionDocuments.clear();
  }


  hasExactTopologyForSource(instanceId: string): boolean {
    const instance = this.designModel.pieceInstances.get(instanceId);
    if (!instance) return false;
    const documentId = this.definitionDocuments.get(instance.definitionId);
    const document = documentId
      ? getOpenCascadeBrepKernel().getDocument(documentId)
      : undefined;
    return Boolean(document && (
      document.vertices.length > 0
      || document.edges.length > 0
      || document.cylinders.length > 0
    ));
  }

  query(
    context: GeometryQueryContext,
  ): readonly GeometryQueryResult[] {
    const results:
      GeometryQueryResult[] = [];
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

      const brepDocumentId =
        this.definitionDocuments.get(
          instance.definitionId,
        );

      if (!brepDocumentId) {
        continue;
      }

      const document =
        kernel.getDocument(
          brepDocumentId,
        );
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

      for (
        const vertex
        of document.vertices
      ) {
        this.pushPoint(
          scalePoint(
            vertex.point,
            scale,
          ),
          "VERTEX",
          instance.id,
          vertex.id,
          object,
          context,
          results,
        );
      }

      for (
        const edge
        of document.edges
      ) {
        if (edge.midpoint) {
          this.pushPoint(
            scalePoint(
              edge.midpoint,
              scale,
            ),
            "EDGE_MIDPOINT",
            instance.id,
            edge.id,
            object,
            context,
            results,
          );
        }

        if (edge.circle) {
          this.pushPoint(
            scalePoint(
              edge.circle.center,
              scale,
            ),
            "CIRCLE_CENTER",
            instance.id,
            `${edge.id}:center`,
            object,
            context,
            results,
          );
        }

        if (
          edge.kind === "LINE"
          && edge.start
          && edge.end
        ) {
          this.pushNearestLinePoint(
            scalePoint(
              edge.start,
              scale,
            ),
            scalePoint(
              edge.end,
              scale,
            ),
            instance.id,
            edge.id,
            object,
            context,
            results,
          );
        }
      }

      for (
        const cylinder
        of document.cylinders
      ) {
        this.pushPoint(
          scalePoint(
            cylinder.axisOrigin,
            scale,
          ),
          "REFERENCE_AXIS_ORIGIN",
          instance.id,
          cylinder.id,
          object,
          context,
          results,
        );
      }
    }

    return results;
  }


  private pushPoint(
    assetPoint: {
      x: number;
      y: number;
      z: number;
    },
    kind: GeometryQueryResult["kind"],
    instanceId: string,
    topologyId: string,
    object: THREE.Object3D,
    context: GeometryQueryContext,
    results: GeometryQueryResult[],
  ): void {
    const worldPoint =
      new THREE.Vector3(
        assetPoint.x,
        assetPoint.y,
        assetPoint.z,
      ).applyMatrix4(
        object.matrixWorld,
      );
    const projected =
      context.projectWorldPoint(
        worldPoint,
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

    results.push({
      kind,
      point:
        worldPoint,
      sourceId:
        instanceId,
      relatedSourceIds: [
        instanceId,
        `BREP:${topologyId}`,
      ],
      object,
      screenDistancePx,
      precision:
        "MODEL_EXACT",
    });
  }


  private pushNearestLinePoint(
    assetStart: {
      x: number;
      y: number;
      z: number;
    },
    assetEnd: {
      x: number;
      y: number;
      z: number;
    },
    instanceId: string,
    topologyId: string,
    object: THREE.Object3D,
    context: GeometryQueryContext,
    results: GeometryQueryResult[],
  ): void {
    const start =
      new THREE.Vector3(
        assetStart.x,
        assetStart.y,
        assetStart.z,
      ).applyMatrix4(
        object.matrixWorld,
      );
    const end =
      new THREE.Vector3(
        assetEnd.x,
        assetEnd.y,
        assetEnd.z,
      ).applyMatrix4(
        object.matrixWorld,
      );
    const nearest =
      new THREE.Vector3();

    context.ray.distanceSqToSegment(
      start,
      end,
      undefined,
      nearest,
    );

    const projected =
      context.projectWorldPoint(
        nearest,
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

    results.push({
      kind:
        "EDGE_NEAREST",
      point:
        nearest,
      sourceId:
        instanceId,
      relatedSourceIds: [
        instanceId,
        `BREP:${topologyId}`,
      ],
      object,
      screenDistancePx,
      precision:
        "MODEL_EXACT",
    });
  }
}


function scalePoint(
  point: {
    x: number;
    y: number;
    z: number;
  },
  scale: number,
) {
  return {
    x:
      point.x * scale,
    y:
      point.y * scale,
    z:
      point.z * scale,
  };
}
