import type {
  Assembly,
  DesignModel,
  PieceInstance,
} from "@framelogic/domain";

import type {
  CadHistoryController,
} from "../interaction/CadHistoryController";

import type {
  InstanceTreeController,
} from "./InstanceTreeController";

import type {
  LinkedAssemblyInstanceController,
} from "./LinkedAssemblyInstanceController";

import {
  LINKED_ASSEMBLY_COMPONENT_TAG_PREFIX,
  LINKED_ASSEMBLY_ID_TAG_PREFIX,
  getLinkedAssemblyId,
} from "./LinkedAssemblyMetadata";


interface Options {
  readonly designModel: DesignModel;
  readonly instanceTree: InstanceTreeController;
  readonly linkedAssemblies: LinkedAssemblyInstanceController;
  readonly cadHistory: CadHistoryController;
}


interface InstanceTreeRuntime {
  contextMenu: HTMLDivElement | null;
  refresh(): void;
  showAssemblyContextMenu(
    x: number,
    y: number,
    assemblyId: string,
  ): void;
}


interface LinkedAssemblyRuntime {
  readonly knownAssemblyLinks: Map<string, string>;
  snapshots: Map<string, unknown>;
  captureSnapshots(): Map<string, unknown>;
}


interface AssemblyLinkState {
  readonly name: string;
  readonly knownLinkId: string | null;
  readonly pieceTags: ReadonlyMap<string, readonly string[]>;
}


/**
 * Integra "Desvincular ensamble" con el historial CAD global.
 *
 * El controlador de interacción enlazada conserva la sincronización inmediata
 * de componentes. Este bridge reemplaza únicamente el botón de desvincular que
 * ese controlador añade al menú y registra la operación en CadHistoryController.
 * De esta forma Ctrl+Z/Ctrl+Y restauran o vuelven a romper el vínculo completo,
 * no solo las transformaciones geométricas anteriores.
 */
export class LinkedAssemblyUnlinkHistoryController {
  private readonly options: Options;
  private readonly treeRuntime: InstanceTreeRuntime;
  private readonly linkedRuntime: LinkedAssemblyRuntime;
  private readonly baseShowAssemblyContextMenu:
    InstanceTreeRuntime["showAssemblyContextMenu"];
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.treeRuntime =
      options.instanceTree as unknown as InstanceTreeRuntime;
    this.linkedRuntime =
      options.linkedAssemblies as unknown as LinkedAssemblyRuntime;

    this.baseShowAssemblyContextMenu =
      this.treeRuntime.showAssemblyContextMenu.bind(this.treeRuntime);

    this.treeRuntime.showAssemblyContextMenu = (
      x: number,
      y: number,
      assemblyId: string,
    ): void => {
      this.baseShowAssemblyContextMenu(x, y, assemblyId);
      this.replaceUnlinkAction(assemblyId);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.treeRuntime.showAssemblyContextMenu =
      this.baseShowAssemblyContextMenu;
  }

  private replaceUnlinkAction(assemblyId: string): void {
    const menu = this.treeRuntime.contextMenu;
    if (!menu) return;

    const original = Array.from(
      menu.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) =>
      button.textContent?.trim() === "Desvincular ensamble",
    );
    if (!original) return;

    /* cloneNode conserva texto/estilo pero NO los listeners del botón anterior. */
    const button = original.cloneNode(true) as HTMLButtonElement;
    original.replaceWith(button);

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.unlinkWithHistory(assemblyId);
      menu.remove();
      if (this.treeRuntime.contextMenu === menu) {
        this.treeRuntime.contextMenu = null;
      }
    });
  }

  private unlinkWithHistory(assemblyId: string): boolean {
    const assembly = this.options.designModel.assemblies.get(assemblyId);
    if (!assembly) return false;

    const linkId = this.getAssemblyLinkId(assembly);
    if (!linkId) return false;

    const before = this.captureState(assembly, linkId);
    const detachedName = this.nextDetachedName(assembly.name);

    const afterTags = new Map<string, readonly string[]>();
    for (const pieceId of assembly.pieceInstanceIds) {
      const piece = this.options.designModel.pieceInstances.get(pieceId);
      if (!piece) continue;
      afterTags.set(
        piece.id,
        getLinkedAssemblyId(piece.tags) === linkId
          ? clearLinkedMetadata(piece.tags)
          : [...piece.tags],
      );
    }

    const after: AssemblyLinkState = {
      name: detachedName,
      knownLinkId: null,
      pieceTags: afterTags,
    };

    this.applyState(assemblyId, after);

    this.options.cadHistory.recordOperation(
      "Desvincular ensamble",
      () => this.applyState(assemblyId, before),
      () => this.applyState(assemblyId, after),
    );

    return true;
  }

  private captureState(
    assembly: Assembly,
    linkId: string,
  ): AssemblyLinkState {
    const pieceTags = new Map<string, readonly string[]>();

    for (const pieceId of assembly.pieceInstanceIds) {
      const piece = this.options.designModel.pieceInstances.get(pieceId);
      if (!piece) continue;
      pieceTags.set(piece.id, [...piece.tags]);
    }

    return {
      name: assembly.name,
      knownLinkId:
        this.linkedRuntime.knownAssemblyLinks.get(assembly.id)
        ?? linkId,
      pieceTags,
    };
  }

  private applyState(
    assemblyId: string,
    state: AssemblyLinkState,
  ): void {
    const assembly = this.options.designModel.assemblies.get(assemblyId);
    if (!assembly) return;

    for (const [pieceId, tags] of state.pieceTags) {
      if (!this.options.designModel.pieceInstances.get(pieceId)) continue;
      this.options.designModel.pieceInstances.updateTags(
        pieceId,
        [...tags],
      );
    }

    this.options.designModel.assemblies.updateName(
      assemblyId,
      state.name,
    );

    if (state.knownLinkId) {
      this.linkedRuntime.knownAssemblyLinks.set(
        assemblyId,
        state.knownLinkId,
      );
    }
    else {
      this.linkedRuntime.knownAssemblyLinks.delete(assemblyId);
    }

    /*
     * El snapshot se reemplaza inmediatamente para que el sincronizador de
     * ensambles no interprete Undo/Redo como una edición nueva de componentes.
     */
    this.linkedRuntime.snapshots =
      this.linkedRuntime.captureSnapshots();

    this.treeRuntime.refresh();
  }

  private getAssemblyLinkId(assembly: Assembly): string | null {
    const counts = new Map<string, number>();

    for (const piece of this.getPieces(assembly)) {
      const linkId = getLinkedAssemblyId(piece.tags);
      if (!linkId) continue;
      counts.set(linkId, (counts.get(linkId) ?? 0) + 1);
    }

    let best: string | null = null;
    let bestCount = 0;
    for (const [linkId, count] of counts) {
      if (count > bestCount) {
        best = linkId;
        bestCount = count;
      }
    }
    return best;
  }

  private getPieces(assembly: Assembly): PieceInstance[] {
    return assembly.pieceInstanceIds
      .map((id) => this.options.designModel.pieceInstances.get(id))
      .filter((piece): piece is PieceInstance => piece !== undefined);
  }

  private nextDetachedName(baseName: string): string {
    const suffixPattern = /\s+desvinculado(?:\s+\d+)?$/i;
    const root = baseName.replace(suffixPattern, "").trim() || baseName;
    const existing = new Set(
      this.options.designModel.assemblies
        .getAll()
        .map((assembly) => assembly.name),
    );

    const first = `${root} desvinculado`;
    if (!existing.has(first)) return first;

    let index = 2;
    while (existing.has(`${root} desvinculado ${index}`)) {
      index += 1;
    }
    return `${root} desvinculado ${index}`;
  }
}


function clearLinkedMetadata(tags: readonly string[]): string[] {
  return tags.filter((value) =>
    !value.startsWith(LINKED_ASSEMBLY_ID_TAG_PREFIX)
    && !value.startsWith(LINKED_ASSEMBLY_COMPONENT_TAG_PREFIX),
  );
}
