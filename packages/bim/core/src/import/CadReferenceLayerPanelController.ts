import type {
  DesignLayer,
  DesignModel,
} from "@framelogic/domain";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

export interface CadReferenceLayerPanelControllerOptions {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly cadLineScene: CadLineSceneController;
  readonly cadPointScene: CadPointSceneController;
  readonly clearGeometryQueryCache: () => void;
}

interface CadLayerEntry {
  readonly referenceName: string;
  readonly sourceLayerName: string;
  readonly layer: DesignLayer;
}

const CAD_LAYER_PREFIX =
  "CAD ";
const CAD_LAYER_SEPARATOR =
  " · ";

/**
 * Panel independiente para las capas internas de DWG/DXF.
 *
 * Las capas CAD importadas siguen existiendo en el dominio para conservar
 * visibilidad y SNAP por layer, pero se presentan como una referencia/bloque
 * agrupada por archivo en vez de mezclarse con los layers normales del modelo.
 */
export class CadReferenceLayerPanelController {
  private readonly options:
    CadReferenceLayerPanelControllerOptions;
  private readonly toggle:
    HTMLButtonElement;
  private readonly panel:
    HTMLDivElement;
  private expanded =
    false;
  private readonly unsubscribeLayers:
    () => void;
  private disposed =
    false;

  constructor(
    options:
      CadReferenceLayerPanelControllerOptions,
  ) {
    this.options =
      options;
    this.toggle =
      this.createToggle(
        options.container,
      );
    this.panel =
      this.createPanel(
        options.container,
      );
    this.unsubscribeLayers =
      options.designModel.layers
        .subscribe(
          () => {
            this.ensureImportedLayersLocked();
            this.render();
          },
        );

    this.ensureImportedLayersLocked();
    this.render();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed =
      true;
    this.unsubscribeLayers();
    this.toggle.remove();
    this.panel.remove();
  }

  ensureImportedLayersLocked(): void {
    let changed =
      false;
    for (
      const layer
      of this.options.designModel.layers.getAll()
    ) {
      if (
        !isCadReferenceLayer(layer)
        || layer.locked
      ) {
        continue;
      }
      this.options.designModel.layers.update(
        layer.id,
        {
          locked: true,
        },
      );
      changed =
        true;
    }

    if (changed) {
      this.syncCadGeometry();
    }
  }

  private createToggle(
    container:
      HTMLElement,
  ):
    HTMLButtonElement {
    const button =
      document.createElement("button");
    button.type =
      "button";
    button.textContent =
      "▸ Capas CAD";
    button.title =
      "Mostrar capas internas de referencias DWG/DXF";
    Object.assign(
      button.style,
      {
        padding: "5px 8px",
        border: "1px solid rgba(255,255,255,0.16)",
        borderRadius: "4px",
        background: "#27343c",
        color: "#f3f7f9",
        cursor: "pointer",
        font: "12px system-ui, sans-serif",
      },
    );
    button.addEventListener(
      "click",
      () => {
        this.expanded =
          !this.expanded;
        button.textContent =
          this.expanded
            ? "▾ Capas CAD"
            : "▸ Capas CAD";
        this.panel.style.display =
          this.expanded
            ? "block"
            : "none";
        if (this.expanded) {
          this.render();
        }
      },
    );

    const projectBar =
      container.querySelector<HTMLElement>(
        '[data-framelogic-project-toolbar="true"]',
      );
    if (projectBar) {
      projectBar.append(button);
    }
    else {
      Object.assign(
        button.style,
        {
          position: "absolute",
          left: "16px",
          top: "84px",
          zIndex: "124",
        },
      );
      container.append(button);
    }
    return button;
  }

  private createPanel(
    container:
      HTMLElement,
  ):
    HTMLDivElement {
    const panel =
      document.createElement("div");
    panel.dataset["framelogicCadLayerPanel"] =
      "true";
    Object.assign(
      panel.style,
      {
        position: "absolute",
        left: "16px",
        top: "92px",
        zIndex: "123",
        display: "none",
        width: "300px",
        maxWidth: "calc(100% - 32px)",
        maxHeight: "52vh",
        overflow: "auto",
        padding: "8px",
        border: "1px solid rgba(255,255,255,0.16)",
        borderRadius: "6px",
        background: "rgba(18,25,30,0.96)",
        color: "#eef4f7",
        boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
        font: "12px system-ui, sans-serif",
      },
    );
    container.append(panel);
    return panel;
  }

  private render(): void {
    if (this.disposed) {
      return;
    }

    this.panel.replaceChildren();
    const entries =
      this.getCadLayerEntries();

    if (entries.length < 1) {
      const empty =
        document.createElement("div");
      empty.textContent =
        "No hay referencias DWG/DXF importadas.";
      empty.style.color =
        "#9fb0ba";
      this.panel.append(empty);
      return;
    }

    const groups =
      new Map<
        string,
        CadLayerEntry[]
      >();
    for (const entry of entries) {
      const list =
        groups.get(
          entry.referenceName,
        )
        ?? [];
      list.push(entry);
      groups.set(
        entry.referenceName,
        list,
      );
    }

    for (
      const [
        referenceName,
        layers,
      ]
      of groups
    ) {
      const group =
        document.createElement("div");
      Object.assign(
        group.style,
        {
          marginBottom: "8px",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: "5px",
          overflow: "hidden",
        },
      );

      const header =
        document.createElement("div");
      Object.assign(
        header.style,
        {
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          alignItems: "center",
          gap: "5px",
          padding: "6px",
          background: "rgba(255,255,255,0.05)",
        },
      );

      const title =
        document.createElement("strong");
      title.textContent =
        referenceName;
      title.title =
        "Referencia CAD agrupada. Las entidades internas permanecen bloqueadas como un solo archivo de referencia.";

      const allVisible =
        layers.every(
          (entry) =>
            entry.layer.visible,
        );
      const allSnap =
        layers.every(
          (entry) =>
            entry.layer.snapEnabled,
        );

      const visibility =
        makeSmallButton(
          allVisible
            ? "👁"
            : "○",
          allVisible
            ? "Ocultar referencia CAD completa"
            : "Mostrar referencia CAD completa",
        );
      visibility.addEventListener(
        "click",
        () => {
          this.updateLayers(
            layers,
            {
              visible:
                !allVisible,
            },
          );
        },
      );

      const snap =
        makeSmallButton(
          allSnap
            ? "S"
            : "S̶",
          allSnap
            ? "Desactivar SNAP de toda la referencia"
            : "Activar SNAP de toda la referencia",
        );
      snap.addEventListener(
        "click",
        () => {
          this.updateLayers(
            layers,
            {
              snapEnabled:
                !allSnap,
            },
          );
        },
      );

      header.append(
        title,
        visibility,
        snap,
      );
      group.append(header);

      const badge =
        document.createElement("div");
      badge.textContent =
        `🔒 bloque de referencia · ${layers.length} capa${layers.length === 1 ? "" : "s"}`;
      Object.assign(
        badge.style,
        {
          padding: "4px 6px",
          color: "#a9bac4",
          fontSize: "11px",
        },
      );
      group.append(badge);

      for (
        const entry
        of layers.sort(
          (
            left,
            right,
          ) =>
            left.sourceLayerName
              .localeCompare(
                right.sourceLayerName,
              ),
        )
      ) {
        const row =
          document.createElement("div");
        Object.assign(
          row.style,
          {
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            alignItems: "center",
            gap: "5px",
            padding: "4px 6px 4px 14px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
          },
        );

        const name =
          document.createElement("span");
        name.textContent =
          entry.sourceLayerName;
        name.title =
          `Layer original: ${entry.sourceLayerName}`;
        name.style.overflow =
          "hidden";
        name.style.textOverflow =
          "ellipsis";
        name.style.whiteSpace =
          "nowrap";

        const eye =
          makeSmallButton(
            entry.layer.visible
              ? "👁"
              : "○",
            entry.layer.visible
              ? "Ocultar capa CAD"
              : "Mostrar capa CAD",
          );
        eye.addEventListener(
          "click",
          () => {
            this.updateLayers(
              [entry],
              {
                visible:
                  !entry.layer.visible,
              },
            );
          },
        );

        const layerSnap =
          makeSmallButton(
            entry.layer.snapEnabled
              ? "S"
              : "S̶",
            entry.layer.snapEnabled
              ? "Desactivar SNAP de esta capa"
              : "Activar SNAP de esta capa",
          );
        layerSnap.addEventListener(
          "click",
          () => {
            this.updateLayers(
              [entry],
              {
                snapEnabled:
                  !entry.layer.snapEnabled,
              },
            );
          },
        );

        row.append(
          name,
          eye,
          layerSnap,
        );
        group.append(row);
      }

      this.panel.append(group);
    }
  }

  private getCadLayerEntries():
    CadLayerEntry[] {
    const result:
      CadLayerEntry[] = [];
    for (
      const layer
      of this.options.designModel.layers.getAll()
    ) {
      const parsed =
        parseCadLayerName(
          layer.name,
        );
      if (!parsed) {
        continue;
      }
      result.push({
        ...parsed,
        layer,
      });
    }
    return result;
  }

  private updateLayers(
    entries:
      readonly CadLayerEntry[],
    input: {
      readonly visible?: boolean;
      readonly snapEnabled?: boolean;
    },
  ): void {
    for (const entry of entries) {
      this.options.designModel.layers.update(
        entry.layer.id,
        {
          ...input,
          locked: true,
        },
      );
    }
    this.syncCadGeometry();
    this.render();
  }

  private syncCadGeometry(): void {
    this.options.cadLineScene.sync();
    this.options.cadPointScene.sync();
    this.options.clearGeometryQueryCache();
  }
}

export function isCadReferenceLayer(
  layer:
    Pick<DesignLayer, "name">,
): boolean {
  return parseCadLayerName(
    layer.name,
  ) !== null;
}

function parseCadLayerName(
  name:
    string,
): {
  readonly referenceName: string;
  readonly sourceLayerName: string;
} | null {
  if (!name.startsWith(CAD_LAYER_PREFIX)) {
    return null;
  }

  const body =
    name.slice(
      CAD_LAYER_PREFIX.length,
    );
  const separator =
    body.indexOf(
      CAD_LAYER_SEPARATOR,
    );
  if (separator <= 0) {
    return null;
  }

  const referenceName =
    body.slice(
      0,
      separator,
    ).trim();
  const sourceLayerName =
    body.slice(
      separator
      + CAD_LAYER_SEPARATOR.length,
    ).trim();
  if (
    !referenceName
    || !sourceLayerName
  ) {
    return null;
  }

  return {
    referenceName,
    sourceLayerName,
  };
}

function makeSmallButton(
  label:
    string,
  title:
    string,
): HTMLButtonElement {
  const button =
    document.createElement("button");
  button.type =
    "button";
  button.textContent =
    label;
  button.title =
    title;
  Object.assign(
    button.style,
    {
      minWidth: "26px",
      height: "24px",
      padding: "2px 5px",
      border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "4px",
      background: "rgba(255,255,255,0.05)",
      color: "#eef4f7",
      cursor: "pointer",
      font: "11px system-ui, sans-serif",
    },
  );
  return button;
}
