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
      () => this.render(),
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
        `${assembly.id}:${assembly.name}:${assembly.pieceInstanceIds.join(",")}`,
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
    if (assemblies.length < 1) {
      assemblyGroup.content.append(this.createEmpty("Sin ensambles"));
    }
    else {
      for (const assembly of assemblies) {
        const members = assembly.pieceInstanceIds
          .map((id) => this.options.designModel.pieceInstances.get(id))
          .filter((value): value is PieceInstance => value !== undefined);
        const allSelected = members.length > 0
          && members.every((member) =>
            this.options.designSelection.isSelected(member.id),
          );
        const row = this.createSelectableRow(
          `▦ ${assembly.name}`,
          `${members.length} pieza${members.length === 1 ? "" : "s"}`,
          allSelected,
          (event) => {
            this.focusedItem = {
              kind: "ASSEMBLY",
              id: assembly.id,
            };
            this.selectAssembly(
              assembly.pieceInstanceIds,
              event.ctrlKey || event.metaKey,
            );
          },
        );
        // Stable identity for the eye/color controllers, including when the
        // instance tree is reparented outside its original viewport.
        row.dataset["framelogicAssemblyId"] = assembly.id;
        row.title = "F2 = renombrar · clic derecho = opciones de ensamble";
        row.addEventListener(
          "contextmenu",
          (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.focusedItem = {
              kind: "ASSEMBLY",
              id: assembly.id,
            };
            this.showAssemblyContextMenu(
              event.clientX,
              event.clientY,
              assembly.id,
            );
          },
        );
        assemblyGroup.content.append(row);

        const children = document.createElement("div");
        children.style.paddingLeft = "16px";
        for (const member of members) {
          children.append(
            this.createPieceRow(member.id),
          );
        }
        assemblyGroup.content.append(children);
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
        if (additive) {
          this.options.designSelection.toggle(instanceId);
        }
        else {
          this.options.cadReferenceBlocks.clearSelection();
          this.options.designSelection.selectSingle(instanceId);
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
    instanceIds: readonly string[],
    additive: boolean,
  ): void {
    this.options.cancelActiveCommand();
    const selectableIds = instanceIds.filter((id) =>
      this.options.designModel.pieceInstances.get(id) !== undefined,
    );
    if (!additive) {
      this.options.cadReferenceBlocks.clearSelection();
      this.options.designSelection.setSelection(selectableIds);
      this.render();
      return;
    }

    const current = new Set(this.options.designSelection.getSelectedIds());
    const allSelected = selectableIds.length > 0
      && selectableIds.every((id) => current.has(id));
    for (const id of selectableIds) {
      if (allSelected) current.delete(id);
      else current.add(id);
    }
    this.options.designSelection.setSelection([...current]);
    this.render();
  }

  private createAssemblyFromSelection(): void {
    const selected = [
      ...this.options.designSelection.getSelectedIds(),
    ].filter((id) =>
      this.options.designModel.pieceInstances.get(id) !== undefined,
    );
    if (selected.length < 1) {
      window.alert("Selecciona una o varias piezas para crear el ensamble.");
      return;
    }

    const defaultName =
      `Ensamble ${this.options.designModel.assemblies.count + 1}`;
    const name = window.prompt(
      "Nombre del ensamble",
      defaultName,
    )?.trim();
    if (!name) return;

    // Grouping validates the whole operation before changing old groups.
    const assembly = this.options.designModel.groupPieceInstances({
      name,
      pieceInstanceIds: selected,
    });
    this.focusedItem = {
      kind: "ASSEMBLY",
      id: assembly.id,
    };
    this.hideContextMenu();
    this.refresh();
  }

  private moveSelectionToAssembly(assemblyId: string): void {
    const selected = [
      ...this.options.designSelection.getSelectedIds(),
    ].filter((id) =>
      this.options.designModel.pieceInstances.get(id) !== undefined,
    );
    if (selected.length < 1) return;

    const moved = this.options.designModel.movePieceInstancesToAssembly(
      assemblyId,
      selected,
    );
    if (!moved) return;

    this.hideContextMenu();
    this.refresh();
  }

  private copySelectionToAssembly(assemblyId: string): void {
    const target = this.options.designModel.assemblies.get(assemblyId);
    if (!target) return;
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
      this.options.designModel.assemblies.updateName(
        focused.id,
        name,
      );
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
    ];

    if (this.options.designSelection.getSelectedIds().length > 0) {
      entries.push(
        {
          label: "Mover selección aquí",
          action: () => this.moveSelectionToAssembly(assemblyId),
        },
        {
          label: "Copiar selección aquí",
          action: () => this.copySelectionToAssembly(assemblyId),
        },
      );
    }

    entries.push({
      label: "Desagrupar ensamble (conservar piezas)",
      action: () => {
        this.options.designModel.assemblies.remove(assemblyId);
        this.focusedItem = null;
        this.hideContextMenu();
        this.refresh();
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
