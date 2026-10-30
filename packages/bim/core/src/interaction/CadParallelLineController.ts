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


interface OrderedSourceSegment {
  readonly id: string;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
}


interface OffsetSegment {
  start: THREE.Vector3;
  end: THREE.Vector3;
}


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


const CONNECT_TOLERANCE = 1e-5;
const CONNECT_TOLERANCE_SQ =
  CONNECT_TOLERANCE * CONNECT_TOLERANCE;


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


function pointFromCadLineStart(
  line: CadLine,
): THREE.Vector3 {
  return new THREE.Vector3(
    line.start.x,
    line.start.y,
    line.start.z,
  );
}


function pointFromCadLineEnd(
  line: CadLine,
): THREE.Vector3 {
  return new THREE.Vector3(
    line.end.x,
    line.end.y,
    line.end.z,
  );
}


function pointsConnect(
  a: THREE.Vector3,
  b: THREE.Vector3,
): boolean {
  return a.distanceToSquared(b)
    <= CONNECT_TOLERANCE_SQ;
}


export class CadParallelLineController {
  private readonly options:
    CadParallelLineControllerOptions;

  private readonly preview:
    THREE.LineSegments;

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

  private readonly pendingSourceIds:
    string[] = [];

  private sourceSegments:
    OrderedSourceSegment[] = [];

  private sourceClosed = false;

  private referenceStart:
    THREE.Vector3 | null = null;

  private referenceOffsetDirection:
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
      new THREE.LineSegments(
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
      Array.from(
        this.options.lineSelection.getSelectedIds(),
      );

    this.options.beforeStart();

    this.active = true;
    this.stage = "SELECT_SOURCE";
    this.fixedDistance = null;
    this.manualOnly = false;
    this.preview.visible = false;
    this.numericShell.style.display = "none";
    this.distanceInput.value = "";
    this.pendingSourceIds.splice(0);
    this.resetSourceGeometry();

    this.options.designSelection.setEnabled(false);
    this.options.pointSelection.setEnabled(false);
    this.options.lineSelection.setEnabled(false);

    if (
      selected.length > 0
      && this.prepareSources(selected)
    ) {
      this.options.lineSelection.setSelection(
        selected,
      );
      this.stage = "DISTANCE";
      this.showDistanceInput();
      return true;
    }

    this.options.lineSelection.clearSelection();

    if (selected.length > 0) {
      this.showHint(
        "PARALELA · las líneas deben formar una cadena conectada sin bifurcaciones · seleccione de nuevo",
      );
    }
    else {
      this.showHint(
        "PARALELA · seleccione una o varias líneas conectadas · Enter confirmar · Esc terminar",
      );
    }

    return true;
  }

  cancel(): void {
    if (!this.active) {
      this.hideUi();
      return;
    }

    this.active = false;
    this.pendingSourceIds.splice(0);
    this.resetSourceGeometry();
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
          this.pendingSourceIds.length > 0
            ? `PARALELA · ${this.pendingSourceIds.length} tramo(s) · Enter confirmar`
            : "PARALELA · seleccione una o varias líneas CAD",
        );
        return;
      }

      const existingIndex =
        this.pendingSourceIds.indexOf(lineId);

      if (existingIndex >= 0) {
        this.pendingSourceIds.splice(
          existingIndex,
          1,
        );
      }
      else {
        this.pendingSourceIds.push(lineId);
      }

      this.options.lineSelection.setSelection(
        this.pendingSourceIds,
      );

      this.showHint(
        this.pendingSourceIds.length > 0
          ? `PARALELA · ${this.pendingSourceIds.length} tramo(s) seleccionados · Enter confirmar`
          : "PARALELA · seleccione una o varias líneas CAD",
      );
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
      return;
    }

    if (
      event.key === "Enter"
      && this.stage === "SELECT_SOURCE"
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (this.pendingSourceIds.length === 0) {
        this.showHint(
          "PARALELA · seleccione al menos una línea CAD",
        );
        return;
      }

      if (!this.prepareSources(this.pendingSourceIds)) {
        this.showHint(
          "PARALELA · las líneas seleccionadas deben formar una cadena conectada sin bifurcaciones",
        );
        return;
      }

      this.stage = "DISTANCE";
      this.showDistanceInput();
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

  private prepareSources(
    lineIds: readonly string[],
  ): boolean {
    if (lineIds.length === 0) return false;

    const rawSegments:
      OrderedSourceSegment[] = [];

    for (const lineId of lineIds) {
      const line =
        this.options.designModel.cadLines.get(
          lineId,
        );

      if (!line) return false;

      const start =
        pointFromCadLineStart(line);
      const end =
        pointFromCadLineEnd(line);

      if (
        start.distanceToSquared(end)
        <= 1e-12
      ) {
        return false;
      }

      rawSegments.push({
        id: lineId,
        start,
        end,
      });
    }

    const ordered =
      this.orderConnectedChain(rawSegments);

    if (!ordered) return false;

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

    const firstDirection =
      ordered[0]
        .end
        .clone()
        .sub(ordered[0].start)
        .normalize();

    const referenceOffsetDirection =
      new THREE.Vector3()
        .crossVectors(
          normal,
          firstDirection,
        );

    if (
      referenceOffsetDirection.lengthSq()
      <= 1e-12
    ) {
      return false;
    }

    for (const segment of ordered) {
      const direction =
        segment.end
          .clone()
          .sub(segment.start)
          .normalize();
      const offsetDirection =
        new THREE.Vector3()
          .crossVectors(
            normal,
            direction,
          );

      if (offsetDirection.lengthSq() <= 1e-12) {
        return false;
      }
    }

    this.sourceSegments = ordered;
    this.sourceClosed =
      ordered.length > 2
      && pointsConnect(
        ordered[ordered.length - 1].end,
        ordered[0].start,
      );
    this.referenceStart =
      ordered[0].start.clone();
    this.referenceOffsetDirection =
      referenceOffsetDirection.normalize();
    this.planeNormal = normal;
    this.preview.visible = false;
    return true;
  }

  private orderConnectedChain(
    segments: readonly OrderedSourceSegment[],
  ): OrderedSourceSegment[] | null {
    if (segments.length === 1) {
      return [{
        id: segments[0].id,
        start: segments[0].start.clone(),
        end: segments[0].end.clone(),
      }];
    }

    const remaining =
      segments.map(
        (segment) => ({
          id: segment.id,
          start: segment.start.clone(),
          end: segment.end.clone(),
        }),
      );

    const ordered:
      OrderedSourceSegment[] = [
        remaining.shift()!,
      ];

    while (remaining.length > 0) {
      let attached = false;

      const chainStart =
        ordered[0].start;
      const chainEnd =
        ordered[ordered.length - 1].end;

      for (
        let index = 0;
        index < remaining.length;
        index += 1
      ) {
        const candidate =
          remaining[index];

        if (
          pointsConnect(
            chainEnd,
            candidate.start,
          )
        ) {
          ordered.push(candidate);
          remaining.splice(index, 1);
          attached = true;
          break;
        }

        if (
          pointsConnect(
            chainEnd,
            candidate.end,
          )
        ) {
          ordered.push({
            id: candidate.id,
            start: candidate.end.clone(),
            end: candidate.start.clone(),
          });
          remaining.splice(index, 1);
          attached = true;
          break;
        }

        if (
          pointsConnect(
            chainStart,
            candidate.end,
          )
        ) {
          ordered.unshift(candidate);
          remaining.splice(index, 1);
          attached = true;
          break;
        }

        if (
          pointsConnect(
            chainStart,
            candidate.start,
          )
        ) {
          ordered.unshift({
            id: candidate.id,
            start: candidate.end.clone(),
            end: candidate.start.clone(),
          });
          remaining.splice(index, 1);
          attached = true;
          break;
        }
      }

      if (!attached) {
        return null;
      }
    }

    for (
      let index = 0;
      index < ordered.length - 1;
      index += 1
    ) {
      if (
        !pointsConnect(
          ordered[index].end,
          ordered[index + 1].start,
        )
      ) {
        return null;
      }
    }

    return ordered;
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
      !this.referenceStart
      || !this.referenceOffsetDirection
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
        .sub(this.referenceStart)
        .dot(this.referenceOffsetDirection);

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
    if (!this.referenceStart || !this.planeNormal) {
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
      this.referenceStart,
    );

    return this.raycaster.ray.intersectPlane(
      this.plane,
      new THREE.Vector3(),
    );
  }

  private buildOffsetSegments(
    signedOffset: number,
  ): OffsetSegment[] | null {
    if (
      !this.planeNormal
      || this.sourceSegments.length === 0
      || Math.abs(signedOffset) <= 1e-9
    ) {
      return null;
    }

    const normal =
      this.planeNormal.clone().normalize();

    const result:
      OffsetSegment[] = [];

    for (const source of this.sourceSegments) {
      const direction =
        source.end
          .clone()
          .sub(source.start);

      if (direction.lengthSq() <= 1e-12) {
        return null;
      }
      direction.normalize();

      const offsetDirection =
        new THREE.Vector3()
          .crossVectors(
            normal,
            direction,
          );

      if (offsetDirection.lengthSq() <= 1e-12) {
        return null;
      }
      offsetDirection.normalize();

      result.push({
        start:
          source.start
            .clone()
            .addScaledVector(
              offsetDirection,
              signedOffset,
            ),
        end:
          source.end
            .clone()
            .addScaledVector(
              offsetDirection,
              signedOffset,
            ),
      });
    }

    for (
      let index = 0;
      index < result.length - 1;
      index += 1
    ) {
      this.joinOffsetSegments(
        result[index],
        result[index + 1],
        normal,
      );
    }

    if (
      this.sourceClosed
      && result.length > 2
    ) {
      this.joinOffsetSegments(
        result[result.length - 1],
        result[0],
        normal,
      );
    }

    return result;
  }

  private joinOffsetSegments(
    first: OffsetSegment,
    second: OffsetSegment,
    normal: THREE.Vector3,
  ): void {
    const firstDirection =
      first.end
        .clone()
        .sub(first.start);
    const secondDirection =
      second.end
        .clone()
        .sub(second.start);

    if (
      firstDirection.lengthSq() <= 1e-12
      || secondDirection.lengthSq() <= 1e-12
    ) {
      return;
    }

    const denominator =
      normal.dot(
        new THREE.Vector3()
          .crossVectors(
            firstDirection,
            secondDirection,
          ),
      );

    if (Math.abs(denominator) <= 1e-10) {
      return;
    }

    const between =
      second.start
        .clone()
        .sub(first.start);

    const numerator =
      normal.dot(
        new THREE.Vector3()
          .crossVectors(
            between,
            secondDirection,
          ),
      );

    const parameter =
      numerator / denominator;

    if (!Number.isFinite(parameter)) {
      return;
    }

    const intersection =
      first.start
        .clone()
        .addScaledVector(
          firstDirection,
          parameter,
        );

    first.end = intersection.clone();
    second.start = intersection.clone();
  }

  private updatePreview(
    signedOffset: number,
  ): void {
    const segments =
      this.buildOffsetSegments(
        signedOffset,
      );

    if (!segments) {
      this.preview.visible = false;
      return;
    }

    const points:
      THREE.Vector3[] = [];

    for (const segment of segments) {
      points.push(
        segment.start,
        segment.end,
      );
    }

    this.preview.geometry.setFromPoints(points);
    this.preview.computeLineDistances();
    this.preview.geometry.computeBoundingSphere();
    this.preview.visible = true;
  }

  private commitParallel(
    signedOffset: number,
  ): void {
    const segments =
      this.buildOffsetSegments(
        signedOffset,
      );

    if (!segments) return;

    const created:
      CadLine[] = [];

    for (const segment of segments) {
      if (
        segment.start.distanceToSquared(
          segment.end,
        ) <= 1e-12
      ) {
        continue;
      }

      const line =
        this.options.designModel.registerCadLine({
          layerId:
            this.options.designModel.layers.activeLayerId,
          start: {
            x: segment.start.x,
            y: segment.start.y,
            z: segment.start.z,
          },
          end: {
            x: segment.end.x,
            y: segment.end.y,
            z: segment.end.z,
          },
        });

      created.push(
        cloneLine(line),
      );
    }

    if (created.length === 0) {
      return;
    }

    this.options.lineScene.sync();

    const snapshots =
      created.map(cloneLine);

    this.options.history.recordOperation(
      snapshots.length === 1
        ? "PARALLEL LINE"
        : "PARALLEL CHAIN",
      () => {
        for (const snapshot of snapshots) {
          this.options.designModel.removeCadLine(
            snapshot.id,
          );
        }
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
      () => {
        for (const snapshot of snapshots) {
          if (
            this.options.designModel.cadLines.get(
              snapshot.id,
            )
          ) {
            continue;
          }

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
    this.pendingSourceIds.splice(0);
    this.resetSourceGeometry();
    this.stage = "SELECT_SOURCE";
    this.fixedDistance = null;
    this.manualOnly = false;

    this.showHint(
      `${created.length} paralela(s) creadas y ajustadas · seleccione otra cadena o Esc`,
    );
  }

  private resetSourceGeometry(): void {
    this.sourceSegments = [];
    this.sourceClosed = false;
    this.referenceStart = null;
    this.referenceOffsetDirection = null;
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
      this.sourceSegments.length > 1
        ? `PARALELA · ${this.sourceSegments.length} tramos conectados · indique distancia y Enter`
        : "PARALELA · indique distancia y Enter, o haga clic para distancia manual",
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
        window.innerWidth - 310,
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
