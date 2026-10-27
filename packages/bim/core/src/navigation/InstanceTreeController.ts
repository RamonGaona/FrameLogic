import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSelectionController,
} from "../interaction/DesignSelectionController";

import {
  parseCadReferenceLayerName,
} from "../import/CadReferenceBlockController";

import type {
  CadReferenceBlockController,
} from "../import/CadReferenceBlockController";

export interface InstanceTreeControllerOptions {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly designSelection: DesignSelectionController;
  readonly cadReferenceBlocks: CadReferenceBlockController;
  readonly cancelActiveCommand: () => void;
}

/**
 * Árbol jerárquico del Model Space.
 *
 * - Ensambles muestran las PieceInstance que contienen.
 * - Piezas que no pertenecen a ensamble aparecen como instancias sueltas.
 * - Cada DWG/DXF aparece como un bloque con sus capas originales debajo.
 * - Ctrl/Cmd permite selección múltiple, igual que en el Model Space.
 */
export class InstanceTreeController {
  private readonly options: InstanceTreeControllerOptions;
  private readonly panel: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly unsubscribeSelection: () => void;
  private readonly unsubscribeLayers: () => void;
  private readonly timer: number;
  private expanded = true;
  private lastSignature = "";
  private disposed = false;

  constructor(
    options: InstanceTreeControllerOptions,
  ) {
    this.options = options;
    this.panel = this.createPanel(options.container);
    this.toggle = this.panel.querySelector<HTMLButtonElement>(
      '[data-framelogic-instance-tree-toggle="true"]',
    )!;
    this.body = this.panel.querySelector<HTMLDivElement>(
      '[data-framelogic-instance-tree-body="true"]',
    )!;

    this.toggle.addEventListener(
      "click",
      this.handleToggle,
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
      .map((instance) => `${instance.id}:${instance.definitionId}`)
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
          .filter((value): value is NonNullable<typeof value> => value !== undefined);
        const allSelected = members.length > 0
          && members.every((member) =>
            this.options.designSelection.isSelected(member.id),
          );
        const row = this.createSelectableRow(
          `▦ ${assembly.name}`,
          `${members.length} pieza${members.length === 1 ? "" : "s"}`,
          allSelected,
          (event) => this.selectAssembly(
            assembly.pieceInstanceIds,
            event.ctrlKey || event.metaKey,
          ),
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
  }

  private createPieceRow(instanceId: string): HTMLDivElement {
    const instance = this.options.designModel.pieceInstances.get(instanceId);
    const definition = instance
      ? this.options.designModel.pieceDefinitions.get(instance.definitionId)
      : undefined;
    const label = definition
      ? `${definition.code} · ${definition.name}`
      : `Pieza ${instanceId.slice(0, 8)}`;
    return this.createSelectableRow(
      `◇ ${label}`,
      instanceId.slice(0, 8),
      this.options.designSelection.isSelected(instanceId),
      (event) => {
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
      top: "106px",
      zIndex: "118",
      width: "310px",
      maxWidth: "calc(100% - 32px)",
      maxHeight: "calc(100% - 190px)",
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
      gridTemplateColumns: "1fr auto",
      alignItems: "center",
      padding: "7px 8px",
      borderBottom: "1px solid rgba(255,255,255,0.09)",
      background: "rgba(255,255,255,0.035)",
    });
    const title = document.createElement("strong");
    title.textContent = "INSTANCIAS";
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
    header.append(title, toggle);

    const body = document.createElement("div");
    body.dataset["framelogicInstanceTreeBody"] = "true";
    Object.assign(body.style, {
      maxHeight: "calc(100vh - 245px)",
      overflow: "auto",
    });

    panel.append(header, body);
    container.append(panel);
    return panel;
  }
}
