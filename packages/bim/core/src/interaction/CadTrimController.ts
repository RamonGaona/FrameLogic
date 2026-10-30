import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadHistoryController,
} from "./CadHistoryController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  CadWorkPlaneController,
} from "./CadWorkPlaneController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";


interface Vector3Data {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}


export interface CadTrimControllerOptions {
  readonly domElement: HTMLElement;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly lineScene: CadLineSceneController;
  readonly lineSelection: CadLineSelectionController;
  readonly pointSelection: CadPointSelectionController;
  readonly designSelection: DesignSelectionController;
  readonly workPlane: CadWorkPlaneController;
  readonly history: CadHistoryController;
  readonly beforeStart: () => void;
  readonly clearGeometryQueryCache?: () => void;
}


/**
 * TRIM / EXTEND unificado para líneas CAD.
 *
 * Regla de operación:
 * - primera línea = objetivo que se modifica;
 * - segunda línea = referencia;
 * - la intersección se calcula con las rectas infinitas proyectadas sobre
 *   el WorkPlane actual;
 * - si la intersección cae fuera del segmento objetivo, éste se alarga;
 * - si cae dentro, se recorta moviendo uno de sus extremos a la intersección.
 */
export class CadTrimController {
  private readonly options: CadTrimControllerOptions;
  private readonly status: HTMLDivElement;
  private readonly toolbarButton: HTMLButtonElement;
  private readonly mutationObserver: MutationObserver;

  private active = false;
  private disposed = false;
  private targetLineId: string | null = null;
  private targetPickParameter: number | null = null;
  private lastTAt = Number.NEGATIVE_INFINITY;

  private readonly doubleTWindowMs = 750;

  constructor(
    options: CadTrimControllerOptions,
  ) {
    this.options = options;
    this.status = this.createStatus();
    this.toolbarButton = this.createToolbarButton();

    this.mutationObserver = new MutationObserver(
      () => this.ensureToolbarButton(),
    );

    this.mutationObserver.observe(
      document.body,
      {
        childList: true,
        subtree: true,
      },
    );

    this.ensureToolbarButton();

    options.domElement.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );

    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
  }

  get isActive(): boolean {
    return this.active;
  }

  activate(): boolean {
    if (this.disposed) return false;

    this.options.beforeStart();
    this.active = true;
    this.targetLineId = null;
    this.targetPickParameter = null;

    this.options.lineSelection.setEnabled(false);
    this.options.pointSelection.setEnabled(false);
    this.options.designSelection.setEnabled(false);

    const selected = [
      ...this.options.lineSelection.getSelectedIds(),
    ];

    if (selected.length >= 2) {
      this.targetLineId = selected[0] ?? null;
      this.targetPickParameter = null;

      if (
        this.targetLineId
        && selected[1]
        && this.applyAgainstReference(
          this.targetLineId,
          selected[1],
        )
      ) {
        this.resetForNextPair(
          "TRIM aplicado · seleccione otra línea a modificar · Esc salir",
        );
      }
      else {
        this.showReferencePrompt();
      }

      return true;
    }

    if (selected.length === 1) {
      this.targetLineId = selected[0] ?? null;
      this.targetPickParameter = null;
      this.showReferencePrompt();
      return true;
    }

    this.options.lineSelection.clearSelection();
    this.showTargetPrompt();
    return true;
  }

  deactivate(): void {
    if (!this.active) return;

    this.active = false;
    this.targetLineId = null;
    this.targetPickParameter = null;
    this.status.style.display = "none";

    this.options.lineSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.designSelection.setEnabled(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.deactivate();
    this.mutationObserver.disconnect();

    this.options.domElement.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );

    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    this.toolbarButton.removeEventListener(
      "click",
      this.handleToolbarClick,
    );

    this.toolbarButton.remove();
    this.status.remove();
  }

  private readonly handleToolbarClick = (): void => {
    this.activate();
  };

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (
      this.disposed
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || this.isEditableTarget(event.target)
    ) {
      return;
    }

    if (event.key === "Escape" && this.active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.deactivate();
      return;
    }

    if (event.key.toLowerCase() !== "t") {
      this.lastTAt = Number.NEGATIVE_INFINITY;
      return;
    }

    const now = performance.now();
    const isDoubleT =
      now - this.lastTAt <= this.doubleTWindowMs;

    this.lastTAt = isDoubleT
      ? Number.NEGATIVE_INFINITY
      : now;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (isDoubleT) {
      this.activate();
    }
  };

  private readonly handlePointerUp = (
    event: PointerEvent,
  ): void => {
    if (
      !this.active
      || event.button !== 0
    ) {
      return;
    }

    const lineId =
      this.options.lineSelection.getLineIdAt(
        event.clientX,
        event.clientY,
      );

    if (!lineId) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (!this.targetLineId) {
      this.targetLineId = lineId;
      this.targetPickParameter =
        this.getPickParameter(
          lineId,
          event.clientX,
          event.clientY,
        );

      this.options.lineSelection.setSelection(
        [lineId],
        true,
      );

      this.showReferencePrompt();
      return;
    }

    if (lineId === this.targetLineId) {
      this.setStatus(
        "TRIM · la referencia debe ser otra línea",
      );
      return;
    }

    const targetId = this.targetLineId;

    if (
      this.applyAgainstReference(
        targetId,
        lineId,
      )
    ) {
      this.resetForNextPair(
        "TRIM aplicado · seleccione otra línea a modificar · Esc salir",
      );
    }
  };

  private applyAgainstReference(
    targetId: string,
    referenceId: string,
  ): boolean {
    const target =
      this.options.designModel.cadLines.get(
        targetId,
      );

    const reference =
      this.options.designModel.cadLines.get(
        referenceId,
      );

    if (!target || !reference) {
      this.setStatus(
        "TRIM · no se pudo encontrar una de las líneas",
      );
      return false;
    }

    const targetLayer =
      this.options.designModel.layers.get(
        target.layerId,
      );

    if (targetLayer?.locked) {
      this.setStatus(
        "TRIM · la primera línea está en una capa bloqueada",
      );
      return false;
    }

    const plane =
      this.options.workPlane.getState();

    const targetStart =
      new THREE.Vector3(
        target.start.x,
        target.start.y,
        target.start.z,
      );

    const targetEnd =
      new THREE.Vector3(
        target.end.x,
        target.end.y,
        target.end.z,
      );

    const referenceStart =
      new THREE.Vector3(
        reference.start.x,
        reference.start.y,
        reference.start.z,
      );

    const referenceEnd =
      new THREE.Vector3(
        reference.end.x,
        reference.end.y,
        reference.end.z,
      );

    const a = this.projectToPlane2D(
      targetStart,
      plane.origin,
      plane.xAxis,
      plane.yAxis,
    );

    const b = this.projectToPlane2D(
      targetEnd,
      plane.origin,
      plane.xAxis,
      plane.yAxis,
    );

    const c = this.projectToPlane2D(
      referenceStart,
      plane.origin,
      plane.xAxis,
      plane.yAxis,
    );

    const d = this.projectToPlane2D(
      referenceEnd,
      plane.origin,
      plane.xAxis,
      plane.yAxis,
    );

    const targetDirection =
      b.clone().sub(a);

    const referenceDirection =
      d.clone().sub(c);

    if (
      targetDirection.lengthSq() <= 1e-18
      || referenceDirection.lengthSq() <= 1e-18
    ) {
      this.setStatus(
        "TRIM · una de las líneas no tiene longitud suficiente",
      );
      return false;
    }

    const denominator =
      this.cross2(
        targetDirection,
        referenceDirection,
      );

    if (Math.abs(denominator) <= 1e-10) {
      this.setStatus(
        "TRIM · líneas paralelas; seleccione otra referencia",
      );
      return false;
    }

    const fromTargetToReference =
      c.clone().sub(a);

    const targetParameter =
      this.cross2(
        fromTargetToReference,
        referenceDirection,
      )
      / denominator;

    const epsilon = 1e-8;

    if (
      Math.abs(targetParameter) <= epsilon
      || Math.abs(targetParameter - 1) <= epsilon
    ) {
      this.setStatus(
        "TRIM · la primera línea ya termina en la referencia",
      );
      return false;
    }

    const intersection =
      targetStart.clone().lerp(
        targetEnd,
        targetParameter,
      );

    let moveStart: boolean;

    if (targetParameter < 0) {
      moveStart = true;
    }
    else if (targetParameter > 1) {
      moveStart = false;
    }
    else if (this.targetPickParameter !== null) {
      /*
       * Cuando la línea objetivo fue escogida con clic, recortamos el lado
       * sobre el que se hizo clic, igual que en un flujo CAD tradicional.
       */
      moveStart =
        this.targetPickParameter
        < targetParameter;
    }
    else {
      /*
       * Si la línea ya estaba preseleccionada no existe un lado de clic.
       * Se recorta el extremo más cercano a la intersección.
       */
      moveStart =
        intersection.distanceToSquared(
          targetStart,
        )
        <= intersection.distanceToSquared(
          targetEnd,
        );
    }

    const beforeStart: Vector3Data = {
      x: target.start.x,
      y: target.start.y,
      z: target.start.z,
    };

    const beforeEnd: Vector3Data = {
      x: target.end.x,
      y: target.end.y,
      z: target.end.z,
    };

    const afterStart: Vector3Data = moveStart
      ? {
          x: intersection.x,
          y: intersection.y,
          z: intersection.z,
        }
      : beforeStart;

    const afterEnd: Vector3Data = moveStart
      ? beforeEnd
      : {
          x: intersection.x,
          y: intersection.y,
          z: intersection.z,
        };

    this.applyGeometry(
      targetId,
      afterStart,
      afterEnd,
    );

    this.options.history.recordOperation(
      targetParameter < 0 || targetParameter > 1
        ? "EXTEND"
        : "TRIM",
      () => {
        this.applyGeometry(
          targetId,
          beforeStart,
          beforeEnd,
        );
      },
      () => {
        this.applyGeometry(
          targetId,
          afterStart,
          afterEnd,
        );
      },
    );

    this.options.lineSelection.setSelection(
      [targetId],
      true,
    );

    return true;
  }

  private applyGeometry(
    lineId: string,
    start: Vector3Data,
    end: Vector3Data,
  ): void {
    this.options.designModel.cadLines.updateGeometry(
      lineId,
      start,
      end,
    );

    this.options.lineScene.sync();
    this.options.clearGeometryQueryCache?.();
  }

  private getPickParameter(
    lineId: string,
    clientX: number,
    clientY: number,
  ): number | null {
    const line =
      this.options.designModel.cadLines.get(
        lineId,
      );

    if (!line) return null;

    const planeState =
      this.options.workPlane.getState();

    const pointerPoint =
      this.options.workPlane.intersectPointer(
        clientX,
        clientY,
        this.options.cameraProvider(),
        this.options.domElement,
      );

    if (!pointerPoint) return null;

    const start = this.projectToPlane2D(
      new THREE.Vector3(
        line.start.x,
        line.start.y,
        line.start.z,
      ),
      planeState.origin,
      planeState.xAxis,
      planeState.yAxis,
    );

    const end = this.projectToPlane2D(
      new THREE.Vector3(
        line.end.x,
        line.end.y,
        line.end.z,
      ),
      planeState.origin,
      planeState.xAxis,
      planeState.yAxis,
    );

    const pointer = this.projectToPlane2D(
      pointerPoint,
      planeState.origin,
      planeState.xAxis,
      planeState.yAxis,
    );

    const direction =
      end.clone().sub(start);

    const lengthSq =
      direction.lengthSq();

    if (lengthSq <= 1e-18) return null;

    return pointer
      .clone()
      .sub(start)
      .dot(direction)
      / lengthSq;
  }

  private projectToPlane2D(
    point: THREE.Vector3,
    origin: THREE.Vector3,
    xAxis: THREE.Vector3,
    yAxis: THREE.Vector3,
  ): THREE.Vector2 {
    const relative =
      point.clone().sub(origin);

    return new THREE.Vector2(
      relative.dot(xAxis),
      relative.dot(yAxis),
    );
  }

  private cross2(
    first: THREE.Vector2,
    second: THREE.Vector2,
  ): number {
    return first.x * second.y
      - first.y * second.x;
  }

  private resetForNextPair(
    message: string,
  ): void {
    this.targetLineId = null;
    this.targetPickParameter = null;
    this.setStatus(message);
  }

  private showTargetPrompt(): void {
    this.setStatus(
      "TRIM · seleccione la línea a modificar · Esc salir",
    );
  }

  private showReferencePrompt(): void {
    this.setStatus(
      "TRIM · seleccione la línea de referencia · Esc salir",
    );
  }

  private setStatus(
    message: string,
  ): void {
    this.status.textContent = message;
    this.status.style.display = "block";
  }

  private createStatus(): HTMLDivElement {
    const status = document.createElement("div");
    status.dataset["framelogicTrimStatus"] = "true";

    Object.assign(
      status.style,
      {
        position: "fixed",
        left: "50%",
        top: "58px",
        transform: "translateX(-50%)",
        zIndex: "2147482500",
        display: "none",
        padding: "6px 10px",
        border: "1px solid rgba(120,190,220,0.38)",
        borderRadius: "4px",
        background: "rgba(10,17,22,0.94)",
        color: "#d8edf5",
        font: "12px system-ui, sans-serif",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
      },
    );

    document.body.append(status);
    return status;
  }

  private createToolbarButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset["framelogicTrimButton"] = "true";
    button.textContent = "TRIM";
    button.title =
      "TRIM / EXTEND · TT · primera línea se modifica, segunda es referencia";

    button.addEventListener(
      "click",
      this.handleToolbarClick,
    );

    return button;
  }

  private ensureToolbarButton(): void {
    if (
      this.disposed
      || this.toolbarButton.isConnected
    ) {
      return;
    }

    const lineButton =
      Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          "button",
        ),
      ).find(
        (button) =>
          button.textContent?.trim() === "LINE"
          && button.dataset["framelogicTrimButton"] !== "true",
      );

    if (!lineButton) return;

    this.toolbarButton.className =
      lineButton.className;

    this.toolbarButton.style.cssText =
      lineButton.style.cssText;

    lineButton.after(
      this.toolbarButton,
    );
  }

  private isEditableTarget(
    target: EventTarget | null,
  ): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    return target.isContentEditable
      || target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement;
  }
}
