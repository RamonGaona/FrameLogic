import * as THREE from "three";

import {
  getOpenCascadeBrepKernel,
} from "@framelogic/geometry";

import type {
  DesignModel,
  EngineeringDataSource,
  FrameLogicEngineeringModel,
  LocalCoordinateSystem,
  PieceEngineeringFeature,
  PieceVector3Data,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import {
  getStepBrepDocumentId,
} from "../step/StepEngineeringBridge";

import type {
  GeometryPrecision,
  GeometryQueryContext,
  GeometryQueryProvider,
  GeometryQueryResult,
} from "./GeometryQueryEngine";


/**
 * Proveedor STEP de precisión.
 *
 * Las features de ingeniería continúan disponibles para ensamblaje/cálculo,
 * pero vértices y aristas se consultan directamente desde el índice exacto
 * del TopoDS_Shape que OpenCascade mantiene vivo en WASM.
 */
export class StepEngineeringFeatureProvider
  implements GeometryQueryProvider {
  private readonly engineeringModel:
    FrameLogicEngineeringModel;

  private readonly designModel:
    DesignModel;

  private readonly designScene:
    DesignSceneController;


  constructor(
    engineeringModel:
      FrameLogicEngineeringModel,
    designModel:
      DesignModel,
    designScene:
      DesignSceneController,
  ) {
    this.engineeringModel =
      engineeringModel;
    this.designModel =
      designModel;
    this.designScene =
      designScene;
  }


  query(
    context: GeometryQueryContext,
  ): readonly GeometryQueryResult[] {
    const results:
      GeometryQueryResult[] = [];

    for (
      const instance
      of this.designModel.pieceInstances.getAll()
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

      const definition =
        this.designModel.pieceDefinitions.get(
          instance.definitionId,
        );
      const engineering =
        this.engineeringModel.pieces.get(
          instance.definitionId,
        );

      if (
        !definition
        || !engineering
      ) {
        continue;
      }

      const object =
        this.designScene.getInstanceObject(
          instance.id,
        );

      if (
        !object
        || !object.visible
      ) {
        continue;
      }

      object.updateMatrixWorld(true);

      /*
       * B-Rep exacto: autoridad geométrica para vértices y aristas STEP.
       * Three.js solo transforma la coordenada del asset al Model Space.
       */
      this.collectBrepTopology(
        instance.definitionId,
        instance.id,
        object,
        context,
        results,
      );

      /*
       * Features analíticas exactas/derivadas registradas al importar STEP.
       * Círculos, cilindros, puntos y ejes siguen sirviendo a snap,
       * ensamblaje e inferencia sin recorrer OCCT en cada pointermove.
       */
      for (
        const feature
        of engineering.features
      ) {
        this.collectFeature(
          feature,
          instance.id,
          object,
          context,
          results,
        );
      }

      /*
       * El eje estructural pertenece al sistema LOCAL de PieceDefinition.
       */
      const structuralAxis =
        engineering.structuralAxis;

      if (structuralAxis) {
        this.pushPointCandidate(
          localToAssetPoint(
            structuralAxis.start,
            definition.coordinateSystem,
          ),
          `structural-axis:${structuralAxis.id}:start`,
          instance.id,
          object,
          context,
          results,
          "REFERENCE_POINT",
          precisionFromSource(
            structuralAxis.source,
          ),
        );

        this.pushPointCandidate(
          localToAssetPoint(
            structuralAxis.end,
            definition.coordinateSystem,
          ),
          `structural-axis:${structuralAxis.id}:end`,
          instance.id,
          object,
          context,
          results,
          "REFERENCE_POINT",
          precisionFromSource(
            structuralAxis.source,
          ),
        );
      }
    }

    return results;
  }


  private collectBrepTopology(
    pieceDefinitionId: string,
    instanceId: string,
    object: THREE.Object3D,
    context: GeometryQueryContext,
    results: GeometryQueryResult[],
  ): void {
    const brepDocumentId =
      getStepBrepDocumentId(
        pieceDefinitionId,
      );

    if (!brepDocumentId) {
      return;
    }

    const document =
      getOpenCascadeBrepKernel()
        .getDocument(
          brepDocumentId,
        );

    if (!document) {
      return;
    }

    const scale =
      document.modelScale;

    for (
      const vertex
      of document.vertices
    ) {
      this.pushBrepPointCandidate(
        scaledPoint(
          vertex.point,
          scale,
        ),
        vertex.id,
        instanceId,
        object,
        context,
        results,
        "VERTEX",
      );
    }

    for (
      const edge
      of document.edges
    ) {
      if (edge.midpoint) {
        this.pushBrepPointCandidate(
          scaledPoint(
            edge.midpoint,
            scale,
          ),
          edge.id,
          instanceId,
          object,
          context,
          results,
          "EDGE_MIDPOINT",
        );
      }

      if (edge.circle) {
        this.pushBrepPointCandidate(
          scaledPoint(
            edge.circle.center,
            scale,
          ),
          `${edge.id}:center`,
          instanceId,
          object,
          context,
          results,
          "CIRCLE_CENTER",
        );
      }

      if (
        edge.kind === "LINE"
        && edge.start
        && edge.end
      ) {
        this.pushBrepNearestLineCandidate(
          scaledPoint(
            edge.start,
            scale,
          ),
          scaledPoint(
            edge.end,
            scale,
          ),
          edge.id,
          instanceId,
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
      this.pushBrepPointCandidate(
        scaledPoint(
          cylinder.axisOrigin,
          scale,
        ),
        cylinder.id,
        instanceId,
        object,
        context,
        results,
        "REFERENCE_AXIS_ORIGIN",
      );
    }
  }


  private pushBrepPointCandidate(
    assetPoint: PieceVector3Data,
    topologyId: string,
    instanceId: string,
    object: THREE.Object3D,
    context: GeometryQueryContext,
    results: GeometryQueryResult[],
    kind: GeometryQueryResult["kind"],
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
        projected.x - context.clientX,
        projected.y - context.clientY,
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


  private pushBrepNearestLineCandidate(
    assetStart: PieceVector3Data,
    assetEnd: PieceVector3Data,
    topologyId: string,
    instanceId: string,
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
        projected.x - context.clientX,
        projected.y - context.clientY,
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


  private collectFeature(
    feature: PieceEngineeringFeature,
    instanceId: string,
    object: THREE.Object3D,
    context: GeometryQueryContext,
    results: GeometryQueryResult[],
  ): void {
    const precision =
      precisionFromSource(
        feature.source,
      );

    switch (
      feature.kind
    ) {
      case "HOLE":
        this.pushPointCandidate(
          feature.center,
          feature.id,
          instanceId,
          object,
          context,
          results,
          "CIRCLE_CENTER",
          precision,
        );
        break;

      case "CIRCLE":
        this.pushPointCandidate(
          feature.center,
          feature.id,
          instanceId,
          object,
          context,
          results,
          "CIRCLE_CENTER",
          precision,
        );
        break;

      case "CYLINDER":
        this.pushPointCandidate(
          feature.axisOrigin,
          feature.id,
          instanceId,
          object,
          context,
          results,
          "REFERENCE_AXIS_ORIGIN",
          precision,
        );
        break;

      case "POINT":
        this.pushPointCandidate(
          feature.position,
          feature.id,
          instanceId,
          object,
          context,
          results,
          "VERTEX",
          precision,
        );
        break;

      case "AXIS":
        this.pushPointCandidate(
          feature.origin,
          feature.id,
          instanceId,
          object,
          context,
          results,
          "REFERENCE_AXIS_ORIGIN",
          precision,
        );
        break;

      case "PLANE":
        break;
    }
  }


  private pushPointCandidate(
    assetPoint: PieceVector3Data,
    featureId: string,
    instanceId: string,
    object: THREE.Object3D,
    context: GeometryQueryContext,
    results: GeometryQueryResult[],
    kind: GeometryQueryResult["kind"],
    precision: GeometryPrecision,
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
        projected.x - context.clientX,
        projected.y - context.clientY,
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
        `${instanceId}:${featureId}`,
      relatedSourceIds: [
        instanceId,
        featureId,
      ],
      object,
      screenDistancePx,
      precision,
    });
  }
}


function scaledPoint(
  point: PieceVector3Data,
  scale: number,
): PieceVector3Data {
  return {
    x:
      point.x * scale,
    y:
      point.y * scale,
    z:
      point.z * scale,
  };
}


function localToAssetPoint(
  local: PieceVector3Data,
  coordinateSystem: LocalCoordinateSystem,
): PieceVector3Data {
  return {
    x:
      coordinateSystem.origin.x
      + local.x * coordinateSystem.xAxis.x
      + local.y * coordinateSystem.yAxis.x
      + local.z * coordinateSystem.zAxis.x,
    y:
      coordinateSystem.origin.y
      + local.x * coordinateSystem.xAxis.y
      + local.y * coordinateSystem.yAxis.y
      + local.z * coordinateSystem.zAxis.y,
    z:
      coordinateSystem.origin.z
      + local.x * coordinateSystem.xAxis.z
      + local.y * coordinateSystem.yAxis.z
      + local.z * coordinateSystem.zAxis.z,
  };
}


function precisionFromSource(
  source: EngineeringDataSource,
): GeometryPrecision {
  switch (source) {
    case "STEP_DERIVED":
      return "DERIVED_MESH";

    case "STEP_BREP_EXACT":
    case "FRAMELOGIC":
    case "CALCULATED":
    case "IMPORTED_IFC":
    case "MANUAL":
      return "MODEL_EXACT";
  }
}
