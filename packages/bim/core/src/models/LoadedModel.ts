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

  readonly visible: boolean;

}