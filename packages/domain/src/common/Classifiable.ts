export interface Classifiable {

    /**
     * Clasificación libre definida por el usuario.
     *
     * Ejemplos:
     * Torre
     * Tensor
     * Brazo
     * Puntal
     * Especial
     *
     * FrameLogic no interpreta este valor.
     */
    readonly classification?: string;
  
  
    /**
     * Etiquetas libres para búsqueda y filtrado.
     *
     * Ejemplos:
     * Superslim
     * Megashor
     * Exterior
     * Temporal
     * Zona Norte
     */
    readonly tags: readonly string[];
  
  }