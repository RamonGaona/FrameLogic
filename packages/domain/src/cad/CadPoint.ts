export interface CadPointPosition {

  readonly x: number;

  readonly y: number;

  readonly z: number;

}


export interface CadPoint {

  /**
   * Identificador único del punto CAD colocado.
   */
  readonly id: string;


  /**
   * Capa del proyecto.
   */
  readonly layerId: string;


  /**
   * Coordenada global/model-space del punto CAD.
   */
  readonly position:
    CadPointPosition;

}
