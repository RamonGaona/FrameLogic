import type {
  AssemblyDefinition,
} from "../assemblies/AssemblyDefinition";

import type {
  FrameLogicEngineeringModel,
} from "./FrameLogicEngineeringModel";

import type {
  PieceEngineeringData,
} from "./PieceEngineering";


export interface FrameLogicEngineeringSnapshotV1 {
  readonly schema:
    "FRAMELOGIC_ENGINEERING";
  readonly version: 1;
  readonly pieces:
    readonly PieceEngineeringData[];
  readonly assemblies:
    readonly AssemblyDefinition[];
}


export type FrameLogicEngineeringSnapshot =
  FrameLogicEngineeringSnapshotV1;


export function createEngineeringSnapshot(
  model: FrameLogicEngineeringModel,
): FrameLogicEngineeringSnapshot {
  return {
    schema:
      "FRAMELOGIC_ENGINEERING",
    version: 1,
    pieces:
      model.pieces
        .getAll()
        .map(
          clonePieceEngineering,
        ),
    assemblies:
      model.assemblies
        .getAll()
        .map(
          cloneAssemblyDefinition,
        ),
  };
}


export function restoreEngineeringSnapshot(
  model: FrameLogicEngineeringModel,
  snapshot: FrameLogicEngineeringSnapshot,
): void {
  if (
    snapshot.schema
    !== "FRAMELOGIC_ENGINEERING"
    || snapshot.version !== 1
  ) {
    throw new Error(
      "Unsupported FrameLogic engineering snapshot.",
    );
  }

  model.pieces.clear();
  model.assemblies.clear();

  for (
    const piece
    of snapshot.pieces
  ) {
    model.pieces.upsert({
      pieceDefinitionId:
        piece.pieceDefinitionId,
      revision:
        piece.revision,
      material:
        piece.material
        ? { ...piece.material }
        : undefined,
      commercial:
        piece.commercial
        ? { ...piece.commercial }
        : undefined,
      physical:
        piece.physical
        ? { ...piece.physical }
        : undefined,
      structuralAxis:
        piece.structuralAxis
        ? cloneStructuralAxis(
            piece.structuralAxis,
          )
        : undefined,
      features:
        piece.features.map(
          cloneFeature,
        ),
    });
  }

  for (
    const assembly
    of snapshot.assemblies
  ) {
    const registered =
      model.assemblies.register({
        id:
          assembly.id,
        code:
          assembly.code,
        name:
          assembly.name,
        revision:
          assembly.revision,
        classification:
          assembly.classification,
        tags:
          assembly.tags,
        currency:
          assembly.currency,
        assemblyCost:
          assembly.assemblyCost,
      });

    for (
      const component
      of assembly.components
    ) {
      model.assemblies.addComponent(
        registered.id,
        {
          id:
            component.id,
          pieceDefinitionId:
            component.pieceDefinitionId,
          transform: {
            position: {
              ...component.transform.position,
            },
            rotation: {
              ...component.transform.rotation,
            },
          },
        },
      );
    }

    for (
      const constraint
      of assembly.constraints
    ) {
      model.assemblies.addConstraint(
        registered.id,
        {
          id:
            constraint.id,
          type:
            constraint.type,
          first: {
            ...constraint.first,
          },
          second: {
            ...constraint.second,
          },
          offset:
            constraint.offset,
          enabled:
            constraint.enabled,
        },
      );
    }
  }
}


function clonePieceEngineering(
  value: PieceEngineeringData,
): PieceEngineeringData {
  return {
    pieceDefinitionId:
      value.pieceDefinitionId,
    revision:
      value.revision,
    material:
      value.material
      ? { ...value.material }
      : undefined,
    commercial:
      value.commercial
      ? { ...value.commercial }
      : undefined,
    physical:
      value.physical
      ? { ...value.physical }
      : undefined,
    structuralAxis:
      value.structuralAxis
      ? cloneStructuralAxis(
          value.structuralAxis,
        )
      : undefined,
    features:
      value.features.map(
        cloneFeature,
      ),
  };
}


function cloneStructuralAxis(
  value: NonNullable<PieceEngineeringData["structuralAxis"]>,
): NonNullable<PieceEngineeringData["structuralAxis"]> {
  return {
    ...value,
    start: {
      ...value.start,
    },
    end: {
      ...value.end,
    },
    localYDirection:
      value.localYDirection
      ? { ...value.localYDirection }
      : undefined,
    section:
      value.section
      ? { ...value.section }
      : undefined,
  };
}


function cloneFeature(
  value: PieceEngineeringData["features"][number],
): PieceEngineeringData["features"][number] {
  switch (
    value.kind
  ) {
    case "HOLE":
      return {
        ...value,
        center: {
          ...value.center,
        },
        axisDirection: {
          ...value.axisDirection,
        },
      };

    case "AXIS":
      return {
        ...value,
        origin: {
          ...value.origin,
        },
        direction: {
          ...value.direction,
        },
      };

    case "PLANE":
      return {
        ...value,
        origin: {
          ...value.origin,
        },
        normal: {
          ...value.normal,
        },
      };

    case "POINT":
      return {
        ...value,
        position: {
          ...value.position,
        },
      };

    case "CIRCLE":
      return {
        ...value,
        center: {
          ...value.center,
        },
        normal: {
          ...value.normal,
        },
      };

    case "CYLINDER":
      return {
        ...value,
        axisOrigin: {
          ...value.axisOrigin,
        },
        axisDirection: {
          ...value.axisDirection,
        },
      };
  }
}


function cloneAssemblyDefinition(
  value: AssemblyDefinition,
): AssemblyDefinition {
  return {
    ...value,
    tags: [
      ...value.tags,
    ],
    components:
      value.components.map(
        (
          component,
        ) => ({
          ...component,
          transform: {
            position: {
              ...component.transform.position,
            },
            rotation: {
              ...component.transform.rotation,
            },
          },
        }),
      ),
    constraints:
      value.constraints.map(
        (
          constraint,
        ) => ({
          ...constraint,
          first: {
            ...constraint.first,
          },
          second: {
            ...constraint.second,
          },
        }),
      ),
  };
}
