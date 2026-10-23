import type {
  Transform3D,
} from "@framelogic/geometry";

import type {
  Classifiable,
} from "../common/Classifiable";


export interface AssemblyComponentDefinition {
  readonly id: string;
  readonly pieceDefinitionId: string;

  /**
   * Transformación de la pieza dentro del sistema local del ensamblaje.
   */
  readonly transform: Transform3D;
}


export interface AssemblyConstraintEndpoint {
  readonly componentId: string;
  readonly featureId: string;
}


export type AssemblyConstraintType =
  | "COINCIDENT"
  | "CONCENTRIC"
  | "COAXIAL"
  | "PARALLEL"
  | "PERPENDICULAR"
  | "DISTANCE"
  | "FACE_TO_FACE";


export interface AssemblyConstraint {
  readonly id: string;
  readonly type: AssemblyConstraintType;
  readonly first: AssemblyConstraintEndpoint;
  readonly second: AssemblyConstraintEndpoint;
  readonly offset?: number;
  readonly enabled: boolean;
}


export interface AssemblyDefinition
  extends Classifiable {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly revision?: string;

  /**
   * Cada componente representa una colocación concreta dentro del ensamble.
   * Varias colocaciones pueden reutilizar el mismo PieceDefinition/STEP.
   */
  readonly components: readonly AssemblyComponentDefinition[];

  /**
   * Relaciones geométricas persistentes entre features de las piezas.
   */
  readonly constraints: readonly AssemblyConstraint[];

  readonly currency?: string;
  readonly assemblyCost?: number;
}
