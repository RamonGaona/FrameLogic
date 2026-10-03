export type ModelSource =
  | "IFC"
  | "STEP"
  | "INTERNAL";


export type ModelRole =
  | "REFERENCE"
  | "DESIGN";


export interface LoadedModelInfo {

  readonly id: string;

  readonly name: string;

  readonly source: ModelSource;

  readonly role: ModelRole;

  /**
   * Capa del proyecto a la que pertenece
   * este modelo colocado.
   */
  readonly layerId: string;

  /**
   * Visibilidad individual del modelo.
   * La visibilidad efectiva también depende
   * de la capa.
   */
  readonly visible: boolean;

}
