const FRAMELOGIC_VERSION = "0.1.11";


/**
 * Muestra una versión legible y permanente de FrameLogic en Model Space.
 *
 * La versión queda embebida directamente en el bundle y el badge usa
 * position: fixed para no depender del clipping/overflow del contenedor 3D.
 */
export class BuildVersionBadgeController {
  private readonly element: HTMLDivElement;
  private disposed = false;

  constructor(container: HTMLElement) {
    void container;

    const previous = document.querySelector<HTMLElement>(
      '[data-framelogic-build-version="true"]',
    );
    previous?.remove();

    const element = document.createElement("div");
    element.dataset["framelogicBuildVersion"] = "true";
    element.textContent = `FrameLogic v${FRAMELOGIC_VERSION}`;
    element.title = `Versión desplegada: ${FRAMELOGIC_VERSION}`;
    Object.assign(element.style, {
      position: "fixed",
      right: "10px",
      bottom: "10px",
      zIndex: "2147483000",
      padding: "4px 8px",
      border: "1px solid rgba(120,190,220,0.38)",
      borderRadius: "4px",
      background: "rgba(10,17,22,0.94)",
      color: "#c7e8f5",
      font: "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      lineHeight: "1.2",
      boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
      pointerEvents: "none",
      userSelect: "none",
    });

    document.body.append(element);
    this.element = element;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.element.remove();
  }
}
