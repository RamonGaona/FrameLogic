import type {
    Classifiable,
  } from "../common/Classifiable";
  
  
  export interface Assembly
    extends Classifiable {
  
    /**
     * Identificador interno del ensamblaje.
     */
    readonly id: string;
  
  
    /**
     * Nombre mostrado al usuario.
     */
    readonly name: string;
  
  
    /**
     * Instancias que forman el ensamblaje.
     */
    readonly pieceInstanceIds:
      readonly string[];
  
  }