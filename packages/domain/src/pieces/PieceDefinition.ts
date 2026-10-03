import type {
  Classifiable,
} from "../common/Classifiable";


export interface PieceVector3Data {

  readonly x: number;

  readonly y: number;

  readonly z: number;

}


export interface LocalCoordinateSystem {

  /**
   * Origen del sistema local expresado
   * en coordenadas nativas del asset geométrico.
   */
  readonly origin:
    PieceVector3Data;


  /**
   * Base ortonormal local expresada en
   * coordenadas nativas del asset.
   */
  readonly xAxis:
    PieceVector3Data;

  readonly yAxis:
    PieceVector3Data;

  readonly zAxis:
    PieceVector3Data;

}


export type PersistentSnapType =
  | "ORIGIN"
  | "CENTER"
  | "CONNECTION"
  | "REFERENCE"
  | "CUSTOM";


export interface PieceSnapPoint {

  readonly id: string;

  readonly name: string;

  readonly type:
    PersistentSnapType;


  /**
   * Coordenada en el sistema local de PieceDefinition.
   */
  readonly position:
    PieceVector3Data;


  readonly relatedAxisId?:
    string;

}


export type ReferenceAxisType =
  | "MAIN"
  | "HOLE"
  | "CONNECTION"
  | "REFERENCE";


export interface ReferenceAxisLine {

  readonly id: string;

  readonly name: string;

  readonly type:
    ReferenceAxisType;


  /**
   * Origen y dirección expresados
   * en coordenadas locales de PieceDefinition.
   */
  readonly origin:
    PieceVector3Data;

  readonly direction:
    PieceVector3Data;

  readonly length?:
    number;

}


export interface PieceReferenceGeometry {

  readonly axisLines:
    readonly ReferenceAxisLine[];

}


export interface PieceDefinition
  extends Classifiable {

  /**
   * Identificador interno único.
   */
  readonly id: string;


  /**
   * Código técnico o comercial de la pieza.
   */
  readonly code: string;


  /**
   * Nombre mostrado al usuario.
   */
  readonly name: string;


  /**
   * Referencia a la geometría reutilizable.
   */
  readonly geometryAssetId: string;


  /**
   * Sistema local de ingeniería de la definición.
   *
   * La base se expresa respecto al sistema nativo
   * del asset geométrico.
   */
  readonly coordinateSystem:
    LocalCoordinateSystem;


  /**
   * SNAPs persistentes definidos manualmente.
   */
  readonly snapPoints:
    readonly PieceSnapPoint[];


  /**
   * Geometría auxiliar de ingeniería.
   */
  readonly referenceGeometry:
    PieceReferenceGeometry;

}
