import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  CadCircle,
  CadCircleSceneController,
} from "../design/CadCircleSceneController";

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


type CircleSizeMode =
  | "RADIUS"
  | "DIAMETER";


type CircleStage =
  | "CENTER"
  | "SIZE_MODE"
  | "SIZE";


interface CircleBasis {
  readonly xAxis: THREE.Vector3;
  readonly yAxis: THREE.Vector3;
  readonly normal: THREE.Vector3;
}


export interface CadCirclePlacementControllerOptions {
  readonly container: HTMLElement;
  readonly domElement: HTMLElement;
  readonly scene: THREE.Scene;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly circleScene: CadCircleSceneController;
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


function isEditableTarget(
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


function parseCadNumber(
  value: string,
): number | null {
  const normalized =
    value
      .trim()
      .replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed =
    Number(normalized);

  return Number.isFinite(parsed)
    && parsed > 0
      ? parsed
      : null;
}


function cloneCircle(
  circle: CadCircle,
): CadCircle {
  return {
    ...circle,
    center: { ...circle.center },
    xAxis: { ...circle.xAxis },
    yAxis: { ...circle.yAxis },
    normal: { ...circle.normal },
  };
}


export class CadCirclePlacementController {
  private readonly options:
    CadCirclePlacementControllerOptions;

  private readonly preview:
    THREE.LineLoop;

  private readonly modeMenu:
    HTMLDivElement;

  private readonly numericShell:
    HTMLDivElement;

  private readonly numericLabel:
    HTMLSpanElement;

  private readonly numericInput:
    HTMLInputElement;

  private readonly commandHint:
    HTMLDivElement;

  private active = false;
  private disposed = false;
  private stage: CircleStage = "CENTER";
  private sizeMode: CircleSizeMode | null = null;
  private center: THREE.Vector3 | null = null;
  private basis: CircleBasis | null = null;
  private manualOnly = false;

  private pointerX = 0;
  private pointerY = 0;

  private commandBuffer = "";
  private commandBufferReset:
    number | null = null;

  constructor(
    options: CadCirclePlacementControllerOptions,
  ) {
    this.options = options;

    this.preview =
      new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: 0x66d9ff,
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        }),
      );
    this.preview.name =
      "FrameLogicCadCirclePreview";
    this.preview.visible = false;
    this.preview.renderOrder = 1000;
    this.options.scene.add(this.preview);

    this.modeMenu =
      this.createModeMenu();
    this.numericShell =
      this.createNumericShell();
    this.numericLabel =
      this.numericShell.querySelector(
        '[data-circle-numeric-label="true"]',
      ) as HTMLSpanElement;
    this.numericInput =
      this.numericShell.querySelector(
        'input',
      ) as HTMLInputElement;
    this.commandHint =
      this.createCommandHint();

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

    const activeLayer =
      this.options.designModel.layers.get(
        this.options.designModel.layers.activeLayerId,
      );

    if (!activeLayer || activeLayer.locked) {
      return false;
    }

    this.options.beforeStart();
    this.resetCommandBuffer();

    this.active = true;
    this.stage = "CENTER";
    this.sizeMode = null;
    this.center = null;
    this.basis = null;
    this.manualOnly = false;
    this.preview.visible = false;

    this.options.designSelection.setEnabled(false);
    this.options.pointSelection.setEnabled(false);
    this.options.lineSelection.setEnabled(false);

    this.showHint(
      "CIRCLE · clic centro · Esc cancelar",
    );
    return true;
  }

  cancel(): void {
    if (!this.active) {
      this.hideCommandUi();
      return;
    }

    this.active = false;
    this.stage = "CENTER";
    this.sizeMode = null;
    this.center = null;
    this.basis = null;
    this.manualOnly = false;
    this.preview.visible = false;
    this.preview.geometry.setFromPoints([]);

    this.modeMenu.style.display = "none";
    this.numericShell.style.display = "none";
    this.numericInput.value = "";

    this.options.designSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.lineSelection.setEnabled(true);

    this.showHint(
      "CIRCLE cancelado",
      700,
    );
  }

  dispose(): void {
    if (this.disposed) return;

    this.cancel();
    this.disposed = true;
    this.resetCommandBuffer();

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

    this.modeMenu.remove();
    this.numericShell.remove();
    this.commandHint.remove();
  }

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;

    this.positionFloatingUi();

    if (
      !this.active
      || (this.stage !== "SIZE" && this.stage !== "SIZE_MODE")
      || !this.center
      || !this.basis
    ) {
      return;
    }

    const numericValue =
      parseCadNumber(
        this.numericInput.value,
      );

    if (
      !this.manualOnly
      && numericValue !== null
      && this.sizeMode
    ) {
      this.updatePreview(
        this.sizeMode === "DIAMETER"
          ? numericValue / 2
          : numericValue,
      );
      return;
    }

    const radius =
      this.getManualRadius(
        event.clientX,
        event.clientY,
      );

    if (radius !== null) {
      this.updatePreview(radius);
    }
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

    this.pointerX = event.clientX;
    this.pointerY = event.clientY;

    event.preventDefault();
    event.stopImmediatePropagation();

    if (this.stage === "CENTER") {
      const center =
        this.pickPoint(
          event.clientX,
          event.clientY,
        );

      if (!center) {
        this.showHint(
          "CIRCLE · no hay punto válido: active WorkPlane o use un SNAP",
        );
        return;
      }

      const state =
        this.options.workPlane.getState();

      // No active workplane: 3D center with a camera-facing circle plane.
      const camera = this.options.cameraProvider();
      camera.updateMatrixWorld();
      const xAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
      const yAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
      this.center = center;
      this.basis = state.enabled
        ? { xAxis: state.xAxis.clone().normalize(),
            yAxis: state.yAxis.clone().normalize(), normal: state.normal.clone().normalize() }
        : { xAxis, yAxis, normal: new THREE.Vector3().crossVectors(xAxis, yAxis).normalize() };
      this.stage = "SIZE_MODE";
      this.preview.visible = false;
      this.showModeMenu();
      return;
    }

    // First option RADIUS: clicking the next SNAP is sufficient; no need
    // for a redundant click on the RADIUS button.
    if (this.stage === "SIZE_MODE") {
      const radius = this.getManualRadius(event.clientX, event.clientY);
      if (radius !== null && radius > 1e-9) {
        this.sizeMode = "RADIUS";
        this.commitRadius(radius);
      }
      return;
    }

    if (
      this.stage === "SIZE"
      && this.sizeMode
    ) {
      const numericValue =
        !this.manualOnly
          ? parseCadNumber(
              this.numericInput.value,
            )
          : null;

      if (numericValue !== null) {
        this.commitRadius(
          this.sizeMode === "DIAMETER"
            ? numericValue / 2
            : numericValue,
        );
        return;
      }

      const radius =
        this.getManualRadius(
          event.clientX,
          event.clientY,
        );

      if (
        radius === null
        || radius <= 1e-9
      ) {
        this.showHint(
          "CIRCLE · el tamaño debe ser mayor que cero",
        );
        return;
      }

      this.commitRadius(radius);
    }
  };

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (this.disposed) return;

    if (this.active) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cancel();
        return;
      }

      if (
        this.stage === "SIZE_MODE"
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
      ) {
        const key =
          event.key.toLowerCase();
        if (key === "r" || event.key === "Enter") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.chooseSizeMode("RADIUS");
          return;
        }
        if (key === "d") {
          event.preventDefault();
          event.stopImmediatePropagation();
          this.chooseSizeMode("DIAMETER");
          return;
        }
      }

      return;
    }

    if (
      isEditableTarget(event.target)
      || event.ctrlKey
      || event.metaKey
      || event.altKey
    ) {
      return;
    }

    if (
      event.key === "Escape"
      && this.commandBuffer
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.resetCommandBuffer();
      return;
    }

    if (
      event.key === "Backspace"
      && this.commandBuffer
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.commandBuffer =
        this.commandBuffer.slice(0, -1);
      if (this.commandBuffer) {
        this.showCommandBuffer();
        this.scheduleCommandBufferReset();
      }
      else {
        this.resetCommandBuffer();
      }
      return;
    }

    if (
      event.key === "Enter"
      && this.commandBuffer
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();

      const command =
        this.normalizeCommand(
          this.commandBuffer,
        );
      this.resetCommandBuffer();

      if (
        command === "C"
        || command === "CIRCULO"
        || command === "CIRCLE"
      ) {
        this.start();
      }
      return;
    }

    if (
      event.key.length !== 1
      || !/[a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]/.test(
        event.key,
      )
    ) {
      return;
    }

    const next =
      this.normalizeCommand(
        this.commandBuffer
        + event.key,
      );

    const supportedPrefixes = [
      "C",
      "CI",
      "CIR",
      "CIRC",
      "CIRCU",
      "CIRCUL",
      "CIRCULO",
      "CIRCLE",
    ];

    if (!supportedPrefixes.includes(next)) {
      this.resetCommandBuffer();
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    this.commandBuffer = next;
    this.showCommandBuffer();
    this.scheduleCommandBufferReset();
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

    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const value =
      parseCadNumber(
        this.numericInput.value,
      );

    if (value === null) {
      this.manualOnly = true;
      this.numericShell.style.display = "none";
      this.showHint(
        this.sizeMode === "DIAMETER"
          ? "CIRCLE · diámetro manual · mueva el cursor y haga clic"
          : "CIRCLE · radio manual · mueva el cursor y haga clic",
      );
      this.options.domElement.focus();
      return;
    }

    this.commitRadius(
      this.sizeMode === "DIAMETER"
        ? value / 2
        : value,
    );
  };

  private chooseSizeMode(
    mode: CircleSizeMode,
  ): void {
    if (
      !this.active
      || this.stage !== "SIZE_MODE"
    ) {
      return;
    }

    this.sizeMode = mode;
    this.stage = "SIZE";
    this.manualOnly = false;
    this.modeMenu.style.display = "none";
    this.numericLabel.textContent =
      mode === "DIAMETER"
        ? "Ø"
        : "R";
    this.numericInput.value = "";
    this.numericInput.placeholder =
      mode === "DIAMETER"
        ? "diámetro o Enter = manual"
        : "radio o Enter = manual";
    this.numericShell.style.display = "flex";
    this.positionFloatingUi();
    this.showHint(
      mode === "DIAMETER"
        ? "CIRCLE · escriba diámetro y Enter, o clic para manual"
        : "CIRCLE · escriba radio y Enter, o clic para manual",
    );

    window.queueMicrotask(
      () => {
        if (this.active && this.stage === "SIZE") {
          this.numericInput.focus();
          this.numericInput.select();
        }
      },
    );
  }

  private pickPoint(
    clientX: number,
    clientY: number,
  ): THREE.Vector3 | null {
    const state = this.options.workPlane.getState();
    const snap = this.options.findSnapPoint(clientX, clientY);
    if (snap && (!state.enabled
      || Math.abs(snap.clone().sub(state.origin).dot(state.normal)) <= 1e-5)) {
      return snap.clone();
    }

    if (state.enabled) {
      return this.options.workPlane.intersectPointer(
        clientX, clientY, this.options.cameraProvider(), this.options.domElement,
      );
    }
    // WorkPlane OFF: free 3D SNAP, or a camera-facing plane passing through
    // the selected center (origin before the first point).
    const rect = this.options.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const camera = this.options.cameraProvider();
    camera.updateMatrixWorld();
    const pointer = new THREE.Vector2(
      (clientX - rect.left) / rect.width * 2 - 1,
      -(clientY - rect.top) / rect.height * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      camera.getWorldDirection(new THREE.Vector3()).normalize(),
      this.center ?? state.origin,
    );
    return raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  private getManualRadius(
    clientX: number,
    clientY: number,
  ): number | null {
    if (!this.center || !this.basis) {
      return null;
    }

    const point =
      this.pickPoint(
        clientX,
        clientY,
      );

    if (!point) return null;

    const delta =
      point
        .clone()
        .sub(this.center);
    if (!this.options.workPlane.getState().enabled) {
      // Orient a free-3D circle so the second SNAP is on its circumference.
      if (delta.lengthSq() <= 1e-18) return 0;
      const xAxis = delta.clone().normalize();
      const view = this.options.cameraProvider().getWorldDirection(new THREE.Vector3());
      const normal = view.addScaledVector(xAxis, -view.dot(xAxis));
      if (normal.lengthSq() <= 1e-12) {
        normal.set(0, 0, 1).addScaledVector(xAxis, -xAxis.z);
      }
      if (normal.lengthSq() > 1e-12) {
        normal.normalize();
        const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
        this.basis = { xAxis, yAxis, normal };
      }
      return delta.length();
    }
    const x = delta.dot(this.basis.xAxis);
    const y = delta.dot(this.basis.yAxis);
    return Math.hypot(x, y);
  }

  private commitRadius(
    radius: number,
  ): void {
    if (
      !this.center
      || !this.basis
      || !Number.isFinite(radius)
      || radius <= 1e-9
    ) {
      return;
    }

    const created =
      this.options.circleScene.register({
        center: {
          x: this.center.x,
          y: this.center.y,
          z: this.center.z,
        },
        radius,
        xAxis: {
          x: this.basis.xAxis.x,
          y: this.basis.xAxis.y,
          z: this.basis.xAxis.z,
        },
        yAxis: {
          x: this.basis.yAxis.x,
          y: this.basis.yAxis.y,
          z: this.basis.yAxis.z,
        },
        normal: {
          x: this.basis.normal.x,
          y: this.basis.normal.y,
          z: this.basis.normal.z,
        },
      });

    const snapshot =
      cloneCircle(created);

    this.options.history.recordOperation(
      "CIRCLE",
      () => {
        this.options.circleScene.remove(
          snapshot.id,
        );
        this.options.clearGeometryQueryCache?.();
      },
      () => {
        if (
          !this.options.circleScene.get(
            snapshot.id,
          )
        ) {
          this.options.circleScene.register({
            id: snapshot.id,
            layerId: snapshot.layerId,
            center: snapshot.center,
            radius: snapshot.radius,
            xAxis: snapshot.xAxis,
            yAxis: snapshot.yAxis,
            normal: snapshot.normal,
          });
        }
        this.options.clearGeometryQueryCache?.();
      },
    );

    this.options.clearGeometryQueryCache?.();
    this.active = false;
    this.preview.visible = false;
    this.modeMenu.style.display = "none";
    this.numericShell.style.display = "none";
    this.numericInput.value = "";

    this.options.designSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.lineSelection.setEnabled(true);

    const shownValue =
      this.sizeMode === "DIAMETER"
        ? radius * 2
        : radius;
    this.showHint(
      `${
        this.sizeMode === "DIAMETER"
          ? "CIRCLE Ø"
          : "CIRCLE R"
      } ${shownValue.toFixed(4)} creado`,
      1200,
    );

    this.stage = "CENTER";
    this.sizeMode = null;
    this.center = null;
    this.basis = null;
    this.manualOnly = false;
  }

  private updatePreview(
    radius: number,
  ): void {
    if (
      !this.center
      || !this.basis
      || !Number.isFinite(radius)
      || radius <= 1e-9
    ) {
      this.preview.visible = false;
      return;
    }

    const points: THREE.Vector3[] = [];
    const segmentCount = 128;

    for (
      let index = 0;
      index < segmentCount;
      index += 1
    ) {
      const angle =
        index / segmentCount
        * Math.PI
        * 2;
      points.push(
        this.center
          .clone()
          .addScaledVector(
            this.basis.xAxis,
            Math.cos(angle) * radius,
          )
          .addScaledVector(
            this.basis.yAxis,
            Math.sin(angle) * radius,
          ),
      );
    }

    this.preview.geometry.setFromPoints(points);
    this.preview.geometry.computeBoundingSphere();
    this.preview.visible = true;
    if (this.active && (this.stage === "SIZE" || this.stage === "SIZE_MODE")) {
      const value = this.sizeMode === "DIAMETER" ? radius * 2 : radius;
      this.showHint(`CÍRCULO · ${this.sizeMode === "DIAMETER" ? "Ø" : "R"} ${value.toFixed(2)} mm · Enter / SNAP`);
    }
  }

  private createModeMenu(): HTMLDivElement {
    const menu =
      document.createElement("div");
    menu.dataset["framelogicCircleModeMenu"] =
      "true";

    Object.assign(
      menu.style,
      {
        position: "fixed",
        zIndex: "2147482500",
        display: "none",
        alignItems: "center",
        gap: "4px",
        padding: "5px",
        border: "1px solid rgba(127,210,240,0.48)",
        borderRadius: "6px",
        background: "rgba(12,20,26,0.96)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.38)",
        font: "12px system-ui, sans-serif",
      },
    );

    const label =
      document.createElement("span");
    label.textContent = "Tamaño:";
    Object.assign(
      label.style,
      {
        color: "#cbd5e1",
        padding: "0 4px",
      },
    );

    const radius =
      this.makeMenuButton(
        "Radio",
        () => this.chooseSizeMode("RADIUS"),
      );
    const diameter =
      this.makeMenuButton(
        "Diámetro",
        () => this.chooseSizeMode("DIAMETER"),
      );

    menu.append(
      label,
      radius,
      diameter,
    );
    document.body.append(menu);
    return menu;
  }

  private makeMenuButton(
    label: string,
    action: () => void,
  ): HTMLButtonElement {
    const button =
      document.createElement("button");
    button.type = "button";
    button.textContent = label;
    Object.assign(
      button.style,
      {
        padding: "5px 8px",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: "4px",
        background: "#263944",
        color: "#f8fafc",
        cursor: "pointer",
      },
    );
    button.addEventListener(
      "pointerdown",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
    );
    button.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      },
    );
    return button;
  }

  private createNumericShell(): HTMLDivElement {
    const shell =
      document.createElement("div");
    shell.dataset["framelogicCircleNumeric"] =
      "true";
    Object.assign(
      shell.style,
      {
        position: "fixed",
        zIndex: "2147482501",
        display: "none",
        alignItems: "center",
        gap: "5px",
        padding: "4px 6px",
        border: "1px solid rgba(127,210,240,0.5)",
        borderRadius: "5px",
        background: "rgba(12,20,26,0.97)",
        boxShadow: "0 4px 14px rgba(0,0,0,0.38)",
      },
    );

    const label =
      document.createElement("span");
    label.dataset["circleNumericLabel"] =
      "true";
    label.textContent = "R";
    Object.assign(
      label.style,
      {
        minWidth: "14px",
        color: "#7dd3fc",
        font: "700 12px ui-monospace, monospace",
      },
    );

    const input =
      document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.dataset["cadNumeric"] = "true";
    Object.assign(
      input.style,
      {
        width: "150px",
        padding: "5px 6px",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "4px",
        outline: "none",
        background: "#111827",
        color: "#f8fafc",
        font: "12px ui-monospace, monospace",
      },
    );
    input.addEventListener(
      "keydown",
      this.handleNumericKeyDown,
    );
    input.addEventListener(
      "input",
      () => {
        const value =
          parseCadNumber(input.value);
        if (
          value !== null
          && this.sizeMode
        ) {
          this.updatePreview(
            this.sizeMode === "DIAMETER"
              ? value / 2
              : value,
          );
        }
      },
    );

    shell.append(label, input);
    document.body.append(shell);
    return shell;
  }

  private createCommandHint(): HTMLDivElement {
    const hint =
      document.createElement("div");
    hint.dataset["framelogicCircleHint"] =
      "true";
    Object.assign(
      hint.style,
      {
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
      },
    );
    document.body.append(hint);
    return hint;
  }

  private showModeMenu(): void {
    this.numericShell.style.display = "none";
    this.modeMenu.style.display = "flex";
    this.positionFloatingUi();
    this.showHint(
      "CÍRCULO · Radio (predeterminado ↵) / Diámetro (D) · clic SNAP = radio",
    );
  }

  private positionFloatingUi(): void {
    const left =
      `${Math.round(this.pointerX + 18)}px`;
    const top =
      `${Math.round(this.pointerY + 18)}px`;

    this.modeMenu.style.left = left;
    this.modeMenu.style.top = top;
    this.numericShell.style.left = left;
    this.numericShell.style.top = top;

    this.commandHint.style.left =
      `${Math.round(this.pointerX + 18)}px`;
    this.commandHint.style.top =
      `${Math.round(this.pointerY - 30)}px`;
  }

  private showHint(
    text: string,
    autoHideMs?: number,
  ): void {
    this.commandHint.textContent = text;
    this.commandHint.style.display = "block";
    this.positionFloatingUi();

    if (autoHideMs !== undefined) {
      window.setTimeout(
        () => {
          if (
            !this.active
            && this.commandHint.textContent
              === text
          ) {
            this.commandHint.style.display = "none";
          }
        },
        autoHideMs,
      );
    }
  }

  private showCommandBuffer(): void {
    this.commandHint.textContent =
      `Comando: ${this.commandBuffer} ↵`;
    this.commandHint.style.display = "block";
    this.positionFloatingUi();
  }

  private scheduleCommandBufferReset(): void {
    if (this.commandBufferReset !== null) {
      window.clearTimeout(
        this.commandBufferReset,
      );
    }

    this.commandBufferReset =
      window.setTimeout(
        () => this.resetCommandBuffer(),
        1800,
      );
  }

  private resetCommandBuffer(): void {
    if (this.commandBufferReset !== null) {
      window.clearTimeout(
        this.commandBufferReset,
      );
      this.commandBufferReset = null;
    }
    this.commandBuffer = "";

    if (!this.active) {
      this.commandHint.style.display = "none";
    }
  }

  private hideCommandUi(): void {
    this.modeMenu.style.display = "none";
    this.numericShell.style.display = "none";
    if (!this.commandBuffer) {
      this.commandHint.style.display = "none";
    }
  }

  private normalizeCommand(
    value: string,
  ): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  }
}
