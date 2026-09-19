import type {
    Classifiable,
  } from "../common/Classifiable";
  
  
  export interface PieceDefinition
    extends Classifiable {
  
    /**
     * Identificador interno único.
     */
    readonly id: string;
  
  
    /**
     * Código técnico o comercial de la pieza.
     *
     * Ejemplo:
     * MP_1800
     * SS_3600
     */
    readonly code: string;
  
  
    /**
     * Nombre mostrado al usuario.
     */
    readonly name: string;
  
  
    /**
     * Referencia a la geometría reutilizable.
     *
     * Más adelante apuntará a AssetDefinition.
     */
    readonly geometryAssetId: string;
  
  }