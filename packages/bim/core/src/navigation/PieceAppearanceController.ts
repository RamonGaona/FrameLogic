import * as THREE from "three";

import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import {
  getPieceColorFromTags,
  setPieceColorInTags,
} from "../design/PieceAppearanceMetadata";

import type {
  DesignSelectionController,
} from "../interaction/DesignSelectionController";

import { findInstanceTreeBody } from "./findInstanceTreeBody";

import {
  getLinkedAssemblyComponentId,
  getLinkedAssemblyId,
} from "./LinkedAssemblyMetadata";


interface Options {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly designSelection: DesignSelectionController;
}


interface MaterialState {
  readonly baseMaterials: THREE.Material[];
  readonly baseColors: readonly (number | null)[];
  readonly arrayMaterial: boolean;
}


interface PaletteEntry {
  readonly name: string;
  readonly color: string;
}


const PASTEL_PALETTE: readonly PaletteEntry[] = [
  { name: "Azul niebla", color: "#9db7c7" },
  { name: "Verde salvia", color: "#a8bfa3" },
  { name: "Lavanda", color: "#c4b5d6" },
  { name: "Arena", color: "#d7c7a3" },
  { name: "Rosa", color: "#d6a6ad" },
  { name: "Menta", color: "#a8c9bf" },
  { name: "Durazno", color: "#d9b38c" },
  { name: "Celeste", color: "#a7bfd9" },
  { name: "Gris perla", color: "#bfc7c9" },
  { name: "Amarillo suave", color: "#d8d0a4" },
] as const;


/**
 * Apariencia persistente de piezas y visibilidad de trabajo del Model Space.
 *
 * El color se guarda en PieceInstance.tags, por lo que viaja automáticamente
 * dentro del .flproject. Si una .flpiece trae el color en PieceDefinition.tags,
 * ese valor funciona como color base para todas sus nuevas instancias.
 *
 * La visibilidad del ojo es únicamente de trabajo y no se persiste: el motor
 * documental puede seguir mostrando la pieza aunque esté oculta en Model Space.
 */
export class PieceAppearanceController {
  private readonly options: Options;
  private readonly materialStates =
    new WeakMap<THREE.Mesh, MaterialState>();
  private readonly baseSceneSync: () => void;
  private readonly timer: number;
  private palette: HTMLDivElement | null = null;
  private disposed = false;


  constructor(options: Options) {
    this.options = options;
    this.baseSceneSync =
      options.designScene.sync.bind(options.designScene);

    options.designScene.sync = this.syncSceneWithAppearance;

    document.addEventListener(
      "contextmenu",
      this.handleContextMenuCapture,
      true,
    );
    window.addEventListener(
      "pointerdown",
      this.handleGlobalPointerDown,
      true,
    );
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    document.addEventListener(
      "framelogic-instance-tree-rendered",
      this.handleTreeRendered,
    );
    this.decorateRows();
    this.applyToAll();
    this.timer = window.setInterval(
      () => {
        this.decorateRows();
        this.applyToAll();
      },
      300,
    );
  }


  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.options.designScene.sync = this.baseSceneSync;
    document.removeEventListener(
      "contextmenu",
      this.handleContextMenuCapture,
      true,
    );
    window.removeEventListener(
      "pointerdown",
      this.handleGlobalPointerDown,
      true,
    );
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    document.removeEventListener(
      "framelogic-instance-tree-rendered",
      this.handleTreeRendered,
    );
    this.hidePalette();
  }


  private readonly handleTreeRendered = (): void => {
    this.decorateRows();
  };


  private readonly syncSceneWithAppearance = (): void => {
    this.baseSceneSync();
    this.applyToAll();
  };


  private readonly handleContextMenuCapture = (
    event: MouseEvent,
  ): void => {
    if (this.disposed) return;
    this.hidePalette();
    this.decorateRows();

    const target =
      event.target instanceof Element
        ? event.target
        : null;
    const row = target?.closest<HTMLElement>(
      "[data-framelogic-piece-id], [data-framelogic-assembly-id]",
    );
    if (!row || !findInstanceTreeBody(this.options.container)?.contains(row)) return;

    const pieceId = row.dataset["framelogicPieceId"] ?? null;
    const assemblyId = row.dataset["framelogicAssemblyId"] ?? null;
    if (!pieceId && !assemblyId) return;

    const x = event.clientX;
    const y = event.clientY;
    window.setTimeout(
      () => this.decorateOpenContextMenu(
        pieceId,
        assemblyId,
        x,
        y,
      ),
      0,
    );
  };


  private readonly handleGlobalPointerDown = (
    event: PointerEvent,
  ): void => {
    if (
      this.palette
      && event.target instanceof Node
      && !this.palette.contains(event.target)
    ) {
      this.hidePalette();
    }
  };


  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (event.key === "Escape") {
      this.hidePalette();
    }
  };


  private decorateRows(): void {
    // The layout organizer can move INSTANCIAS outside the BIM viewport.
    // Always resolve the current tree globally, just like the group-eye
    // controller, rather than only searching this.options.container.
    const body = findInstanceTreeBody(this.options.container);
    if (!body) return;

    for (const row of body.querySelectorAll<HTMLDivElement>(
      'div[data-framelogic-assembly-id]',
    )) {
      const id = row.dataset["framelogicAssemblyId"];
      if (!id || !this.options.designModel.assemblies.get(id)) continue;
      this.ensureAssemblyVisibilityEye(row, id);
    }

    for (const row of body.querySelectorAll<HTMLDivElement>(
      'div[data-framelogic-piece-id]',
    )) {
      const id = row.dataset["framelogicPieceId"];
      if (!id || !this.options.designModel.pieceInstances.get(id)) continue;
      this.ensurePieceVisibilityEye(row, id);
    }
  }


  private ensurePieceVisibilityEye(
    row: HTMLDivElement,
    pieceId: string,
  ): void {
    let eye = row.querySelector<HTMLButtonElement>(
      'button[data-framelogic-piece-visibility-eye="true"]',
    );
    if (!eye) {
      eye = document.createElement("button");
      eye.type = "button";
      eye.dataset["framelogicPieceVisibilityEye"] = "true";
      Object.assign(eye.style, {
        width: "20px",
        height: "18px",
        padding: "0",
        border: "0",
        background: "transparent",
        color: "#cfe8f3",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      });
      eye.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      eye.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = eye?.dataset["framelogicPieceId"];
        if (id) this.togglePieceVisibility(id);
      });
      row.prepend(eye);
    }

    eye.dataset["framelogicPieceId"] = pieceId;
    const hidden = this.options.designScene.isInstanceHidden(pieceId);
    eye.dataset["framelogicPieceVisible"] = hidden ? "false" : "true";
    eye.innerHTML = eyeSvg(hidden);
    eye.title = hidden ? "Mostrar pieza" : "Ocultar pieza";
    eye.style.opacity = hidden ? "0.55" : "1";
    row.style.gridTemplateColumns = "22px minmax(0,1fr) auto";
  }


  /**
   * One authoritative scene visibility state for pieces and assemblies.
   * Group operations update all members in a single scene synchronization,
   * without synthetic DOM clicks or rebuilding rows between members.
   */
  setPiecesHidden(pieceIds: readonly string[], hidden: boolean): void {
    const ids = pieceIds.filter((id) =>
      this.options.designModel.pieceInstances.get(id) !== undefined,
    );
    if (ids.length < 1) return;

    this.options.designScene.setInstancesHidden(ids, hidden);
    if (hidden) {
      const hiding = new Set(ids);
      const remaining = this.options.designSelection
        .getSelectedIds()
        .filter((id) => !hiding.has(id));
      if (remaining.length !== this.options.designSelection.getSelectedIds().length) {
        this.options.designSelection.setSelection(remaining);
      }
    }
    this.decorateRows();
    this.options.designSelection.refreshHelpers();
  }

  private togglePieceVisibility(pieceId: string): void {
    this.setPiecesHidden(
      [pieceId],
      !this.options.designScene.isInstanceHidden(pieceId),
    );
  }

  private ensureAssemblyVisibilityEye(
    row: HTMLDivElement,
    assemblyId: string,
  ): void {
    const assembly = this.options.designModel.assemblies.get(assemblyId);
    if (!assembly) return;

    let eye = row.querySelector<HTMLButtonElement>(
      'button[data-framelogic-assembly-visibility-eye="true"]',
    );
    if (!eye) {
      eye = document.createElement("button");
      eye.type = "button";
      eye.dataset["framelogicAssemblyVisibilityEye"] = "true";
      Object.assign(eye.style, {
        width: "20px",
        height: "18px",
        padding: "0",
        border: "0",
        background: "transparent",
        color: "#cfe8f3",
        cursor: "pointer",
        display: "grid",
        placeItems: "center",
      });
      eye.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      eye.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = eye?.dataset["framelogicAssemblyId"];
        const current = id ? this.options.designModel.assemblies.get(id) : null;
        if (!current) return;
        const allIds = this.options.designModel.getAssemblyPieceIdsDeep(current.id);
        if (allIds.length < 1) return;
        const anyShown = allIds.some(
          (pieceId) => !this.options.designScene.isInstanceHidden(pieceId),
        );
        this.setPiecesHidden(allIds, anyShown);
      });
      row.prepend(eye);
    }
    eye.dataset["framelogicAssemblyId"] = assemblyId;
    const ids = this.options.designModel.getAssemblyPieceIdsDeep(assemblyId);
    const allHidden = ids.length > 0 && ids.every(
      (id) => this.options.designScene.isInstanceHidden(id),
    );
    eye.disabled = ids.length === 0;
    eye.innerHTML = eyeSvg(allHidden);
    eye.title = ids.length === 0
      ? "Ensamble vacío"
      : allHidden ? "Mostrar ensamble" : "Ocultar ensamble";
    eye.setAttribute("aria-label", eye.title);
    eye.style.opacity = ids.length === 0 ? "0.35" : allHidden ? "0.55" : "1";
    row.style.gridTemplateColumns = "22px minmax(0,1fr) auto";
  }


  private decorateOpenContextMenu(
    pieceId: string | null,
    assemblyId: string | null,
    x: number,
    y: number,
  ): void {
    if (this.disposed) return;

    const menus = Array.from(
      document.body.querySelectorAll<HTMLDivElement>("div"),
    ).filter((element) => {
      if (element.dataset["framelogicPieceColorPalette"] === "true") {
        return false;
      }
      const buttons = Array.from(element.children).filter(
        (child): child is HTMLButtonElement => child instanceof HTMLButtonElement,
      );
      return element.style.position === "fixed" && buttons.length > 0;
    });
    const menu = menus.at(-1);
    if (!menu) return;
    if (menu.querySelector('[data-framelogic-piece-color-menu="true"]')) {
      return;
    }

    const ids = pieceId
      ? [pieceId]
      : assemblyId
        ? this.options.designModel.getAssemblyPieceIdsDeep(assemblyId)
        : [];
    if (ids.length < 1) return;

    const reference = menu.querySelector<HTMLButtonElement>(":scope > button");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset["framelogicPieceColorMenu"] = "true";
    button.textContent = "Color ▸";
    if (reference) {
      button.style.cssText = reference.style.cssText;
    }
    else {
      Object.assign(button.style, {
        display: "block",
        width: "100%",
        padding: "6px 8px",
        border: "0",
        borderRadius: "3px",
        background: "transparent",
        color: "#e7f0f4",
        textAlign: "left",
        cursor: "pointer",
        font: "12px system-ui, sans-serif",
      });
    }
    button.addEventListener("mouseenter", () => {
      button.style.background = "rgba(100,190,230,0.16)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "transparent";
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu.remove();
      this.showPalette(x + 12, y + 12, ids);
    });
    menu.prepend(button);
  }


  private showPalette(
    x: number,
    y: number,
    sourceIds: readonly string[],
  ): void {
    this.hidePalette();
    const ids = this.expandLinkedTargets(sourceIds);
    if (ids.length < 1) return;

    const palette = document.createElement("div");
    palette.dataset["framelogicPieceColorPalette"] = "true";
    Object.assign(palette.style, {
      position: "fixed",
      left: `${Math.max(6, x)}px`,
      top: `${Math.max(6, y)}px`,
      zIndex: "2147482500",
      width: "188px",
      padding: "8px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "6px",
      background: "rgba(18,25,30,0.98)",
      color: "#eef4f6",
      boxShadow: "0 8px 24px rgba(0,0,0,0.38)",
      font: "11px system-ui, sans-serif",
    });

    const title = document.createElement("div");
    title.textContent = ids.length > 1
      ? `Color · ${ids.length} piezas enlazadas`
      : "Color de pieza";
    Object.assign(title.style, {
      marginBottom: "7px",
      fontWeight: "700",
      color: "#dce8ed",
    });

    const grid = document.createElement("div");
    Object.assign(grid.style, {
      display: "grid",
      gridTemplateColumns: "repeat(5, 28px)",
      gap: "6px",
      alignItems: "center",
    });

    const current = this.getEffectiveColor(ids[0] ?? "");
    for (const entry of PASTEL_PALETTE) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.title = entry.name;
      swatch.setAttribute("aria-label", entry.name);
      Object.assign(swatch.style, {
        width: "28px",
        height: "28px",
        padding: "0",
        borderRadius: "5px",
        border: current === entry.color
          ? "2px solid #ffffff"
          : "1px solid rgba(255,255,255,0.28)",
        background: entry.color,
        cursor: "pointer",
        boxShadow: current === entry.color
          ? "0 0 0 2px rgba(68,183,232,0.7)"
          : "none",
      });
      swatch.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.applyColor(ids, entry.color);
        this.hidePalette();
      });
      grid.append(swatch);
    }

    const automatic = document.createElement("button");
    automatic.type = "button";
    automatic.textContent = "Restablecer color";
    Object.assign(automatic.style, {
      width: "100%",
      marginTop: "8px",
      padding: "5px 7px",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "4px",
      background: "rgba(255,255,255,0.04)",
      color: "#dce8ed",
      cursor: "pointer",
      font: "inherit",
    });
    automatic.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.applyColor(ids, null);
      this.hidePalette();
    });

    palette.append(title, grid, automatic);
    document.body.append(palette);
    this.keepInsideViewport(palette);
    this.palette = palette;
  }


  private keepInsideViewport(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    if (rect.right > window.innerWidth - 6) {
      element.style.left = `${Math.max(6, window.innerWidth - rect.width - 6)}px`;
    }
    if (rect.bottom > window.innerHeight - 6) {
      element.style.top = `${Math.max(6, window.innerHeight - rect.height - 6)}px`;
    }
  }


  private hidePalette(): void {
    this.palette?.remove();
    this.palette = null;
  }


  private expandLinkedTargets(
    sourceIds: readonly string[],
  ): string[] {
    const result = new Set<string>(sourceIds);
    const all = this.options.designModel.pieceInstances.getAll();

    for (const sourceId of sourceIds) {
      const source = this.options.designModel.pieceInstances.get(sourceId);
      if (!source) continue;
      const linkId = getLinkedAssemblyId(source.tags);
      const componentId = getLinkedAssemblyComponentId(source.tags);
      if (!linkId || !componentId) continue;

      for (const candidate of all) {
        if (
          getLinkedAssemblyId(candidate.tags) === linkId
          && getLinkedAssemblyComponentId(candidate.tags) === componentId
        ) {
          result.add(candidate.id);
        }
      }
    }

    return [...result];
  }


  private applyColor(
    ids: readonly string[],
    color: string | null,
  ): void {
    for (const id of ids) {
      const instance = this.options.designModel.pieceInstances.get(id);
      if (!instance) continue;
      this.options.designModel.pieceInstances.updateTags(
        id,
        setPieceColorInTags(instance.tags, color),
      );
    }
    this.options.designScene.sync();
  }


  private getEffectiveColor(instanceId: string): string | null {
    const instance = this.options.designModel.pieceInstances.get(instanceId);
    if (!instance) return null;
    const own = getPieceColorFromTags(instance.tags);
    if (own) return own;
    const definition = this.options.designModel.pieceDefinitions.get(
      instance.definitionId,
    );
    return definition
      ? getPieceColorFromTags(definition.tags)
      : null;
  }


  private applyToAll(): void {
    if (this.disposed) return;

    for (const [instanceId, root] of this.options.designScene.getInstanceEntries()) {
      const color = this.getEffectiveColor(instanceId);
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const state = this.ensureMaterialState(object);
        this.applyMaterialColor(object, state, color);
      });
    }
  }


  private ensureMaterialState(mesh: THREE.Mesh): MaterialState {
    const current = this.materialStates.get(mesh);
    if (current) return current;

    const source = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const clones = source.map((material) => material.clone());
    const state: MaterialState = {
      baseMaterials: clones,
      baseColors: clones.map((material) => this.readMaterialColor(material)),
      arrayMaterial: Array.isArray(mesh.material),
    };

    mesh.material = state.arrayMaterial
      ? clones
      : clones[0] ?? mesh.material;
    this.materialStates.set(mesh, state);
    return state;
  }


  private applyMaterialColor(
    mesh: THREE.Mesh,
    state: MaterialState,
    color: string | null,
  ): void {
    state.baseMaterials.forEach((material, index) => {
      this.writeMaterialColor(
        material,
        color,
        state.baseColors[index] ?? null,
      );
    });

    const current = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    current.forEach((material, index) => {
      if (state.baseMaterials.includes(material)) return;
      this.writeMaterialColor(
        material,
        color,
        state.baseColors[index] ?? state.baseColors[0] ?? null,
      );
    });
  }


  private readMaterialColor(material: THREE.Material): number | null {
    const candidate = material as THREE.Material & {
      color?: THREE.Color;
    };
    return candidate.color instanceof THREE.Color
      ? candidate.color.getHex()
      : null;
  }


  private writeMaterialColor(
    material: THREE.Material,
    color: string | null,
    fallback: number | null,
  ): void {
    const candidate = material as THREE.Material & {
      color?: THREE.Color;
    };
    if (!(candidate.color instanceof THREE.Color)) return;

    if (color) {
      candidate.color.set(color);
    }
    else if (fallback !== null) {
      candidate.color.setHex(fallback);
    }
    material.needsUpdate = true;
  }
}


function eyeSvg(hidden: boolean): string {
  if (hidden) {
    return [
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">',
      '<path d="M3 3l18 18" fill="none" stroke="currentColor" stroke-width="1.8"/>',
      '<path d="M2.5 12s3.5-6 9.5-6c2.1 0 3.9.7 5.4 1.7M21.5 12s-3.5 6-9.5 6c-2.1 0-3.9-.7-5.4-1.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      '</svg>',
    ].join("");
  }
  return [
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">',
    '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    '<circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
    '</svg>',
  ].join("");
}
