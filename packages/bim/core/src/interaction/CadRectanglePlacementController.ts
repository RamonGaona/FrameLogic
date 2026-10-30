import * as THREE from "three";

import type {
  CadLine,
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


type RectangleStage =
  | "FIRST_CORNER"
  | "SECOND_CORNER";


interface RectangleBasis {
  readonly xAxis: THREE.Vector3;
  readonly yAxis: THREE.Vector3;
  readonly normal: THREE.Vector3;
}


export interface CadRectanglePlacementControllerOptions {
  readonly container: HTMLElement;
  readonly domElement: HTMLElement;
  readonly scene: THREE.Scene;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly lineScene: CadLineSceneController;
  readonly workPlane: CadWorkPlaneController;
  readonly history: CadHistoryController;
  readonly designSelection: DesignSelectionController;
  readonly pointSelection: CadPointSelectionController;
  readonly lineSelection: CadLineSelectionController;
  readonly findSnapPoint: (
    clientX: number,
    clientY: number,
  ) => THREE.Vector3 | null;
  readonly beforeStart: () => void;
  readonly clearGeometryQueryCache?: () => void;
}


function parseDimension(
  value: string,
): number | null {
  const normalized =
    value
      .trim()
      .replace(",", ".");

  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed)
    && parsed > 0
      ? parsed
      : null;
}


function cloneLine(
  line: CadLine,
): CadLine {
  return {
    ...line,
    start: { ...line.start },
    end: { ...line.end },
  };
}


export class CadRectanglePlacementController {
  private readonly options:
    CadRectanglePlacementControllerOptions;

  private readonly preview:
    THREE.LineLoop;

  private readonly numericShell:
    HTMLDivElement;

  private readonly widthInput:
    HTMLInputElement;

  private readonly heightInput:
    HTMLInputElement;

  private readonly hint:
    HTMLDivElement;

  private active = false;
  private disposed = false;
  private stage: RectangleStage =
    "FIRST_CORNER";
  private firstCorner:
    THREE.Vector3 | null = null;
  private basis:
    RectangleBasis | null = null;
  private manualOnly = false;

  private pointerX = 180;
  private pointerY = 160;
  private lastPointerPoint:
    THREE.Vector3 | null = null;

  constructor(
    options: CadRectanglePlacementControllerOptions,
  ) {
    this.options = options;

    this.preview =
      new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineDashedMaterial({
          dashSize: 80,
          gapSize: 40,
          depthTest: false,
        }),
      );
    this.preview.name =
      "FrameLogicCadRectanglePreview";
    this.preview.visible = false;
    this.preview.renderOrder = 1000;
    this.options.scene.add(this.preview);

    this.numericShell =
      this.createNumericShell();
    const inputs =
      this.numericShell.querySelectorAll<HTMLInputElement>(
        "input",
      );
    this.widthInput = inputs[0];
    this.heightInput = inputs[1];

    this.hint =
      this.createHint();

    this.options.domElement.addEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
    this.options.domElement.addEventListener(
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

  start(): boolean {
    if (this.disposed) return false;

    const layer =
      this.options.designModel.layers.activeLayer;
    if (layer.locked) return false;

    this.options.beforeStart();

    this.active = true;
    this.stage = "FIRST_CORNER";
    this.firstCorner = null;
    this.basis = null;
    this.manualOnly = false;
    this.lastPointerPoint = null;
    this.preview.visible = false;
    this.numericShell.style.display = "none";
    this.widthInput.value = "";
    this.heightInput.value = "";

    this.options.designSelection.setEnabled(false);
    this.options.pointSelection.setEnabled(false);
    this.options.lineSelection.setEnabled(false);

    this.showHint(
      "RECTÁNGULO · indique primera esquina · Esc cancelar",
    );
    return true;
  }

  cancel(): void {
    if (!this.active) {
      this.hideUi();
      return;
    }

    this.active = false;
    this.stage = "FIRST_CORNER";
    this.firstCorner = null;
    this.basis = null;
    this.manualOnly = false;
    this.lastPointerPoint = null;
    this.preview.visible = false;
    this.preview.geometry.setFromPoints([]);
    this.numericShell.style.display = "none";
    this.widthInput.value = "";
    this.heightInput.value = "";

    this.options.designSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.lineSelection.setEnabled(true);

    this.showHint(
      "RECTÁNGULO cancelado",
      700,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;

    this.options.domElement.removeEventListener(
      "pointermove",
      this.handlePointerMove,
      true,
    );
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

    this.options.scene.remove(this.preview);
    this.preview.geometry.dispose();
    if (Array.isArray(this.preview.material)) {
      for (const material of this.preview.material) {
        material.dispose();
      }
    }
    else {
      this.preview.material.dispose();
    }

    this.numericShell.remove();
    this.hint.remove();
  }

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.positionUi();

    if (
      !this.active
      || this.stage !== "SECOND_CORNER"
      || !this.firstCorner
      || !this.basis
    ) {
      return;
    }

    const point =
      this.pickPoint(
        event.clientX,
        event.clientY,
      );
    if (!point) return;

    this.lastPointerPoint = point.clone();
    const delta =
      this.resolveDimensions(point);
    this.updatePreview(
      delta.x,
      delta.y,
    );
  };

  private readonly handlePointerUp = (
    event: PointerEvent,
  ): void => {
    if (
      !this.active
      || event.button !== 0
      || event.target !== this.options.domElement
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    this.pointerX = event.clientX;
    this.pointerY = event.clientY;

    const point =
      this.pickPoint(
        event.clientX,
        event.clientY,
      );
    if (!point) {
      this.showHint(
        "RECTÁNGULO · no hay punto válido: active WorkPlane o use un SNAP",
      );
      return;
    }

    if (this.stage === "FIRST_CORNER") {
      const state =
        this.options.workPlane.getState();
      if (!state.enabled) {
        this.showHint(
          "RECTÁNGULO · WorkPlane OFF: active un plano para dibujar",
        );
        return;
      }

      this.firstCorner = point.clone();
      this.basis = {
        xAxis: state.xAxis.clone().normalize(),
        yAxis: state.yAxis.clone().normalize(),
        normal: state.normal.clone().normalize(),
      };
      this.stage = "SECOND_CORNER";
      this.manualOnly = false;
      this.lastPointerPoint = point.clone();
      this.showNumericShell();
      this.showHint(
        "RECTÁNGULO · segunda esquina · escriba ancho/alto o clic manual",
      );
      return;
    }

    if (!this.firstCorner || !this.basis) return;

    this.lastPointerPoint = point.clone();
    const delta =
      this.resolveDimensions(point);

    if (
      Math.abs(delta.x) <= 1e-9
      || Math.abs(delta.y) <= 1e-9
    ) {
      this.showHint(
        "RECTÁNGULO · ancho y alto deben ser mayores que cero",
      );
      return;
    }

    this.commitRectangle(
      delta.x,
      delta.y,
    );
  };

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (!this.active) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
    }
  };

  private readonly handleNumericKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
      return;
    }

    if (event.key !== "Enter") return;

    event.preventDefault();
    event.stopPropagation();

    const width =
      parseDimension(
        this.widthInput.value,
      );
    const height =
      parseDimension(
        this.heightInput.value,
      );

    if (
      width === null
      && height === null
    ) {
      this.manualOnly = true;
      this.numericShell.style.display = "none";
      this.options.domElement.focus();
      this.showHint(
        "RECTÁNGULO · modo manual · indique esquina opuesta",
      );
      return;
    }

    const reference =
      this.lastPointerPoint
      ?? this.firstCorner;
    if (!reference) return;

    const delta =
      this.resolveDimensions(reference);

    if (
      Math.abs(delta.x) <= 1e-9
      || Math.abs(delta.y) <= 1e-9
    ) {
      this.showHint(
        "RECTÁNGULO · complete ancho y alto o mueva el cursor para definir dirección",
      );
      return;
    }

    this.commitRectangle(
      delta.x,
      delta.y,
    );
  };

  private pickPoint(
    clientX: number,
    clientY: number,
  ): THREE.Vector3 | null {
    const snap =
      this.options.findSnapPoint(
        clientX,
        clientY,
      );
    if (snap) return snap.clone();

    return this.options.workPlane
      .intersectPointer(
        clientX,
        clientY,
        this.options.cameraProvider(),
        this.options.domElement,
      );
  }

  private resolveDimensions(
    point: THREE.Vector3,
  ): { x: number; y: number } {
    if (!this.firstCorner || !this.basis) {
      return { x: 0, y: 0 };
    }

    const delta =
      point
        .clone()
        .sub(this.firstCorner);

    let x =
      delta.dot(this.basis.xAxis);
    let y =
      delta.dot(this.basis.yAxis);

    if (!this.manualOnly) {
      const width =
        parseDimension(
          this.widthInput.value,
        );
      const height =
        parseDimension(
          this.heightInput.value,
        );

      if (width !== null) {
        x = (x < 0 ? -1 : 1) * width;
      }
      if (height !== null) {
        y = (y < 0 ? -1 : 1) * height;
      }
    }

    return { x, y };
  }

  private getCorners(
    x: number,
    y: number,
  ): readonly THREE.Vector3[] {
    if (!this.firstCorner || !this.basis) {
      return [];
    }

    const a = this.firstCorner.clone();
    const b = a
      .clone()
      .addScaledVector(
        this.basis.xAxis,
        x,
      );
    const d = a
      .clone()
      .addScaledVector(
        this.basis.yAxis,
        y,
      );
    const c = b
      .clone()
      .addScaledVector(
        this.basis.yAxis,
        y,
      );

    return [a, b, c, d];
  }

  private updatePreview(
    x: number,
    y: number,
  ): void {
    if (
      Math.abs(x) <= 1e-9
      || Math.abs(y) <= 1e-9
    ) {
      this.preview.visible = false;
      return;
    }

    const corners =
      this.getCorners(x, y);
    if (corners.length !== 4) return;

    this.preview.geometry.setFromPoints(
      [...corners],
    );
    this.preview.computeLineDistances();
    this.preview.geometry.computeBoundingSphere();
    this.preview.visible = true;
  }

  private commitRectangle(
    x: number,
    y: number,
  ): void {
    const corners =
      this.getCorners(x, y);
    if (corners.length !== 4) return;

    const layerId =
      this.options.designModel.layers.activeLayerId;
    const created: CadLine[] = [];

    try {
      for (let index = 0; index < 4; index += 1) {
        const start = corners[index];
        const end = corners[(index + 1) % 4];
        created.push(
          this.options.designModel.registerCadLine({
            layerId,
            start: {
              x: start.x,
              y: start.y,
              z: start.z,
            },
            end: {
              x: end.x,
              y: end.y,
              z: end.z,
            },
          }),
        );
      }
    }
    catch (error) {
      for (const line of created) {
        this.options.designModel.removeCadLine(
          line.id,
        );
      }
      this.options.lineScene.sync();
      throw error;
    }

    this.options.lineScene.sync();

    const snapshots =
      created.map(cloneLine);

    this.options.history.recordOperation(
      "RECTANGLE",
      () => {
        for (const line of snapshots) {
          this.options.designModel.removeCadLine(
            line.id,
          );
        }
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
      () => {
        for (const line of snapshots) {
          if (
            this.options.designModel.cadLines.get(
              line.id,
            )
          ) {
            continue;
          }
          this.options.designModel.registerCadLine({
            id: line.id,
            layerId: line.layerId,
            start: { ...line.start },
            end: { ...line.end },
          });
        }
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
    );

    this.options.clearGeometryQueryCache?.();
    this.finish(
      `RECTÁNGULO ${Math.abs(x).toFixed(2)} × ${Math.abs(y).toFixed(2)} creado`,
    );
  }

  private finish(
    message: string,
  ): void {
    this.active = false;
    this.stage = "FIRST_CORNER";
    this.firstCorner = null;
    this.basis = null;
    this.manualOnly = false;
    this.lastPointerPoint = null;
    this.preview.visible = false;
    this.numericShell.style.display = "none";
    this.widthInput.value = "";
    this.heightInput.value = "";

    this.options.designSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.lineSelection.setEnabled(true);

    this.showHint(
      message,
      1200,
    );
  }

  private createNumericShell(): HTMLDivElement {
    const shell =
      document.createElement("div");
    shell.dataset["framelogicRectangleNumeric"] =
      "true";
    Object.assign(shell.style, {
      position: "fixed",
      zIndex: "2147482501",
      display: "none",
      alignItems: "center",
      gap: "4px",
      padding: "5px 6px",
      border: "1px solid rgba(127,210,240,0.5)",
      borderRadius: "5px",
      background: "rgba(12,20,26,0.97)",
      boxShadow: "0 4px 14px rgba(0,0,0,0.38)",
      color: "#dbeafe",
      font: "12px ui-monospace, monospace",
    });

    const widthLabel =
      document.createElement("span");
    widthLabel.textContent = "X";
    const widthInput =
      this.makeInput("ancho");
    const heightLabel =
      document.createElement("span");
    heightLabel.textContent = "Y";
    const heightInput =
      this.makeInput("alto");

    widthInput.addEventListener(
      "keydown",
      this.handleNumericKeyDown,
    );
    heightInput.addEventListener(
      "keydown",
      this.handleNumericKeyDown,
    );

    const refresh = (): void => {
      if (
        !this.active
        || this.stage !== "SECOND_CORNER"
        || !this.lastPointerPoint
      ) {
        return;
      }
      const delta =
        this.resolveDimensions(
          this.lastPointerPoint,
        );
      this.updatePreview(
        delta.x,
        delta.y,
      );
    };

    widthInput.addEventListener(
      "input",
      refresh,
    );
    heightInput.addEventListener(
      "input",
      refresh,
    );

    shell.append(
      widthLabel,
      widthInput,
      heightLabel,
      heightInput,
    );
    document.body.append(shell);
    return shell;
  }

  private makeInput(
    placeholder: string,
  ): HTMLInputElement {
    const input =
      document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.placeholder = placeholder;
    input.dataset["cadNumeric"] = "true";
    Object.assign(input.style, {
      width: "82px",
      padding: "5px 6px",
      border: "1px solid rgba(255,255,255,0.2)",
      borderRadius: "4px",
      outline: "none",
      background: "#111827",
      color: "#f8fafc",
      font: "12px ui-monospace, monospace",
    });
    return input;
  }

  private showNumericShell(): void {
    this.numericShell.style.display = "flex";
    this.positionUi();

    window.queueMicrotask(
      () => {
        this.widthInput.focus();
        this.widthInput.select();
      },
    );
  }

  private createHint(): HTMLDivElement {
    const hint =
      document.createElement("div");
    hint.dataset["framelogicRectangleHint"] =
      "true";
    Object.assign(hint.style, {
      position: "fixed",
      zIndex: "2147482400",
      display: "none",
      padding: "4px 7px",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "4px",
      background: "rgba(11,18,23,0.9)",
      color: "#d7eef7",
      font: "11px ui-monospace, monospace",
      pointerEvents: "none",
      whiteSpace: "nowrap",
    });
    document.body.append(hint);
    return hint;
  }

  private showHint(
    text: string,
    autoHideMs?: number,
  ): void {
    this.hint.textContent = text;
    this.hint.style.display = "block";
    this.positionUi();

    if (autoHideMs !== undefined) {
      window.setTimeout(
        () => {
          if (!this.active) {
            this.hint.style.display = "none";
          }
        },
        autoHideMs,
      );
    }
  }

  private positionUi(): void {
    const left =
      Math.min(
        this.pointerX + 18,
        window.innerWidth - 230,
      );
    const top =
      Math.min(
        this.pointerY + 18,
        window.innerHeight - 70,
      );

    this.numericShell.style.left =
      `${Math.max(12, left)}px`;
    this.numericShell.style.top =
      `${Math.max(12, top)}px`;
    this.hint.style.left =
      `${Math.max(12, left)}px`;
    this.hint.style.top =
      `${Math.max(12, this.pointerY - 30)}px`;
  }

  private hideUi(): void {
    this.preview.visible = false;
    this.numericShell.style.display = "none";
    this.hint.style.display = "none";
  }
}
