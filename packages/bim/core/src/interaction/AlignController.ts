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

import type {
  CadReferenceBlockController,
} from "../import/CadReferenceBlockController";

export interface AlignControllerOptions {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly designSelection: DesignSelectionController;
  readonly cadReferenceBlocks: CadReferenceBlockController;
  readonly cancelActiveCommand: () => void;
  readonly clearGeometryQueryCache: () => void;
}

type AlignAxis = "X" | "Y" | "Z";
type AlignMode = "MIN" | "CENTER" | "MAX";

type AlignTarget =
  | {
      readonly id: string;
      readonly kind: "PIECE";
      readonly label: string;
      readonly pieceIds: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "ASSEMBLY";
      readonly label: string;
      readonly pieceIds: readonly string[];
    }
  | {
      readonly id: string;
      readonly kind: "CAD";
      readonly label: string;
      readonly referenceName: string;
    };

/**
 * ALINEAR por caja envolvente.
 *
 * La referencia permanece fija y los demás objetivos seleccionados se mueven
 * sobre X/Y/Z para hacer coincidir MIN, CENTRO o MAX. Si un ensamble completo
 * está seleccionado, sus piezas se trasladan juntas como una sola entidad.
 */
export class AlignController {
  private readonly options: AlignControllerOptions;
  private readonly button: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly referenceSelect: HTMLSelectElement;
  private readonly status: HTMLSpanElement;
  private targets: AlignTarget[] = [];
  private disposed = false;

  constructor(
    options: AlignControllerOptions,
  ) {
    this.options = options;
    this.button = this.createButton(options.container);
    const ui = this.createPanel(options.container);
    this.panel = ui.panel;
    this.referenceSelect = ui.referenceSelect;
    this.status = ui.status;

    this.button.addEventListener("click", this.handleOpen);
    window.addEventListener("keydown", this.handleKeyDown, true);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.button.removeEventListener("click", this.handleOpen);
    window.removeEventListener("keydown", this.handleKeyDown, true);
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

    if (event.key === "Escape" && this.panel.style.display !== "none") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }

    if (
      event.key.toLowerCase() === "a"
      && this.panel.style.display === "none"
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.open();
    }
  };

  private open(): void {
    this.options.cancelActiveCommand();
    this.targets = this.collectTargets();
    if (this.targets.length < 2) {
      window.alert(
        "ALINEAR requiere al menos dos objetivos seleccionados. Puedes combinar piezas, ensambles completos y bloques DWG/DXF con Ctrl.",
      );
      return;
    }

    this.referenceSelect.replaceChildren();
    for (const target of this.targets) {
      const option = document.createElement("option");
      option.value = target.id;
      option.textContent = target.label;
      this.referenceSelect.append(option);
    }
    this.status.textContent = `${this.targets.length} objetivos · la referencia permanece fija`;
    this.panel.style.display = "grid";
  }

  private close(): void {
    this.panel.style.display = "none";
    this.targets = [];
  }

  private align(
    axis: AlignAxis,
    mode: AlignMode,
  ): void {
    const referenceId = this.referenceSelect.value;
    const reference = this.targets.find((target) => target.id === referenceId);
    if (!reference) return;
    const referenceBounds = this.getBounds(reference);
    if (!referenceBounds) return;

    const referenceCoordinate = coordinateAt(
      referenceBounds,
      axis,
      mode,
    );

    let moved = 0;
    for (const target of this.targets) {
      if (target.id === reference.id) continue;
      const bounds = this.getBounds(target);
      if (!bounds) continue;
      const coordinate = coordinateAt(bounds, axis, mode);
      const amount = referenceCoordinate - coordinate;
      if (Math.abs(amount) <= 1e-10) continue;
      const delta = new THREE.Vector3();
      if (axis === "X") delta.x = amount;
      else if (axis === "Y") delta.y = amount;
      else delta.z = amount;
      this.translateTarget(target, delta);
      moved += 1;
    }

    this.options.clearGeometryQueryCache();
    this.status.textContent =
      `${moved} objetivo${moved === 1 ? "" : "s"} alineado${moved === 1 ? "" : "s"} · ${axis} ${mode}`;
  }

  private collectTargets(): AlignTarget[] {
    const selectedPieces = new Set(
      this.options.designSelection.getSelectedIds(),
    );
    const consumed = new Set<string>();
    const targets: AlignTarget[] = [];

    for (const assembly of this.options.designModel.assemblies.getAll()) {
      const members = assembly.pieceInstanceIds.filter((id) =>
        this.options.designModel.pieceInstances.get(id) !== undefined,
      );
      if (
        members.length > 0
        && members.every((id) => selectedPieces.has(id))
      ) {
        targets.push({
          id: `ASSEMBLY:${assembly.id}`,
          kind: "ASSEMBLY",
          label: `Ensamble · ${assembly.name}`,
          pieceIds: members,
        });
        for (const id of members) consumed.add(id);
      }
    }

    for (const instanceId of selectedPieces) {
      if (consumed.has(instanceId)) continue;
      const instance = this.options.designModel.pieceInstances.get(instanceId);
      if (!instance) continue;
      const definition = this.options.designModel.pieceDefinitions.get(
        instance.definitionId,
      );
      targets.push({
        id: `PIECE:${instanceId}`,
        kind: "PIECE",
        label: definition
          ? `${definition.code} · ${definition.name}`
          : `Pieza ${instanceId.slice(0, 8)}`,
        pieceIds: [instanceId],
      });
    }

    for (
      const referenceName
      of this.options.cadReferenceBlocks.getSelectedReferenceNames()
    ) {
      targets.push({
        id: `CAD:${referenceName}`,
        kind: "CAD",
        label: `CAD · ${referenceName}`,
        referenceName,
      });
    }

    return targets;
  }

  private getBounds(target: AlignTarget): THREE.Box3 | null {
    if (target.kind === "CAD") {
      return this.options.cadReferenceBlocks.getReferenceBounds(
        target.referenceName,
        true,
      );
    }

    const box = new THREE.Box3();
    let hasBounds = false;
    for (const pieceId of target.pieceIds) {
      const object = this.options.designScene.getInstanceObject(pieceId);
      if (!object || !object.visible) continue;
      object.updateWorldMatrix(true, true);
      const current = new THREE.Box3().setFromObject(object, true);
      if (current.isEmpty()) continue;
      if (!hasBounds) {
        box.copy(current);
        hasBounds = true;
      }
      else {
        box.union(current);
      }
    }
    return hasBounds ? box : null;
  }

  private translateTarget(
    target: AlignTarget,
    delta: THREE.Vector3,
  ): void {
    if (target.kind === "CAD") {
      this.options.cadReferenceBlocks.translateReference(
        target.referenceName,
        delta,
      );
      return;
    }

    for (const pieceId of target.pieceIds) {
      const instance = this.options.designModel.pieceInstances.get(pieceId);
      const object = this.options.designScene.getInstanceObject(pieceId);
      if (!instance || !object) continue;

      object.position.add(delta);
      object.updateMatrix();
      object.updateMatrixWorld(true);
      this.options.designModel.pieceInstances.updateTransform(
        pieceId,
        {
          position: {
            x: instance.transform.position.x + delta.x,
            y: instance.transform.position.y + delta.y,
            z: instance.transform.position.z + delta.z,
          },
          rotation: {
            ...instance.transform.rotation,
          },
        },
      );
    }
  }

  private createButton(container: HTMLElement): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "ALINEAR";
    button.title = "Alinear selección (A)";
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
    referenceSelect: HTMLSelectElement;
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
      gridTemplateColumns: "auto minmax(180px, 320px) auto auto auto",
      alignItems: "center",
      gap: "6px",
      padding: "7px 9px",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: "6px",
      background: "rgba(18,25,30,0.96)",
      color: "#eaf2f6",
      boxShadow: "0 8px 22px rgba(0,0,0,0.30)",
      font: "12px system-ui, sans-serif",
    });

    const label = document.createElement("strong");
    label.textContent = "ALINEAR";
    const referenceSelect = document.createElement("select");
    referenceSelect.title = "Objeto de referencia que permanece fijo";
    Object.assign(referenceSelect.style, {
      minWidth: "180px",
      padding: "4px",
      background: "#202c33",
      color: "#edf5f8",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "4px",
    });

    const axisGroup = document.createElement("div");
    axisGroup.style.display = "flex";
    axisGroup.style.gap = "3px";
    for (const axis of ["X", "Y", "Z"] as const) {
      const axisLabel = document.createElement("span");
      axisLabel.textContent = axis;
      axisLabel.style.color = "#91a6b0";
      axisLabel.style.padding = "4px 2px";
      axisGroup.append(axisLabel);
      for (const mode of ["MIN", "CENTER", "MAX"] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = mode === "CENTER"
          ? "C"
          : mode === "MIN"
            ? "−"
            : "+";
        button.title = `${axis} · ${mode}`;
        Object.assign(button.style, smallButtonStyle());
        button.addEventListener("click", () => this.align(axis, mode));
        axisGroup.append(button);
      }
    }

    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "×";
    close.title = "Cerrar";
    Object.assign(close.style, smallButtonStyle());
    close.addEventListener("click", () => this.close());

    const status = document.createElement("span");
    status.style.color = "#91a6b0";
    status.style.fontSize = "11px";
    status.style.gridColumn = "1 / -1";

    panel.append(
      label,
      referenceSelect,
      axisGroup,
      close,
      status,
    );
    container.append(panel);
    return { panel, referenceSelect, status };
  }
}

function coordinateAt(
  box: THREE.Box3,
  axis: AlignAxis,
  mode: AlignMode,
): number {
  const min = axis === "X"
    ? box.min.x
    : axis === "Y"
      ? box.min.y
      : box.min.z;
  const max = axis === "X"
    ? box.max.x
    : axis === "Y"
      ? box.max.y
      : box.max.z;
  if (mode === "MIN") return min;
  if (mode === "MAX") return max;
  return (min + max) * 0.5;
}

function smallButtonStyle(): Partial<CSSStyleDeclaration> {
  return {
    width: "25px",
    height: "24px",
    padding: "0",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "4px",
    background: "rgba(255,255,255,0.06)",
    color: "#edf5f8",
    cursor: "pointer",
    font: "11px system-ui, sans-serif",
  };
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
