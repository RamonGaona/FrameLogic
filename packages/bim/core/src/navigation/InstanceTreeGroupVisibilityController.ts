import { findInstanceTreeBody } from "./findInstanceTreeBody";

import type {
  DesignModel,
} from "@framelogic/domain";

import type { DesignSceneController } from "../design/DesignSceneController";
import type { PieceAppearanceController } from "./PieceAppearanceController";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import type {
  CadLineSelectionController,
} from "../interaction/CadLineSelectionController";

import type {
  CadPointSelectionController,
} from "../interaction/CadPointSelectionController";

import type {
  SectionDrawingController,
} from "../drawing/SectionDrawingController";

import type {
  SectionInstanceTreeBridgeController,
} from "../drawing/SectionInstanceTreeBridgeController";

import {
  parseCadReferenceLayerName,
} from "../import/CadReferenceBlockController";


interface SectionTreeRuntime {
  readonly hidden: Set<string>;
  setHiddenSections(sectionIds: readonly string[], hidden: boolean): void;
}

interface Options {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly pieceAppearance: PieceAppearanceController;
  readonly lineScene: CadLineSceneController;
  readonly pointScene: CadPointSceneController;
  readonly lineSelection: CadLineSelectionController;
  readonly pointSelection: CadPointSelectionController;
  readonly sectionDrawing: SectionDrawingController;
  readonly sectionTree: SectionInstanceTreeBridgeController;
}

/**
 * Ojos globales de categorías en INSTANCIAS.
 *
 * No sustituyen los ojos individuales; solamente ofrecen una operación masiva
 * sobre el grupo completo. El ojo de REFERENCIAS CAD permanece visible aun
 * cuando todavía no existen DWG/DXF cargados.
 */
export class InstanceTreeGroupVisibilityController {
  private readonly options: Options;
  private readonly sectionRuntime: SectionTreeRuntime;
  private readonly timer: number;
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.sectionRuntime =
      options.sectionTree as unknown as SectionTreeRuntime;

    this.decorate();
    this.timer = window.setInterval(
      () => this.decorate(),
      250,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);

    findInstanceTreeBody(this.options.container)
      ?.querySelectorAll('[data-framelogic-group-eye="true"]')
      .forEach((element) => element.remove());
  }

  private decorate(): void {
    if (this.disposed) return;

    const body = findInstanceTreeBody(this.options.container);
    if (!body) return;

    const cadDetails = body.querySelector<HTMLDetailsElement>(
      'details[data-framelogic-cad-entity-tree="true"]',
    );
    const sectionDetails = body.querySelector<HTMLDetailsElement>(
      'details[data-framelogic-section-tree="true"]',
    );
    const referenceDetails = this.findGroup("REFERENCIAS CAD");
    const assemblyDetails = this.findGroup("ENSAMBLAJES");
    const looseDetails = this.findGroup("PIEZAS SUELTAS");

    if (cadDetails) {
      const lines = this.options.designModel.cadLines.getAll();
      const points = this.options.designModel.cadPoints.getAll();
      const total = lines.length + points.length;
      const allHidden = total > 0
        && lines.every((line) => this.options.lineScene.isHidden(line.id))
        && points.every((point) => this.options.pointScene.isHidden(point.id));

      this.ensureEye(
        cadDetails,
        "cad",
        allHidden,
        total > 0,
        () => this.toggleAllCad(),
      );
    }

    if (sectionDetails) {
      const sections = this.options.sectionDrawing.getSections();
      const allHidden = sections.length > 0
        && sections.every((section) =>
          this.sectionRuntime.hidden.has(section.id),
        );

      this.ensureEye(
        sectionDetails,
        "sections",
        allHidden,
        sections.length > 0,
        () => this.toggleAllSections(),
      );
    }

    if (assemblyDetails) {
      const pieceIds = this.getAssemblyPieceIds();
      this.ensureEye(
        assemblyDetails,
        "assemblies",
        pieceIds.length > 0 && pieceIds.every(
          (id) => this.options.designScene.isInstanceHidden(id),
        ),
        pieceIds.length > 0,
        () => this.togglePieces("assemblies"),
      );
    }

    if (looseDetails) {
      const pieceIds = this.getLoosePieceIds();
      this.ensureEye(
        looseDetails,
        "loose",
        pieceIds.length > 0 && pieceIds.every(
          (id) => this.options.designScene.isInstanceHidden(id),
        ),
        pieceIds.length > 0,
        () => this.togglePieces("loose"),
      );
    }

    if (referenceDetails) {
      const references = this.getReferenceLayers();
      const allHidden = references.length > 0
        && references.every((layer) => !layer.visible);

      this.ensureEye(
        referenceDetails,
        "references",
        allHidden,
        references.length > 0,
        () => this.toggleAllReferences(),
      );
    }
  }

  private ensureEye(
    details: HTMLDetailsElement,
    key: string,
    allHidden: boolean,
    enabled: boolean,
    action: () => void,
  ): void {
    const summary = details.querySelector<HTMLElement>(":scope > summary");
    if (!summary) return;

    let button = summary.querySelector<HTMLButtonElement>(
      `button[data-framelogic-group-eye-key="${key}"]`,
    );

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.dataset["framelogicGroupEye"] = "true";
      button.dataset["framelogicGroupEyeKey"] = key;
      Object.assign(button.style, {
        float: "right",
        width: "22px",
        height: "18px",
        margin: "-1px 0 0 6px",
        padding: "0",
        border: "0",
        background: "transparent",
        color: "#cfe8f3",
        cursor: "pointer",
      });
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        action();
      });
      summary.append(button);
    }

    button.disabled = !enabled;
    button.style.opacity = enabled ? "1" : "0.35";
    button.style.cursor = enabled ? "pointer" : "default";
    button.title = enabled
      ? allHidden
        ? "Mostrar todo el grupo"
        : "Ocultar todo el grupo"
      : "Grupo vacío";
    button.innerHTML = eyeSvg(allHidden);
  }

  private toggleAllCad(): void {
    const lines = this.options.designModel.cadLines.getAll();
    const points = this.options.designModel.cadPoints.getAll();
    if (lines.length + points.length < 1) return;

    const anyVisible =
      lines.some((line) => !this.options.lineScene.isHidden(line.id))
      || points.some((point) => !this.options.pointScene.isHidden(point.id));
    const hide = anyVisible;

    for (const line of lines) {
      this.options.lineScene.setHidden(line.id, hide);
    }
    for (const point of points) {
      this.options.pointScene.setHidden(point.id, hide);
    }

    if (hide) {
      this.options.lineSelection.clearSelection();
      this.options.pointSelection.clearSelection();
    }

    this.decorate();
  }

  private toggleAllSections(): void {
    const sections = this.options.sectionDrawing.getSections();
    if (sections.length < 1) return;
    const hide = sections.some(
      (section) => !this.sectionRuntime.hidden.has(section.id),
    );
    // One batch: the tree and the scene are refreshed after ALL section
    // visibility flags change, never between individual rows.
    this.sectionRuntime.setHiddenSections(
      sections.map((section) => section.id),
      hide,
    );
    this.decorate();
  }

  private getAssemblyPieceIds(): string[] {
    return Array.from(new Set(
      this.options.designModel.assemblies.getAll()
        .flatMap((assembly) => assembly.pieceInstanceIds),
    )).filter(
      (id) => this.options.designModel.pieceInstances.get(id) !== undefined,
    );
  }

  private getLoosePieceIds(): string[] {
    const grouped = new Set(this.getAssemblyPieceIds());
    return this.options.designModel.pieceInstances.getAll()
      .filter((piece) => !grouped.has(piece.id))
      .map((piece) => piece.id);
  }

  private togglePieces(group: "assemblies" | "loose"): void {
    const ids = group === "assemblies"
      ? this.getAssemblyPieceIds()
      : this.getLoosePieceIds();
    if (ids.length === 0) return;
    const hide = ids.some(
      (id) => !this.options.designScene.isInstanceHidden(id),
    );
    this.options.pieceAppearance.setPiecesHidden(ids, hide);
    this.decorate();
  }

  private toggleAllReferences(): void {
    const references = this.getReferenceLayers();
    if (references.length < 1) return;

    const anyVisible = references.some((layer) => layer.visible);
    const targetVisible = !anyVisible;
    for (const layer of references) {
      this.options.designModel.layers.update(
        layer.id,
        { visible: targetVisible },
      );
    }
    this.decorate();
  }

  private getReferenceLayers(): ReturnType<DesignModel["layers"]["getAll"]> {
    return this.options.designModel.layers
      .getAll()
      .filter((layer) => parseCadReferenceLayerName(layer) !== null);
  }

  private findGroup(title: string): HTMLDetailsElement | null {
    const body = findInstanceTreeBody(this.options.container);
    if (!body) return null;

    return Array.from(
      body.querySelectorAll<HTMLDetailsElement>(":scope > details"),
    ).find((details) => {
      const summary = details.querySelector<HTMLElement>(":scope > summary");
      if (!summary) return false;
      const text = Array.from(summary.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim();
      return text === title;
    }) ?? null;
  }
}


function eyeSvg(hidden: boolean): string {
  if (hidden) {
    return [
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">',
      '<path d="M3 3l18 18" fill="none" stroke="currentColor" stroke-width="1.8"/>',
      '<path d="M2.5 12s3.5-6 9.5-6c2.1 0 3.9.7 5.4 1.7M21.5 12s-3.5 6-9.5 6c-2.1 0-3.9-.7-5.4-1.7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
      '</svg>',
    ].join("");
  }

  return [
    '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">',
    '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    '<circle cx="12" cy="12" r="2.6" fill="currentColor"/>',
    '</svg>',
  ].join("");
}
