export type AssetFormat =
  | "IFC"
  | "STEP"
  | "GLB"
  | "INTERNAL";


export interface AssetDefinition {

  /**
   * Identificador único del asset.
   */
  readonly id: string;


  /**
   * Nombre mostrado al usuario.
   */
  readonly name: string;


  /**
   * Formato original de la geometría.
   */
  readonly format: AssetFormat;


  /**
   * Hash del contenido.
   *
   * Más adelante permitirá detectar
   * archivos duplicados aunque tengan
   * nombres diferentes.
   */
  readonly contentHash?: string;


  /**
   * Ruta, URL o referencia al recurso.
   *
   * De momento puede quedar vacío
   * mientras trabajamos con archivos locales.
   */
  readonly sourceUri?: string;


  /**
   * Versión del asset.
   */
  readonly version: number;

}