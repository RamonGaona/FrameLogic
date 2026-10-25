import type {
  PieceVector3Data,
} from "../pieces/PieceDefinition";


export type EngineeringDataSource =
  | "FRAMELOGIC"
  | "STEP_BREP_EXACT"
  | "STEP_DERIVED"
  | "CALCULATED"
  | "IMPORTED_IFC"
  | "MANUAL";


export interface PieceMaterialData {
  readonly name?: string;
  readonly grade?: string;
  readonly densityKgPerM3?: number;
  readonly source?: EngineeringDataSource;
}


export interface PieceCommercialData {
  readonly currency?: string;

  /**
   * Tarifa comercial o de venta propia de FrameLogic.
   * Se mantiene separada del costo unitario.
   */
  readonly tariff?: number;

  readonly unitCost?: number;
  readonly assemblyCost?: number;
  readonly supplier?: string;
  readonly sku?: string;

  /**
   * Tiempo previsto de instalación/montaje de una unidad.
   */
  readonly installationTimeHours?: number;
}


export interface PiecePhysicalData {
  readonly massKg?: number;
  readonly volumeM3?: number;
  readonly source?: EngineeringDataSource;
}


export interface StructuralSectionData {
  readonly code?: string;
  readonly name?: string;
  readonly areaM2?: number;
  readonly iyM4?: number;
  readonly izM4?: number;
  readonly torsionalConstantM4?: number;
}


export interface StructuralAxisDefinition {
  readonly id: string;
  readonly name: string;

  /**
   * Extremos del eje estructural en el sistema local de PieceDefinition.
   */
  readonly start: PieceVector3Data;
  readonly end: PieceVector3Data;

  /**
   * Dirección Y local opcional de la sección.
   * Permite conservar la orientación de Iy/Iz y cargas locales.
   */
  readonly localYDirection?: PieceVector3Data;

  readonly source: EngineeringDataSource;

  /**
   * Los ejes detectados automáticamente deben poder ser confirmados
   * por el usuario antes de usarse para análisis estructural.
   */
  readonly confirmed: boolean;

  readonly section?: StructuralSectionData;
}


export type PieceEngineeringFeature =
  | PieceHoleFeature
  | PieceAxisFeature
  | PiecePlaneFeature
  | PiecePointFeature
  | PieceCircleFeature
  | PieceCylinderFeature;


interface PieceFeatureBase {
  readonly id: string;
  readonly name?: string;
  readonly source: EngineeringDataSource;
}


export interface PieceHoleFeature
  extends PieceFeatureBase {
  readonly kind: "HOLE";
  readonly center: PieceVector3Data;
  readonly axisDirection: PieceVector3Data;
  readonly diameter: number;
  readonly depth?: number;
}


export interface PieceAxisFeature
  extends PieceFeatureBase {
  readonly kind: "AXIS";
  readonly origin: PieceVector3Data;
  readonly direction: PieceVector3Data;
  readonly length?: number;
}


export interface PiecePlaneFeature
  extends PieceFeatureBase {
  readonly kind: "PLANE";
  readonly origin: PieceVector3Data;
  readonly normal: PieceVector3Data;
}


export interface PiecePointFeature
  extends PieceFeatureBase {
  readonly kind: "POINT";
  readonly position: PieceVector3Data;
}


export interface PieceCircleFeature
  extends PieceFeatureBase {
  readonly kind: "CIRCLE";
  readonly center: PieceVector3Data;
  readonly normal: PieceVector3Data;
  readonly radius: number;
}


export interface PieceCylinderFeature
  extends PieceFeatureBase {
  readonly kind: "CYLINDER";
  readonly axisOrigin: PieceVector3Data;
  readonly axisDirection: PieceVector3Data;
  readonly radius: number;
  readonly length?: number;
}


/**
 * Datos de ingeniería cuyo dueño es FrameLogic.
 *
 * El STEP sigue siendo la fuente geométrica principal, pero precio,
 * montaje, clasificación y decisiones de ingeniería no dependen de que
 * otro programa CAD pueda escribir o leer propiedades personalizadas.
 */
export interface PieceEngineeringData {
  readonly pieceDefinitionId: string;
  readonly revision?: string;
  readonly material?: PieceMaterialData;
  readonly commercial?: PieceCommercialData;
  readonly physical?: PiecePhysicalData;
  readonly structuralAxis?: StructuralAxisDefinition;
  readonly features: readonly PieceEngineeringFeature[];
}
