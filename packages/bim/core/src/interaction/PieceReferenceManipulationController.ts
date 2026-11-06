import * as THREE from "three";
import type { PieceDefinitionPreparationController } from "./PieceDefinitionPreparationController";
import type { PieceDefinitionHelperSceneController } from "../design/PieceDefinitionHelperSceneController";

export type ReferenceEditMode = "SELECT" | "MOVE" | "COPY";

/**
 * Explicit two-click reference editing. It never intercepts regular CAD
 * commands unless the user explicitly activates the reference tool.
 */
export class PieceReferenceManipulationController {
  private mode: ReferenceEditMode | null = null;
  private awaitingSource = false;
  private pointerStart: {x:number;y:number}|null = null;

  constructor(private readonly options: {
    readonly canvas: HTMLElement;
    readonly cameraProvider: () => THREE.Camera;
    readonly preparation: PieceDefinitionPreparationController;
    readonly helpers: PieceDefinitionHelperSceneController;
    readonly snapAt: (x:number,y:number) => THREE.Vector3 | null;
    readonly beforeStart: () => void;
    readonly onChanged: () => void;
  }) {
    options.canvas.addEventListener("pointerdown", this.onPointerDown, true);
    options.canvas.addEventListener("pointerup", this.onPointerUp, true);
    window.addEventListener("keydown", this.onKeyDown, true);
  }

  get isActive(): boolean { return this.mode !== null; }

  activate(mode: ReferenceEditMode): void {
    if (!this.options.preparation.isActive) return;
    this.options.beforeStart();
    this.mode = mode;
    this.awaitingSource = !this.options.preparation.getPinnedReference();
    this.options.preparation.setReferenceToolMessage(
      mode === "SELECT" || this.awaitingSource
        ? "Selecciona un marcador SNAP o un eje directamente sobre la pieza (Esc cancela)."
        : `${mode === "COPY" ? "Copiar" : "Mover"}: haz clic en el SNAP de destino (Esc cancela).`,
    );
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.mode || event.button !== 0) return;
    this.pointerStart = {x:event.clientX,y:event.clientY};
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.mode || event.button !== 0 || !this.pointerStart) return;
    const from = this.pointerStart;
    this.pointerStart = null;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (Math.hypot(event.clientX-from.x,event.clientY-from.y) > 5) return;

    if (this.mode === "SELECT" || this.awaitingSource) {
      const focus = this.options.helpers.findReferenceAtPointer(
        event.clientX,event.clientY,
        this.options.cameraProvider(),
        this.options.canvas.getBoundingClientRect(),
      );
      if (!focus) {
        this.options.preparation.setReferenceToolMessage(
          "No se detectó un marcador o eje; haz clic cerca de una referencia visible.",
        );
        return;
      }
      this.options.preparation.selectReference(focus);
      if (this.mode === "SELECT") {
        this.mode = null;
        this.options.preparation.setReferenceToolMessage(
          "Referencia seleccionada. Elige Mover referencia o Copiar referencia.",
        );
      } else {
        this.awaitingSource = false;
        this.options.preparation.setReferenceToolMessage(
          "Referencia seleccionada. Haz clic en el SNAP de destino.",
        );
      }
      return;
    }

    const destination = this.options.snapAt(event.clientX,event.clientY);
    if (!destination) {
      this.options.preparation.setReferenceToolMessage(
        "No se encontró un SNAP preciso de destino. Apunta a un punto válido.",
      );
      return;
    }
    try {
      const copying = this.mode === "COPY";
      this.options.preparation.relocatePinnedReference(destination, copying);
      this.options.onChanged();
      this.mode = null;
      this.options.preparation.setReferenceToolMessage(
        copying ? "Referencia copiada al SNAP de destino." : "Referencia movida al SNAP de destino.",
      );
    } catch (error) {
      this.options.preparation.setReferenceToolMessage(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.mode || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.cancel();
  };

  cancel(): void {
    this.mode = null;
    this.awaitingSource = false;
    this.pointerStart = null;
    this.options.preparation.setReferenceToolMessage("Edición de referencia cancelada.");
  }

  dispose(): void {
    this.cancel();
    this.options.canvas.removeEventListener("pointerdown", this.onPointerDown, true);
    this.options.canvas.removeEventListener("pointerup", this.onPointerUp, true);
    window.removeEventListener("keydown", this.onKeyDown, true);
  }
}
