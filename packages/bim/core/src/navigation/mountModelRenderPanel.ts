/**
 * Render/quality controls must remain above isolated Piece FrameLogic editor
 * overlays. Rendering the controls inside the WebGL viewport can place them
 * behind a separate stacking context even when the controls have z-index.
 */
export function mountModelRenderPanel(
  panel: HTMLElement,
  body: HTMLElement,
): void {
  Object.assign(panel.style, {
    position: "fixed",
    right: "16px",
    bottom: "16px",
    zIndex: "2147481500",
    pointerEvents: "auto",
  });
  body.appendChild(panel);
}
