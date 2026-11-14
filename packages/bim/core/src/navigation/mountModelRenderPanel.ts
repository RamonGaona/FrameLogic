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
  // Guard optional DOM hooks for the headless unit test and non-browser runtimes.
  if (typeof document !== "undefined" && panel.dataset) {
    panel.dataset["framelogicModelRenderPanel"] = "true";
    // Model Space controls must never float on top of a Paper Space View.
    if (!document.getElementById("framelogic-model-render-visibility")) {
    const rule = document.createElement("style");
    rule.id = "framelogic-model-render-visibility";
    rule.textContent = `body:has([data-framelogic-drawing-workspace="true"][style*="display: flex"]) 
      [data-framelogic-model-render-panel="true"] { display: none !important; }`;
      document.head.append(rule);
    }
  }
  body.appendChild(panel);
}
