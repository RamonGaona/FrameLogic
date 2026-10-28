declare const __FRAMELOGIC_BUILD_SHA__: string;


/**
 * Muestra el commit exacto que está ejecutando el navegador.
 *
 * El valor se inyecta en build-time desde Vite usando GITHUB_SHA o
 * CF_PAGES_COMMIT_SHA. Esto permite comparar el sitio desplegado con el HEAD
 * de desarrollo sin depender de caché ni de suposiciones sobre Cloudflare.
 */
export class BuildVersionBadgeController {
  private readonly element: HTMLDivElement;
  private disposed = false;

  constructor(container: HTMLElement) {
    const raw =
      typeof __FRAMELOGIC_BUILD_SHA__ !== "undefined"
        ? __FRAMELOGIC_BUILD_SHA__
        : "local";
    const short = raw === "local"
      ? raw
      : raw.slice(0, 8);

    const element = document.createElement("div");
    element.dataset["framelogicBuildVersion"] = "true";
    element.textContent = `FrameLogic · ${short}`;
    element.title = raw === "local"
      ? "Build local"
      : `Commit desplegado: ${raw}`;
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
