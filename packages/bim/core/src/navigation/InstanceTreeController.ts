import type {
  DesignModel,
  PieceInstance,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type { CadHistoryController } from "../interaction/CadHistoryController";


import type {
  DesignSelectionController,
} from "../interaction/DesignSelectionController";

import {
  parseCadReferenceLayerName,
} from "../import/CadReferenceBlockController";

import type {
  CadReferenceBlockController,
} from "../import/CadReferenceBlockController";

const INSTANCE_NAME_TAG_PREFIX = "__FL_INSTANCE_NAME__:";

type FocusedTreeItem =
  | { readonly kind: "PIECE"; readonly id: string }
  | { readonly kind: "ASSEMBLY"; readonly id: string }
  | null;

export interface InstanceTreeControllerOptions {
  readonly container: HTMLElement;
  readonly canvas: HTMLElement;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly designSelection: DesignSelectionController;
  readonly cadHistory: CadHistoryController;
  readonly cadReferenceBlocks: CadReferenceBlockController;
  readonly cancelActiveCommand: () => void;
}

/**
 * Árbol jerárquico del Model Space.
 *
 * - Ensambles son grupos lógicos de PieceInstance, no geometría fusionada.
 * - Clic derecho en el árbol permite crear ensamble, mover/copiar selección a un grupo.
 * - F2 renombra la instancia o ensamble enfocado en el árbol.
 * - El canvas conserva su propio menú contextual de Model Space.
 * - Cada DWG/DXF permanece como bloque de referencia con sus capas debajo.
 */
export class InstanceTreeController {
  private readonly options: InstanceTreeControllerOptions;
  private readonly panel: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly addAssemblyButton: HTMLButtonElement;
  private readonly unsubscribeSelection: () => void;
  private readonly unsubscribeLayers: () => void;
  private readonly timer: number;
  private expanded = true;
  private lastSignature = "";
  private focusedItem: FocusedTreeItem = null;
  // Selecting an assembly in the tree is NOT equivalent to selecting its
  // component pieces in the viewport. Keep the explicit identity separately.
  private readonly selectedAssemblyIds = new Set<string>();
  private updatingTreeSelection = false;
  private contextMenu: HTMLDivElement | null = null;
  private disposed = false;

  constructor(
    options: InstanceTreeControllerOptions,
  ) {
    this.options = options;
    this.panel = this.createPanel(options.container);
    this.toggle = this.panel.querySelector<HTMLButtonElement>(
      '[data-framelogic-instance-tree-toggle="true"]',
    )!;
    this.addAssemblyButton = this.panel.querySelector<HTMLButtonElement>(
      '[data-framelogic-instance-tree-add-assembly="true"]',
    )!;
    this.body = this.panel.querySelector<HTMLDivElement>(
      '[data-framelogic-instance-tree-body="true"]',
    )!;

    this.toggle.addEventListener(
      "click",
      this.handleToggle,
    );
    this.addAssemblyButton.addEventListener(
      "click",
      this.handleCreateAssembly,
    );
    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    window.addEventListener(
      "pointerdown",
      this.handleGlobalPointerDown,
      true,
    );

    this.unsubscribeSelection = options.designSelection.subscribe(
      () => {
        if (!this.updatingTreeSelection) this.selectedAssemblyIds.clear();
        this.render();
      },
    );
    this.unsubscribeLayers = options.designModel.layers.subscribe(
      () => this.render(),
    );
    this.timer = window.setInterval(
      () => this.refreshIfChanged(),
      600,
    );
    this.render();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.clearInterval(this.timer);
    this.unsubscribeSelection();
    this.unsubscribeLayers();
    this.toggle.removeEventListener(
      "click",
      this.handleToggle,
    );
    this.addAssemblyButton.removeEventListener(
      "click",
      this.handleCreateAssembly,
    );
    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
    window.removeEventListener(
      "pointerdown",
      this.handleGlobalPointerDown,
      true,
    );
    this.hideContextMenu();
    this.panel.remove();
  }

  refresh(): void {
    this.lastSignature = "";
    this.render();
  }

  private readonly handleToggle = (): void => {
    this.expanded = !this.expanded;
    this.body.style.display = this.expanded ? "block" : "none";
    this.toggle.textContent = this.expanded ? "−" : "+";
  };

  private readonly handleCreateAssembly = (): void => {
    this.createAssemblyFromSelection();
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

    if (event.key === "F2" && this.focusedItem) {
      event.preventDefault();
      event.stopPropagation();
      this.renameFocusedItem();
    }
  };

  private readonly handleGlobalPointerDown = (
    event: PointerEvent,
  ): void => {
    if (
      this.contextMenu
      && event.target instanceof Node
      && !this.contextMenu.contains(event.target)
    ) {
      this.hideContextMenu();
    }
  };

  private refreshIfChanged(): void {
    if (this.disposed) return;
    const signature = this.getSignature();
    if (signature !== this.lastSignature) {
      this.render();
    }
  }

  private getSignature(): string {
    const pieces = this.options.designModel.pieceInstances
      .getAll()
      .map((instance) =>
        `${instance.id}:${instance.definitionId}:${instance.name ?? ""}:${instance.tags.join("|")}`,
      )
      .sort();
    const assemblies = this.options.designModel.assemblies
      .getAll()
      .map((assembly) =>
        `${assembly.id}:${assembly.name}:${assembly.pieceInstanceIds.join(",")}:${assembly.parentAssemblyId ?? ""}:${Boolean(assembly.locked)}`,
      )
      .sort();
    const cadLayers = this.options.designModel.layers
      .getAll()
      .filter((layer) => parseCadReferenceLayerName(layer) !== null)
      .map((layer) => `${layer.id}:${layer.name}:${layer.visible}`)
      .sort();
    const selectedPieces = [...this.options.designSelection.getSelectedIds()]
      .sort();
    const selectedCad = [...this.options.cadReferenceBlocks.getSelectedReferenceNames()]
      .sort();
    return JSON.stringify({
      pieces,
      assemblies,
      cadLayers,
      selectedPieces,
      selectedCad,
      selectedAssemblyIds: [...this.selectedAssemblyIds].sort(),
    });
  }

  private render(): void {
    if (this.disposed) return;
    this.lastSignature = this.getSignature();
    this.body.replaceChildren();

    const assemblies = this.options.designModel.assemblies.getAll();
    const allInstances = this.options.designModel.pieceInstances.getAll();
    const assigned = new Set<string>();
    for (const assembly of assemblies) {
      for (const id of assembly.pieceInstanceIds) assigned.add(id);
    }

    const summary = document.createElement("div");
    summary.textContent =
      `${allInstances.length} instancia${allInstances.length === 1 ? "" : "s"} · ${assemblies.length} ensamble${assemblies.length === 1 ? "" : "s"} · ${this.options.cadReferenceBlocks.getReferenceNames().length} CAD`;
    Object.assign(summary.style, {
      padding: "5px 8px 7px",
      color: "#94a8b3",
      fontSize: "11px",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
    });
    this.body.append(summary);

    const assemblyGroup = this.createGroup("ENSAMBLAJES", true);
    const rendered = new Set<string>();
    for (const selectedId of [...this.selectedAssemblyIds]) {
      if (!this.options.designModel.assemblies.get(selectedId)) {
        this.selectedAssemblyIds.delete(selectedId);
      }
    }
    if (assemblies.length < 1) {
      assemblyGroup.content.append(this.createEmpty("Sin ensambles"));
    } else {
      for (const assembly of assemblies) {
        if (assembly.parentAssemblyId
          && this.options.designModel.assemblies.get(assembly.parentAssemblyId)) {
          continue;
        }
        this.appendAssemblyNode(assembly.id, assemblyGroup.content, rendered);
      }
      // Guard against corrupt legacy data: display unvisited entries but
      // never recurse forever into invalid parent cycles.
      for (const assembly of assemblies) {
        if (!rendered.has(assembly.id)) {
          this.appendAssemblyNode(assembly.id, assemblyGroup.content, rendered);
        }
      }
    }
    this.body.append(assemblyGroup.details);

    const looseGroup = this.createGroup("PIEZAS SUELTAS", true);
    const loose = allInstances.filter((instance) => !assigned.has(instance.id));
    if (loose.length < 1) {
      looseGroup.content.append(this.createEmpty("Sin piezas sueltas"));
    }
    else {
      for (const instance of loose) {
        looseGroup.content.append(
          this.createPieceRow(instance.id),
        );
      }
    }
    this.body.append(looseGroup.details);

    const cadGroup = this.createGroup("REFERENCIAS CAD", true);
    const cadEntries = this.collectCadReferences();
    if (cadEntries.length < 1) {
      cadGroup.content.append(this.createEmpty("Sin DWG/DXF"));
    }
    else {
      const selectedCad = new Set(
        this.options.cadReferenceBlocks.getSelectedReferenceNames(),
      );
      for (const entry of cadEntries) {
        const row = this.createSelectableRow(
          `▧ ${entry.referenceName}`,
          `${entry.layers.length} capa${entry.layers.length === 1 ? "" : "s"}`,
          selectedCad.has(entry.referenceName),
          (event) => {
            this.focusedItem = null;
            this.options.cancelActiveCommand();
            this.options.cadReferenceBlocks.selectReference(
              entry.referenceName,
              event.ctrlKey || event.metaKey,
            );
            this.render();
          },
        );
        cadGroup.content.append(row);
        const children = document.createElement("div");
        children.style.paddingLeft = "16px";
        for (const layer of entry.layers) {
          const child = document.createElement("div");
          child.textContent = `${layer.visible ? "●" : "○"} ${layer.sourceLayerName}`;
          child.title = "Capa original del archivo CAD. Visibilidad y SNAP se controlan desde Capas CAD.";
          Object.assign(child.style, {
            padding: "3px 6px",
            color: layer.visible ? "#b8c8d0" : "#6f8089",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: "11px",
          });
          children.append(child);
        }
        cadGroup.content.append(children);
      }
    }
    this.body.append(cadGroup.details);
    // The appearance controller may live outside the reparented tree.
    // Notify it after every full tree rebuild so eyes appear immediately.
    document.dispatchEvent(new Event("framelogic-instance-tree-rendered"));
  }

  private appendAssemblyNode(
    assemblyId: string,
    parent: HTMLElement,
    rendered: Set<string>,
  ): void {
    const assembly = this.options.designModel.assemblies.get(assemblyId);
    if (!assembly || rendered.has(assemblyId)) return;
    rendered.add(assemblyId);

    const allIds = this.options.designModel.getAssemblyPieceIdsDeep(assemblyId);
    const directMembers = assembly.pieceInstanceIds
      .map((id) => this.options.designModel.pieceInstances.get(id))
      .filter((member): member is PieceInstance => member !== undefined);
    const children = this.options.designModel.getAssemblyChildren(assemblyId);
    const selected = this.selectedAssemblyIds.has(assembly.id);

    const row = this.createSelectableRow(
      `▦ ${this.options.designModel.isAssemblyLocked(assembly.id) ? "🔒 " : ""}${assembly.name}`,
      `${allIds.length} pieza${allIds.length === 1 ? "" : "s"}${children.length ? ` · ${children.length} sub` : ""}`,
      selected,
      (event) => {
        this.focusedItem = { kind: "ASSEMBLY", id: assembly.id };
        this.selectAssembly(assembly.id, event.ctrlKey || event.metaKey);
      },
    );
    row.dataset["framelogicAssemblyId"] = assembly.id;
    row.title = "Clic = seleccionar ensamble completo · Ctrl = multiselección · clic derecho = opciones";
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.focusedItem = { kind: "ASSEMBLY", id: assembly.id };
      if (!this.selectedAssemblyIds.has(assembly.id)) {
        this.selectedAssemblyIds.clear();
        this.selectedAssemblyIds.add(assembly.id);
        this.updatingTreeSelection = true;
        try {
          this.options.designSelection.setSelection(allIds);
        } finally {
          this.updatingTreeSelection = false;
        }
      }
      this.showAssemblyContextMenu(
        event.clientX, event.clientY, assembly.id,
      );
    });
    parent.append(row);

    const items = document.createElement("div");
    items.dataset["framelogicAssemblyChildren"] = assembly.id;
    items.style.paddingLeft = "16px";
    for (const child of children) {
      this.appendAssemblyNode(child.id, items, rendered);
    }
    for (const member of directMembers) {
      items.append(this.createPieceRow(member.id));
    }
    parent.append(items);
  }


  private createPieceRow(instanceId: string): HTMLDivElement {
    const instance = this.options.designModel.pieceInstances.get(instanceId);
    const definition = instance
      ? this.options.designModel.pieceDefinitions.get(instance.definitionId)
      : undefined;
    const label = instance
      ? getInstanceDisplayName(instance, definition?.code, definition?.name)
      : `Pieza ${instanceId.slice(0, 8)}`;
    const row = this.createSelectableRow(
      `◇ ${label}`,
      instanceId.slice(0, 8),
      this.options.designSelection.isSelected(instanceId),
      (event) => {
        this.focusedItem = {
          kind: "PIECE",
          id: instanceId,
        };
        this.options.cancelActiveCommand();
        const additive = event.ctrlKey || event.metaKey;
        if (!additive) this.selectedAssemblyIds.clear();
        this.updatingTreeSelection = true;
        try {
          if (additive) {
            this.options.designSelection.toggle(instanceId);
          } else {
            this.options.cadReferenceBlocks.clearSelection();
            this.options.designSelection.selectSingle(instanceId);
          }
        } finally {
          this.updatingTreeSelection = false;
        }
        this.render();
      },
    );
    row.dataset["framelogicPieceId"] = instanceId;
    row.title = "F2 = renombrar · clic derecho = crear/mover/copiar a ensamble";
    row.addEventListener(
      "contextmenu",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.focusedItem = {
          kind: "PIECE",
          id: instanceId,
        };
        if (!this.options.designSelection.isSelected(instanceId)) {
          this.options.cadReferenceBlocks.clearSelection();
          this.options.designSelection.selectSingle(instanceId);
        }
        this.showSelectionContextMenu(
          event.clientX,
          event.clientY,
        );
      },
    );
    return row;
  }

  private selectAssembly(
    assemblyId: string,
    additive: boolean,
  ): void {
    this.options.cancelActiveCommand();
    const ids = this.options.designModel.getAssemblyPieceIdsDeep(assemblyId);
    const current = new Set(this.options.designSelection.getSelectedIds());
    if (!additive) {
      this.selectedAssemblyIds.clear();
      this.selectedAssemblyIds.add(assemblyId);
      current.clear();
      for (const id of ids) current.add(id);
      this.options.cadReferenceBlocks.clearSelection();
    } else {
      const wasSelected = this.selectedAssemblyIds.has(assemblyId);
      if (wasSelected) this.selectedAssemblyIds.delete(assemblyId);
      else this.selectedAssemblyIds.add(assemblyId);
      for (const id of ids) {
        if (wasSelected) current.delete(id);
        else current.add(id);
      }
    }
    this.updatingTreeSelection = true;
    try {
      this.options.designSelection.setSelection([...current]);
    } finally {
      this.updatingTreeSelection = false;
    }
    this.render();
  }


  private selectedLoosePieceIds(): string[] {
    const covered = new Set<string>();
    for (const assemblyId of this.selectedAssemblyIds) {
      for (const id of this.options.designModel.getAssemblyPieceIdsDeep(assemblyId)) {
        covered.add(id);
      }
    }
    return this.options.designSelection.getSelectedIds()
      .filter((id) => !covered.has(id))
      .filter((id) => this.options.designModel.pieceInstances.get(id) !== undefined);
  }

  private recordAssemblyHistory(
    label: string,
    before: ReturnType<DesignModel["captureAssemblies"]>,
  ): void {
    const after = this.options.designModel.captureAssemblies();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const restore = (snapshot: typeof before): void => {
      this.options.designModel.restoreAssemblies(snapshot);
      this.selectedAssemblyIds.clear();
      this.focusedItem = null;
      this.options.designScene.sync();
      this.refresh();
    };
    this.options.cadHistory.recordOperation(
      label,
      () => restore(before),
      () => restore(after),
    );
  }

  private createAssemblyFromSelection(): void {
    const model = this.options.designModel;
    const children = [...this.selectedAssemblyIds];
    const loose = this.selectedLoosePieceIds();
    if (children.length === 0 && loose.length === 0) {
      window.alert("Selecciona un ensamble completo o piezas sueltas.");
      return;
    }

    try {
      // Never take pieces from an existing group through '+ Grupo'.
      // The user must select that assembly row explicitly.
      for (const id of loose) {
        const owner = model.assemblies.findByPieceInstanceId(id)[0];
        if (owner) {
          throw new Error(
            `La pieza pertenece a "${owner.name}". Selecciona la fila del ENSAMBLE (Ctrl+clic para combinar) y no sus piezas internas.`,
          );
        }
      }
      const defaultName = `Ensamble ${model.assemblies.count + 1}`;
      const name = window.prompt("Nombre del ensamble", defaultName)?.trim();
      if (!name) return;
      const before = model.captureAssemblies();
      const created = model.createNestedAssembly({
        name,
        pieceInstanceIds: loose,
        childAssemblyIds: children,
      });
      this.selectedAssemblyIds.clear();
      this.selectedAssemblyIds.add(created.id);
      this.focusedItem = { kind: "ASSEMBLY", id: created.id };
      this.recordAssemblyHistory("Crear ensamble jerárquico", before);
      this.hideContextMenu();
      this.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  private moveSelectionToAssembly(assemblyId: string): void {
    const model = this.options.designModel;
    const childIds = [...this.selectedAssemblyIds]
      .filter((id) => id !== assemblyId);
    const looseIds = this.selectedLoosePieceIds();
    if (childIds.length === 0 && looseIds.length === 0) return;

    const before = model.captureAssemblies();
    try {
      // Prevalidate every move: no partial edits if a child would create
      // a cycle or a parent layer is locked.
      if (model.isAssemblyLocked(assemblyId)) {
        throw new Error("El ensamble de destino está bloqueado.");
      }
      for (const id of childIds) {
        if (model.isAssemblyLocked(id)
          || model.getAssemblyDescendantIds(id).includes(assemblyId)) {
          throw new Error("Ensamble bloqueado o relación circular: operación cancelada.");
        }
        if (model.getAssemblyDescendantIds(id).some(
          (descendantId) => childIds.includes(descendantId),
        )) {
          throw new Error(
            "Seleccionaste un ensamble y uno de sus subensambles. Selecciona solo el ensamble superior.",
          );
        }
      }
      for (const id of looseIds) {
        if (model.isPieceLocked(id)) {
          throw new Error("Hay piezas bloqueadas en la selección.");
        }
        if (model.assemblies.findByPieceInstanceId(id).length > 0) {
          throw new Error(
            "No se extraerán piezas de otro ensamble. Selecciona el ensamble completo para anidarlo.",
          );
        }
      }
      for (const id of childIds) model.setAssemblyParent(id, assemblyId);
      if (looseIds.length > 0) {
        model.movePieceInstancesToAssembly(assemblyId, looseIds);
      }
      this.selectedAssemblyIds.clear();
      this.selectedAssemblyIds.add(assemblyId);
      this.recordAssemblyHistory("Mover subensambles y piezas", before);
      this.hideContextMenu();
      this.refresh();
    } catch (error) {
      model.restoreAssemblies(before);
      window.alert(error instanceof Error ? error.message : String(error));
      this.refresh();
    }
  }

  private copySelectionToAssembly(assemblyId: string): void {
    const target = this.options.designModel.assemblies.get(assemblyId);
    if (!target) return;
    if (this.options.designModel.isAssemblyLocked(assemblyId)) {
      window.alert("No se pueden insertar piezas en un ensamble bloqueado.");
      return;
    }
    const selected = [
      ...this.options.designSelection.getSelectedIds(),
    ];
    const createdIds: string[] = [];

    for (const id of selected) {
      const source = this.options.designModel.pieceInstances.get(id);
      if (!source) continue;
      const definition = this.options.designModel.pieceDefinitions.get(
        source.definitionId,
      );
      const baseName = getInstanceDisplayName(
        source,
        definition?.code,
        definition?.name,
      );
      const copyName = `${baseName} copia`;
      const tags = setStoredInstanceName(
        source.tags,
        copyName,
      );
      const copy = this.options.designModel.registerPieceInstance({
        name: copyName,
        definitionId: source.definitionId,
        layerId: source.layerId,
        transform: {
          position: { ...source.transform.position },
          rotation: { ...source.transform.rotation },
        },
        tags,
      });
      createdIds.push(copy.id);
    }

    if (createdIds.length < 1) return;
    this.options.designScene.sync();
    this.options.designModel.assemblies.updatePieceInstanceIds(
      assemblyId,
      [
        ...target.pieceInstanceIds,
        ...createdIds,
      ],
    );
    this.options.designSelection.setSelection(createdIds);
    this.hideContextMenu();
    this.refresh();
  }

  private renameFocusedItem(): void {
    const focused = this.focusedItem;
    if (!focused) return;

    if (focused.kind === "ASSEMBLY") {
      const assembly = this.options.designModel.assemblies.get(focused.id);
      if (!assembly) return;
      const name = window.prompt(
        "Nuevo nombre del ensamble",
        assembly.name,
      )?.trim();
      if (!name) return;
      if (this.options.designModel.isAssemblyLocked(focused.id)) {
        window.alert("No se puede renombrar un ensamble bloqueado.");
        return;
      }
      const before = this.options.designModel.captureAssemblies();
      this.options.designModel.assemblies.updateName(focused.id, name);
      this.recordAssemblyHistory("Renombrar ensamble", before);
      this.refresh();
      return;
    }

    const instance = this.options.designModel.pieceInstances.get(focused.id);
    if (!instance) return;
    const definition = this.options.designModel.pieceDefinitions.get(
      instance.definitionId,
    );
    const currentName = getInstanceDisplayName(
      instance,
      definition?.code,
      definition?.name,
    );
    const name = window.prompt(
      "Nuevo nombre de la instancia",
      currentName,
    )?.trim();
    if (!name) return;
    if (this.options.designModel.isPieceLocked(focused.id)) {
      window.alert("No se puede renombrar una pieza de un ensamble bloqueado.");
      return;
    }

    this.options.designModel.pieceInstances.updateName(
      focused.id,
      name,
    );
    this.options.designModel.pieceInstances.updateTags(
      focused.id,
      setStoredInstanceName(
        instance.tags,
        name,
      ),
    );
    this.refresh();
  }

  private showSelectionContextMenu(
    x: number,
    y: number,
  ): void {
    const selected = this.options.designSelection.getSelectedIds();
    if (selected.length < 1) return;

    const entries: Array<{
      label: string;
      action: () => void;
    }> = [
      {
        label: "Crear ensamble con selección",
        action: () => this.createAssemblyFromSelection(),
      },
    ];

    for (const assembly of this.options.designModel.assemblies.getAll()) {
      entries.push(
        {
          label: `Mover selección a · ${assembly.name}`,
          action: () => this.moveSelectionToAssembly(assembly.id),
        },
        {
          label: `Copiar selección a · ${assembly.name}`,
          action: () => this.copySelectionToAssembly(assembly.id),
        },
      );
    }

    this.showContextMenu(x, y, entries);
  }

  private showAssemblyContextMenu(
    x: number,
    y: number,
    assemblyId: string,
  ): void {
    const assembly = this.options.designModel.assemblies.get(assemblyId);
    if (!assembly) return;
    const entries: Array<{
      label: string;
      action: () => void;
    }> = [
      {
        label: "Renombrar ensamble · F2",
        action: () => this.renameFocusedItem(),
      },
      {
        label: assembly.locked ? "Desbloquear ensamble" : "Bloquear ensamble y subensambles",
        action: () => {
          try {
            const model = this.options.designModel;
            const before = model.captureAssemblies();
            model.setAssemblyLocked(assemblyId, !assembly.locked);
            this.recordAssemblyHistory("Bloqueo de ensamble", before);
            this.refresh();
          } catch (error) {
            window.alert(error instanceof Error ? error.message : String(error));
          }
        },
      },
    ];

    if (assembly.parentAssemblyId) {
      entries.push({
        label: "Desanidar ensamble (llevar a raíz)",
        action: () => {
          const model = this.options.designModel;
          const before = model.captureAssemblies();
          try {
            model.setAssemblyParent(assemblyId, null);
            this.recordAssemblyHistory("Desanidar ensamble", before);
            this.refresh();
          } catch (error) {
            window.alert(error instanceof Error ? error.message : String(error));
          }
        },
      });
    }

    if (this.selectedAssemblyIds.size > 0
      || this.selectedLoosePieceIds().length > 0) {
      entries.push({
        label: "Anidar ensambles / mover piezas sueltas aquí",
        action: () => this.moveSelectionToAssembly(assemblyId),
      });
    }

    entries.push({
      label: "Crear ensamble superior con selección",
      action: () => this.createAssemblyFromSelection(),
    });

    entries.push({
      label: "Desagrupar (conservar piezas y subensambles)",
      action: () => {
        const model = this.options.designModel;
        const before = model.captureAssemblies();
        try {
          model.removeAssembly(assemblyId);
          this.selectedAssemblyIds.delete(assemblyId);
          this.focusedItem = null;
          this.recordAssemblyHistory("Desagrupar ensamble", before);
          this.refresh();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : String(error));
        }
      },
    });

    this.showContextMenu(x, y, entries);
  }


  private showContextMenu(
    x: number,
    y: number,
    entries: readonly {
      readonly label: string;
      readonly action: () => void;
    }[],
  ): void {
    this.hideContextMenu();
    const menu = document.createElement("div");
    Object.assign(menu.style, {
      position: "fixed",
      left: `${x}px`,
      top: `${y}px`,
      zIndex: "10000",
      minWidth: "220px",
      maxHeight: "60vh",
      overflow: "auto",
      padding: "4px",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: "5px",
      background: "rgba(19,27,33,0.98)",
      boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
      font: "12px system-ui, sans-serif",
    });

    for (const entry of entries) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = entry.label;
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
      button.addEventListener("mouseenter", () => {
        button.style.background = "rgba(100,190,230,0.16)";
      });
      button.addEventListener("mouseleave", () => {
        button.style.background = "transparent";
      });
      button.addEventListener("click", () => {
        entry.action();
        this.hideContextMenu();
      });
      menu.append(button);
    }

    document.body.append(menu);
    this.contextMenu = menu;
  }

  private hideContextMenu(): void {
    this.contextMenu?.remove();
    this.contextMenu = null;
  }

  private collectCadReferences(): Array<{
    referenceName: string;
    layers: Array<{
      sourceLayerName: string;
      visible: boolean;
    }>;
  }> {
    const groups = new Map<
      string,
      Array<{ sourceLayerName: string; visible: boolean }>
    >();
    for (const layer of this.options.designModel.layers.getAll()) {
      const parsed = parseCadReferenceLayerName(layer);
      if (!parsed) continue;
      const list = groups.get(parsed.referenceName) ?? [];
      list.push({
        sourceLayerName: parsed.sourceLayerName,
        visible: layer.visible,
      });
      groups.set(parsed.referenceName, list);
    }
    return [...groups.entries()]
      .map(([referenceName, layers]) => ({
        referenceName,
        layers: layers.sort((a, b) =>
          a.sourceLayerName.localeCompare(b.sourceLayerName),
        ),
      }))
      .sort((a, b) => a.referenceName.localeCompare(b.referenceName));
  }

  private createGroup(
    title: string,
    open: boolean,
  ): {
    details: HTMLDetailsElement;
    content: HTMLDivElement;
  } {
    const details = document.createElement("details");
    details.open = open;
    const header = document.createElement("summary");
    header.textContent = title;
    Object.assign(header.style, {
      padding: "6px 8px",
      cursor: "pointer",
      color: "#dce8ed",
      fontWeight: "600",
      userSelect: "none",
      borderBottom: "1px solid rgba(255,255,255,0.05)",
    });
    const content = document.createElement("div");
    details.append(header, content);
    return { details, content };
  }

  private createSelectableRow(
    title: string,
    meta: string,
    selected: boolean,
    onClick: (event: MouseEvent) => void,
  ): HTMLDivElement {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: "8px",
      alignItems: "center",
      padding: "5px 8px",
      cursor: "pointer",
      borderBottom: "1px solid rgba(255,255,255,0.035)",
      background: selected
        ? "rgba(88,180,220,0.20)"
        : "transparent",
      color: selected ? "#dff6ff" : "#c8d5db",
      userSelect: "none",
    });
    const name = document.createElement("span");
    name.textContent = title;
    name.style.overflow = "hidden";
    name.style.textOverflow = "ellipsis";
    name.style.whiteSpace = "nowrap";
    const info = document.createElement("span");
    info.textContent = meta;
    info.style.color = "#7f949e";
    info.style.fontSize = "10px";
    row.append(name, info);
    row.addEventListener("click", onClick);
    return row;
  }

  private createEmpty(text: string): HTMLDivElement {
    const empty = document.createElement("div");
    empty.textContent = text;
    Object.assign(empty.style, {
      padding: "5px 10px",
      color: "#70838c",
      fontSize: "11px",
    });
    return empty;
  }

  private createPanel(container: HTMLElement): HTMLDivElement {
    const panel = document.createElement("div");
    panel.dataset["framelogicInstanceTree"] = "true";
    Object.assign(panel.style, {
      position: "absolute",
      left: "16px",
      top: "146px",
      zIndex: "118",
      width: "310px",
      maxWidth: "calc(100% - 32px)",
      maxHeight: "calc(100% - 220px)",
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.14)",
      borderRadius: "6px",
      background: "rgba(20,28,34,0.95)",
      color: "#e8f0f4",
      boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
      font: "12px system-ui, sans-serif",
    });

    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "grid",
      gridTemplateColumns: "1fr auto auto",
      gap: "5px",
      alignItems: "center",
      padding: "7px 8px",
      borderBottom: "1px solid rgba(255,255,255,0.09)",
      background: "rgba(255,255,255,0.035)",
    });
    const title = document.createElement("strong");
    title.textContent = "INSTANCIAS";

    const addAssembly = document.createElement("button");
    addAssembly.type = "button";
    addAssembly.dataset["framelogicInstanceTreeAddAssembly"] = "true";
    addAssembly.textContent = "+ Grupo";
    addAssembly.title = "Crear ensamble con las piezas seleccionadas";
    Object.assign(addAssembly.style, {
      height: "22px",
      padding: "0 6px",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "4px",
      background: "rgba(255,255,255,0.05)",
      color: "#e8f0f4",
      cursor: "pointer",
      font: "11px system-ui, sans-serif",
    });

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.dataset["framelogicInstanceTreeToggle"] = "true";
    toggle.textContent = "−";
    Object.assign(toggle.style, {
      width: "24px",
      height: "22px",
      padding: "0",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "4px",
      background: "rgba(255,255,255,0.05)",
      color: "#e8f0f4",
      cursor: "pointer",
    });
    header.append(title, addAssembly, toggle);

    const body = document.createElement("div");
    body.dataset["framelogicInstanceTreeBody"] = "true";
    Object.assign(body.style, {
      maxHeight: "calc(100vh - 285px)",
      overflow: "auto",
    });

    panel.append(header, body);
    container.append(panel);
    return panel;
  }
}

function getStoredInstanceName(
  tags: readonly string[],
): string | undefined {
  const tag = tags.find((value) =>
    value.startsWith(INSTANCE_NAME_TAG_PREFIX),
  );
  return tag
    ? tag.slice(INSTANCE_NAME_TAG_PREFIX.length)
    : undefined;
}

function setStoredInstanceName(
  tags: readonly string[],
  name: string,
): string[] {
  return [
    ...tags.filter((value) =>
      !value.startsWith(INSTANCE_NAME_TAG_PREFIX),
    ),
    `${INSTANCE_NAME_TAG_PREFIX}${name}`,
  ];
}

function getInstanceDisplayName(
  instance: PieceInstance,
  definitionCode?: string,
  definitionName?: string,
): string {
  const custom =
    instance.name
    ?? getStoredInstanceName(instance.tags);
  if (custom) return custom;
  if (definitionCode && definitionName) {
    return `${definitionCode} · ${definitionName}`;
  }
  return definitionCode
    ?? definitionName
    ?? `Pieza ${instance.id.slice(0, 8)}`;
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
