export interface DesignLayer {

  /**
   * Identificador estable de la capa.
   */
  readonly id: string;


  /**
   * Nombre mostrado al usuario.
   */
  readonly name: string;


  /**
   * Si es false, los objetos de esta capa
   * no deben mostrarse en el viewport.
   */
  readonly visible: boolean;


  /**
   * Si es true, los objetos de esta capa
   * no deben poder editarse.
   */
  readonly locked: boolean;


  /**
   * Si es false, los objetos de esta capa
   * no deben aportar candidatos de SNAP.
   */
  readonly snapEnabled: boolean;


  /**
   * Las capas del sistema no pueden eliminarse.
   */
  readonly system: boolean;

}


export const DEFAULT_DESIGN_LAYER_IDS = {

  GEOMETRY:
    "geometry",

  REFERENCE_CAD:
    "reference-cad",

  SNAP_MANUAL:
    "snap-manual",

  REFERENCE_AXES:
    "reference-axes",

  EXTERNAL_REFERENCES:
    "external-references",

} as const;
