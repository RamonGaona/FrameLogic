import type {
  Transform3D,
} from "@framelogic/geometry";


export interface PieceInstance {

  /**
   * Identificador único de esta colocación.
   */
  readonly id: string;


  /**
   * PieceDefinition utilizada.
   *
   * Muchas instancias pueden utilizar
   * exactamente la misma definición.
   */
  readonly definitionId: string;


  /**
   * Posición y orientación de esta
   * colocación concreta.
   */
  readonly transform: Transform3D;


  /**
   * Etiquetas específicas de la instancia.
   *
   * Ejemplos:
   * Zona Norte
   * Nivel 2
   * Fase 1
   */
  readonly tags: readonly string[];

}