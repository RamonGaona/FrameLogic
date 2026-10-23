import type {
  Point3,
} from "../types/Point3";

import type {
  Vector3,
} from "../types/Vector3";


export type StepFeaturePrecision =
  | "BREP_EXACT"
  | "DERIVED";


export interface StepMeshData {
  readonly id: string;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normals?: Float32Array;
}


interface StepFeatureBase {
  readonly id: string;
  readonly name?: string;
  readonly precision: StepFeaturePrecision;
}


export interface StepHoleFeature
  extends StepFeatureBase {
  readonly kind: "HOLE";
  readonly center: Point3;
  readonly axisDirection: Vector3;
  readonly diameter: number;
  readonly depth?: number;
}


export interface StepCircleFeature
  extends StepFeatureBase {
  readonly kind: "CIRCLE";
  readonly center: Point3;
  readonly normal: Vector3;
  readonly radius: number;
}


export interface StepCylinderFeature
  extends StepFeatureBase {
  readonly kind: "CYLINDER";
  readonly axisOrigin: Point3;
  readonly axisDirection: Vector3;
  readonly radius: number;
  readonly length?: number;
}


export interface StepPointFeature
  extends StepFeatureBase {
  readonly kind: "POINT";
  readonly position: Point3;
}


export interface StepAxisFeature
  extends StepFeatureBase {
  readonly kind: "AXIS";
  readonly origin: Point3;
  readonly direction: Vector3;
  readonly length?: number;
}


export interface StepPlaneFeature
  extends StepFeatureBase {
  readonly kind: "PLANE";
  readonly origin: Point3;
  readonly normal: Vector3;
}


export type StepGeometryFeature =
  | StepHoleFeature
  | StepCircleFeature
  | StepCylinderFeature
  | StepPointFeature
  | StepAxisFeature
  | StepPlaneFeature;


export type StepMatrix4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];


export interface StepProductNode {
  readonly id: string;
  readonly name?: string;
  readonly geometryIds: readonly string[];
  readonly childIds: readonly string[];
  readonly localTransform?: StepMatrix4;
}


export interface StepGeometryDocument {
  readonly id: string;
  readonly sourceFileName: string;

  /**
   * Factor que convierte una unidad nativa del STEP a metros.
   */
  readonly unitScaleToMeters: number;

  /**
   * Malla de visualización. No es la autoridad de precisión.
   */
  readonly meshes: readonly StepMeshData[];

  /**
   * Features obtenidas desde B-Rep o derivadas explícitamente.
   */
  readonly features: readonly StepGeometryFeature[];

  /**
   * Estructura de producto/ensamblaje contenida en el STEP cuando exista.
   */
  readonly products: readonly StepProductNode[];
}


export interface LoadStepGeometryOptions {
  readonly sourceFileName: string;
  readonly targetUnit?: "meter" | "millimeter";
  readonly includeExactFeatures?: boolean;
}


/**
 * Contrato estable entre FrameLogic y cualquier implementación OCCT.
 *
 * La implementación concreta debe ejecutarse preferiblemente en Web Worker.
 * FrameLogic no debe depender directamente del API de una librería OCCT.
 */
export interface StepGeometryAdapter {
  load(
    data: Uint8Array,
    options: LoadStepGeometryOptions,
  ): Promise<StepGeometryDocument>;

  disposeDocument?(
    documentId: string,
  ): Promise<void> | void;
}
