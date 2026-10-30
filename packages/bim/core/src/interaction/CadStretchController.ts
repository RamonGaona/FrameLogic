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


type StretchStage =
  | "WINDOW_FIRST"
  | "WINDOW_SECOND"
  | "BASE"
  | "DESTINATION";


interface StretchMask {
  readonly start: boolean;
  readonly end: boolean;
}


export interface CadStretchControllerOptions {
  readonly domElement: HTMLElement;
  readonly cameraProvider: () => THREE.Camera;
  readonly designModel: DesignModel;
  readonly lineScene: CadLineSceneController;
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
 * STRETCH CAD por ventana de cruce.
 *
 * Los extremos que caen dentro de la ventana se desplazan. Una línea con sus
 * dos extremos dentro se mueve completa; una línea con un solo extremo dentro
 * cambia únicamente ese extremo. En una POLYLINE los vértices compartidos se
 * actualizan porque los extremos coincidentes de los tramos adyacentes entran
 * simultáneamente en la máscara de cruce.
 */
export class CadStretchController {
  private readonly options: CadStretchControllerOptions;
  private readonly status: HTMLDivElement;
  private readonly windowOverlay: HTMLDivElement;
  private readonly toolbarButton: HTMLButtonElement;
  private readonly observer: MutationObserver;

  private active = false;
  private disposed = false;
  private stage: StretchStage = "WINDOW_FIRST";
  private firstWindowPoint: { x: number; y: number } | null = null;
  private masks = new Map<string, StretchMask>();
  private basePoint: THREE.Vector3 | null = null;

  constructor(
    options: CadStretchControllerOptions,
  ) {
    this.options = options;
    this.status = this.createStatus();
    this.windowOverlay = this.createWindowOverlay();
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
    this.stage = "WINDOW_FIRST";
    this.firstWindowPoint = null;
    this.masks.clear();
    this.basePoint = null;
    this.windowOverlay.style.display = "none";

    this.options.designSelection.setEnabled(false);
    this.options.pointSelection.setEnabled(false);
    this.options.lineSelection.setEnabled(false);

    this.setStatus(
      "STRETCH · indique primera esquina de ventana de cruce · Esc cancelar",
    );
    return true;
  }

  cancel(): void {
    if (!this.active) {
      this.hideUi();
      return;
    }

    this.active = false;
    this.stage = "WINDOW_FIRST";
    this.firstWindowPoint = null;
    this.masks.clear();
    this.basePoint = null;
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
    this.windowOverlay.remove();
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
      if (event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.start();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.cancel();
    }
  };

  private readonly handlePointerMove = (
    event: PointerEvent,
  ): void => {
    if (
      !this.active
      || this.stage !== "WINDOW_SECOND"
      || !this.firstWindowPoint
    ) {
      return;
    }

    this.updateWindowOverlay(
      this.firstWindowPoint.x,
      this.firstWindowPoint.y,
      event.clientX,
      event.clientY,
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

    if (this.stage === "WINDOW_FIRST") {
      this.firstWindowPoint = {
        x: event.clientX,
        y: event.clientY,
      };
      this.stage = "WINDOW_SECOND";
      this.windowOverlay.style.display = "block";
      this.updateWindowOverlay(
        event.clientX,
        event.clientY,
        event.clientX,
        event.clientY,
      );
      this.setStatus(
        "STRETCH · indique esquina opuesta de la ventana",
      );
      return;
    }

    if (
      this.stage === "WINDOW_SECOND"
      && this.firstWindowPoint
    ) {
      this.captureMasks(
        this.firstWindowPoint.x,
        this.firstWindowPoint.y,
        event.clientX,
        event.clientY,
      );
      this.windowOverlay.style.display = "none";

      if (this.masks.size === 0) {
        this.firstWindowPoint = null;
        this.stage = "WINDOW_FIRST";
        this.setStatus(
          "STRETCH · la ventana no contiene vértices CAD · seleccione nuevamente",
        );
        return;
      }

      this.stage = "BASE";
      this.options.lineSelection.setSelection(
        Array.from(this.masks.keys()),
        true,
      );
      this.setStatus(
        `STRETCH · ${this.masks.size} tramo(s) afectados · indique punto base`,
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
        "STRETCH · no hay punto válido: active WorkPlane o use un SNAP",
      );
      return;
    }

    if (this.stage === "BASE") {
      this.basePoint = point.clone();
      this.stage = "DESTINATION";
      this.setStatus(
        "STRETCH · indique segundo punto del desplazamiento",
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
          "STRETCH · el segundo punto debe ser distinto del punto base",
        );
        return;
      }
      this.commitStretch(delta);
    }
  };

  private captureMasks(
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): void {
    const left = Math.min(ax, bx);
    const right = Math.max(ax, bx);
    const top = Math.min(ay, by);
    const bottom = Math.max(ay, by);

    this.masks.clear();

    for (
      const line
      of this.options.designModel.cadLines.getAll()
    ) {
      const layer =
        this.options.designModel.layers.get(
          line.layerId,
        );
      if (
        layer
        && (
          !layer.visible
          || layer.locked
        )
      ) {
        continue;
      }

      const start =
        this.projectToScreen(
          new THREE.Vector3(
            line.start.x,
            line.start.y,
            line.start.z,
          ),
        );
      const end =
        this.projectToScreen(
          new THREE.Vector3(
            line.end.x,
            line.end.y,
            line.end.z,
          ),
        );

      const startInside =
        start !== null
        && start.x >= left
        && start.x <= right
        && start.y >= top
        && start.y <= bottom;
      const endInside =
        end !== null
        && end.x >= left
        && end.x <= right
        && end.y >= top
        && end.y <= bottom;

      if (startInside || endInside) {
        this.masks.set(
          line.id,
          {
            start: startInside,
            end: endInside,
          },
        );
      }
    }
  }

  private commitStretch(
    delta: THREE.Vector3,
  ): void {
    const before = new Map<string, CadLine>();
    const after = new Map<string, CadLine>();

    for (const [lineId, mask] of this.masks) {
      const line =
        this.options.designModel.cadLines.get(lineId);
      if (!line) continue;

      before.set(lineId, cloneLine(line));

      const start = {
        x: line.start.x + (mask.start ? delta.x : 0),
        y: line.start.y + (mask.start ? delta.y : 0),
        z: line.start.z + (mask.start ? delta.z : 0),
      };
      const end = {
        x: line.end.x + (mask.end ? delta.x : 0),
        y: line.end.y + (mask.end ? delta.y : 0),
        z: line.end.z + (mask.end ? delta.z : 0),
      };

      const updated =
        this.options.designModel.cadLines.updateGeometry(
          line.id,
          start,
          end,
        );

      if (updated) {
        after.set(line.id, cloneLine(updated));
      }
    }

    if (after.size === 0) {
      this.setStatus(
        "STRETCH · no fue posible modificar la geometría",
      );
      return;
    }

    this.options.lineScene.sync();
    this.options.clearGeometryQueryCache?.();

    const applySnapshot =
      (
        snapshot: ReadonlyMap<string, CadLine>,
      ): void => {
        for (const [lineId, line] of snapshot) {
          this.options.designModel.cadLines.updateGeometry(
            lineId,
            { ...line.start },
            { ...line.end },
          );
        }
        this.options.lineScene.sync();
        this.options.clearGeometryQueryCache?.();
      };

    this.options.history.recordOperation(
      "STRETCH",
      () => applySnapshot(before),
      () => applySnapshot(after),
    );

    this.active = false;
    this.stage = "WINDOW_FIRST";
    this.firstWindowPoint = null;
    this.masks.clear();
    this.basePoint = null;
    this.options.designSelection.setEnabled(true);
    this.options.pointSelection.setEnabled(true);
    this.options.lineSelection.setEnabled(true);
    this.setStatus(
      `STRETCH · ${after.size} tramo(s) modificados`,
      1200,
    );
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

  private updateWindowOverlay(
    ax: number,
    ay: number,
    bx: number,
    by: number,
  ): void {
    const left = Math.min(ax, bx);
    const top = Math.min(ay, by);
    const width = Math.abs(bx - ax);
    const height = Math.abs(by - ay);

    Object.assign(
      this.windowOverlay.style,
      {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      },
    );
  }

  private createWindowOverlay(): HTMLDivElement {
    const element = document.createElement("div");
    element.dataset["framelogicStretchWindow"] = "true";
    Object.assign(element.style, {
      position: "fixed",
      zIndex: "2147482200",
      display: "none",
      border: "1px dashed rgba(90,200,255,0.95)",
      background: "rgba(40,150,220,0.14)",
      pointerEvents: "none",
      boxSizing: "border-box",
    });
    document.body.append(element);
    return element;
  }

  private createToolbarButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "STRETCH";
    button.title =
      "STRETCH · S · ventana de cruce + punto base + destino · edición CAD / RECORT";
    button.dataset["framelogicStretchButton"] = "true";
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

    const copy =
      Array.from(
        toolbar.querySelectorAll<HTMLButtonElement>(
          "button",
        ),
      ).find(
        (button) =>
          button.textContent?.trim().toUpperCase()
          === "COPIAR",
      )
      ?? null;

    if (copy?.parentElement === toolbar) {
      copy.insertAdjacentElement(
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
    element.dataset["framelogicStretchStatus"] = "true";
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

  private hideUi(): void {
    this.windowOverlay.style.display = "none";
    this.status.style.display = "none";
  }
}
