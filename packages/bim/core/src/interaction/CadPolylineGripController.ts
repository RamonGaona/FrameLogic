import * as THREE from "three";

import type {
  CadLine,
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPolyline,
  CadPolylineRegistryController,
  CadPolylineSegmentRef,
} from "../design/CadPolylineRegistryController";

import type {
  CadHistoryController,
} from "./CadHistoryController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  CadWorkPlaneController,
} from "./CadWorkPlaneController";

import {
  getDesignOrthoController,
} from "./DesignOrthoController";

import type {
  DesignOrthoController,
} from "./DesignOrthoController";


export interface CadPolylineGripControllerOptions {
  readonly domElement: HTMLElement;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly lineScene: CadLineSceneController;
  readonly polylines: CadPolylineRegistryController;
  readonly lineSelection: CadLineSelectionController;
  readonly workPlane: CadWorkPlaneController;
  readonly history: CadHistoryController;
  readonly findSnapPoint: (
    clientX: number,
    clientY: number,
  ) => THREE.Vector3 | null;
  readonly setCameraEnabled: (enabled: boolean) => void;
  readonly clearGeometryQueryCache?: () => void;
}


interface DragState {
  readonly polylineId: string;
  readonly vertexIndex: number;
  readonly pointerId: number;
  readonly origin: THREE.Vector3;
  readonly before: Map<string, CadLine>;
  readonly affectedSegmentIndexes: readonly number[];
  readonly lineSelectionWasEnabled: boolean;
  moved: boolean;
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


function toVector(
  point: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  },
): THREE.Vector3 {
  return new THREE.Vector3(
    point.x,
    point.y,
    point.z,
  );
}


function lineChanged(
  before: CadLine,
  after: CadLine,
): boolean {
  const values = [
    before.start.x - after.start.x,
    before.start.y - after.start.y,
    before.start.z - after.start.z,
    before.end.x - after.end.x,
    before.end.y - after.end.y,
    before.end.z - after.end.z,
  ];

  return values.some(
    (value) => Math.abs(value) > 1e-9,
  );
}


/**
 * Grips directos para POLYLINE.
 *
 * - Un clic normal sobre cualquier CadLine perteneciente a una POLYLINE mantiene
 *   la selección histórica a nivel de tramo, pero muestra todos los vértices de
 *   su entidad padre.
 * - Arrastrar un grip modifica en vivo únicamente los segmentos conectados al
 *   vértice.
 * - SNAP tiene prioridad sobre ORTO. Si no hay SNAP, F8 restringe el arrastre a
 *   los ejes del WorkPlane activo.
 * - El cambio completo se registra como una sola operación Undo/Redo.
 */
export class CadPolylineGripController {
  private readonly options:
    CadPolylineGripControllerOptions;

  private readonly ortho:
    DesignOrthoController;

  private readonly grips:
    HTMLButtonElement[] = [];

  private readonly status:
    HTMLDivElement;

  private readonly raycaster =
    new THREE.Raycaster();
  private readonly pointerNdc =
    new THREE.Vector2();
  private readonly fallbackPlane =
    new THREE.Plane();
  private readonly viewDirection =
    new THREE.Vector3();

  private activePolylineId:
    string | null = null;
  private drag:
    DragState | null = null;
  private disposed = false;
  private animationFrame:
    number | null = null;

  private readonly unsubscribeSelection:
    () => void;

  constructor(
    options: CadPolylineGripControllerOptions,
  ) {
    this.options = options;
    this.ortho =
      getDesignOrthoController(
        options.domElement,
      );
    this.status = this.createStatus();

    this.unsubscribeSelection =
      options.lineSelection.subscribe(
        (selectedIds) => {
          if (this.drag) return;
          this.setSelectionContext(
            selectedIds,
          );
        },
      );

    window.addEventListener(
      "pointermove",
      this.handleWindowPointerMove,
      true,
    );
    window.addEventListener(
      "pointerup",
      this.handleWindowPointerUp,
      true,
    );
    window.addEventListener(
      "pointercancel",
      this.handleWindowPointerCancel,
      true,
    );
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    this.startRenderLoop();
  }

  dispose(): void {
    if (this.disposed) return;

    if (this.drag) {
      this.restoreSnapshot(
        this.drag.before,
      );
      this.finishDrag(false);
    }

    this.disposed = true;
    this.unsubscribeSelection();

    window.removeEventListener(
      "pointermove",
      this.handleWindowPointerMove,
      true,
    );
    window.removeEventListener(
      "pointerup",
      this.handleWindowPointerUp,
      true,
    );
    window.removeEventListener(
      "pointercancel",
      this.handleWindowPointerCancel,
      true,
    );
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    if (this.animationFrame !== null) {
      cancelAnimationFrame(
        this.animationFrame,
      );
      this.animationFrame = null;
    }

    this.clearGrips();
    this.status.remove();
  }

  private setSelectionContext(
    selectedIds: readonly string[],
  ): void {
    const polyline =
      this.resolveSelectedPolyline(
        selectedIds,
      );

    const nextId =
      polyline?.id
      ?? null;

    if (nextId === this.activePolylineId) {
      this.refreshGrips();
      return;
    }

    this.activePolylineId = nextId;
    this.rebuildGrips();
  }

  private resolveSelectedPolyline(
    selectedIds: readonly string[],
  ): CadPolyline | null {
    if (selectedIds.length === 0) {
      return null;
    }

    let candidate:
      CadPolyline | null = null;

    for (const lineId of selectedIds) {
      const parent =
        this.options.polylines
          .findByLineId(lineId);

      if (!parent) {
        return null;
      }

      if (
        candidate
        && candidate.id !== parent.id
      ) {
        return null;
      }

      candidate = parent;
    }

    return candidate;
  }

  private rebuildGrips(): void {
    this.clearGrips();

    const polyline =
      this.currentPolyline();

    if (!polyline) return;

    const vertices =
      this.getVertices(polyline);

    for (
      let index = 0;
      index < vertices.length;
      index += 1
    ) {
      const grip =
        document.createElement("button");
      grip.type = "button";
      grip.dataset["framelogicPolylineGrip"] =
        "true";
      grip.dataset["vertexIndex"] =
        String(index);
      grip.title =
        `POLYLINE · vértice ${index + 1} · arrastrar para editar`;

      Object.assign(
        grip.style,
        {
          position: "fixed",
          zIndex: "2147482400",
          width: "11px",
          height: "11px",
          minWidth: "11px",
          padding: "0",
          margin: "0",
          border: "2px solid #d9f5ff",
          borderRadius: "2px",
          background: "#1689b8",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.6), 0 1px 5px rgba(0,0,0,0.45)",
          transform: "translate(-50%, -50%)",
          cursor: "move",
          pointerEvents: "auto",
          touchAction: "none",
          display: "none",
        },
      );

      grip.addEventListener(
        "pointerdown",
        this.handleGripPointerDown,
        true,
      );

      document.body.append(grip);
      this.grips.push(grip);
    }

    this.refreshGrips();
  }

  private clearGrips(): void {
    for (const grip of this.grips) {
      grip.removeEventListener(
        "pointerdown",
        this.handleGripPointerDown,
        true,
      );
      grip.remove();
    }

    this.grips.splice(0);
  }

  private currentPolyline(): CadPolyline | null {
    if (!this.activePolylineId) {
      return null;
    }

    return this.options.polylines.get(
      this.activePolylineId,
    ) ?? null;
  }

  private getVertices(
    polyline: CadPolyline,
  ): THREE.Vector3[] {
    if (polyline.segments.length === 0) {
      return [];
    }

    const vertices:
      THREE.Vector3[] = [];

    for (
      let index = 0;
      index < polyline.segments.length;
      index += 1
    ) {
      const ref =
        polyline.segments[index];
      const line =
        this.options.designModel
          .cadLines.get(ref.lineId);

      if (!line) return [];

      const start =
        ref.reversed
          ? toVector(line.end)
          : toVector(line.start);
      const end =
        ref.reversed
          ? toVector(line.start)
          : toVector(line.end);

      if (index === 0) {
        vertices.push(start);
      }
      vertices.push(end);
    }

    if (
      polyline.closed
      && vertices.length > 1
      && vertices[0]
        .distanceToSquared(
          vertices[vertices.length - 1],
        ) <= 1e-10
    ) {
      vertices.pop();
    }

    return vertices;
  }

  private refreshGrips(): void {
    const polyline =
      this.currentPolyline();

    if (
      !polyline
      || (
        !this.options.lineSelection.isEnabled
        && !this.drag
      )
    ) {
      for (const grip of this.grips) {
        grip.style.display = "none";
      }
      return;
    }

    const layer =
      this.options.designModel.layers.get(
        polyline.layerId,
      );

    if (
      !layer
      || !layer.visible
      || layer.locked
    ) {
      for (const grip of this.grips) {
        grip.style.display = "none";
      }
      return;
    }

    const vertices =
      this.getVertices(polyline);

    if (vertices.length !== this.grips.length) {
      if (!this.drag) {
        this.rebuildGrips();
      }
      return;
    }

    for (
      let index = 0;
      index < this.grips.length;
      index += 1
    ) {
      const grip =
        this.grips[index];
      const projected =
        this.projectToScreen(
          vertices[index],
        );

      if (!projected) {
        grip.style.display = "none";
        continue;
      }

      grip.style.display = "block";
      grip.style.left =
        `${projected.x}px`;
      grip.style.top =
        `${projected.y}px`;
      grip.style.background =
        this.drag?.vertexIndex === index
          ? "#ffb347"
          : "#1689b8";
    }
  }

  private readonly handleGripPointerDown =
    (
      event: PointerEvent,
    ): void => {
      if (
        this.disposed
        || this.drag
        || event.button !== 0
      ) {
        return;
      }

      const grip =
        event.currentTarget;

      if (!(grip instanceof HTMLButtonElement)) {
        return;
      }

      const vertexIndex =
        Number(
          grip.dataset["vertexIndex"],
        );

      if (!Number.isInteger(vertexIndex)) {
        return;
      }

      const polyline =
        this.currentPolyline();

      if (!polyline) return;

      const layer =
        this.options.designModel.layers.get(
          polyline.layerId,
        );

      if (!layer || layer.locked) {
        return;
      }

      const vertices =
        this.getVertices(polyline);
      const origin =
        vertices[vertexIndex];

      if (!origin) return;

      const affectedSegmentIndexes =
        this.getAffectedSegmentIndexes(
          polyline,
          vertexIndex,
        );

      const before =
        new Map<string, CadLine>();

      for (
        const segmentIndex
        of affectedSegmentIndexes
      ) {
        const ref =
          polyline.segments[
            segmentIndex
          ];
        const line =
          this.options.designModel
            .cadLines.get(ref.lineId);

        if (line) {
          before.set(
            line.id,
            cloneLine(line),
          );
        }
      }

      if (before.size === 0) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      this.drag = {
        polylineId: polyline.id,
        vertexIndex,
        pointerId: event.pointerId,
        origin: origin.clone(),
        before,
        affectedSegmentIndexes,
        lineSelectionWasEnabled:
          this.options.lineSelection.isEnabled,
        moved: false,
      };

      this.options.lineSelection
        .setEnabled(false);
      this.options.setCameraEnabled(false);
      this.showStatus(
        "GRIP POLYLINE · arrastre vértice · SNAP/ORTO activos · Esc cancelar",
        event.clientX,
        event.clientY,
      );
      this.refreshGrips();
    };

  private readonly handleWindowPointerMove =
    (
      event: PointerEvent,
    ): void => {
      if (
        !this.drag
        || event.pointerId
          !== this.drag.pointerId
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const point =
        this.acquireDragPoint(
          event.clientX,
          event.clientY,
        );

      if (!point) return;

      this.applyDragPoint(point);
      this.drag.moved =
        this.drag.moved
        || point.distanceToSquared(
          this.drag.origin,
        ) > 1e-12;

      this.showStatus(
        `GRIP POLYLINE · X ${point.x.toFixed(2)} · Y ${point.y.toFixed(2)} · Z ${point.z.toFixed(2)}`,
        event.clientX,
        event.clientY,
      );
    };

  private readonly handleWindowPointerUp =
    (
      event: PointerEvent,
    ): void => {
      if (
        !this.drag
        || event.pointerId
          !== this.drag.pointerId
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const point =
        this.acquireDragPoint(
          event.clientX,
          event.clientY,
        );

      if (point) {
        this.applyDragPoint(point);
      }

      this.commitDrag();
    };

  private readonly handleWindowPointerCancel =
    (
      event: PointerEvent,
    ): void => {
      if (
        !this.drag
        || event.pointerId
          !== this.drag.pointerId
      ) {
        return;
      }

      this.restoreSnapshot(
        this.drag.before,
      );
      this.finishDrag(false);
    };

  private readonly handleKeyDown =
    (
      event: KeyboardEvent,
    ): void => {
      if (
        !this.drag
        || event.key !== "Escape"
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      this.restoreSnapshot(
        this.drag.before,
      );
      this.finishDrag(false);
      this.flashStatus(
        "GRIP POLYLINE · movimiento cancelado",
      );
    };

  private acquireDragPoint(
    clientX: number,
    clientY: number,
  ): THREE.Vector3 | null {
    if (!this.drag) return null;

    const snap =
      this.options.findSnapPoint(
        clientX,
        clientY,
      );

    if (snap) {
      return snap;
    }

    const camera =
      this.options.cameraProvider();
    const state =
      this.options.workPlane.getState();

    let candidate =
      state.enabled
        ? this.options.workPlane
            .intersectPointer(
              clientX,
              clientY,
              camera,
              this.options.domElement,
            )
        : null;

    if (!candidate) {
      candidate =
        this.intersectViewPlane(
          clientX,
          clientY,
          this.drag.origin,
        );
    }

    if (!candidate) return null;

    if (!this.ortho.isEnabled) {
      return candidate;
    }

    if (state.enabled) {
      return this.ortho.constrainPoint(
        this.drag.origin,
        candidate,
        {
          axes: ["X", "Y"],
          basis: {
            xAxis: state.xAxis,
            yAxis: state.yAxis,
            zAxis: state.normal,
          },
        },
      );
    }

    return this.ortho.constrainPoint(
      this.drag.origin,
      candidate,
    );
  }

  private intersectViewPlane(
    clientX: number,
    clientY: number,
    origin: THREE.Vector3,
  ): THREE.Vector3 | null {
    const rect =
      this.options.domElement
        .getBoundingClientRect();

    if (
      rect.width <= 0
      || rect.height <= 0
    ) {
      return null;
    }

    this.pointerNdc.set(
      (
        (clientX - rect.left)
        / rect.width
      ) * 2 - 1,
      -(
        (clientY - rect.top)
        / rect.height
      ) * 2 + 1,
    );

    const camera =
      this.options.cameraProvider();
    this.raycaster.setFromCamera(
      this.pointerNdc,
      camera,
    );
    camera.getWorldDirection(
      this.viewDirection,
    );

    if (
      this.viewDirection.lengthSq()
      <= 1e-18
    ) {
      return null;
    }

    this.fallbackPlane
      .setFromNormalAndCoplanarPoint(
        this.viewDirection.normalize(),
        origin,
      );

    return this.raycaster.ray
      .intersectPlane(
        this.fallbackPlane,
        new THREE.Vector3(),
      );
  }

  private applyDragPoint(
    point: THREE.Vector3,
  ): void {
    const drag = this.drag;
    if (!drag) return;

    const polyline =
      this.options.polylines.get(
        drag.polylineId,
      );

    if (!polyline) return;

    for (
      const segmentIndex
      of drag.affectedSegmentIndexes
    ) {
      const ref =
        polyline.segments[
          segmentIndex
        ];
      const original =
        drag.before.get(ref.lineId);

      if (!original) continue;

      const orientedStart =
        ref.reversed
          ? toVector(original.end)
          : toVector(original.start);
      const orientedEnd =
        ref.reversed
          ? toVector(original.start)
          : toVector(original.end);

      const isOutgoing =
        segmentIndex === drag.vertexIndex;

      const nextStart =
        isOutgoing
          ? point
          : orientedStart;
      const nextEnd =
        isOutgoing
          ? orientedEnd
          : point;

      this.updateOrientedGeometry(
        ref,
        nextStart,
        nextEnd,
      );
    }

    this.options.lineScene.sync();
    this.options.clearGeometryQueryCache?.();
    this.refreshGrips();
  }

  private getAffectedSegmentIndexes(
    polyline: CadPolyline,
    vertexIndex: number,
  ): number[] {
    const affected =
      new Set<number>();
    const segmentCount =
      polyline.segments.length;

    if (polyline.closed) {
      affected.add(
        (
          vertexIndex - 1
          + segmentCount
        ) % segmentCount,
      );
      affected.add(
        vertexIndex
        % segmentCount,
      );
    }
    else {
      if (vertexIndex > 0) {
        affected.add(
          vertexIndex - 1,
        );
      }
      if (vertexIndex < segmentCount) {
        affected.add(
          vertexIndex,
        );
      }
    }

    return Array.from(affected);
  }

  private updateOrientedGeometry(
    ref: CadPolylineSegmentRef,
    orientedStart: THREE.Vector3,
    orientedEnd: THREE.Vector3,
  ): void {
    const start =
      ref.reversed
        ? orientedEnd
        : orientedStart;
    const end =
      ref.reversed
        ? orientedStart
        : orientedEnd;

    this.options.designModel
      .cadLines.updateGeometry(
        ref.lineId,
        {
          x: start.x,
          y: start.y,
          z: start.z,
        },
        {
          x: end.x,
          y: end.y,
          z: end.z,
        },
      );
  }

  private commitDrag(): void {
    const drag = this.drag;
    if (!drag) return;

    const after =
      new Map<string, CadLine>();
    let changed = false;

    for (const lineId of drag.before.keys()) {
      const line =
        this.options.designModel
          .cadLines.get(lineId);

      if (!line) continue;

      const snapshot =
        cloneLine(line);
      after.set(
        lineId,
        snapshot,
      );

      const before =
        drag.before.get(lineId);
      if (
        before
        && lineChanged(
          before,
          snapshot,
        )
      ) {
        changed = true;
      }
    }

    if (changed) {
      const beforeSnapshot =
        new Map(
          Array.from(
            drag.before.entries(),
            ([id, line]) => [
              id,
              cloneLine(line),
            ] as const,
          ),
        );
      const afterSnapshot =
        new Map(
          Array.from(
            after.entries(),
            ([id, line]) => [
              id,
              cloneLine(line),
            ] as const,
          ),
        );

      this.options.history
        .recordOperation(
          "POLYLINE GRIP MOVE",
          () =>
            this.restoreSnapshot(
              beforeSnapshot,
            ),
          () =>
            this.restoreSnapshot(
              afterSnapshot,
            ),
        );
    }

    this.finishDrag(changed);

    if (changed) {
      this.flashStatus(
        "POLYLINE · vértice actualizado",
      );
    }
  }

  private restoreSnapshot(
    snapshot: ReadonlyMap<string, CadLine>,
  ): void {
    for (const line of snapshot.values()) {
      if (
        !this.options.designModel
          .cadLines.get(line.id)
      ) {
        continue;
      }

      this.options.designModel
        .cadLines.updateGeometry(
          line.id,
          { ...line.start },
          { ...line.end },
        );
    }

    this.options.lineScene.sync();
    this.options.clearGeometryQueryCache?.();
    this.refreshGrips();
  }

  private finishDrag(
    keepCurrentGeometry: boolean,
  ): void {
    void keepCurrentGeometry;

    const drag = this.drag;
    if (!drag) return;

    this.drag = null;
    this.options.setCameraEnabled(true);
    this.options.lineSelection
      .setEnabled(
        drag.lineSelectionWasEnabled,
      );
    this.status.style.display = "none";
    this.refreshGrips();
  }

  private projectToScreen(
    point: THREE.Vector3,
  ): {
    readonly x: number;
    readonly y: number;
  } | null {
    const rect =
      this.options.domElement
        .getBoundingClientRect();

    if (
      rect.width <= 0
      || rect.height <= 0
    ) {
      return null;
    }

    const projected =
      point.clone().project(
        this.options.cameraProvider(),
      );

    if (
      !Number.isFinite(projected.x)
      || !Number.isFinite(projected.y)
      || !Number.isFinite(projected.z)
      || projected.z < -1
      || projected.z > 1
    ) {
      return null;
    }

    const x =
      rect.left
      + (
        projected.x + 1
      ) * 0.5
      * rect.width;
    const y =
      rect.top
      + (
        1 - projected.y
      ) * 0.5
      * rect.height;

    if (
      x < rect.left - 12
      || x > rect.right + 12
      || y < rect.top - 12
      || y > rect.bottom + 12
    ) {
      return null;
    }

    return { x, y };
  }

  private startRenderLoop(): void {
    const render = (): void => {
      if (this.disposed) return;
      this.refreshGrips();
      this.animationFrame =
        requestAnimationFrame(render);
    };

    this.animationFrame =
      requestAnimationFrame(render);
  }

  private createStatus(): HTMLDivElement {
    const element =
      document.createElement("div");
    element.dataset[
      "framelogicPolylineGripStatus"
    ] = "true";

    Object.assign(
      element.style,
      {
        position: "fixed",
        zIndex: "2147482450",
        display: "none",
        padding: "5px 8px",
        border: "1px solid rgba(190,220,235,0.55)",
        borderRadius: "4px",
        background: "rgba(18,28,36,0.94)",
        color: "#eef8fc",
        font: "11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      },
    );

    document.body.append(element);
    return element;
  }

  private showStatus(
    message: string,
    clientX: number,
    clientY: number,
  ): void {
    this.status.textContent = message;
    this.status.style.display = "block";

    const left =
      Math.min(
        clientX + 18,
        window.innerWidth - 390,
      );
    const top =
      Math.min(
        clientY + 20,
        window.innerHeight - 42,
      );

    this.status.style.left =
      `${Math.max(8, left)}px`;
    this.status.style.top =
      `${Math.max(8, top)}px`;
  }

  private flashStatus(
    message: string,
  ): void {
    const rect =
      this.options.domElement
        .getBoundingClientRect();

    this.showStatus(
      message,
      rect.left + 24,
      rect.top + 24,
    );

    window.setTimeout(
      () => {
        if (!this.drag) {
          this.status.style.display =
            "none";
        }
      },
      900,
    );
  }
}
