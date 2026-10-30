import * as THREE from "three";

import type {
  CadLine,
  DesignModel,
} from "@framelogic/domain";

import type {
  CadPolyline,
  CadPolylineRegistryController,
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


type CopyStage =
  | "SELECT"
  | "BASE"
  | "DESTINATION";


export interface CadCopyControllerOptions {
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
 * COPY CAD básico: selección -> punto base -> destino.
 *
 * Si se selecciona cualquier tramo perteneciente a una POLYLINE, se expande
 * la selección a la entidad completa y la copia conserva su metadata padre.
 */
export class CadCopyController {
  private readonly options: CadCopyControllerOptions;
  private readonly status: HTMLDivElement;
  private readonly toolbarButton: HTMLButtonElement;
  private readonly observer: MutationObserver;

  private active = false;
  private disposed = false;
  private stage: CopyStage = "SELECT";
  private sourceLineIds: string[] = [];
  private basePoint: THREE.Vector3 | null = null;

  constructor(
    options: CadCopyControllerOptions,
  ) {
    this.options = options;
    this.status = this.createStatus();
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
    this.basePoint = null;

    const selected =
      this.expandSelection(
        this.options.lineSelection.getSelectedIds(),
      );

    this.options.designSelection.setEnabled(false);
    this.options.pointSelection.setEnabled(false);

    if (selected.length > 0) {
      this.sourceLineIds = selected;
      this.options.lineSelection.setSelection(
        selected,
        true,
      );
      this.options.lineSelection.setEnabled(false);
      this.stage = "BASE";
      this.setStatus(
        `COPIAR · ${selected.length} tramo(s) · indique punto base · Esc cancelar`,
      );
      return true;
    }

    this.sourceLineIds = [];
    this.stage = "SELECT";
    this.options.lineSelection.setEnabled(true);
    this.setStatus(
      "COPIAR · seleccione líneas/polilíneas con Ctrl · Enter confirmar · Esc cancelar",
    );
    return true;
  }

  cancel(): void {
    if (!this.active) {
      this.status.style.display = "none";
      return;
    }

    this.active = false;
    this.stage = "SELECT";
    this.sourceLineIds = [];
    this.basePoint = null;
    this.status.style.display = "none";
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
    this.start();
  };

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (
      this.disposed
      || isEditableTarget(event.target)
    ) {
      return;
    }

    if (
      !this.active
      && event.ctrlKey
      && !event.metaKey
      && !event.altKey
      && event.key.toLowerCase() === "d"
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.start();
      return;
    }

    if (!this.active) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
      return;
    }

    if (
      this.stage === "SELECT"
      && event.key === "Enter"
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.confirmSelection();
    }
  };

  private readonly handlePointerUp = (
    event: PointerEvent,
  ): void => {
    if (
      !this.active
      || event.button !== 0
      || this.stage === "SELECT"
      || event.target !== this.options.domElement
    ) {
      return;
    }

    const point =
      this.pickPoint(
        event.clientX,
        event.clientY,
      );

    if (!point) {
      this.setStatus(
        "COPIAR · no hay punto válido: active WorkPlane o use un SNAP",
      );
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (this.stage === "BASE") {
      this.basePoint = point.clone();
      this.stage = "DESTINATION";
      this.setStatus(
        "COPIAR · indique punto destino · Esc cancelar",
      );
      return;
    }

    if (
      this.stage === "DESTINATION"
      && this.basePoint
    ) {
      const delta =
        point.clone().sub(this.basePoint);

      if (delta.lengthSq() <= 1e-18) {
        this.setStatus(
          "COPIAR · el destino debe ser distinto del punto base",
        );
        return;
      }

      this.commitCopy(delta);
    }
  };

  private confirmSelection(): void {
    const expanded =
      this.expandSelection(
        this.options.lineSelection.getSelectedIds(),
      );

    if (expanded.length === 0) {
      this.setStatus(
        "COPIAR · seleccione al menos una línea o polilínea",
      );
      return;
    }

    this.sourceLineIds = expanded;
    this.options.lineSelection.setSelection(
      expanded,
      true,
    );
    this.options.lineSelection.setEnabled(false);
    this.stage = "BASE";
    this.setStatus(
      `COPIAR · ${expanded.length} tramo(s) · indique punto base`,
    );
  }

  private expandSelection(
    selected: readonly string[],
  ): string[] {
    const expanded = new Set<string>();

    for (const lineId of selected) {
      const line =
        this.options.designModel.cadLines.get(lineId);
      if (!line) continue;

      const parent =
        this.options.polylines.findByLineId(lineId);

      if (parent) {
        for (const segment of parent.segments) {
          expanded.add(segment.lineId);
        }
      }
      else {
        expanded.add(lineId);
      }
    }

    return Array.from(expanded);
  }

  private commitCopy(
    delta: THREE.Vector3,
  ): void {
    const sources: CadLine[] = [];

    for (const lineId of this.sourceLineIds) {
      const line =
        this.options.designModel.cadLines.get(lineId);
      if (line) sources.push(cloneLine(line));
    }

    if (sources.length === 0) {
      this.setStatus(
        "COPIAR · la geometría seleccionada ya no existe",
      );
      return;
    }

    const sourceSet =
      new Set(sources.map((line) => line.id));
    const parentSnapshots =
      this.options.polylines
        .getAll()
        .filter(
          (polyline) =>
            polyline.segments.every(
              (segment) =>
                sourceSet.has(segment.lineId),
            )
            && polyline.segments.some(
              (segment) =>
                sourceSet.has(segment.lineId),
            ),
        )
        .map(clonePolyline);

    const mapping =
      new Map<string, string>();
    const createdLines: CadLine[] = [];
    const createdPolylines: CadPolyline[] = [];

    try {
      for (const source of sources) {
        const created =
          this.options.designModel.registerCadLine({
            layerId: source.layerId,
            start: {
              x: source.start.x + delta.x,
              y: source.start.y + delta.y,
              z: source.start.z + delta.z,
            },
            end: {
              x: source.end.x + delta.x,
              y: source.end.y + delta.y,
              z: source.end.z + delta.z,
            },
          });
        mapping.set(source.id, created.id);
        createdLines.push(cloneLine(created));
      }

      for (const sourceParent of parentSnapshots) {
        const mappedSegments =
          sourceParent.segments.map(
            (segment) => ({
              lineId:
                mapping.get(segment.lineId)!,
              reversed: segment.reversed,
            }),
          );

        const created =
          this.options.polylines.register({
            layerId: sourceParent.layerId,
            segments: mappedSegments,
            closed: sourceParent.closed,
          });
        createdPolylines.push(
          clonePolyline(created),
        );
      }
    }
    catch (error) {
      for (const polyline of createdPolylines) {
        this.options.polylines.remove(polyline.id);
      }
      for (const line of createdLines) {
        this.options.designModel.removeCadLine(line.id);
      }
      this.options.lineScene.sync();
      this.setStatus(
        error instanceof Error
          ? `COPIAR · ${error.message}`
          : "COPIAR · no se pudo crear la copia",
      );
      return;
    }

    this.options.lineScene.sync();

    const lineSnapshots =
      createdLines.map(cloneLine);
    const polylineSnapshots =
      createdPolylines.map(clonePolyline);

    this.options.history.recordOperation(
      "COPY",
      () => {
        for (const polyline of polylineSnapshots) {
          this.options.polylines.remove(polyline.id);
        }
        for (const line of lineSnapshots) {
          this.options.designModel.removeCadLine(line.id);
        }
        this.options.lineScene.sync();
        this.options.lineSelection.refresh();
        this.options.clearGeometryQueryCache?.();
      },
      () => {
        for (const line of lineSnapshots) {
          if (!this.options.designModel.cadLines.get(line.id)) {
            this.options.designModel.registerCadLine({
              id: line.id,
              layerId: line.layerId,
              start: { ...line.start },
              end: { ...line.end },
            });
          }
        }
        for (const polyline of polylineSnapshots) {
          if (!this.options.polylines.get(polyline.id)) {
            this.options.polylines.register({
              id: polyline.id,
              layerId: polyline.layerId,
              segments: polyline.segments,
              closed: polyline.closed,
            });
          }
        }
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      },
    );

    this.options.lineSelection.setSelection(
      lineSnapshots.map((line) => line.id),
      true,
    );
    this.options.clearGeometryQueryCache?.();

    this.active = false;
    this.stage = "SELECT";
    this.sourceLineIds = [];
    this.basePoint = null;
    this.options.designSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.lineSelection.setEnabled(true);
    this.setStatus(
      `COPIAR · ${lineSnapshots.length} tramo(s) copiados`,
      1200,
    );
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

  private createToolbarButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "COPIAR";
    button.title =
      "COPIAR / COPY · Ctrl+D · selección + punto base + destino · edición CAD / RECORT";
    button.dataset["framelogicCopyButton"] = "true";
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

    const anchor =
      Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>(
          "button",
        ),
      ).find(
        (button) =>
          button.textContent?.trim().toUpperCase()
          === "UNIR",
      )
      ?? null;

    if (anchor?.parentElement === toolbar) {
      anchor.insertAdjacentElement(
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
    element.dataset["framelogicCopyStatus"] = "true";
    Object.assign(element.style, {
      position: "fixed",
      left: "50%",
      top: "58px",
      transform: "translateX(-50%)",
      zIndex: "2147482300",
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
}
