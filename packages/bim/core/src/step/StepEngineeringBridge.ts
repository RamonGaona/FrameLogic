import type {
  FrameLogicEngineeringModel,
  PieceEngineeringFeature,
} from "@framelogic/domain";

import type {
  StepGeometryDocument,
  StepGeometryFeature,
} from "@framelogic/geometry";


const brepDocumentByDefinition =
  new Map<
    string,
    string
  >();


/**
 * Registra en FrameLogic las features extraídas del STEP.
 *
 * El documento STEP continúa siendo la fuente geométrica; este bridge
 * crea el índice de ingeniería que usan snap, ensamble y cálculo y enlaza
 * la PieceDefinition con el TopoDS_Shape vivo de OpenCascade.
 */
export function registerStepDocumentEngineering(
  engineeringModel: FrameLogicEngineeringModel,
  pieceDefinitionId: string,
  document: StepGeometryDocument,
): void {
  engineeringModel.pieces.upsert({
    pieceDefinitionId,
    features:
      document.features.map(
        mapFeature,
      ),
  });

  if (
    document.brepDocumentId
  ) {
    brepDocumentByDefinition.set(
      pieceDefinitionId,
      document.brepDocumentId,
    );
  }
}


export function getStepBrepDocumentId(
  pieceDefinitionId: string,
): string | undefined {
  return brepDocumentByDefinition.get(
    pieceDefinitionId,
  );
}


export function unbindStepBrepDocument(
  pieceDefinitionId: string,
): void {
  brepDocumentByDefinition.delete(
    pieceDefinitionId,
  );
}


export function clearStepBrepDocuments(): void {
  brepDocumentByDefinition.clear();
}


function mapFeature(
  feature: StepGeometryFeature,
): PieceEngineeringFeature {
  const source =
    feature.precision === "BREP_EXACT"
      ? "STEP_BREP_EXACT" as const
      : "STEP_DERIVED" as const;

  switch (
    feature.kind
  ) {
    case "HOLE":
      return {
        id:
          feature.id,
        name:
          feature.name,
        kind: "HOLE",
        source,
        center: {
          ...feature.center,
        },
        axisDirection: {
          ...feature.axisDirection,
        },
        diameter:
          feature.diameter,
        depth:
          feature.depth,
      };

    case "CIRCLE":
      return {
        id:
          feature.id,
        name:
          feature.name,
        kind: "CIRCLE",
        source,
        center: {
          ...feature.center,
        },
        normal: {
          ...feature.normal,
        },
        radius:
          feature.radius,
      };

    case "CYLINDER":
      return {
        id:
          feature.id,
        name:
          feature.name,
        kind: "CYLINDER",
        source,
        axisOrigin: {
          ...feature.axisOrigin,
        },
        axisDirection: {
          ...feature.axisDirection,
        },
        radius:
          feature.radius,
        length:
          feature.length,
      };

    case "POINT":
      return {
        id:
          feature.id,
        name:
          feature.name,
        kind: "POINT",
        source,
        position: {
          ...feature.position,
        },
      };

    case "AXIS":
      return {
        id:
          feature.id,
        name:
          feature.name,
        kind: "AXIS",
        source,
        origin: {
          ...feature.origin,
        },
        direction: {
          ...feature.direction,
        },
        length:
          feature.length,
      };

    case "PLANE":
      return {
        id:
          feature.id,
        name:
          feature.name,
        kind: "PLANE",
        source,
        origin: {
          ...feature.origin,
        },
        normal: {
          ...feature.normal,
        },
      };
  }
}
