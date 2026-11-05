import type {
  DesignModel,
  FrameLogicEngineeringModel,
  PieceCommercialData,
  PieceEngineeringData,
  PieceMaterialData,
  PiecePhysicalData,
} from "@framelogic/domain";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";


export interface PieceFrameLogicWorkspaceActions {
  readonly startPreparation: (
    instanceId: string,
  ) => void;
  readonly stopPreparation: () => void;
  readonly startOriginSnap: () => void;
  readonly addSnapsFromSelection: () => number;
  readonly addAxesFromSelection: () => number;
  readonly setIsoView: () => Promise<void>;
}


type InputMap =
  Record<
    string,
    HTMLInputElement
  >;


const FRAMELOGIC_READY_TAG =
  "FRAMELOGIC_READY";


function hasUserDefinedEngineering(
  value:
    PieceEngineeringData
    | undefined,
): boolean {
  if (!value) {
    return false;
  }

  return Boolean(
    value.revision
    || value.material
    || value.commercial
    || value.physical
    || value.structuralAxis
    || value.features.some(
      (
        feature,
      ) =>
        feature.source
          === "FRAMELOGIC"
        || feature.source
          === "MANUAL",
    )
  );
}


export class PieceFrameLogicWorkspaceController {
  private readonly container:
    HTMLElement;

  private readonly canvas:
    HTMLElement;

  private readonly designModel:
    DesignModel;

  private readonly selection:
    DesignSelectionController;

  private readonly engineeringModel:
    FrameLogicEngineeringModel;

  private readonly actions:
    PieceFrameLogicWorkspaceActions;

  private readonly hiddenElements =
    new Map<
      HTMLElement,
      string
    >();

  private menu:
    HTMLDivElement
    | null =
      null;

  private workspace:
    HTMLDivElement
    | null =
      null;

  private statusElement:
    HTMLDivElement
    | null =
      null;

  private inputs:
    InputMap =
      {};

  private activeInstanceId:
    string
    | null =
      null;

  private disposed =
    false;


  constructor(
    container: HTMLElement,
    canvas: HTMLElement,
    designModel: DesignModel,
    selection: DesignSelectionController,
    engineeringModel: FrameLogicEngineeringModel,
    actions: PieceFrameLogicWorkspaceActions,
  ) {
    this.container =
      container;
    this.canvas =
      canvas;
    this.designModel =
      designModel;
    this.selection =
      selection;
    this.engineeringModel =
      engineeringModel;
    this.actions =
      actions;

    this.canvas.addEventListener(
      "contextmenu",
      this.handleContextMenu,
    );

    document.addEventListener(
      "pointerdown",
      this.handleDocumentPointerDown,
    );
  }


  private readonly handleContextMenu =
    (
      event: MouseEvent,
    ): void => {
      if (
        this.disposed
        || this.workspace
      ) {
        return;
      }

      const instanceId =
        this.selection
          .getInstanceIdAt(
            event.clientX,
            event.clientY,
          );
      const selectedIds =
        this.selection
          .getSelectedIds();

      if (
        !instanceId
        || selectedIds.length
          !== 1
        || selectedIds[0]
          !== instanceId
      ) {
        this.hideMenu();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      this.showMenu(
        event.clientX,
        event.clientY,
        instanceId,
      );
    };


  private readonly handleDocumentPointerDown =
    (
      event: PointerEvent,
    ): void => {
      if (
        this.menu
        && event.target
          instanceof Node
        && !this.menu.contains(
          event.target,
        )
      ) {
        this.hideMenu();
      }
    };


  private showMenu(
    x: number,
    y: number,
    instanceId: string,
  ): void {
    this.hideMenu();

    const instance =
      this.designModel
        .pieceInstances
        .get(
          instanceId,
        );

    if (!instance) {
      return;
    }

    const engineering =
      this.engineeringModel
        .pieces
        .get(
          instance.definitionId,
        );

    const isFrameLogic =
      instance.tags.includes(
        FRAMELOGIC_READY_TAG,
      )
      || hasUserDefinedEngineering(
        engineering,
      );

    const menu =
      document.createElement(
        "div",
      );

    Object.assign(
      menu.style,
      {
        position:
          "fixed",
        left:
          `${x}px`,
        top:
          `${y}px`,
        zIndex:
          "10000",
        minWidth:
          "230px",
        padding:
          "6px",
        border:
          "1px solid #596875",
        borderRadius:
          "6px",
        background:
          "#1f2933",
        boxShadow:
          "0 8px 24px rgba(0,0,0,0.35)",
      },
    );

    const button =
      this.createButton(
        isFrameLogic
          ? "Editar pieza FrameLogic"
          : "Convertir a pieza FrameLogic",
        () => {
          this.hideMenu();
          this.enterWorkspace(
            instanceId,
          );
        },
      );

    button.style.width =
      "100%";
    button.style.textAlign =
      "left";

    menu.appendChild(
      button,
    );
    document.body.appendChild(
      menu,
    );
    this.menu =
      menu;
  }


  private enterWorkspace(
    instanceId: string,
  ): void {
    const instance =
      this.designModel
        .pieceInstances
        .get(
          instanceId,
        );

    if (
      !instance
      || this.workspace
    ) {
      return;
    }

    const definition =
      this.designModel
        .pieceDefinitions
        .get(
          instance.definitionId,
        );

    if (!definition) {
      return;
    }

    this.selection.selectSingle(
      instanceId,
    );

    if (
      !this.selection
        .isolateSelection()
    ) {
      return;
    }

    this.activeInstanceId =
      instanceId;

    this.hideMainUi();
    this.buildWorkspace(
      definition.id,
      definition.code,
      definition.name,
      definition.classification,
    );

    // Iniciar ANTES de dibujar LINE/POINT. Si se esperase hasta pulsar
    // "Línea → eje", la preparación ocultaría la capa donde el usuario
    // ya dibujó los objetos CAD, dando la impresión de que se borraron.
    this.startPreparation();

    // Indica a toda la UI que el editor aislado tiene prioridad
    // sobre las barras del espacio modelo, incluso si otro layout
    // vuelve a aplicar display a sus controles.
    document.documentElement.setAttribute(
      "data-framelogic-piece-workspace-active",
      "true",
    );

    void this.actions
      .setIsoView();
  }


  private buildWorkspace(
    definitionId: string,
    code: string,
    name: string,
    classification?: string,
  ): void {
    const current =
      this.engineeringModel
        .pieces
        .get(
          definitionId,
        );

    const workspace =
      document.createElement(
        "div",
      );

    Object.assign(
      workspace.style,
      {
        position:
          "absolute",
        inset:
          "0",
        zIndex:
          "80",
        pointerEvents:
          "none",
        fontFamily:
          "Arial, sans-serif",
      },
    );

    const topBar =
      document.createElement(
        "div",
      );

    Object.assign(
      topBar.style,
      {
        position:
          "absolute",
        top:
          "12px",
        left:
          "12px",
        right:
          "180px",
        display:
          "flex",
        alignItems:
          "center",
        gap:
          "10px",
        padding:
          "8px 12px",
        border:
          "1px solid #4b5563",
        borderRadius:
          "7px",
        background:
          "rgba(31,41,51,0.96)",
        color:
          "white",
        pointerEvents:
          "auto",
      },
    );

    const title =
      document.createElement(
        "strong",
      );
    title.textContent =
      `Pieza FrameLogic · ${code}`;

    const detail =
      document.createElement(
        "span",
      );
    detail.textContent =
      `${name}${
        classification
          ? ` · ${classification}`
          : ""
      } · solo esta pieza está visible`;
    detail.style.fontSize =
      "12px";
    detail.style.opacity =
      "0.72";

    const back =
      this.createButton(
        "Volver al modelo",
        () => {
          this.exitWorkspace();
        },
      );
    back.style.marginLeft =
      "auto";

    topBar.append(
      title,
      detail,
      back,
    );

    // Una sola columna lateral para metadata plegable y preparación.
    // La geometría permanece visible porque ningún panel invade
    // el centro del visor; el sidebar puede desplazarse verticalmente.
    const sidebar = document.createElement("aside");
    sidebar.dataset["framelogicPieceEditorSidebar"] = "true";
    Object.assign(sidebar.style, {
      position: "absolute",
      top: "68px",
      left: "12px",
      bottom: "12px",
      width: "min(340px, calc(100vw - 24px))",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      gap: "8px",
      overflowX: "hidden",
      overflowY: "auto",
      pointerEvents: "auto",
      boxSizing: "border-box",
    });

    const metadataDetails = document.createElement("details");
    metadataDetails.dataset["framelogicPieceMetadata"] = "true";
    // Preparación es la tarea principal; los metadatos siguen
    // disponibles al abrir esta sección sin desaparecer ni perder datos.
    metadataDetails.open = false;
    Object.assign(metadataDetails.style, {
      border: "1px solid #4b5563",
      borderRadius: "7px",
      background: "rgba(31,41,51,0.96)",
      color: "white",
      flexShrink: "0",
      overflow: "hidden",
    });

    const metadataSummary = document.createElement("summary");
    metadataSummary.textContent = "Metadatos de ingeniería";
    metadataSummary.title = "Expandir o contraer metadatos";
    Object.assign(metadataSummary.style, {
      cursor: "pointer",
      padding: "12px",
      fontWeight: "bold",
      fontSize: "13px",
      userSelect: "none",
    });

    const panel = document.createElement("div");
    Object.assign(panel.style, {
      padding: "0 12px 12px",
      maxHeight: "min(46vh, 440px)",
      overflowY: "auto",
      boxSizing: "border-box",
    });

    metadataDetails.append(metadataSummary, panel);
    sidebar.appendChild(metadataDetails);

    const preparationActions = document.createElement("section");
    preparationActions.dataset["framelogicPiecePreparationActions"] = "true";
    Object.assign(preparationActions.style, {
      padding: "10px 12px",
      border: "1px solid #4b5563",
      borderRadius: "7px",
      background: "rgba(31,41,51,0.96)",
      color: "white",
      flexShrink: "0",
    });
    sidebar.appendChild(preparationActions);

    const preparationSlot = document.createElement("div");
    preparationSlot.dataset["framelogicPieceEditorPreparationSlot"] = "true";
    Object.assign(preparationSlot.style, {
      width: "100%",
      minWidth: "0",
      flexShrink: "0",
      boxSizing: "border-box",
    });
    sidebar.appendChild(preparationSlot);

    this.inputs =
      {};

    this.addField(
      panel,
      "revision",
      "Revisión",
      current?.revision,
    );
    this.addField(
      panel,
      "materialName",
      "Material",
      current?.material?.name,
    );
    this.addField(
      panel,
      "materialGrade",
      "Grado / especificación",
      current?.material?.grade,
    );
    this.addField(
      panel,
      "densityKgPerM3",
      "Densidad kg/m³",
      current?.material?.densityKgPerM3,
      "number",
    );
    this.addField(
      panel,
      "currency",
      "Moneda",
      current?.commercial?.currency,
    );
    this.addField(
      panel,
      "tariff",
      "Tarifa",
      current?.commercial?.tariff,
      "number",
    );
    this.addField(
      panel,
      "unitCost",
      "Costo unitario",
      current?.commercial?.unitCost,
      "number",
    );
    this.addField(
      panel,
      "assemblyCost",
      "Costo de montaje",
      current?.commercial?.assemblyCost,
      "number",
    );
    this.addField(
      panel,
      "supplier",
      "Proveedor",
      current?.commercial?.supplier,
    );
    this.addField(
      panel,
      "sku",
      "SKU / código proveedor",
      current?.commercial?.sku,
    );
    this.addField(
      panel,
      "installationTimeHours",
      "Tiempo instalación (h)",
      current?.commercial
        ?.installationTimeHours,
      "number",
    );
    this.addField(
      panel,
      "massKg",
      "Peso / masa kg",
      current?.physical?.massKg,
      "number",
    );
    this.addField(
      panel,
      "volumeM3",
      "Volumen m³",
      current?.physical?.volumeM3,
      "number",
    );

    const save =
      this.createButton(
        "Guardar metadatos",
        () => {
          this.saveMetadata();
        },
      );
    save.style.width =
      "100%";
    save.style.marginTop =
      "10px";
    panel.appendChild(
      save,
    );

    this.addHeading(
      preparationActions,
      "Preparación geométrica",
    );

    const help =
      document.createElement(
        "div",
      );
    help.textContent =
      "Define origen, SNAPs y ejes persistentes sobre la pieza aislada.";
    help.style.fontSize =
      "11px";
    help.style.opacity =
      "0.72";
    help.style.marginBottom =
      "8px";
    preparationActions.appendChild(
      help,
    );

    preparationActions.append(
      this.createButton(
        "Preparar geometría",
        () => {
          this.startPreparation();
        },
      ),
      this.createButton(
        "Origen ← SNAP",
        () => {
          this.startPreparation();
          this.actions
            .startOriginSnap();
        },
      ),
      this.createButton(
        "Punto → SNAP",
        () => {
          if (!this.startPreparation()) return;
          try {
            const count = this.actions.addSnapsFromSelection();
            this.setStatus(
              count > 0
                ? `${count} SNAP agregado(s).`
                : "No se agregó ningún SNAP. Selecciona un punto CAD.",
            );
          } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error));
          }
        },
      ),
      this.createButton(
        "Línea → eje",
        () => {
          if (!this.startPreparation()) return;
          try {
            const count = this.actions.addAxesFromSelection();
            this.setStatus(
              count > 0
                ? `${count} eje(s) agregado(s).`
                : "No se agregó ningún eje. Selecciona una línea CAD terminada.",
            );
          } catch (error) {
            this.setStatus(error instanceof Error ? error.message : String(error));
          }
        },
      ),
      this.createButton(
        "Salir de preparación",
        () => {
          this.actions
            .stopPreparation();
          this.setStatus(
            "Preparación geométrica detenida.",
          );
        },
      ),
    );

    const status =
      document.createElement(
        "div",
      );
    Object.assign(
      status.style,
      {
        marginTop:
          "12px",
        padding:
          "8px",
        borderRadius:
          "5px",
        background:
          "rgba(0,0,0,0.18)",
        fontSize:
          "11px",
      },
    );
    status.textContent =
      hasUserDefinedEngineering(
        current,
      )
        ? "Esta pieza ya contiene metadatos FrameLogic definidos por el usuario."
        : "Completa y guarda al menos un metadato para convertir la pieza.";

    preparationActions.appendChild(
      status,
    );
    this.statusElement =
      status;

    workspace.append(
      topBar,
      sidebar,
    );
    this.container.appendChild(
      workspace,
    );
    this.workspace =
      workspace;
  }


  private saveMetadata(): void {
    const instanceId =
      this.activeInstanceId;

    if (!instanceId) {
      return;
    }

    const instance =
      this.designModel
        .pieceInstances
        .get(
          instanceId,
        );

    if (!instance) {
      return;
    }

    const existing =
      this.engineeringModel
        .pieces
        .get(
          instance.definitionId,
        );

    const revision =
      this.text(
        "revision",
      );
    const material =
      this.buildMaterial();
    const commercial =
      this.buildCommercial();
    const physical =
      this.buildPhysical();

    const hasMetadata =
      Boolean(
        revision
        || material
        || commercial
        || physical
        || existing?.structuralAxis
        || existing?.features.some(
          (
            feature,
          ) =>
            feature.source
              === "FRAMELOGIC"
            || feature.source
              === "MANUAL",
        )
      );

    if (!hasMetadata) {
      this.setStatus(
        "No se guardó: agrega al menos un metadato real antes de convertir la pieza.",
      );
      return;
    }

    const next =
      this.engineeringModel
        .pieces
        .upsert({
          pieceDefinitionId:
            instance.definitionId,
          revision,
          material,
          commercial,
          physical,
          structuralAxis:
            existing?.structuralAxis,
          features:
            existing?.features
            ?? [],
        });

    if (
      !instance.tags.includes(
        FRAMELOGIC_READY_TAG,
      )
    ) {
      this.designModel
        .pieceInstances
        .updateTags(
          instance.id,
          [
            ...instance.tags,
            FRAMELOGIC_READY_TAG,
          ],
        );
    }

    this.setStatus(
      `Pieza convertida a FrameLogic · ${next.features.length} feature(s) disponibles.`,
    );
  }


  private buildMaterial():
    PieceMaterialData
    | undefined {
    const name =
      this.text(
        "materialName",
      );
    const grade =
      this.text(
        "materialGrade",
      );
    const densityKgPerM3 =
      this.number(
        "densityKgPerM3",
      );

    if (
      !name
      && !grade
      && densityKgPerM3
        === undefined
    ) {
      return undefined;
    }

    return {
      name,
      grade,
      densityKgPerM3,
      source:
        "FRAMELOGIC",
    };
  }


  private buildCommercial():
    PieceCommercialData
    | undefined {
    const currency =
      this.text(
        "currency",
      );
    const tariff =
      this.number(
        "tariff",
      );
    const unitCost =
      this.number(
        "unitCost",
      );
    const assemblyCost =
      this.number(
        "assemblyCost",
      );
    const supplier =
      this.text(
        "supplier",
      );
    const sku =
      this.text(
        "sku",
      );
    const installationTimeHours =
      this.number(
        "installationTimeHours",
      );

    if (
      !currency
      && tariff === undefined
      && unitCost === undefined
      && assemblyCost === undefined
      && !supplier
      && !sku
      && installationTimeHours
        === undefined
    ) {
      return undefined;
    }

    return {
      currency,
      tariff,
      unitCost,
      assemblyCost,
      supplier,
      sku,
      installationTimeHours,
    };
  }


  private buildPhysical():
    PiecePhysicalData
    | undefined {
    const massKg =
      this.number(
        "massKg",
      );
    const volumeM3 =
      this.number(
        "volumeM3",
      );

    if (
      massKg === undefined
      && volumeM3 === undefined
    ) {
      return undefined;
    }

    return {
      massKg,
      volumeM3,
      source:
        "FRAMELOGIC",
    };
  }


  private startPreparation(): boolean {
    const instanceId = this.activeInstanceId;
    if (!instanceId) return false;
    try {
      this.actions.startPreparation(instanceId);
      this.setStatus("Preparación geométrica activa.");
      return true;
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : String(error));
      return false;
    }
  }


  private addHeading(
    parent: HTMLElement,
    text: string,
  ): void {
    const heading =
      document.createElement(
        "strong",
      );
    heading.textContent =
      text;
    heading.style.display =
      "block";
    heading.style.margin =
      "14px 0 8px";
    parent.appendChild(
      heading,
    );
  }


  private addField(
    parent: HTMLElement,
    key: string,
    labelText: string,
    value:
      string
      | number
      | undefined,
    type =
      "text",
  ): void {
    const label =
      document.createElement(
        "label",
      );
    label.textContent =
      labelText;
    Object.assign(
      label.style,
      {
        display:
          "block",
        marginTop:
          "8px",
        fontSize:
          "11px",
        color:
          "#cbd5e1",
      },
    );

    const input =
      document.createElement(
        "input",
      );
    input.type =
      type;
    input.value =
      value === undefined
        ? ""
        : String(
            value,
          );

    if (
      type === "number"
    ) {
      input.step =
        "any";
    }

    Object.assign(
      input.style,
      {
        width:
          "100%",
        marginTop:
          "4px",
        padding:
          "7px 8px",
        border:
          "1px solid #596875",
        borderRadius:
          "4px",
        background:
          "#111827",
        color:
          "white",
      },
    );

    this.inputs[key] =
      input;

    parent.append(
      label,
      input,
    );
  }


  private createButton(
    text: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button =
      document.createElement(
        "button",
      );
    button.type =
      "button";
    button.textContent =
      text;

    Object.assign(
      button.style,
      {
        margin:
          "4px 4px 0 0",
        padding:
          "7px 9px",
        border:
          "1px solid #596875",
        borderRadius:
          "4px",
        background:
          "#1f2933",
        color:
          "white",
        cursor:
          "pointer",
        fontSize:
          "11px",
      },
    );

    button.addEventListener(
      "click",
      onClick,
    );

    return button;
  }


  private text(
    key: string,
  ):
    string
    | undefined {
    const value =
      this.inputs[key]
        ?.value
        .trim()
      ?? "";

    return value.length > 0
      ? value
      : undefined;
  }


  private number(
    key: string,
  ):
    number
    | undefined {
    const text =
      this.text(
        key,
      );

    if (!text) {
      return undefined;
    }

    const value =
      Number(
        text,
      );

    return Number.isFinite(
      value,
    )
      ? value
      : undefined;
  }


  private setStatus(
    message: string,
  ): void {
    if (
      this.statusElement
    ) {
      this.statusElement.textContent =
        message;
    }
  }


  private hideMainUi(): void {
    const page =
      this.container.closest(
        ".bim-page",
      );

    if (
      !(page instanceof HTMLElement)
    ) {
      return;
    }

    for (
      const selector
      of [
        ".bim-toolbar",
        ".layer-panel",
        ".model-panel",
      ]
    ) {
      const element =
        page.querySelector(
          selector,
        );

      if (
        element instanceof HTMLElement
      ) {
        this.hiddenElements.set(
          element,
          element.style.display,
        );
        element.style.display =
          "none";
      }
    }
  }


  private restoreMainUi(): void {
    for (
      const [
        element,
        display,
      ]
      of this.hiddenElements
    ) {
      element.style.display =
        display;
    }

    this.hiddenElements.clear();
  }


  private exitWorkspace(): void {
    document.documentElement.removeAttribute(
      "data-framelogic-piece-workspace-active",
    );

    this.actions
      .stopPreparation();
    this.selection
      .exitIsolation();
    this.restoreMainUi();

    // Preparar pieza se monta temporalmente dentro del sidebar.
    // Sacarlo ANTES de eliminar el workspace evita destruir el panel,
    // su estado editable y los listeners del controlador de preparación.
    const preparationPanel = this.workspace?.querySelector<HTMLElement>(
      '[data-framelogic-piece-preparation-panel="true"]',
    );
    if (preparationPanel) {
      document.body.appendChild(preparationPanel);
    }

    this.workspace?.remove();
    this.workspace =
      null;
    this.statusElement =
      null;
    this.inputs =
      {};
    this.activeInstanceId =
      null;
  }


  private hideMenu(): void {
    this.menu?.remove();
    this.menu =
      null;
  }


  dispose(): void {
    if (
      this.disposed
    ) {
      return;
    }

    this.disposed =
      true;

    this.canvas.removeEventListener(
      "contextmenu",
      this.handleContextMenu,
    );
    document.removeEventListener(
      "pointerdown",
      this.handleDocumentPointerDown,
    );

    this.hideMenu();

    if (
      this.workspace
    ) {
      this.exitWorkspace();
    }
  }
}
