const FRAMELOGIC_VERSION = "0.1.2";


/**
 * Muestra una versión legible de FrameLogic en el navegador.
 *
 * La versión queda embebida directamente en el bundle para que no dependa de
 * variables de Cloudflare, GitHub Actions ni Vite. Si el navegador muestra una
 * versión distinta, está ejecutando otro build.
 */
export class BuildVersionBadgeController {
  private readonly element: HTMLDivElement;
  private disposed = false;

  constructor(container: HTMLElement) {
    const element = document.createElement("div");
    element.dataset["framelogicBuildVersion"] = "true";
    element.textContent = `FrameLogic v${FRAMELOGIC_VERSION}`;
    element.title = `Versión desplegada: ${FRAMELOGIC_VERSION}`;
    Object.assign(element.style, {
      position: "absolute",
      right: "8px",
      bottom: "8px",
      zIndex: "30000",
      padding: "3px 6px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "rgba(12,18,22,0.82)",
      color: "#9fb4bf",
      font: "10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      lineHeight: "1.2",
      pointerEvents: "none",
      userSelect: "none",
    });

    container.append(element);
    this.element = element;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.element.remove();
  }
}
