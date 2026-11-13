import type {
  CadLinePlacementController,
} from "./CadLinePlacementController";


export interface CadLineNumericPreviewBridgeControllerOptions {
  readonly container: HTMLElement;
  readonly linePlacement: CadLinePlacementController;
}

/**
 * Sincroniza la longitud digitada con la cota temporal de LINE.
 *
 * CadNumericInputController conserva la entrada numérica inferior. Mientras
 * el usuario escribe una longitud (por ejemplo 3000), este bridge reemplaza
 * únicamente el texto informativo de la cota temporal. La geometría definitiva
 * sigue siendo creada por CadLinePlacementController al confirmar con Enter.
 */
export class CadLineNumericPreviewBridgeController {
  private readonly container: HTMLElement;
  private readonly linePlacement: CadLinePlacementController;
  private frame: number | null = null;
  private disposed = false;

  constructor(
    options: CadLineNumericPreviewBridgeControllerOptions,
  ) {
    this.container = options.container;
    this.linePlacement = options.linePlacement;
    this.schedule();
  }

  private schedule(): void {
    const tick = (): void => {
      if (this.disposed) return;

      this.sync();
      this.frame = window.requestAnimationFrame(tick);
    };

    this.frame = window.requestAnimationFrame(tick);
  }

  private sync(): void {
    if (
      !this.linePlacement.isActive
      || !this.linePlacement.hasStartPoint
    ) {
      return;
    }

    const inputs = Array.from(
      this.container.querySelectorAll<HTMLInputElement>(
        'input[data-cad-numeric="true"]',
      ),
    ).filter(
      (input) =>
        input.isConnected
        && input.getClientRects().length > 0,
    );

    /* LINE_DISTANCE es el único modo de LINE con una sola casilla visible. */
    if (inputs.length !== 1) {
      return;
    }

    const raw = inputs[0]?.value.trim() ?? "";
    if (raw.length === 0) {
      return;
    }

    const distance = Number(raw.replace(",", "."));
    if (
      !Number.isFinite(distance)
      || Math.abs(distance) <= 1e-12
    ) {
      return;
    }

    const label = document.querySelector<HTMLElement>(
      '[data-framelogic-temporary-line-dimension="true"]'
      + ':not([data-framelogic-temporary-line-angle="true"])',
    );

    if (!label || label.style.display === "none") {
      return;
    }

    label.textContent = `${Math.round(Math.abs(distance)).toLocaleString(
      "es-CO",
      {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      },
    )} mm`;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.frame !== null) {
      window.cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }
}
