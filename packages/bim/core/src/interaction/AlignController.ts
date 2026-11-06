import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";
import type { CadHistoryController } from "./CadHistoryController";

import type {
  CadReferenceBlockController,
} from "../import/CadReferenceBlockController";

export interface AlignControllerOptions {
  readonly container: HTMLElement;
  readonly canvas: HTMLElement;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly designSelection: DesignSelectionController;
  readonly cadReferenceBlocks: CadReferenceBlockController;
  readonly history: CadHistoryController;
  readonly cancelActiveCommand: () => void;
  readonly clearGeometryQueryCache: () => void;
  readonly findSnapPoint: (
    clientX: number,
    clientY: number,
  ) => THREE.Vector3 | null;
}

type AlignStage = 0 | 1 | 2 | 3;

/**
 * ALINEAR por 4 puntos, estilo CAD 3D:
 *
 * Selección previa = objetos que se moverán.
 * P1 = origen actual.
 * P2 = nuevo origen.
 * P3 = punto que define el eje/dirección actual desde P1.
 * P4 = punto que define el nuevo eje/dirección desde P2.
 *
 * La transformación final es rígida: una traslación P1->P2 y una rotación
 * que hace coincidir el vector P1->P3 con P2->P4. No requiere seleccionar
 * una segunda instancia de referencia.
 */
export class AlignController {
  private readonly options: AlignControllerOptions;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly status: HTMLSpanElement;
  private readonly points: THREE.Vector3[] = [];
  private selectedPieceIds: string[] = [];
  private selectedCadReferences: string[] = [];
  private active = false;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownActive = false;
  private stage: AlignStage = 0;
  private disposed = false;

  constructor(
    options: AlignControllerOptions,
  ) {
    this.options = options;
    this.button = this.createButton(options.container);
    const ui = this.createPanel(options.container);
    this.panel = ui.panel;
    this.status = ui.status;

    this.button.addEventListener("click", this.handleOpen);
    window.addEventListener("keydown", this.handleKeyDown, true);
    options.canvas.addEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    options.canvas.addEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
  }

  get isActive(): boolean {
    return this.active;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.close();
    this.button.removeEventListener("click", this.handleOpen);
    window.removeEventListener("keydown", this.handleKeyDown, true);
    this.options.canvas.removeEventListener(
      "pointerdown",
      this.handlePointerDown,
      true,
    );
    this.options.canvas.removeEventListener(
      "pointerup",
      this.handlePointerUp,
      true,
    );
    this.button.remove();
    this.panel.remove();
  }

  private readonly handleOpen = (): void => {
    this.open();
  };

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (
      this.disposed
      || isEditableTarget(event.target)
      || event.ctrlKey
      || event.metaKey
      || event.altKey
    ) {
      return;
    }

    if (event.key === "Escape" && this.active) {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }

    if (
      event.key.toLowerCase() === "a"
      && !this.active
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.open();
    }
  };

  private open(): void {
    this.options.cancelActiveCommand();

    this.selectedPieceIds = [
      ...this.options.designSelection.getSelectedIds(),
    ].filter((id) =>
      this.options.designModel.pieceInstances.get(id) !== undefined,
    );
    this.selectedCadReferences = [
      ...this.options.cadReferenceBlocks.getSelectedReferenceNames(),
    ];

    if (
      this.selectedPieceIds.length < 1
      && this.selectedCadReferences.length < 1
    ) {
      window.alert(
        "ALINEAR requiere seleccionar primero la pieza, ensamble o referencia CAD que se va a mover.",
      );
      return;
    }

    this.points.length = 0;
    this.stage = 0;
    this.active = true;
    this.pointerDownActive = false;
    this.options.designSelection.setEnabled(false);
    this.options.cadReferenceBlocks.setInteractionEnabled(false);
    this.panel.style.display = "grid";
    this.updateStatus();
  }

  private close(): void {
    if (!this.active) {
      this.panel.style.display = "none";
      return;
    }
    this.active = false;
    this.pointerDownActive = false;
    this.points.length = 0;
    this.selectedPieceIds = [];
    this.selectedCadReferences = [];
    this.options.designSelection.setEnabled(true);
    this.options.cadReferenceBlocks.setInteractionEnabled(true);
    this.panel.style.display = "none";
  }

  private readonly handlePointerDown = (
    event: PointerEvent,
  ): void => {
    if (!this.active || event.button !== 0) return;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerDownActive = true;
  };

  private readonly handlePointerUp = (
    event: PointerEvent,
  ): void => {
    if (
      !this.active
      || event.button !== 0
      || !this.pointerDownActive
    ) {
      return;
    }

    this.pointerDownActive = false;
    const movement = Math.hypot(
      event.clientX - this.pointerDownX,
      event.clientY - this.pointerDownY,
    );

    if (movement > 5) {
      return;
    }

    const point = this.options.findSnapPoint(
      event.clientX,
      event.clientY,
    );

    if (!point) {
      this.status.textContent =
        `${stageLabel(this.stage)} · selecciona un SNAP válido`;
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    this.points.push(point.clone());

    if (this.points.length < 4) {
      this.stage = this.points.length as AlignStage;
      this.updateStatus();
      return;
    }

    this.applyAlignment();
  };

  private applyAlignment(): void {
    const p1 = this.points[0];
    const p2 = this.points[1];
    const p3 = this.points[2];
    const p4 = this.points[3];
    if (!p1 || !p2 || !p3 || !p4) return;

    const currentAxis = p3.clone().sub(p1);
    const targetAxis = p4.clone().sub(p2);

    if (
      currentAxis.lengthSq() <= 1e-16
      || targetAxis.lengthSq() <= 1e-16
    ) {
      this.status.textContent =
        "ALINEAR · los puntos de eje deben definir una dirección válida";
      this.points.length = 0;
      this.stage = 0;
      return;
    }

    const rotation = new THREE.Quaternion()
      .setFromUnitVectors(
        currentAxis.normalize(),
        targetAxis.normalize(),
      );

    // ALIGN must participate in the same undo history as MOVE/ROTATE.
    // Capture before the rigid translation and rotation are applied.
    const before = this.options.history.capture(this.selectedPieceIds);

    for (const pieceId of this.selectedPieceIds) {
      this.transformPiece(
        pieceId,
        p1,
        p2,
        rotation,
      );
    }

    for (const referenceName of this.selectedCadReferences) {
      this.options.cadReferenceBlocks.transformReference(
        referenceName,
        p1,
        p2,
        rotation,
      );
    }

    this.options.designScene.sync();
    this.options.history.recordTransform("ALIGN", before, this.selectedPieceIds);
    this.options.designSelection.refreshHelpers();
    this.options.cadReferenceBlocks.refresh();
    this.options.clearGeometryQueryCache();
    this.status.textContent =
      `ALINEAR · ${this.selectedPieceIds.length + this.selectedCadReferences.length} objetivo(s) movidos`;

    window.setTimeout(
      () => this.close(),
      650,
    );
  }

  private transformPiece(
    pieceId: string,
    fromOrigin: THREE.Vector3,
    toOrigin: THREE.Vector3,
    rotation: THREE.Quaternion,
  ): void {
    const instance =
      this.options.designModel.pieceInstances.get(pieceId);
    const object =
      this.options.designScene.getInstanceObject(pieceId);
    if (!instance || !object) return;

    object.updateWorldMatrix(true, true);

    const position = object.position
      .clone()
      .sub(fromOrigin)
      .applyQuaternion(rotation)
      .add(toOrigin);

    const quaternion = rotation
      .clone()
      .multiply(object.quaternion);

    object.position.copy(position);
    object.quaternion.copy(quaternion);
    object.updateMatrix();
    object.updateMatrixWorld(true);

    const euler = new THREE.Euler()
      .setFromQuaternion(
        quaternion,
        "XYZ",
      );

    this.options.designModel.pieceInstances.updateTransform(
      pieceId,
      {
        position: {
          x: position.x,
          y: position.y,
          z: position.z,
        },
        rotation: {
          x: euler.x,
          y: euler.y,
          z: euler.z,
        },
      },
    );
  }

  private updateStatus(): void {
    this.status.textContent =
      `${stageLabel(this.stage)} · ${this.points.length}/4 puntos`;
  }

  private createButton(container: HTMLElement): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "ALINEAR";
    button.title = "Alinear selección por 4 puntos (A)";
    Object.assign(button.style, {
      padding: "5px 8px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#27343c",
      color: "#f3f7f9",
      cursor: "pointer",
      font: "12px system-ui, sans-serif",
    });
    const bar = container.querySelector<HTMLElement>(
      '[data-framelogic-project-toolbar="true"]',
    );
    if (bar) bar.append(button);
    else {
      Object.assign(button.style, {
        position: "absolute",
        left: "16px",
        top: "84px",
        zIndex: "124",
      });
      container.append(button);
    }
    return button;
  }

  private createPanel(container: HTMLElement): {
    panel: HTMLDivElement;
    status: HTMLSpanElement;
  } {
    const panel = document.createElement("div");
    Object.assign(panel.style, {
      position: "absolute",
      left: "50%",
      bottom: "54px",
      transform: "translateX(-50%)",
      zIndex: "165",
      display: "none",
      gridTemplateColumns: "auto auto",
      alignItems: "center",
      gap: "8px",
      padding: "8px 10px",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: "6px",
      background: "rgba(18,25,30,0.96)",
      color: "#eaf2f6",
      boxShadow: "0 8px 22px rgba(0,0,0,0.30)",
      font: "12px system-ui, sans-serif",
    });

    const label = document.createElement("strong");
    label.textContent = "ALINEAR · 4 PUNTOS";

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Cancelar";
    Object.assign(close.style, {
      padding: "4px 7px",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "4px",
      background: "rgba(255,255,255,0.06)",
      color: "#edf5f8",
      cursor: "pointer",
      font: "11px system-ui, sans-serif",
    });
    close.addEventListener("click", () => this.close());

    const status = document.createElement("span");
    status.style.color = "#9ec2d1";
    status.style.fontSize = "11px";
    status.style.gridColumn = "1 / -1";

    const help = document.createElement("span");
    help.textContent =
      "P1 origen actual · P2 nuevo origen · P3 eje actual · P4 nuevo eje";
    help.style.color = "#718993";
    help.style.fontSize = "10px";
    help.style.gridColumn = "1 / -1";

    panel.append(
      label,
      close,
      status,
      help,
    );
    container.append(panel);
    return { panel, status };
  }
}

function stageLabel(stage: AlignStage): string {
  switch (stage) {
    case 0:
      return "P1 · origen actual";
    case 1:
      return "P2 · nuevo origen";
    case 2:
      return "P3 · eje actual";
    case 3:
      return "P4 · nuevo eje";
  }
}

function isEditableTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable
    || target.tagName === "INPUT"
    || target.tagName === "TEXTAREA"
    || target.tagName === "SELECT"
  );
}
