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


type ParallelStage =
  | "SELECT_SOURCE"
  | "DISTANCE"
  | "SIDE";


export interface CadParallelLineControllerOptions {
  readonly container: HTMLElement;
  readonly domElement: HTMLElement;
  readonly scene: THREE.Scene;
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


function parseDistance(
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


export class CadParallelLineController {
  private readonly options:
    CadParallelLineControllerOptions;

  private readonly preview:
    THREE.Line;

  private readonly numericShell:
    HTMLDivElement;

  private readonly distanceInput:
    HTMLInputElement;

  private readonly hint:
    HTMLDivElement;

  private readonly raycaster =
    new THREE.Raycaster();

  private readonly ndc =
    new THREE.Vector2();

  private readonly plane =
    new THREE.Plane();

  private active = false;
  private disposed = false;
  private stage: ParallelStage =
    "SELECT_SOURCE";

  private sourceId:
    string | null = null;
  private sourceStart:
    THREE.Vector3 | null = null;
  private sourceEnd:
    THREE.Vector3 | null = null;
  private offsetDirection:
    THREE.Vector3 | null = null;
  private planeNormal:
    THREE.Vector3 | null = null;

  private fixedDistance:
    number | null = null;
  private lastDistance:
    number | null = null;
  private manualOnly = false;

  private pointerX = 180;
  private pointerY = 160;

  constructor(
    options: CadParallelLineControllerOptions,
  ) {
    this.options = options;

    this.preview =
      new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineDashedMaterial({
          dashSize: 80,
          gapSize: 40,
          depthTest: false,
        }),
      );
    this.preview.name =
      "FrameLogicCadParallelPreview";
    this.preview.visible = false;
    this.preview.renderOrder = 1000;
    this.options.scene.add(this.preview);

    this.numericShell =
      this.createNumericShell();
    this.distanceInput =
      this.numericShell.querySelector(
        "input",
      ) as HTMLInputElement;
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

    const selected =
      this.options.lineSelection.getSelectedIds();
    const preselectedId =
      selected.length === 1
        ? selected[0]
        : null;

    this.options.beforeStart();

    this.active = true;
    this.stage = "SELECT_SOURCE";
    this.fixedDistance = null;
    this.manualOnly = false;
    this.preview.visible = false;
    this.numericShell.style.display = "none";
    this.distanceInput.value = "";

    this.options.designSelection.setEnabled(false);
    this.options.pointSelection.setEnabled(false);
    this.options.lineSelection.setEnabled(false);

    if (
      preselectedId
      && this.prepareSource(
        preselectedId,
      )
    ) {
      this.options.lineSelection.selectSingle(
        preselectedId,
      );
      this.stage = "DISTANCE";
      this.showDistanceInput();
      return true;
    }

    if (selected.length !== 1) {
      this.options.lineSelection.clearSelection();
    }

    this.showHint(
      "PARALELA · seleccione una línea CAD · Esc terminar",
    );
    return true;
  }

  cancel(): void {
    if (!this.active) {
      this.hideUi();
      return;
    }

    this.active = false;
    this.resetSource();
    this.stage = "SELECT_SOURCE";
    this.fixedDistance = null;
    this.manualOnly = false;
    this.preview.visible = false;
    this.numericShell.style.display = "none";
    this.distanceInput.value = "";

    this.options.designSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.lineSelection.setEnabled(true);

    this.showHint(
      "PARALELA finalizada",
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
      || this.stage !== "SIDE"
    ) {
      return;
    }

    const signedOffset =
      this.getSignedOffsetAtPointer(
        event.clientX,
        event.clientY,
      );
    if (signedOffset !== null) {
      this.updatePreview(signedOffset);
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

    event.preventDefault();
    event.stopImmediatePropagation();

    this.pointerX = event.clientX;
    this.pointerY = event.clientY;

    if (this.stage === "SELECT_SOURCE") {
      const lineId =
        this.options.lineSelection.getLineIdAt(
          event.clientX,
          event.clientY,
        );

      if (!lineId) {
        this.showHint(
          "PARALELA · seleccione una línea CAD válida",
        );
        return;
      }

      if (!this.prepareSource(lineId)) {
        this.showHint(
          "PARALELA · no se pudo usar esa línea como referencia",
        );
        return;
      }

      this.options.lineSelection.selectSingle(
        lineId,
      );
      this.stage = "DISTANCE";
      this.showDistanceInput();
      return;
    }

    if (this.stage === "DISTANCE") {
      const signedOffset =
        this.getSignedOffsetAtPointer(
          event.clientX,
          event.clientY,
          true,
        );
      if (
        signedOffset === null
        || Math.abs(signedOffset) <= 1e-9
      ) {
        return;
      }

      this.manualOnly = true;
      this.numericShell.style.display = "none";
      this.commitParallel(signedOffset);
      return;
    }

    if (this.stage === "SIDE") {
      const signedOffset =
        this.getSignedOffsetAtPointer(
          event.clientX,
          event.clientY,
        );
      if (
        signedOffset === null
        || Math.abs(signedOffset) <= 1e-9
      ) {
        return;
      }
      this.commitParallel(signedOffset);
    }
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

    const distance =
      parseDistance(
        this.distanceInput.value,
      );

    if (distance === null) {
      this.fixedDistance = null;
      this.manualOnly = true;
      this.stage = "SIDE";
      this.numericShell.style.display = "none";
      this.options.domElement.focus();
      this.showHint(
        "PARALELA · distancia manual · mueva el cursor al lado deseado y haga clic",
      );
      return;
    }

    this.fixedDistance = distance;
    this.lastDistance = distance;
    this.manualOnly = false;
    this.stage = "SIDE";
    this.numericShell.style.display = "none";
    this.options.domElement.focus();
    this.showHint(
      `PARALELA · distancia ${distance} · indique el lado con un clic`,
    );
  };

  private prepareSource(
    lineId: string,
  ): boolean {
    const line =
      this.options.designModel.cadLines.get(
        lineId,
      );
    if (!line) return false;

    const start =
      new THREE.Vector3(
        line.start.x,
        line.start.y,
        line.start.z,
      );
    const end =
      new THREE.Vector3(
        line.end.x,
        line.end.y,
        line.end.z,
      );
    const direction =
      end.clone().sub(start);

    if (direction.lengthSq() <= 1e-12) {
      return false;
    }
    direction.normalize();

    const state =
      this.options.workPlane.getState();
    const normal =
      state.enabled
        ? state.normal.clone()
        : this.getViewNormal();

    if (normal.lengthSq() <= 1e-12) {
      return false;
    }
    normal.normalize();

    let offsetDirection =
      new THREE.Vector3()
        .crossVectors(
          normal,
          direction,
        );

    if (offsetDirection.lengthSq() <= 1e-12) {
      const viewNormal =
        this.getViewNormal();
      offsetDirection =
        new THREE.Vector3()
          .crossVectors(
            viewNormal,
            direction,
          );
    }

    if (offsetDirection.lengthSq() <= 1e-12) {
      return false;
    }

    this.sourceId = lineId;
    this.sourceStart = start;
    this.sourceEnd = end;
    this.planeNormal = normal;
    this.offsetDirection =
      offsetDirection.normalize();
    this.preview.visible = false;
    return true;
  }

  private getViewNormal(): THREE.Vector3 {
    const normal =
      new THREE.Vector3();
    this.options.cameraProvider()
      .getWorldDirection(normal);
    return normal.normalize();
  }

  private getSignedOffsetAtPointer(
    clientX: number,
    clientY: number,
    forceManual = false,
  ): number | null {
    if (
      !this.sourceStart
      || !this.offsetDirection
      || !this.planeNormal
    ) {
      return null;
    }

    const point =
      this.intersectPointerWithPlane(
        clientX,
        clientY,
      );
    if (!point) return null;

    const raw =
      point
        .clone()
        .sub(this.sourceStart)
        .dot(this.offsetDirection);

    const sign =
      raw < 0
        ? -1
        : 1;

    const distance =
      !forceManual
      && !this.manualOnly
      && this.fixedDistance !== null
        ? this.fixedDistance
        : Math.abs(raw);

    if (distance <= 1e-9) return null;
    return sign * distance;
  }

  private intersectPointerWithPlane(
    clientX: number,
    clientY: number,
  ): THREE.Vector3 | null {
    if (!this.sourceStart || !this.planeNormal) {
      return null;
    }

    const rect =
      this.options.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.ndc.x =
      ((clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y =
      -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(
      this.ndc,
      this.options.cameraProvider(),
    );
    this.plane.setFromNormalAndCoplanarPoint(
      this.planeNormal,
      this.sourceStart,
    );

    return this.raycaster.ray.intersectPlane(
      this.plane,
      new THREE.Vector3(),
    );
  }

  private updatePreview(
    signedOffset: number,
  ): void {
    if (
      !this.sourceStart
      || !this.sourceEnd
      || !this.offsetDirection
    ) {
      this.preview.visible = false;
      return;
    }

    const start =
      this.sourceStart
        .clone()
        .addScaledVector(
          this.offsetDirection,
          signedOffset,
        );
    const end =
      this.sourceEnd
        .clone()
        .addScaledVector(
          this.offsetDirection,
          signedOffset,
        );

    this.preview.geometry.setFromPoints(
      [start, end],
    );
    this.preview.computeLineDistances();
    this.preview.geometry.computeBoundingSphere();
    this.preview.visible = true;
  }

  private commitParallel(
    signedOffset: number,
  ): void {
    if (
      !this.sourceStart
      || !this.sourceEnd
      || !this.offsetDirection
      || Math.abs(signedOffset) <= 1e-9
    ) {
      return;
    }

    const start =
      this.sourceStart
        .clone()
        .addScaledVector(
          this.offsetDirection,
          signedOffset,
        );
    const end =
      this.sourceEnd
        .clone()
        .addScaledVector(
          this.offsetDirection,
          signedOffset,
        );

    const line =
      this.options.designModel.registerCadLine({
        layerId:
          this.options.designModel.layers.activeLayerId,
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
      });

    this.options.lineScene.sync();
    const snapshot = cloneLine(line);

    this.options.history.recordOperation(
      "PARALLEL LINE",
      () => {
        this.options.designModel.removeCadLine(
          snapshot.id,
        );
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
      () => {
        if (
          !this.options.designModel.cadLines.get(
            snapshot.id,
          )
        ) {
          this.options.designModel.registerCadLine({
            id: snapshot.id,
            layerId: snapshot.layerId,
            start: { ...snapshot.start },
            end: { ...snapshot.end },
          });
        }
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
    );

    this.options.clearGeometryQueryCache?.();
    this.lastDistance =
      Math.abs(signedOffset);
    this.preview.visible = false;
    this.numericShell.style.display = "none";
    this.distanceInput.value = "";
    this.options.lineSelection.clearSelection();
    this.resetSource();
    this.stage = "SELECT_SOURCE";
    this.fixedDistance = null;
    this.manualOnly = false;

    this.showHint(
      `PARALELA ${Math.abs(signedOffset).toFixed(2)} creada · seleccione otra línea o Esc`,
    );
  }

  private resetSource(): void {
    this.sourceId = null;
    this.sourceStart = null;
    this.sourceEnd = null;
    this.offsetDirection = null;
    this.planeNormal = null;
  }

  private createNumericShell(): HTMLDivElement {
    const shell =
      document.createElement("div");
    shell.dataset["framelogicParallelNumeric"] =
      "true";
    Object.assign(shell.style, {
      position: "fixed",
      zIndex: "2147482501",
      display: "none",
      alignItems: "center",
      gap: "5px",
      padding: "5px 6px",
      border: "1px solid rgba(127,210,240,0.5)",
      borderRadius: "5px",
      background: "rgba(12,20,26,0.97)",
      boxShadow: "0 4px 14px rgba(0,0,0,0.38)",
      color: "#dbeafe",
      font: "12px ui-monospace, monospace",
    });

    const label =
      document.createElement("span");
    label.textContent = "Dist";

    const input =
      document.createElement("input");
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.dataset["cadNumeric"] = "true";
    input.placeholder = "distancia o Enter = manual";
    Object.assign(input.style, {
      width: "170px",
      padding: "5px 6px",
      border: "1px solid rgba(255,255,255,0.2)",
      borderRadius: "4px",
      outline: "none",
      background: "#111827",
      color: "#f8fafc",
      font: "12px ui-monospace, monospace",
    });
    input.addEventListener(
      "keydown",
      this.handleNumericKeyDown,
    );

    shell.append(label, input);
    document.body.append(shell);
    return shell;
  }

  private showDistanceInput(): void {
    this.fixedDistance = null;
    this.manualOnly = false;
    this.distanceInput.value =
      this.lastDistance !== null
        ? String(this.lastDistance)
        : "";
    this.numericShell.style.display = "flex";
    this.positionUi();
    this.showHint(
      "PARALELA · indique distancia y Enter, o haga clic para distancia manual",
    );

    window.queueMicrotask(
      () => {
        this.distanceInput.focus();
        this.distanceInput.select();
      },
    );
  }

  private createHint(): HTMLDivElement {
    const hint =
      document.createElement("div");
    hint.dataset["framelogicParallelHint"] =
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
        window.innerWidth - 245,
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
