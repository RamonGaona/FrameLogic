/**
 * El panel de SNAPs/ejes es un editor de contenido, no parte de las
 * herramientas generales del espacio modelo. Por eso debe salir del stack
 * que se oculta al editar una pieza FrameLogic aislada.
 */
export function dockPiecePreparationPanel(
  panel: HTMLElement,
  parent: HTMLElement,
  isolatedPieceEditor: boolean,
): void {
  if (panel.parentElement !== parent) {
    parent.appendChild(panel);
  }

  const insidePieceSidebar =
    isolatedPieceEditor
    && parent.getAttribute?.(
      "data-framelogic-piece-editor-preparation-slot",
    ) === "true";

  if (insidePieceSidebar) {
    Object.assign(panel.style, {
      position: "relative",
      left: "auto",
      top: "auto",
      bottom: "auto",
      width: "100%",
      maxWidth: "100%",
      maxHeight: "min(48vh, 440px)",
      minHeight: "140px",
      flex: "0 0 auto",
      overflowX: "hidden",
      overflowY: "auto",
      zIndex: "auto",
      pointerEvents: "auto",
      boxSizing: "border-box",
    });
    return;
  }

  // Fallback para el instante en que el editor ya está activo pero
  // su sidebar todavía no se ha montado.
  if (isolatedPieceEditor) {
    Object.assign(panel.style, {
      position: "fixed",
      left: "clamp(16px, 392px, calc(100vw - 376px))",
      top: "74px",
      bottom: "16px",
      width: "min(360px, calc(100vw - 32px))",
      maxWidth: "calc(100vw - 32px)",
      maxHeight: "calc(100vh - 90px)",
      minHeight: "0",
      flex: "none",
      overflowX: "hidden",
      overflowY: "auto",
      zIndex: "140",
      pointerEvents: "auto",
    });
    return;
  }

  Object.assign(panel.style, {
    position: "relative",
    left: "auto",
    top: "auto",
    bottom: "auto",
    width: "100%",
    maxWidth: "100%",
    maxHeight: "none",
    minHeight: "0",
    flex: "0 1 auto",
    overflowX: "hidden",
    overflowY: "auto",
    zIndex: "119",
    pointerEvents: "auto",
    boxSizing: "border-box",
  });
}
