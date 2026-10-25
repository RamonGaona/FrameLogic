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


interface InputRefs {
  revision: HTMLInputElement;
  materialName: HTMLInputElement;
  materialGrade: HTMLInputElement;
  densityKgPerM3: HTMLInputElement;
  currency: HTMLInputElement;
  tariff: HTMLInputElement;
  unitCost: HTMLInputElement;
  assemblyCost: HTMLInputElement;
  supplier: HTMLInputElement;
  sku: HTMLInputElement;
  installationTimeHours: HTMLInputElement;
  massKg: HTMLInputElement;
  volumeM3: HTMLInputElement;
}


export class PieceFrameLogicWorkspaceController {
  private readonly hiddenElements =
    new Map<HTMLElement, string>();

  private menu:
    HTMLDivElement
    | null = null;

  private workspace:
    HTMLDivElement
    | null = null;

  private statusElement:
    HTMLDivElement
    | null = null;

  private inputRefs:
    InputRefs
    | null = null;

  private activeInstanceId:
    string
    | null = null;

  private disposed =
    false;


  constructor(
    private readonly container: HTMLElement,
    private readonly canvas: HTMLElement,
    private readonly designModel: DesignModel,
    private readonly selection: DesignSelectionController,
    private readonly engineeringModel: FrameLogicEngineeringModel,
    private readonly actions: PieceFrameLogicWorkspaceActions,
  ) {
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
        this.selection.getInstanceIdAt(
          event.clientX,
          event.clientY,
        );
      const selectedIds =
        this.selection.getSelectedIds();

      if (
        !instanceId
        || selectedIds.length !== 1
        || selectedIds[0] !== instanceId
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
        && event.target instanceof Node
        && !this.menu.contains(
          event.target,
        )
      ) {
        this.hideMenu();
      }
    };


  private showMenu(
    clientX: number,
    clientY: number,
    instanceId: string,
  ): void {
    this.hideMenu();

    const instance =
      this.designModel.pieceInstances.get(
        instanceId,
      );

    if (!instance) {
      return;
    }

    const definition =
      this.designModel.pieceDefinitions.get(
        instance.definitionId,
      );

    if (!definition) {
      return;
    }

    const alreadyHasEngineering =
      this.engineeringModel.pieces.get(
        definition.id,
      ) !== undefined;

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
          `${clientX}px`,
        top:
          `${clientY}px`,
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
        fontFamily:
          "Arial, sans-serif",
      },
    );

    const button =
      document.createElement(
        "button",
      );

    button.type =
      "button";
    button.textContent =
      alreadyHasEngineering
        ? "Editar pieza FrameLogic"
        : "Convertir a pieza FrameLogic";

    Object.assign(
      button.style,
      {
        width:
          "100%",
        padding:
          "9px 10px",
        border:
          "none",
        borderRadius:
          "4px",
        background:
          "transparent",
        color:
          "white",
        textAlign:
          "left",
        cursor:
          "pointer",
        fontSize:
          "13px",
      },
    );

    button.addEventListener(
      "mouseenter",
      () => {
        button.style.background =
          "rgba(255,255,255,0.10)";
      },
    );
    button.addEventListener(
      "mouseleave",
      () => {
        button.style.background =
          "transparent";
      },
    );
    button.addEventListener(
      "click",
      () => {
        this.hideMenu();
        this.enterWorkspace(
          instanceId,
        );
      },
    );

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
    if (
      this.workspace
      || this.disposed
    ) {
      return;
    }

    const instance =
      this.designModel.pieceInstances.get(
        instanceId,
      );

    if (!instance) {
      return;
    }

    const definition =
      this.designModel.pieceDefinitions.get(
        instance.definitionId,
      );

    if (!definition) {
      return;
    }

    this.selection.selectSingle(
      instanceId,
    );

    if (
      !this.selection.isolateSelection()
    ) {
      return;
    }

    this.activeInstanceId =
      instanceId;
    this.hideMainUi();
    this.createWorkspace(
      definition.id,
      definition.code,
      definition.name,
      definition.classification,
    );

    void this.actions.setIsoView();
  }


  private createWorkspace(
    definitionId: string,
    code: string,
    name: string,
    classification?: string,
  ): void {
    const current =
      this.engineeringModel.pieces.get(
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
        minHeight:
          "42px",
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

    const subtitle =
      document.createElement(
        "span",
      );
    subtitle.textContent =
      `${name}${
        classification
          ? ` · ${classification}`
          : ""
      } · solo esta pieza está visible`;
    subtitle.style.fontSize =
      "12px";
    subtitle.style.opacity =
      "0.72";

    const exitButton =
      this.createButton(
        "Volver al modelo",
        () => {
          this.exitWorkspace();
        },
      );
    exitButton.style.marginLeft =
      "auto";

    topBar.append(
      title,
      subtitle,
      exitButton,
    );

    const panel =
      document.createElement(
        "div",
      );

    Object.assign(
      panel.style,
      {
        position:
          "absolute",
        top:
          "68px",
        left:
          "12px",
        width:
          "340px",
        maxHeight:
          "calc(100vh - 84px)",
        overflowY:
          "auto",
        padding:
          "12px",
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

    const engineeringTitle =
      document.createElement(
        "strong",
      );
    engineeringTitle.textContent =
      "Metadatos de ingeniería";
    engineeringTitle.style.display =
      "block";
    engineeringTitle.style.marginBottom =
      "10px";

    panel.appendChild(
      engineeringTitle,
    );

    const inputRefs:
      InputRefs = {
        revision:
          this.addInput(
            panel,
            "Revisión",
            current?.revision,
          ),
        materialName:
          this.addInput(
            panel,
            "Material",
            current?.material?.name,
          ),
        materialGrade:
          this.addInput(
            panel,
            "Grado / especificación",
            current?.material?.grade,
          ),
        densityKgPerM3:
          this.addInput(
            panel,
            "Densidad kg/m³",
            current?.material?.densityKgPerM3,
            "number",
          ),
        currency:
          this.addInput(
            panel,
            "Moneda",
            current?.commercial?.currency,
          ),
        tariff:
          this.addInput(
            panel,
            "Tarifa",
            current?.commercial?.tariff,
            "number",
          ),
        unitCost:
          this.addInput(
            panel,
            "Costo unitario",
            current?.commercial?.unitCost,
            "number",
          ),
        assemblyCost:
          this.addInput(
            panel,
            "Costo de montaje",
            current?.commercial?.assemblyCost,
            "number",
          ),
        supplier:
          this.addInput(
            panel,
            "Proveedor",
            current?.commercial?.supplier,
          ),
        sku:
          this.addInput(
            panel,
            "SKU / código proveedor",
            current?.commercial?.sku,
          ),
        installationTimeHours:
          this.addInput(
            panel,
            "Tiempo instalación (h)",
            current?.commercial?.installationTimeHours,
            "number",
          ),
        massKg:
          this.addInput(
            panel,
            "Peso / masa kg",
            current?.physical?.massKg,
            "number",
          ),
        volumeM3:
          this.addInput(
            panel,
            "Volumen m³",
            current?.physical?.volumeM3,
            "number",
          ),
      };

    this.inputRefs =
      inputRefs;

    const saveButton =
      this.createButton(
        "Guardar metadatos",
        () => {
          this.saveMetadata();
        },
      );
    saveButton.style.width =
      "100%";
    saveButton.style.marginTop =
      "10px";

    panel.appendChild(
      saveButton,
    );

    const geometryTitle =
      document.createElement(
        "strong",
      );
    geometryTitle.textContent =
      "Preparación geométrica";
    geometryTitle.style.display =
      "block";
    geometryTitle.style.margin =
      "18px 0 8px";
    panel.appendChild(
      geometryTitle,
    );

    const geometryHelp =
      document.createElement(
        "div",
      );
    geometryHelp.textContent =
      "Define origen, SNAPs y ejes persistentes sobre la pieza aislada.";
    geometryHelp.style.fontSize =
      "11px";
    geometryHelp.style.opacity =
      "0.72";
    geometryHelp.style.marginBottom =
      "8px";
    panel.appendChild(
      geometryHelp,
    );

    panel.append(
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
          this.actions.startOriginSnap();
        },
      ),
      this.createButton(
        "Punto → SNAP",
        () => {
          this.startPreparation();
          const added =
            this.actions.addSnapsFromSelection();
          this.setStatus(
            added > 0
              ? `${added} SNAP agregado(s).`
              : "No se agregó ningún SNAP.",
          );
        },
      ),
      this.createButton(
        "Línea → eje",
        () => {
          this.startPreparation();
          const added =
            this.actions.addAxesFromSelection();
          this.setStatus(
            added > 0
              ? `${added} eje(s) agregado(s).`
              : "No se agregó ningún eje.",
          );
        },
      ),
      this.createButton(
        "Salir de preparación",
        () => {
          this.actions.stopPreparation();
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
    status.style.marginTop =
      "12px";
    status.style.padding =
      "8px";
    status.style.borderRadius =
      "5px";
    status.style.background =
      "rgba(0,0,0,0.18)";
    status.style.fontSize =
      "11px";
    status.textContent =
      current
        ? "Esta pieza ya contiene metadatos FrameLogic."
        : "Completa y guarda al menos un metadato para convertir la pieza.";

    panel.appendChild(
      status,
    );

    this.statusElement =
      status;

    workspace.append(
      topBar,
      panel,
    );
    this.container.appendChild(
      workspace,
    );
    this.workspace =
      workspace;
  }


  private startPreparation(): void {
    if (!this.activeInstanceId) {
      return;
    }

    try {
      this.actions.startPreparation(
        this.activeInstanceId,
      );
      this.setStatus(
        "Preparación geométrica activa.",
      );
    }
    catch (
      error
    ) {
      this.setStatus(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }


  private saveMetadata(): boolean {
    const instanceId =
      this.activeInstanceId;
    const refs =
      this.inputRefs;

    if (
      !instanceId
      || !refs
    ) {
      return false;
    }

    const instance =
      this.designModel.pieceInstances.get(
        instanceId,
      );

    if (!instance) {
      return false;
    }

    const existing =
      this.engineeringModel.pieces.get(
        instance.definitionId,
      );

    const revision =
      this.stringValue(
        refs.revision,
      );

    const material:
      PieceMaterialData
      | undefined =
        this.buildMaterial(
          refs,
        );

    const commercial:
      PieceCommercialData
      | undefined =
        this.buildCommercial(
          refs,
        );

    const physical:
      PiecePhysicalData
      | undefined =
        this.buildPhysical(
          refs,
        );

    const hasRealMetadata =
      Boolean(
        revision
        || material
        || commercial
        || physical
        || existing?.structuralAxis
        || existing?.features.length
      );

    if (!hasRealMetadata) {
      this.setStatus(
        "No se guardó: agrega al menos un metadato real antes de convertir la pieza.",
      );
      return false;
    }

    const next:
      PieceEngineeringData =
        this.engineeringModel.pieces.upsert({
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

    this.setStatus(
      `Pieza FrameLogic guardada en memoria · ${
        next.features.length
      } feature(s).`,
    );

    return true;
  }


  private buildMaterial(
    refs: InputRefs,
  ):
    PieceMaterialData
    | undefined {
    const name =
      this.stringValue(
        refs.materialName,
      );
    const grade =
      this.stringValue(
        refs.materialGrade,
      );
    const densityKgPerM3 =
      this.numberValue(
        refs.densityKgPerM3,
      );

    if (
      !name
      && !grade
      && densityKgPerM3 === undefined
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


  private buildCommercial(
    refs: InputRefs,
  ):
    PieceCommercialData
    | undefined {
    const currency =
      this.stringValue(
        refs.currency,
      );
    const tariff =
      this.numberValue(
        refs.tariff,
      );
    const unitCost =
      this.numberValue(
        refs.unitCost,
      );
    const assemblyCost =
      this.numberValue(
        refs.assemblyCost,
      );
    const supplier =
      this.stringValue(
        refs.supplier,
      );
    const sku =
      this.stringValue(
        refs.sku,
      );
    const installationTimeHours =
      this.numberValue(
        refs.installationTimeHours,
      );

    if (
      !currency
      && tariff === undefined
      && unitCost === undefined
      && assemblyCost === undefined
      && !supplier
      && !sku
      && installationTimeHours === undefined
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


  private buildPhysical(
    refs: InputRefs,
  ):
    PiecePhysicalData
    | undefined {
    const massKg =
      this.numberValue(
        refs.massKg,
      );
    const volumeM3 =
      this.numberValue(
        refs.volumeM3,
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


  private addInput(
    parent: HTMLElement,
    labelText: string,
    initialValue:
      string
      | number
      | undefined,
    type =
      "text",
  ):
    HTMLInputElement {
    const label =
      document.createElement(
        "label",
      );
    label.textContent =
      labelText;
    label.style.display =
      "block";
    label.style.marginTop =
      "8px";
    label.style.fontSize =
      "11px";
    label.style.color =
      "#cbd5e1";

    const input =
      document.createElement(
        "input",
      );
    input.type =
      type;
    input.value =
      initialValue === undefined
        ? ""
        : String(
            initialValue,
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
        display:
          "block",
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

    parent.append(
      label,
      input,
    );

    return input;
  }


  private createButton(
    text: string,
    onClick: () => void,
  ):
    HTMLButtonElement {
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


  private stringValue(
    input: HTMLInputElement,
  ):
    string
    | undefined {
    const value =
      input.value.trim();

    return value.length > 0
      ? value
      : undefined;
  }


  private numberValue(
    input: HTMLInputElement,
  ):
    number
    | undefined {
    const text =
      input.value.trim();

    if (
      text.length === 0
    ) {
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
        previousDisplay,
      ]
      of this.hiddenElements
    ) {
      element.style.display =
        previousDisplay;
    }

    this.hiddenElements.clear();
  }


  private exitWorkspace(): void {
    this.actions.stopPreparation();
    this.selection.exitIsolation();
    this.restoreMainUi();

    this.workspace?.remove();
    this.workspace =
      null;
    this.statusElement =
      null;
    this.inputRefs =
      null;
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
