export type ModelSource =
  | "IFC"
  | "STEP"
  | "INTERNAL";


export interface LoadedModelInfo {
  readonly id: string;
  readonly name: string;
  readonly source: ModelSource;
  readonly visible: boolean;
}