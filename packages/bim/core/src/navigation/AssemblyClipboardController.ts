import type {
  DesignModel,
  PieceInstance,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  DesignSelectionController,
} from "../interaction/DesignSelectionController";

import type {
  InstanceTreeController,
} from "./InstanceTreeController";

interface FocusedTreeItemRuntime {
  readonly kind: "PIECE" | "ASSEMBLY";
  readonly id: string;
}

interface InstanceTreeRuntime {
  focusedItem: FocusedTreeItemRuntime | null;
  refresh(): void;
}

interface PieceClipboardSnapshot {
  readonly definitionId: string;
  readonly name?: string;
  readonly layerId: string;
  readonly transform: {
    readonly position: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
    readonly rotation: {
      readonly x: number;
      readonly y: number;
      readonly z: number;
    };
  };
  readonly tags: readonly string[];
}

interface AssemblyClipboardSnapshot {
  readonly name: string;
  readonly layerId: string;
  readonly classification?: string;
  readonly tags: readonly string[];
  readonly pieces: readonly PieceClipboardSnapshot[];
}

interface Options {
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly designSelection: DesignSelectionController;
  readonly instanceTree: InstanceTreeController;
}

/**
 * Copiar/pegar de ENSAMBLES como entidad lógica.
 *
 * Ctrl/Cmd+C sobre una fila de ensamble guarda no solo sus piezas sino también
 * los metadatos del propio ensamble. Ctrl/Cmd+V crea nuevas PieceInstance y un
 * nuevo Assembly que las agrupa, conservando capa, clasificación y tags.
 */
export class AssemblyClipboardController {
  private readonly options: Options;
  private readonly treeRuntime: InstanceTreeRuntime;
  private clipboard: AssemblyClipboardSnapshot | null = null;
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.treeRuntime =
      options.instanceTree as unknown as InstanceTreeRuntime;

    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    this.clipboard = null;
  }

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    if (
      this.disposed
      || isEditableTarget(event.target)
      || !(event.ctrlKey || event.metaKey)
      || event.altKey
    ) {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === "c") {
      const focused = this.treeRuntime.focusedItem;
      if (!focused || focused.kind !== "ASSEMBLY") return;
      if (!this.copyAssembly(focused.id)) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (key === "v" && this.clipboard) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.pasteAssembly();
    }
  };

  private copyAssembly(assemblyId: string): boolean {
    const assembly = this.options.designModel.assemblies.get(assemblyId);
    if (!assembly) return false;

    const pieces = assembly.pieceInstanceIds
      .map((id) => this.options.designModel.pieceInstances.get(id))
      .filter((piece): piece is PieceInstance => piece !== undefined)
      .map((piece) => this.clonePiece(piece));

    if (pieces.length < 1) return false;

    this.clipboard = {
      name: assembly.name,
      layerId: assembly.layerId,
      classification: assembly.classification,
      tags: [...assembly.tags],
      pieces,
    };

    return true;
  }

  private pasteAssembly(): boolean {
    const snapshot = this.clipboard;
    if (!snapshot) return false;

    const createdIds: string[] = [];

    for (const piece of snapshot.pieces) {
      const created = this.options.designModel.registerPieceInstance({
        name: piece.name,
        definitionId: piece.definitionId,
        layerId: piece.layerId,
        transform: {
          position: { ...piece.transform.position },
          rotation: { ...piece.transform.rotation },
        },
        tags: [...piece.tags],
      });
      createdIds.push(created.id);
    }

    if (createdIds.length < 1) return false;

    const assembly = this.options.designModel.assemblies.register({
      name: this.nextCopyName(snapshot.name),
      layerId: snapshot.layerId,
      classification: snapshot.classification,
      tags: [...snapshot.tags],
      pieceInstanceIds: createdIds,
    });

    this.options.designScene.sync();
    this.options.designSelection.setSelection(createdIds);
    this.treeRuntime.focusedItem = {
      kind: "ASSEMBLY",
      id: assembly.id,
    };
    this.treeRuntime.refresh();
    return true;
  }

  private clonePiece(piece: PieceInstance): PieceClipboardSnapshot {
    return {
      definitionId: piece.definitionId,
      name: piece.name,
      layerId: piece.layerId,
      transform: {
        position: { ...piece.transform.position },
        rotation: { ...piece.transform.rotation },
      },
      tags: [...piece.tags],
    };
  }

  private nextCopyName(baseName: string): string {
    const existing = new Set(
      this.options.designModel.assemblies
        .getAll()
        .map((assembly) => assembly.name),
    );

    const first = `${baseName} copia`;
    if (!existing.has(first)) return first;

    let index = 2;
    while (existing.has(`${baseName} copia ${index}`)) {
      index += 1;
    }
    return `${baseName} copia ${index}`;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable
    || target.tagName === "INPUT"
    || target.tagName === "TEXTAREA"
    || target.tagName === "SELECT"
  );
}
