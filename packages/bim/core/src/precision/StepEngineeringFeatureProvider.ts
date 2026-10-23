import * as THREE from "three";

import type {
  DesignModel,
  EngineeringDataSource,
  FrameLogicEngineeringModel,
  PieceEngineeringFeature,
  PieceVector3Data,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  GeometryPrecision,
  GeometryQueryContext,
  GeometryQueryProvider,
  GeometryQueryResult,
} from "./GeometryQueryEngine";


export class StepEngineeringFeatureProvider
  implements GeometryQueryProvider {
  constructor(
    private readonly engineeringModel:
      FrameLogicEngineeringModel,
    private readonly designModel:
      DesignModel,
    private readonly designScene:
      DesignSceneController,
  ) {}


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

      const engineering =
        this.engineeringModel.pieces.get(
          instance.definitionId,
        );

      if (!engineering) {
        continue;
      }

      const object =
        this.designScene.getInstanceObject(
          instance.id,
        );

      if (!object) {
        continue;
      }

      object.updateMatrixWorld(true);

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

      const structuralAxis =
        engineering.structuralAxis;

      if (structuralAxis) {
        this.pushPointCandidate(
          structuralAxis.start,
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
          structuralAxis.end,
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
    localPoint: PieceVector3Data,
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
        localPoint.x,
        localPoint.y,
        localPoint.z,
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
