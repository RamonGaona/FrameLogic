import type {
  PieceVector3Data,
} from "../pieces/PieceDefinition";

import type {
  PieceMaterialData,
  StructuralSectionData,
} from "../engineering/PieceEngineering";


export interface PlacedStructuralAxis {
  readonly id: string;
  readonly pieceInstanceId: string;
  readonly pieceDefinitionId: string;
  readonly start: PieceVector3Data;
  readonly end: PieceVector3Data;
  readonly localYDirection?: PieceVector3Data;
  readonly material?: PieceMaterialData;
  readonly section?: StructuralSectionData;
}


export interface StructuralNode {
  readonly id: string;
  /** Coordenada de proyecto en milímetros. */
  readonly position: PieceVector3Data;
}


export interface StructuralMember {
  readonly id: string;
  readonly pieceInstanceId: string;
  readonly pieceDefinitionId: string;
  readonly startNodeId: string;
  readonly endNodeId: string;
  readonly localYDirection?: PieceVector3Data;
  readonly material?: PieceMaterialData;
  readonly section?: StructuralSectionData;
}


export interface StructuralModel {
  readonly nodes: readonly StructuralNode[];
  readonly members: readonly StructuralMember[];
}


/**
 * Convierte ejes estructurales ya resueltos a coordenadas de proyecto
 * en milímetros y produce un modelo de nodos + miembros apto para enviar
 * posteriormente a un adaptador de solver.
 *
 * El límite externo del solver es responsable de convertir mm a la unidad
 * requerida por ese solver; el dominio FrameLogic permanece siempre en mm.
 *
 * No recibe sólidos STEP. La geometría de fabricación permanece separada.
 */
export function buildStructuralModel(
  axes: readonly PlacedStructuralAxis[],
  nodeMergeTolerance = 0.001,
): StructuralModel {
  if (
    !Number.isFinite(nodeMergeTolerance)
    || nodeMergeTolerance < 0
  ) {
    throw new Error(
      "Structural node merge tolerance must be zero or positive.",
    );
  }

  const nodes: StructuralNode[] = [];
  const members: StructuralMember[] = [];

  const findOrCreateNode = (
    position: PieceVector3Data,
  ): StructuralNode => {
    const existing =
      nodes.find(
        (
          node,
        ) =>
          distance(
            node.position,
            position,
          )
          <= nodeMergeTolerance,
      );

    if (existing) {
      return existing;
    }

    const node:
      StructuralNode = {
        id:
          `node-${nodes.length + 1}`,
        position: {
          ...position,
        },
      };

    nodes.push(node);
    return node;
  };

  for (
    const axis
    of axes
  ) {
    if (
      distance(
        axis.start,
        axis.end,
      )
      <= 1e-9
    ) {
      throw new Error(
        `Structural axis "${axis.id}" has zero length.`,
      );
    }

    const startNode =
      findOrCreateNode(
        axis.start,
      );
    const endNode =
      findOrCreateNode(
        axis.end,
      );

    members.push({
      id:
        axis.id,
      pieceInstanceId:
        axis.pieceInstanceId,
      pieceDefinitionId:
        axis.pieceDefinitionId,
      startNodeId:
        startNode.id,
      endNodeId:
        endNode.id,
      localYDirection:
        axis.localYDirection,
      material:
        axis.material,
      section:
        axis.section,
    });
  }

  return {
    nodes,
    members,
  };
}


function distance(
  first: PieceVector3Data,
  second: PieceVector3Data,
): number {
  return Math.hypot(
    second.x - first.x,
    second.y - first.y,
    second.z - first.z,
  );
}
