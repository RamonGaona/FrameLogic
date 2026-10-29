declare const __FRAMELOGIC_VERSION__: string;


/**
 * Muestra una versión legible de FrameLogic en el navegador.
 *
 * La versión se toma del package.json raíz en build-time. El objetivo es que
 * el usuario pueda comprobar rápidamente si el sitio desplegado corresponde
 * a la versión de desarrollo indicada, sin tener que comparar hashes Git.
 */
export class BuildVersionBadgeController {
  private readonly element: HTMLDivElement;
  private disposed = false;

  constructor(container: HTMLElement) {
    const version =
      typeof __FRAMELOGIC_VERSION__ !== "undefined"
        ? __FRAMELOGIC_VERSION__
        : "local";

    const element = document.createElement("div");
    element.dataset["framelogicBuildVersion"] = "true";
    element.textContent = version === "local"
      ? "FrameLogic · local"
      : `FrameLogic v${version}`;
    element.title = version === "local"
      ? "Versión local"
      : `Versión desplegada: ${version}`;
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
