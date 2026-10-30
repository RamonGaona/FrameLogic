export interface DesignLayer {

  /** Identificador estable de la capa. */
  readonly id: string;

  /** Nombre mostrado al usuario. */
  readonly name: string;

  /**
   * Color visual CAD del layer en formato hexadecimal #RRGGBB.
   * Por ahora no modifica piezas 3D ni referencias IFC.
   */
  readonly color?: string;

  /** Si es false, los objetos de esta capa no deben mostrarse. */
  readonly visible: boolean;

  /** Si es true, los objetos de esta capa no deben poder editarse. */
  readonly locked: boolean;

  /** Si es false, los objetos de esta capa no aportan candidatos SNAP. */
  readonly snapEnabled: boolean;

  /** Las capas del sistema no pueden eliminarse. */
  readonly system: boolean;

}


export const DEFAULT_DESIGN_LAYER_COLOR =
  "#e5e7eb";


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
