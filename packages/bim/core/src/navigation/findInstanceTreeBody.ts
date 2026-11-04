/**
 * El panel INSTANCIAS puede ser movido por installModelSpacePanelLayout
 * desde el visor a una pila lateral montada en document.body.
 * Los controladores de secciones, CAD y PDF deben encontrar el mismo arbol
 * antes y despues de esa reubicacion.
 */
export function findInstanceTreeBody(container: HTMLElement): HTMLElement | null {
  const selector = '[data-framelogic-instance-tree-body="true"]';
  return container.querySelector<HTMLElement>(selector)
    ?? document.querySelector<HTMLElement>(
      '[data-framelogic-model-space-panel-stack="true"] ' + selector,
    )
    ?? document.querySelector<HTMLElement>(selector);
}
