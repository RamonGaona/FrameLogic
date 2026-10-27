export interface MoveRulerExperienceControllerOptions {
  readonly container: HTMLElement;
}

/**
 * Complementa la entrada numérica existente de MOVE con la acción HASTA.
 *
 * DesignTransformController ya arma el eje cuando el usuario hace un clic
 * corto sobre X/Y/Z/XY/XZ/YZ. El siguiente clic sobre un SNAP mueve la
 * selección hasta ese punto restringiendo el desplazamiento al eje/plano.
 * Este controlador hace visible ese comportamiento como en SpaceClaim:
 * Distancia + Hasta.
 */
export class MoveRulerExperienceController {
  private readonly options: MoveRulerExperienceControllerOptions;
  private readonly observer: MutationObserver;
  private readonly hint: HTMLDivElement;
  private disposed = false;

  constructor(
    options: MoveRulerExperienceControllerOptions,
  ) {
    this.options = options;
    this.hint = this.createHint(options.container);
    this.observer = new MutationObserver(() => this.decorate());
    this.observer.observe(options.container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    this.decorate();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.hint.remove();
  }

  private decorate(): void {
    if (this.disposed) return;
    const numericInput = this.options.container
      .querySelector<HTMLInputElement>(
        'input[data-cad-numeric="true"]',
      );
    if (!numericInput) return;

    const fields = numericInput.parentElement?.parentElement;
    const root = fields?.parentElement;
    if (!(root instanceof HTMLDivElement)) return;
    const title = root.firstElementChild;
    if (!(title instanceof HTMLElement)) return;
    const text = title.textContent ?? "";
    if (!text.startsWith("MOVE ·")) {
      root.querySelector('[data-framelogic-move-until="true"]')?.remove();
      return;
    }

    const labels = fields?.querySelectorAll("label") ?? [];
    for (const label of labels) {
      const caption = label.querySelector("span");
      if (
        caption
        && !caption.textContent?.startsWith("Dist.")
      ) {
        caption.textContent = `Dist. ${caption.textContent ?? ""}`.trim();
      }
    }

    if (root.querySelector('[data-framelogic-move-until="true"]')) {
      return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.dataset["framelogicMoveUntil"] = "true";
    button.textContent = "Hasta";
    button.title =
      "Mover hasta un SNAP usando el eje/plano seleccionado del gizmo";
    Object.assign(button.style, {
      height: "30px",
      padding: "0 10px",
      border: "1px solid rgba(104,215,255,0.5)",
      borderRadius: "4px",
      background: "rgba(49,82,96,0.92)",
      color: "#eaf9ff",
      cursor: "pointer",
      font: "12px system-ui, sans-serif",
    });
    button.addEventListener("click", () => {
      /*
       * El eje queda armado por DesignTransformController al soltar el clic
       * corto sobre el gizmo. Ocultamos únicamente la regla numérica y dejamos
       * que el siguiente clic SNAP ejecute el movimiento exacto existente.
       */
      root.style.display = "none";
      this.showHint(
        "HASTA — seleccione un punto SNAP de destino",
      );
      this.options.container.focus?.();
    });
    root.append(button);
  }

  private createHint(container: HTMLElement): HTMLDivElement {
    const hint = document.createElement("div");
    Object.assign(hint.style, {
      position: "absolute",
      left: "50%",
      bottom: "58px",
      transform: "translateX(-50%)",
      zIndex: "176",
      display: "none",
      padding: "5px 9px",
      border: "1px solid rgba(104,215,255,0.45)",
      borderRadius: "5px",
      background: "rgba(18,25,30,0.94)",
      color: "#ccefff",
      pointerEvents: "none",
      font: "12px system-ui, sans-serif",
    });
    container.append(hint);
    return hint;
  }

  private showHint(message: string): void {
    this.hint.textContent = message;
    this.hint.style.display = "block";
    const expected = message;
    window.setTimeout(() => {
      if (this.hint.textContent === expected) {
        this.hint.style.display = "none";
      }
    }, 2200);
  }
}
