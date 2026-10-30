import * as THREE from "three";

import type {
  CadLine,
  DesignModel,
} from "@framelogic/domain";

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
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  CadPolyline,
  CadPolylineRegistryController,
  CadPolylineSegmentRef,
} from "../design/CadPolylineRegistryController";


interface OrderedJoinSegment {
  readonly id: string;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  readonly reversed: boolean;
}


const CONNECT_TOLERANCE = 1e-5;
const CONNECT_TOLERANCE_SQ =
  CONNECT_TOLERANCE * CONNECT_TOLERANCE;


function pointStart(
  line: CadLine,
): THREE.Vector3 {
  return new THREE.Vector3(
    line.start.x,
    line.start.y,
    line.start.z,
  );
}


function pointEnd(
  line: CadLine,
): THREE.Vector3 {
  return new THREE.Vector3(
    line.end.x,
    line.end.y,
    line.end.z,
  );
}


function pointsConnect(
  first: THREE.Vector3,
  second: THREE.Vector3,
): boolean {
  return first.distanceToSquared(second)
    <= CONNECT_TOLERANCE_SQ;
}


function clonePolyline(
  polyline: CadPolyline,
): CadPolyline {
  return {
    ...polyline,
    segments:
      polyline.segments.map(
        (segment) => ({
          lineId: segment.lineId,
          reversed: segment.reversed,
        }),
      ),
  };
}


export interface CadJoinLinesControllerOptions {
  readonly designModel: DesignModel;
  readonly polylines: CadPolylineRegistryController;
  readonly lineSelection: CadLineSelectionController;
  readonly pointSelection: CadPointSelectionController;
  readonly designSelection: DesignSelectionController;
  readonly history: CadHistoryController;
  readonly beforeStart: () => void;
  readonly clearGeometryQueryCache?: () => void;
}


/**
 * JOIN / UNIR: convierte líneas conectadas (o polilíneas + líneas) en una
 * única entidad POLYLINE sin alterar la geometría de sus CadLine internas.
 */
export class CadJoinLinesController {
  private readonly options:
    CadJoinLinesControllerOptions;
  private readonly status:
    HTMLDivElement;
  private readonly toolbarButton:
    HTMLButtonElement;
  private readonly mutationObserver:
    MutationObserver;

  private active = false;
  private disposed = false;

  constructor(
    options: CadJoinLinesControllerOptions,
  ) {
    this.options = options;
    this.status = this.createStatus();
    this.toolbarButton =
      this.createToolbarButton();

    this.mutationObserver =
      new MutationObserver(
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

    const selected =
      this.options.lineSelection
        .getSelectedIds();

    if (selected.length >= 2) {
      if (this.joinCurrentSelection()) {
        this.active = false;
        return true;
      }
    }

    this.active = true;
    this.options.designSelection.setEnabled(false);
    this.options.pointSelection.setEnabled(false);
    this.options.lineSelection.setEnabled(true);
    this.setStatus(
      selected.length > 0
        ? "UNIR · ajuste la selección con Ctrl · Enter unir · Esc cancelar"
        : "UNIR · seleccione 2 o más líneas conectadas (Ctrl) · Enter unir · Esc cancelar",
    );
    return true;
  }

  cancel(): void {
    if (!this.active) {
      this.status.style.display = "none";
      return;
    }

    this.active = false;
    this.options.designSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.lineSelection.setEnabled(true);
    this.status.style.display = "none";
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancel();
    this.mutationObserver.disconnect();
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

  private readonly handleToolbarClick =
    (): void => {
      this.start();
    };

  private readonly handleKeyDown =
    (
      event: KeyboardEvent,
    ): void => {
      if (
        this.disposed
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || this.isEditableTarget(
          event.target,
        )
      ) {
        return;
      }

      if (!this.active) {
        if (
          event.key.toLowerCase()
          !== "j"
        ) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        this.start();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cancel();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();

        if (this.joinCurrentSelection()) {
          this.active = false;
          this.options.designSelection.setEnabled(true);
          this.options.pointSelection.setEnabled(true);
          this.options.lineSelection.setEnabled(true);
        }
      }
    };

  private joinCurrentSelection(): boolean {
    const selected =
      this.options.lineSelection
        .getSelectedIds();

    if (selected.length === 0) {
      this.setStatus(
        "UNIR · seleccione al menos dos líneas conectadas",
      );
      return false;
    }

    const expandedIds =
      new Set<string>();
    const previousParents =
      new Map<string, CadPolyline>();

    for (const lineId of selected) {
      expandedIds.add(lineId);

      const parent =
        this.options.polylines
          .findByLineId(lineId);

      if (!parent) continue;

      previousParents.set(
        parent.id,
        parent,
      );

      for (const segment of parent.segments) {
        expandedIds.add(
          segment.lineId,
        );
      }
    }

    if (expandedIds.size < 2) {
      this.setStatus(
        "UNIR · se requieren dos o más líneas conectadas",
      );
      return false;
    }

    if (
      previousParents.size === 1
      && this.selectionMatchesExistingPolyline(
        expandedIds,
        Array.from(
          previousParents.values(),
        )[0],
      )
    ) {
      this.setStatus(
        "UNIR · la selección ya pertenece a una polilínea",
        1100,
      );
      return true;
    }

    const raw:
      OrderedJoinSegment[] = [];

    for (const lineId of expandedIds) {
      const line =
        this.options.designModel
          .cadLines.get(lineId);

      if (!line) {
        this.setStatus(
          "UNIR · una de las líneas seleccionadas ya no existe",
        );
        return false;
      }

      raw.push({
        id: line.id,
        start: pointStart(line),
        end: pointEnd(line),
        reversed: false,
      });
    }

    const firstLine =
      this.options.designModel
        .cadLines.get(raw[0].id);

    if (!firstLine) return false;

    const sameLayer =
      raw.every(
        (segment) =>
          this.options.designModel
            .cadLines.get(segment.id)
            ?.layerId
          === firstLine.layerId,
      );

    if (!sameLayer) {
      this.setStatus(
        "UNIR · todas las líneas deben pertenecer al mismo layer",
      );
      return false;
    }

    const ordered =
      this.orderConnectedChain(raw);

    if (!ordered) {
      this.setStatus(
        "UNIR · las líneas deben formar una cadena conectada sin bifurcaciones",
      );
      return false;
    }

    const closed =
      ordered.length > 2
      && pointsConnect(
        ordered[ordered.length - 1].end,
        ordered[0].start,
      );

    const segmentRefs:
      CadPolylineSegmentRef[] =
        ordered.map(
          (segment) => ({
            lineId: segment.id,
            reversed: segment.reversed,
          }),
        );

    const oldSnapshots =
      Array.from(
        previousParents.values(),
        clonePolyline,
      );

    for (const parent of oldSnapshots) {
      this.options.polylines.remove(
        parent.id,
      );
    }

    let created: CadPolyline;

    try {
      created =
        this.options.polylines.register({
          layerId: firstLine.layerId,
          segments: segmentRefs,
          closed,
        });
    }
    catch (error) {
      for (const parent of oldSnapshots) {
        this.options.polylines.register({
          id: parent.id,
          layerId: parent.layerId,
          segments: parent.segments,
          closed: parent.closed,
        });
      }

      this.setStatus(
        error instanceof Error
          ? `UNIR · ${error.message}`
          : "UNIR · no se pudo crear la polilínea",
      );
      return false;
    }

    const createdSnapshot =
      clonePolyline(created);

    this.options.history.recordOperation(
      "JOIN POLYLINE",
      () => {
        this.options.polylines.remove(
          createdSnapshot.id,
        );

        for (const parent of oldSnapshots) {
          this.options.polylines.register({
            id: parent.id,
            layerId: parent.layerId,
            segments: parent.segments,
            closed: parent.closed,
          });
        }

        this.options.clearGeometryQueryCache?.();
      },
      () => {
        for (const parent of oldSnapshots) {
          this.options.polylines.remove(
            parent.id,
          );
        }

        if (
          !this.options.polylines.get(
            createdSnapshot.id,
          )
        ) {
          this.options.polylines.register({
            id: createdSnapshot.id,
            layerId: createdSnapshot.layerId,
            segments: createdSnapshot.segments,
            closed: createdSnapshot.closed,
          });
        }

        this.options.clearGeometryQueryCache?.();
      },
    );

    this.options.lineSelection.setSelection(
      ordered.map(
        (segment) => segment.id,
      ),
    );
    this.options.clearGeometryQueryCache?.();

    this.setStatus(
      `UNIR · polilínea ${closed ? "cerrada" : "abierta"} de ${ordered.length} tramos creada`,
      1400,
    );

    return true;
  }

  private selectionMatchesExistingPolyline(
    ids: ReadonlySet<string>,
    polyline: CadPolyline,
  ): boolean {
    if (ids.size !== polyline.segments.length) {
      return false;
    }

    return polyline.segments.every(
      (segment) =>
        ids.has(segment.lineId),
    );
  }

  private orderConnectedChain(
    segments: readonly OrderedJoinSegment[],
  ): OrderedJoinSegment[] | null {
    if (segments.length < 2) return null;

    const remaining =
      segments.map(
        (segment) => ({
          id: segment.id,
          start: segment.start.clone(),
          end: segment.end.clone(),
          reversed: false,
        }),
      );

    const ordered:
      OrderedJoinSegment[] = [
        remaining.shift()!,
      ];

    while (remaining.length > 0) {
      const chainStart =
        ordered[0].start;
      const chainEnd =
        ordered[ordered.length - 1].end;
      let attached = false;

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
            reversed: true,
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
            reversed: true,
          });
          remaining.splice(index, 1);
          attached = true;
          break;
        }
      }

      if (!attached) return null;
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

    /*
     * Rechaza bifurcaciones T/Y: en una cadena válida cada vértice puede ser
     * compartido como máximo por dos extremos de segmentos.
     */
    const endpoints =
      ordered.flatMap(
        (segment) => [
          segment.start,
          segment.end,
        ],
      );

    for (const endpoint of endpoints) {
      const coincident =
        endpoints.filter(
          (candidate) =>
            pointsConnect(
              endpoint,
              candidate,
            ),
        ).length;

      if (coincident > 2) {
        return null;
      }
    }

    return ordered;
  }

  private createToolbarButton(): HTMLButtonElement {
    const button =
      document.createElement("button");
    button.type = "button";
    button.textContent = "UNIR";
    /* RECORT fuerza al organizador existente a clasificarlo en Editar. */
    button.title =
      "UNIR / JOIN · J · convierte líneas conectadas en POLYLINE · compatible con RECORT / EXTEND";
    button.dataset["framelogicJoinButton"] =
      "true";
    button.addEventListener(
      "click",
      this.handleToolbarClick,
    );
    return button;
  }

  private ensureToolbarButton(): void {
    const toolbar =
      document.querySelector<HTMLElement>(
        ".bim-toolbar",
      );

    if (!toolbar) return;

    const existing =
      toolbar.querySelector<HTMLButtonElement>(
        '[data-framelogic-join-button="true"]',
      );

    if (
      existing
      && existing !== this.toolbarButton
    ) {
      existing.remove();
    }

    if (
      this.toolbarButton.parentElement
      === toolbar
    ) {
      return;
    }

    const parallel =
      Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>(
          "button",
        ),
      ).find(
        (button) =>
          button.textContent
            ?.trim()
            .toUpperCase()
          === "PARALELA",
      );

    if (parallel) {
      parallel.insertAdjacentElement(
        "afterend",
        this.toolbarButton,
      );
    }
    else {
      toolbar.append(
        this.toolbarButton,
      );
    }
  }

  private createStatus(): HTMLDivElement {
    const element =
      document.createElement("div");
    element.dataset["framelogicJoinStatus"] =
      "true";
    Object.assign(
      element.style,
      {
        position: "fixed",
        left: "50%",
        top: "78px",
        transform: "translateX(-50%)",
        zIndex: "2147482400",
        display: "none",
        padding: "5px 9px",
        border: "1px solid rgba(127,210,240,0.42)",
        borderRadius: "4px",
        background: "rgba(11,18,23,0.94)",
        color: "#d7eef7",
        font: "11px ui-monospace, monospace",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      },
    );
    document.body.append(element);
    return element;
  }

  private setStatus(
    text: string,
    autoHideMs?: number,
  ): void {
    this.status.textContent = text;
    this.status.style.display = "block";

    if (autoHideMs !== undefined) {
      window.setTimeout(
        () => {
          if (!this.active) {
            this.status.style.display = "none";
          }
        },
        autoHideMs,
      );
    }
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
