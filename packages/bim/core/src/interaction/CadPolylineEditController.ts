import * as THREE from "three";

import type {
  CadLine,
  DesignModel,
} from "@framelogic/domain";

import type {
  CadPolyline,
  CadPolylineRegistryController,
  CadPolylineSegmentRef,
} from "../design/CadPolylineRegistryController";

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


type PolylineEditStage =
  | "SELECT_POLYLINE"
  | "MENU"
  | "MOVE_VERTEX_PICK"
  | "MOVE_VERTEX_DESTINATION"
  | "ADD_VERTEX_SEGMENT"
  | "DELETE_VERTEX_PICK"
  | "DETACH_SEGMENT";


export interface CadPolylineEditControllerOptions {
  readonly domElement: HTMLElement;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly lineScene: CadLineSceneController;
  readonly polylines: CadPolylineRegistryController;
  readonly lineSelection: CadLineSelectionController;
  readonly pointSelection: CadPointSelectionController;
  readonly designSelection: DesignSelectionController;
  readonly workPlane: CadWorkPlaneController;
  readonly history: CadHistoryController;
  readonly findSnapPoint: (
    clientX: number,
    clientY: number,
  ) => THREE.Vector3 | null;
  readonly beforeStart: () => void;
  readonly clearGeometryQueryCache?: () => void;
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


function clonePolyline(
  polyline: CadPolyline,
): CadPolyline {
  return {
    ...polyline,
    segments:
      polyline.segments.map(
        (segment) => ({ ...segment }),
      ),
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


function isEditableTarget(
  target: EventTarget | null,
): boolean {
  return target instanceof HTMLElement
    && (
      target.isContentEditable
      || target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
    );
}


/**
 * PEDIT básico para la entidad POLYLINE de FrameLogic.
 *
 * Operaciones incluidas:
 * - mover vértice;
 * - añadir vértice dividiendo un tramo;
 * - eliminar vértice fusionando los tramos vecinos;
 * - abrir/cerrar;
 * - invertir sentido;
 * - separar un tramo extremo (o cualquier tramo en una cerrada).
 */
export class CadPolylineEditController {
  private readonly options:
    CadPolylineEditControllerOptions;
  private readonly status: HTMLDivElement;
  private readonly menu: HTMLDivElement;
  private readonly toolbarButton: HTMLButtonElement;
  private readonly observer: MutationObserver;

  private active = false;
  private disposed = false;
  private stage: PolylineEditStage =
    "SELECT_POLYLINE";
  private polylineId: string | null = null;
  private selectedVertexIndex: number | null = null;
  private pointerX = 180;
  private pointerY = 160;

  constructor(
    options: CadPolylineEditControllerOptions,
  ) {
    this.options = options;
    this.status = this.createStatus();
    this.menu = this.createMenu();
    this.toolbarButton = this.createToolbarButton();
    this.observer = new MutationObserver(
      () => this.ensureToolbarButton(),
    );
    this.observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
      },
    );
    this.ensureToolbarButton();

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

    this.options.beforeStart();
    this.active = true;
    this.polylineId = null;
    this.selectedVertexIndex = null;
    this.menu.style.display = "none";

    this.options.designSelection.setEnabled(false);
    this.options.pointSelection.setEnabled(false);

    const selected =
      this.options.lineSelection.getSelectedIds();

    for (const lineId of selected) {
      const parent =
        this.options.polylines.findByLineId(lineId);
      if (parent) {
        this.activatePolyline(parent);
        return true;
      }
    }

    this.stage = "SELECT_POLYLINE";
    this.options.lineSelection.setEnabled(false);
    this.setStatus(
      "PEDIT · seleccione un tramo perteneciente a una POLYLINE · Esc cancelar",
    );
    return true;
  }

  cancel(): void {
    if (!this.active) {
      this.hideUi();
      return;
    }

    this.active = false;
    this.stage = "SELECT_POLYLINE";
    this.polylineId = null;
    this.selectedVertexIndex = null;
    this.hideUi();
    this.options.designSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.lineSelection.setEnabled(true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.cancel();
    this.disposed = true;
    this.observer.disconnect();
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
    this.toolbarButton.removeEventListener(
      "click",
      this.handleToolbarClick,
    );
    this.toolbarButton.remove();
    this.menu.remove();
    this.status.remove();
  }

  private readonly handleToolbarClick = (): void => {
    this.start();
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

    if (!this.active) {
      if (event.key.toLowerCase() !== "e") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.start();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (this.stage !== "MENU") {
        this.showMenu(
          "PEDIT · operación cancelada",
        );
      }
      else {
        this.cancel();
      }
    }
  };

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;

    if (this.menu.style.display !== "none") {
      this.positionMenu();
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

    if (this.stage === "SELECT_POLYLINE") {
      const lineId =
        this.options.lineSelection.getLineIdAt(
          event.clientX,
          event.clientY,
        );
      if (!lineId) return;

      const parent =
        this.options.polylines.findByLineId(lineId);
      if (!parent) {
        this.setStatus(
          "PEDIT · esa línea no pertenece a una POLYLINE",
        );
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      this.activatePolyline(parent);
      return;
    }

    if (!this.polylineId) return;

    if (this.stage === "MOVE_VERTEX_PICK") {
      const index =
        this.findVertexAt(
          this.polylineId,
          event.clientX,
          event.clientY,
        );
      if (index === null) {
        this.setStatus(
          "PEDIT · haga clic cerca de un vértice",
        );
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      this.selectedVertexIndex = index;
      this.stage = "MOVE_VERTEX_DESTINATION";
      this.setStatus(
        "PEDIT · indique nueva posición del vértice",
      );
      return;
    }

    if (
      this.stage === "MOVE_VERTEX_DESTINATION"
      && this.selectedVertexIndex !== null
    ) {
      const point =
        this.pickPoint(
          event.clientX,
          event.clientY,
        );
      if (!point) {
        this.setStatus(
          "PEDIT · no hay punto válido para mover el vértice",
        );
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      this.moveVertex(
        this.selectedVertexIndex,
        point,
      );
      return;
    }

    if (this.stage === "ADD_VERTEX_SEGMENT") {
      const lineId =
        this.options.lineSelection.getLineIdAt(
          event.clientX,
          event.clientY,
        );
      if (!lineId) return;

      const parent =
        this.options.polylines.findByLineId(lineId);
      if (!parent || parent.id !== this.polylineId) {
        this.setStatus(
          "PEDIT · seleccione un tramo de la polilínea activa",
        );
        return;
      }

      const point =
        this.pickPoint(
          event.clientX,
          event.clientY,
        );
      if (!point) {
        this.setStatus(
          "PEDIT · no hay punto válido sobre el tramo",
        );
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      this.addVertex(lineId, point);
      return;
    }

    if (this.stage === "DELETE_VERTEX_PICK") {
      const index =
        this.findVertexAt(
          this.polylineId,
          event.clientX,
          event.clientY,
        );
      if (index === null) {
        this.setStatus(
          "PEDIT · haga clic cerca del vértice que desea eliminar",
        );
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      this.deleteVertex(index);
      return;
    }

    if (this.stage === "DETACH_SEGMENT") {
      const lineId =
        this.options.lineSelection.getLineIdAt(
          event.clientX,
          event.clientY,
        );
      if (!lineId) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      this.detachSegment(lineId);
    }
  };

  private activatePolyline(
    polyline: CadPolyline,
  ): void {
    this.polylineId = polyline.id;
    this.stage = "MENU";
    this.options.lineSelection.setEnabled(false);
    this.options.lineSelection.setSelection(
      polyline.segments.map(
        (segment) => segment.lineId,
      ),
      true,
    );
    this.showMenu(
      `PEDIT · ${polyline.closed ? "cerrada" : "abierta"} · ${polyline.segments.length} tramos`,
    );
  }

  private showMenu(
    message?: string,
  ): void {
    if (!this.active || !this.polylineId) return;
    this.stage = "MENU";
    this.selectedVertexIndex = null;
    this.menu.style.display = "flex";
    this.positionMenu();
    this.setStatus(
      message
      ?? "PEDIT · elija una operación",
    );
  }

  private beginMoveVertex(): void {
    this.menu.style.display = "none";
    this.stage = "MOVE_VERTEX_PICK";
    this.setStatus(
      "PEDIT · MOVER VÉRTICE · seleccione vértice",
    );
  }

  private beginAddVertex(): void {
    this.menu.style.display = "none";
    this.stage = "ADD_VERTEX_SEGMENT";
    this.setStatus(
      "PEDIT · AÑADIR VÉRTICE · haga clic sobre el tramo a dividir",
    );
  }

  private beginDeleteVertex(): void {
    this.menu.style.display = "none";
    this.stage = "DELETE_VERTEX_PICK";
    this.setStatus(
      "PEDIT · ELIMINAR VÉRTICE · seleccione vértice",
    );
  }

  private beginDetachSegment(): void {
    this.menu.style.display = "none";
    this.stage = "DETACH_SEGMENT";
    this.setStatus(
      "PEDIT · SEPARAR TRAMO · seleccione tramo",
    );
  }

  private currentPolyline(): CadPolyline | null {
    if (!this.polylineId) return null;
    return this.options.polylines.get(
      this.polylineId,
    ) ?? null;
  }

  private getVertices(
    polyline: CadPolyline,
  ): THREE.Vector3[] {
    if (polyline.segments.length === 0) return [];

    const vertices: THREE.Vector3[] = [];

    for (
      let index = 0;
      index < polyline.segments.length;
      index += 1
    ) {
      const ref = polyline.segments[index];
      const line =
        this.options.designModel.cadLines.get(
          ref.lineId,
        );
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
      && vertices[0].distanceToSquared(
        vertices[vertices.length - 1],
      ) <= 1e-10
    ) {
      vertices.pop();
    }

    return vertices;
  }

  private findVertexAt(
    polylineId: string,
    clientX: number,
    clientY: number,
  ): number | null {
    const polyline =
      this.options.polylines.get(polylineId);
    if (!polyline) return null;

    const vertices =
      this.getVertices(polyline);
    let bestIndex: number | null = null;
    let bestDistance = 14;

    for (
      let index = 0;
      index < vertices.length;
      index += 1
    ) {
      const projected =
        this.projectToScreen(vertices[index]);
      if (!projected) continue;

      const distance = Math.hypot(
        projected.x - clientX,
        projected.y - clientY,
      );

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    return bestIndex;
  }

  private moveVertex(
    vertexIndex: number,
    point: THREE.Vector3,
  ): void {
    const polyline = this.currentPolyline();
    if (!polyline) return;

    const vertices = this.getVertices(polyline);
    if (
      vertexIndex < 0
      || vertexIndex >= vertices.length
    ) {
      this.showMenu(
        "PEDIT · vértice inválido",
      );
      return;
    }

    const affected =
      new Set<number>();
    const segmentCount =
      polyline.segments.length;

    if (polyline.closed) {
      affected.add(
        (vertexIndex - 1 + segmentCount)
        % segmentCount,
      );
      affected.add(
        vertexIndex % segmentCount,
      );
    }
    else {
      if (vertexIndex > 0) {
        affected.add(vertexIndex - 1);
      }
      if (vertexIndex < segmentCount) {
        affected.add(vertexIndex);
      }
    }

    const before = new Map<string, CadLine>();
    const after = new Map<string, CadLine>();

    for (const segmentIndex of affected) {
      const ref = polyline.segments[segmentIndex];
      const line =
        this.options.designModel.cadLines.get(
          ref.lineId,
        );
      if (!line) continue;

      before.set(line.id, cloneLine(line));

      const orientedStart =
        ref.reversed
          ? toVector(line.end)
          : toVector(line.start);
      const orientedEnd =
        ref.reversed
          ? toVector(line.start)
          : toVector(line.end);

      const isOutgoing =
        segmentIndex === vertexIndex
        || (
          polyline.closed
          && vertexIndex === 0
          && segmentIndex === 0
        );

      const newStart =
        isOutgoing
          ? point
          : orientedStart;
      const newEnd =
        isOutgoing
          ? orientedEnd
          : point;

      this.updateOrientedGeometry(
        ref,
        newStart,
        newEnd,
      );

      const updated =
        this.options.designModel.cadLines.get(
          line.id,
        );
      if (updated) {
        after.set(line.id, cloneLine(updated));
      }
    }

    if (after.size === 0) {
      this.showMenu(
        "PEDIT · no fue posible mover el vértice",
      );
      return;
    }

    this.options.lineScene.sync();
    this.options.clearGeometryQueryCache?.();

    this.options.history.recordOperation(
      "PEDIT MOVE VERTEX",
      () => this.applyLineSnapshot(before),
      () => this.applyLineSnapshot(after),
    );

    this.showMenu(
      "PEDIT · vértice movido",
    );
  }

  private addVertex(
    lineId: string,
    rawPoint: THREE.Vector3,
  ): void {
    const polyline = this.currentPolyline();
    if (!polyline) return;

    const segmentIndex =
      polyline.segments.findIndex(
        (segment) =>
          segment.lineId === lineId,
      );
    if (segmentIndex < 0) {
      this.showMenu(
        "PEDIT · el tramo no pertenece a la polilínea",
      );
      return;
    }

    const ref = polyline.segments[segmentIndex];
    const line =
      this.options.designModel.cadLines.get(lineId);
    if (!line) return;

    const orientedStart =
      ref.reversed
        ? toVector(line.end)
        : toVector(line.start);
    const orientedEnd =
      ref.reversed
        ? toVector(line.start)
        : toVector(line.end);
    const direction =
      orientedEnd.clone().sub(orientedStart);
    const lengthSq = direction.lengthSq();

    if (lengthSq <= 1e-18) {
      this.showMenu(
        "PEDIT · el tramo tiene longitud nula",
      );
      return;
    }

    const t = THREE.MathUtils.clamp(
      rawPoint
        .clone()
        .sub(orientedStart)
        .dot(direction)
        / lengthSq,
      0,
      1,
    );

    if (t <= 1e-5 || t >= 1 - 1e-5) {
      this.showMenu(
        "PEDIT · el nuevo vértice debe quedar dentro del tramo",
      );
      return;
    }

    const split =
      orientedStart
        .clone()
        .addScaledVector(direction, t);

    const beforePolyline =
      clonePolyline(polyline);
    const beforeLine = cloneLine(line);

    this.updateOrientedGeometry(
      ref,
      orientedStart,
      split,
    );

    const created =
      this.options.designModel.registerCadLine({
        layerId: line.layerId,
        start: {
          x: split.x,
          y: split.y,
          z: split.z,
        },
        end: {
          x: orientedEnd.x,
          y: orientedEnd.y,
          z: orientedEnd.z,
        },
      });

    const newSegments: CadPolylineSegmentRef[] = [
      ...polyline.segments.slice(0, segmentIndex),
      { ...ref },
      {
        lineId: created.id,
        reversed: false,
      },
      ...polyline.segments.slice(segmentIndex + 1),
    ];

    this.options.polylines.updateSegments(
      polyline.id,
      newSegments,
      polyline.closed,
    );

    const afterLine =
      this.options.designModel.cadLines.get(line.id);
    const createdSnapshot = cloneLine(created);
    const afterPolyline =
      this.options.polylines.get(polyline.id);

    if (!afterLine || !afterPolyline) return;

    this.options.lineScene.sync();
    this.options.clearGeometryQueryCache?.();

    this.options.history.recordOperation(
      "PEDIT ADD VERTEX",
      () => {
        this.options.polylines.updateSegments(
          beforePolyline.id,
          beforePolyline.segments,
          beforePolyline.closed,
        );
        this.options.designModel.cadLines.updateGeometry(
          beforeLine.id,
          { ...beforeLine.start },
          { ...beforeLine.end },
        );
        this.options.designModel.removeCadLine(
          createdSnapshot.id,
        );
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
      () => {
        if (!this.options.designModel.cadLines.get(createdSnapshot.id)) {
          this.options.designModel.registerCadLine({
            id: createdSnapshot.id,
            layerId: createdSnapshot.layerId,
            start: { ...createdSnapshot.start },
            end: { ...createdSnapshot.end },
          });
        }
        this.options.designModel.cadLines.updateGeometry(
          afterLine.id,
          { ...afterLine.start },
          { ...afterLine.end },
        );
        this.options.polylines.updateSegments(
          afterPolyline.id,
          afterPolyline.segments,
          afterPolyline.closed,
        );
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
    );

    this.refreshPolylineSelection();
    this.showMenu(
      "PEDIT · vértice añadido",
    );
  }

  private deleteVertex(
    vertexIndex: number,
  ): void {
    const polyline = this.currentPolyline();
    if (!polyline) return;

    const segmentCount =
      polyline.segments.length;
    const vertices = this.getVertices(polyline);

    if (polyline.closed) {
      if (segmentCount < 4) {
        this.showMenu(
          "PEDIT · una polilínea cerrada necesita al menos 3 lados",
        );
        return;
      }
    }
    else {
      if (
        segmentCount < 3
        || vertexIndex <= 0
        || vertexIndex >= vertices.length - 1
      ) {
        this.showMenu(
          "PEDIT · en una polilínea abierta solo se eliminan vértices interiores y deben quedar al menos 2 tramos",
        );
        return;
      }
    }

    const prevIndex =
      polyline.closed
        ? (vertexIndex - 1 + segmentCount)
          % segmentCount
        : vertexIndex - 1;
    const nextIndex =
      polyline.closed
        ? vertexIndex % segmentCount
        : vertexIndex;

    const prevRef =
      polyline.segments[prevIndex];
    const nextRef =
      polyline.segments[nextIndex];
    const prevLine =
      this.options.designModel.cadLines.get(
        prevRef.lineId,
      );
    const nextLine =
      this.options.designModel.cadLines.get(
        nextRef.lineId,
      );

    if (!prevLine || !nextLine) return;

    const beforePolyline = clonePolyline(polyline);
    const beforePrev = cloneLine(prevLine);
    const removedSnapshot = cloneLine(nextLine);

    const previousVertex =
      vertices[
        (vertexIndex - 1 + vertices.length)
        % vertices.length
      ];
    const nextVertex =
      vertices[
        (vertexIndex + 1)
        % vertices.length
      ];

    this.updateOrientedGeometry(
      prevRef,
      previousVertex,
      nextVertex,
    );
    this.options.designModel.removeCadLine(
      nextRef.lineId,
    );

    const newSegments =
      polyline.segments.filter(
        (_, index) => index !== nextIndex,
      );

    this.options.polylines.updateSegments(
      polyline.id,
      newSegments,
      polyline.closed,
    );

    const afterPrev =
      this.options.designModel.cadLines.get(
        prevRef.lineId,
      );
    const afterPolyline =
      this.options.polylines.get(polyline.id);

    if (!afterPrev || !afterPolyline) return;

    this.options.lineScene.sync();
    this.options.clearGeometryQueryCache?.();

    this.options.history.recordOperation(
      "PEDIT DELETE VERTEX",
      () => {
        if (!this.options.designModel.cadLines.get(removedSnapshot.id)) {
          this.options.designModel.registerCadLine({
            id: removedSnapshot.id,
            layerId: removedSnapshot.layerId,
            start: { ...removedSnapshot.start },
            end: { ...removedSnapshot.end },
          });
        }
        this.options.designModel.cadLines.updateGeometry(
          beforePrev.id,
          { ...beforePrev.start },
          { ...beforePrev.end },
        );
        this.options.polylines.updateSegments(
          beforePolyline.id,
          beforePolyline.segments,
          beforePolyline.closed,
        );
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
      () => {
        this.options.designModel.cadLines.updateGeometry(
          afterPrev.id,
          { ...afterPrev.start },
          { ...afterPrev.end },
        );
        this.options.designModel.removeCadLine(
          removedSnapshot.id,
        );
        this.options.polylines.updateSegments(
          afterPolyline.id,
          afterPolyline.segments,
          afterPolyline.closed,
        );
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
    );

    this.refreshPolylineSelection();
    this.showMenu(
      "PEDIT · vértice eliminado",
    );
  }

  private toggleClosed(): void {
    const polyline = this.currentPolyline();
    if (!polyline) return;

    const beforePolyline = clonePolyline(polyline);

    if (polyline.closed) {
      if (polyline.segments.length < 3) {
        this.showMenu(
          "PEDIT · no se puede abrir esta polilínea",
        );
        return;
      }

      const closing =
        polyline.segments[
          polyline.segments.length - 1
        ];
      const closingLine =
        this.options.designModel.cadLines.get(
          closing.lineId,
        );
      if (!closingLine) return;

      const closingSnapshot = cloneLine(closingLine);
      const newSegments =
        polyline.segments.slice(0, -1);

      this.options.designModel.removeCadLine(
        closing.lineId,
      );
      this.options.polylines.updateSegments(
        polyline.id,
        newSegments,
        false,
      );

      const afterPolyline =
        this.options.polylines.get(polyline.id);
      if (!afterPolyline) return;

      this.options.history.recordOperation(
        "PEDIT OPEN",
        () => {
          if (!this.options.designModel.cadLines.get(closingSnapshot.id)) {
            this.options.designModel.registerCadLine({
              id: closingSnapshot.id,
              layerId: closingSnapshot.layerId,
              start: { ...closingSnapshot.start },
              end: { ...closingSnapshot.end },
            });
          }
          this.options.polylines.updateSegments(
            beforePolyline.id,
            beforePolyline.segments,
            true,
          );
          this.options.lineScene.sync();
          this.options.clearGeometryQueryCache?.();
        },
        () => {
          this.options.designModel.removeCadLine(
            closingSnapshot.id,
          );
          this.options.polylines.updateSegments(
            afterPolyline.id,
            afterPolyline.segments,
            false,
          );
          this.options.lineScene.sync();
          this.options.clearGeometryQueryCache?.();
        },
      );

      this.options.lineScene.sync();
      this.refreshPolylineSelection();
      this.showMenu(
        "PEDIT · polilínea abierta",
      );
      return;
    }

    const vertices = this.getVertices(polyline);
    if (vertices.length < 3) {
      this.showMenu(
        "PEDIT · se requieren al menos 3 vértices para cerrar",
      );
      return;
    }

    const first = vertices[0];
    const last = vertices[vertices.length - 1];

    if (first.distanceToSquared(last) <= 1e-10) {
      const updated =
        this.options.polylines.updateSegments(
          polyline.id,
          polyline.segments,
          true,
        );
      if (!updated) return;

      const after = clonePolyline(updated);
      this.options.history.recordOperation(
        "PEDIT CLOSE",
        () => {
          this.options.polylines.updateSegments(
            beforePolyline.id,
            beforePolyline.segments,
            false,
          );
        },
        () => {
          this.options.polylines.updateSegments(
            after.id,
            after.segments,
            true,
          );
        },
      );
      this.showMenu(
        "PEDIT · polilínea cerrada",
      );
      return;
    }

    const created =
      this.options.designModel.registerCadLine({
        layerId: polyline.layerId,
        start: {
          x: last.x,
          y: last.y,
          z: last.z,
        },
        end: {
          x: first.x,
          y: first.y,
          z: first.z,
        },
      });

    const newSegments: CadPolylineSegmentRef[] = [
      ...polyline.segments,
      {
        lineId: created.id,
        reversed: false,
      },
    ];

    this.options.polylines.updateSegments(
      polyline.id,
      newSegments,
      true,
    );

    const createdSnapshot = cloneLine(created);
    const afterPolyline =
      this.options.polylines.get(polyline.id);
    if (!afterPolyline) return;

    this.options.history.recordOperation(
      "PEDIT CLOSE",
      () => {
        this.options.polylines.updateSegments(
          beforePolyline.id,
          beforePolyline.segments,
          false,
        );
        this.options.designModel.removeCadLine(
          createdSnapshot.id,
        );
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
      () => {
        if (!this.options.designModel.cadLines.get(createdSnapshot.id)) {
          this.options.designModel.registerCadLine({
            id: createdSnapshot.id,
            layerId: createdSnapshot.layerId,
            start: { ...createdSnapshot.start },
            end: { ...createdSnapshot.end },
          });
        }
        this.options.polylines.updateSegments(
          afterPolyline.id,
          afterPolyline.segments,
          true,
        );
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
    );

    this.options.lineScene.sync();
    this.refreshPolylineSelection();
    this.showMenu(
      "PEDIT · polilínea cerrada",
    );
  }

  private reversePolyline(): void {
    const polyline = this.currentPolyline();
    if (!polyline) return;

    const before = clonePolyline(polyline);
    const reversed =
      [...polyline.segments]
        .reverse()
        .map(
          (segment) => ({
            lineId: segment.lineId,
            reversed: !segment.reversed,
          }),
        );

    const updated =
      this.options.polylines.updateSegments(
        polyline.id,
        reversed,
        polyline.closed,
      );
    if (!updated) return;

    const after = clonePolyline(updated);
    this.options.history.recordOperation(
      "PEDIT REVERSE",
      () => {
        this.options.polylines.updateSegments(
          before.id,
          before.segments,
          before.closed,
        );
      },
      () => {
        this.options.polylines.updateSegments(
          after.id,
          after.segments,
          after.closed,
        );
      },
    );

    this.refreshPolylineSelection();
    this.showMenu(
      "PEDIT · sentido invertido",
    );
  }

  private detachSegment(
    lineId: string,
  ): void {
    const polyline = this.currentPolyline();
    if (!polyline) return;

    const index =
      polyline.segments.findIndex(
        (segment) =>
          segment.lineId === lineId,
      );

    if (index < 0) {
      this.showMenu(
        "PEDIT · el tramo no pertenece a la polilínea",
      );
      return;
    }

    if (polyline.segments.length <= 2) {
      this.showMenu(
        "PEDIT · deben quedar al menos dos tramos en la polilínea",
      );
      return;
    }

    let remaining: CadPolylineSegmentRef[];
    let closed = false;

    if (polyline.closed) {
      remaining = [
        ...polyline.segments.slice(index + 1),
        ...polyline.segments.slice(0, index),
      ].map((segment) => ({ ...segment }));
    }
    else if (index === 0) {
      remaining =
        polyline.segments
          .slice(1)
          .map((segment) => ({ ...segment }));
    }
    else if (index === polyline.segments.length - 1) {
      remaining =
        polyline.segments
          .slice(0, -1)
          .map((segment) => ({ ...segment }));
    }
    else {
      this.showMenu(
        "PEDIT · en una polilínea abierta solo puede separar un tramo extremo; use UNIR después si desea reorganizar la cadena",
      );
      return;
    }

    const before = clonePolyline(polyline);
    const updated =
      this.options.polylines.updateSegments(
        polyline.id,
        remaining,
        closed,
      );
    if (!updated) return;
    const after = clonePolyline(updated);

    this.options.history.recordOperation(
      "PEDIT DETACH SEGMENT",
      () => {
        this.options.polylines.updateSegments(
          before.id,
          before.segments,
          before.closed,
        );
      },
      () => {
        this.options.polylines.updateSegments(
          after.id,
          after.segments,
          after.closed,
        );
      },
    );

    this.refreshPolylineSelection();
    this.showMenu(
      "PEDIT · tramo separado; permanece como LINE independiente",
    );
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

    this.options.designModel.cadLines.updateGeometry(
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

  private applyLineSnapshot(
    snapshot: ReadonlyMap<string, CadLine>,
  ): void {
    for (const [lineId, line] of snapshot) {
      this.options.designModel.cadLines.updateGeometry(
        lineId,
        { ...line.start },
        { ...line.end },
      );
    }
    this.options.lineScene.sync();
    this.options.clearGeometryQueryCache?.();
  }

  private refreshPolylineSelection(): void {
    const polyline = this.currentPolyline();
    if (!polyline) return;
    this.options.lineSelection.setSelection(
      polyline.segments.map(
        (segment) => segment.lineId,
      ),
      true,
    );
    this.options.lineSelection.refresh();
    this.options.clearGeometryQueryCache?.();
  }

  private projectToScreen(
    point: THREE.Vector3,
  ): { x: number; y: number } | null {
    const rect =
      this.options.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
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

    return {
      x:
        rect.left
        + (projected.x + 1)
          * 0.5
          * rect.width,
      y:
        rect.top
        + (1 - projected.y)
          * 0.5
          * rect.height,
    };
  }

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

    return this.options.workPlane.intersectPointer(
      clientX,
      clientY,
      this.options.cameraProvider(),
      this.options.domElement,
    );
  }

  private createMenu(): HTMLDivElement {
    const menu = document.createElement("div");
    menu.dataset["framelogicPolylineEditMenu"] = "true";
    Object.assign(menu.style, {
      position: "fixed",
      zIndex: "2147482500",
      display: "none",
      flexWrap: "wrap",
      gap: "4px",
      maxWidth: "350px",
      padding: "6px",
      border: "1px solid rgba(127,210,240,0.5)",
      borderRadius: "6px",
      background: "rgba(12,20,26,0.97)",
      boxShadow: "0 4px 14px rgba(0,0,0,0.38)",
    });

    const addButton = (
      label: string,
      action: () => void,
    ): void => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      Object.assign(button.style, {
        padding: "5px 7px",
        border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: "4px",
        background: "#16212b",
        color: "#e7f5fb",
        font: "11px system-ui, sans-serif",
        cursor: "pointer",
      });
      button.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          action();
        },
      );
      menu.append(button);
    };

    addButton(
      "Mover vértice",
      () => this.beginMoveVertex(),
    );
    addButton(
      "Añadir vértice",
      () => this.beginAddVertex(),
    );
    addButton(
      "Eliminar vértice",
      () => this.beginDeleteVertex(),
    );
    addButton(
      "Abrir / Cerrar",
      () => this.toggleClosed(),
    );
    addButton(
      "Invertir",
      () => this.reversePolyline(),
    );
    addButton(
      "Separar tramo",
      () => this.beginDetachSegment(),
    );
    addButton(
      "Salir",
      () => this.cancel(),
    );

    document.body.append(menu);
    return menu;
  }

  private positionMenu(): void {
    const width = 360;
    const height = 90;
    const left = Math.min(
      this.pointerX + 16,
      window.innerWidth - width - 12,
    );
    const top = Math.min(
      this.pointerY + 18,
      window.innerHeight - height - 12,
    );
    this.menu.style.left =
      `${Math.max(12, left)}px`;
    this.menu.style.top =
      `${Math.max(12, top)}px`;
  }

  private createToolbarButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "PEDIT";
    button.title =
      "PEDIT / EDITAR POLILÍNEA · E · vértices, abrir/cerrar, invertir y separar · edición CAD / RECORT";
    button.dataset["framelogicPolylineEditButton"] = "true";
    button.addEventListener(
      "click",
      this.handleToolbarClick,
    );
    return button;
  }

  private ensureToolbarButton(): void {
    if (this.toolbarButton.isConnected) return;

    const toolbar =
      document.querySelector<HTMLElement>(
        ".bim-toolbar",
      );
    if (!toolbar) return;

    const stretch =
      Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>(
          "button",
        ),
      ).find(
        (button) =>
          button.textContent?.trim().toUpperCase()
          === "STRETCH",
      )
      ?? null;

    if (stretch?.parentElement === toolbar) {
      stretch.insertAdjacentElement(
        "afterend",
        this.toolbarButton,
      );
    }
    else {
      toolbar.append(this.toolbarButton);
    }
  }

  private createStatus(): HTMLDivElement {
    const element = document.createElement("div");
    element.dataset["framelogicPolylineEditStatus"] = "true";
    Object.assign(element.style, {
      position: "fixed",
      left: "50%",
      top: "58px",
      transform: "translateX(-50%)",
      zIndex: "2147482400",
      display: "none",
      padding: "5px 9px",
      border: "1px solid rgba(120,190,220,0.42)",
      borderRadius: "4px",
      background: "rgba(11,18,23,0.94)",
      color: "#d7eef7",
      font: "11px ui-monospace, monospace",
      pointerEvents: "none",
      whiteSpace: "nowrap",
    });
    document.body.append(element);
    return element;
  }

  private setStatus(
    text: string,
  ): void {
    this.status.textContent = text;
    this.status.style.display = "block";
  }

  private hideUi(): void {
    this.menu.style.display = "none";
    this.status.style.display = "none";
  }
}
