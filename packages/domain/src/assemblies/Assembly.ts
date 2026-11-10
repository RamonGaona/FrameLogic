import type {
  Classifiable,
} from "../common/Classifiable";


/**
 * Transitional assembly model.
 *
 * The target architecture replaces this with
 * AssemblyDefinition + AssemblyInstance.
 * Until that migration happens, this concrete
 * assembly behaves as a placed project object
 * and therefore owns a layerId.
 */
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
   * Capa del proyecto de este ensamblaje
   * concreto.
   */
  readonly layerId: string;


  /**
   * Instancias que forman el ensamblaje.
   */
  readonly pieceInstanceIds:
    readonly string[];

  /**
   * Optional parent for true nested assemblies. Missing = project root;
   * legacy FRAMELOGIC_PROJECT v1 snapshots therefore keep working.
   */
  readonly parentAssemblyId?: string;

  /**
   * A locked parent protects its whole subtree from interactive edits.
   */
  readonly locked?: boolean;

}
