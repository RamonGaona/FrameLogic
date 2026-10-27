import type {
  Transform3D,
} from "@framelogic/geometry";


export interface PieceInstance {

  /**
   * Identificador único de esta colocación.
   */
  readonly id: string;


  /**
   * Nombre opcional de esta instancia concreta.
   * No modifica PieceDefinition: dos copias de la misma pieza
   * pueden tener nombres distintos en el árbol del proyecto.
   */
  readonly name?: string;


  /**
   * PieceDefinition utilizada.
   *
   * Muchas instancias pueden utilizar
   * exactamente la misma definición.
   */
  readonly definitionId: string;


  /**
   * Capa del proyecto a la que pertenece
   * esta instancia concreta.
   *
   * La capa pertenece a la instancia,
   * no a PieceDefinition.
   */
  readonly layerId: string;


  /**
   * Posición y orientación de esta
   * colocación concreta respecto
   * a su contenedor/padre.
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
