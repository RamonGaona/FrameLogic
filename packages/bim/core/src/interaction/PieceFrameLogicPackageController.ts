import type {
  DesignModel,
  FrameLogicEngineeringModel,
  PieceDefinition,
  PieceEngineeringData,
} from "@framelogic/domain";

import {
  mergeInstanceColorIntoDefinitionTags,
} from "../design/PieceAppearanceMetadata";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";


export type FrameLogicPieceSourceFormat =
  | "STEP"
  | "IFC";


export interface FrameLogicPieceSourceGeometry {
  readonly format:
    FrameLogicPieceSourceFormat;
  readonly fileName:
    string;
  readonly data:
    Uint8Array<ArrayBuffer>;
}


const PREPARATION_LAYER_ID =
  "__framelogic-piece-preparation__";

const PREPARATION_PANEL_ACTIONS =
  "framelogicPiecePreparationActions";

const PREPARATION_PANEL_SCROLL =
  "framelogicPiecePreparationScroll";

const PREPARATION_EXIT_SOURCE =
  "framelogicPiecePreparationExitSource";


function cloneBytes(
  data: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const buffer =
    new ArrayBuffer(
      data.byteLength,
    );
  const clone =
    new Uint8Array(
      buffer,
    );

  clone.set(
    data,
  );

  return clone;
}


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


function hasPreparedDefinition(
  definition:
    PieceDefinition,
): boolean {
  return (
    definition.snapPoints.length > 0
    || definition.referenceGeometry
      .axisLines.length > 0
  );
}


function encodeBase64(
  data: Uint8Array,
): string {
  const chunkSize =
    0x8000;
  const chunks:
    string[] = [];

  for (
    let offset = 0;
    offset < data.length;
    offset += chunkSize
  ) {
    const chunk =
      data.subarray(
        offset,
        Math.min(
          offset + chunkSize,
          data.length,
        ),
      );

    chunks.push(
      String.fromCharCode(
        ...chunk,
      ),
    );
  }

  return window.btoa(
    chunks.join(
      "",
    ),
  );
}


function safeFileName(
  value: string,
): string {
  const normalized =
    value
      .trim()
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "_",
      )
      .replace(
        /^_+|_+$/g,
        "",
      );

  return normalized
    || "pieza_framelogic";
}


export class PieceFrameLogicPackageController {
  private readonly container:
    HTMLElement;

  private readonly designModel:
    DesignModel;

  private readonly selection:
    DesignSelectionController;

  private readonly engineeringModel:
    FrameLogicEngineeringModel;

  private readonly sources =
    new Map<
      string,
      FrameLogicPieceSourceGeometry
    >();

  private readonly observer:
    MutationObserver;

  private updateScheduled =
    false;

  private disposed =
    false;


  constructor(
    container: HTMLElement,
    designModel: DesignModel,
    selection: DesignSelectionController,
    engineeringModel: FrameLogicEngineeringModel,
  ) {
    this.container =
      container;
    this.designModel =
      designModel;
    this.selection =
      selection;
    this.engineeringModel =
      engineeringModel;

    this.observer =
      new MutationObserver(
        () => {
          this.scheduleUiSync();
        },
      );

    /*
     * El editor de Preparar pieza vive en document.body, mientras que el
     * workspace de metadata vive dentro del viewport. Observamos body para
     * ofrecer el guardado individual en ambos contextos y reorganizar el
     * panel de preparación sin acoplar React con el controlador CAD.
     */
    this.observer.observe(
      document.body,
      {
        childList:
          true,
        subtree:
          true,
      },
    );

    this.syncUi();
  }


  registerSource(
    definitionId: string,
    source:
      FrameLogicPieceSourceGeometry,
  ): void {
    this.sources.set(
      definitionId,
      {
        format:
          source.format,
        fileName:
          source.fileName,
        data:
          cloneBytes(
            source.data,
          ),
      },
    );
  }


  /**
   * Guarda una instancia concreta como archivo individual .flpiece.
   * Puede llamarse directamente desde Preparar pieza aunque la selección CAD
   * esté actualmente sobre un POINT o LINE de referencia.
   */
  savePiece(
    instanceId: string,
  ): void {
    try {
      const instance =
        this.designModel
          .pieceInstances
          .get(
            instanceId,
          );

      if (!instance) {
        throw new Error(
          "No se encontró la instancia que se quiere guardar.",
        );
      }

      const definition =
        this.designModel
          .pieceDefinitions
          .get(
            instance.definitionId,
          );

      if (!definition) {
        throw new Error(
          "No se encontró la definición de la pieza.",
        );
      }

      const engineering =
        this.engineeringModel
          .pieces
          .get(
            definition.id,
          );

      if (
        !hasPreparedDefinition(
          definition,
        )
        && !hasUserDefinedEngineering(
          engineering,
        )
      ) {
        throw new Error(
          "La pieza todavía no tiene preparación FrameLogic. Define al menos un origen/SNAP/eje o guarda metadatos de ingeniería antes de exportarla.",
        );
      }

      const source =
        this.sources.get(
          definition.id,
        );

      if (!source) {
        throw new Error(
          "FrameLogic no conserva la geometría original de esta pieza. Vuelve a importarla desde STEP/STP/IFC antes de guardarla como .flpiece.",
        );
      }

      const effectiveEngineering:
        PieceEngineeringData =
          engineering
          ?? {
            pieceDefinitionId:
              definition.id,
            features: [],
          };

      const packageValue = {
        schema:
          "FRAMELOGIC_PIECE" as const,
        version:
          1 as const,
        lengthUnit:
          "mm" as const,
        status:
          "READY" as const,
        geometry: {
          format:
            source.format,
          fileName:
            source.fileName,
          dataBase64:
            encodeBase64(
              source.data,
            ),
        },
        definition: {
          code:
            definition.code,
          name:
            definition.name,
          classification:
            definition.classification,
          tags:
            mergeInstanceColorIntoDefinitionTags(
              definition.tags,
              instance.tags,
            ),
          coordinateSystem:
            definition.coordinateSystem,
          snapPoints:
            definition.snapPoints,
          referenceGeometry:
            definition.referenceGeometry,
        },
        engineering: {
          revision:
            effectiveEngineering.revision,
          material:
            effectiveEngineering.material,
          commercial:
            effectiveEngineering.commercial,
          physical:
            effectiveEngineering.physical,
          structuralAxis:
            effectiveEngineering.structuralAxis,
          features: [
            ...effectiveEngineering.features,
          ],
        },
      };

      const blob =
        new Blob(
          [
            JSON.stringify(
              packageValue,
              null,
              2,
            ),
          ],
          {
            type:
              "application/json",
          },
        );
      const url =
        URL.createObjectURL(
          blob,
        );
      const anchor =
        document.createElement(
          "a",
        );

      anchor.href =
        url;
      anchor.download =
        `${safeFileName(
          definition.code
          || definition.name,
        )}.flpiece`;
      anchor.style.display =
        "none";

      document.body.appendChild(
        anchor,
      );
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(
        url,
      );
    }
    catch (
      error
    ) {
      window.alert(
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      );
    }
  }


  saveSelectedPiece(): void {
    const selectedIds =
      this.selection
        .getSelectedIds();

    if (
      selectedIds.length
      !== 1
    ) {
      window.alert(
        "Selecciona una sola pieza antes de guardarla.",
      );
      return;
    }

    this.savePiece(
      selectedIds[0]!,
    );
  }


  private scheduleUiSync(): void {
    if (
      this.disposed
      || this.updateScheduled
    ) {
      return;
    }

    this.updateScheduled =
      true;

    window.requestAnimationFrame(
      () => {
        this.updateScheduled =
          false;
        this.syncUi();
      },
    );
  }


  private syncUi(): void {
    if (
      this.disposed
    ) {
      return;
    }

    this.attachWorkspaceSaveButton();
    this.decoratePreparationPanel();
  }


  private attachWorkspaceSaveButton(): void {
    const workspace =
      Array.from(
        this.container.children,
      )
        .find(
          (
            element,
          ) =>
            element
              instanceof HTMLElement
            && element.textContent
              ?.includes(
                "Pieza FrameLogic ·",
              )
            && element.textContent
              ?.includes(
                "Volver al modelo",
              ),
        );

    if (
      !(workspace
        instanceof HTMLElement)
      || workspace.querySelector(
        "[data-framelogic-save-package]",
      )
    ) {
      return;
    }

    const metadataButton =
      Array.from(
        workspace.querySelectorAll(
          "button",
        ),
      )
        .find(
          (
            button,
          ) =>
            button.textContent
              ?.trim()
            === "Guardar metadatos",
        );

    if (!metadataButton) {
      return;
    }

    const saveButton =
      document.createElement(
        "button",
      );

    saveButton.type =
      "button";
    saveButton.dataset[
      "framelogicSavePackage"
    ] =
      "true";
    saveButton.textContent =
      "Guardar pieza FrameLogic";

    Object.assign(
      saveButton.style,
      {
        display:
          "block",
        width:
          "100%",
        marginTop:
          "6px",
        padding:
          "7px 10px",
        border:
          "1px solid #718096",
        borderRadius:
          "5px",
        background:
          "#334155",
        color:
          "white",
        cursor:
          "pointer",
      },
    );

    saveButton.addEventListener(
      "click",
      () => {
        this.saveSelectedPiece();
      },
    );

    metadataButton.insertAdjacentElement(
      "afterend",
      saveButton,
    );
  }


  private decoratePreparationPanel(): void {
    const preparationInstance =
      this.designModel
        .pieceInstances
        .getAll()
        .find(
          (
            instance,
          ) =>
            instance.layerId
            === PREPARATION_LAYER_ID,
        );

    const panel =
      this.findPreparationPanel();

    if (
      !preparationInstance
      || !panel
    ) {
      this.restorePreparationToolbarExit();
      return;
    }

    const toolbarExit =
      this.findPreparationToolbarExit(
        panel,
      );

    if (toolbarExit) {
      toolbarExit.dataset[
        PREPARATION_EXIT_SOURCE
      ] =
        "true";
      toolbarExit.style.display =
        "none";
    }

    Object.assign(
      panel.style,
      {
        top:
          "126px",
        bottom:
          "auto",
        maxHeight:
          "calc(100vh - 210px)",
        overflow:
          "hidden",
        display:
          "flex",
        flexDirection:
          "column",
      },
    );

    const existingActions =
      panel.querySelector<HTMLElement>(
        `[data-${this.toKebabCase(
          PREPARATION_PANEL_ACTIONS,
        )}="true"]`,
      );

    if (existingActions) {
      return;
    }

    const children =
      Array.from(
        panel.children,
      );
    const header =
      children[0];

    if (!(header instanceof HTMLElement)) {
      return;
    }

    const scroll =
      document.createElement(
        "div",
      );
    scroll.dataset[
      PREPARATION_PANEL_SCROLL
    ] =
      "true";

    Object.assign(
      scroll.style,
      {
        minHeight:
          "0",
        flex:
          "1 1 auto",
        overflowY:
          "auto",
        overflowX:
          "hidden",
        overscrollBehavior:
          "contain",
        scrollbarGutter:
          "stable",
      },
    );

    for (
      const child
      of children.slice(
        1,
      )
    ) {
      scroll.appendChild(
        child,
      );
    }

    const actions =
      document.createElement(
        "div",
      );
    actions.dataset[
      PREPARATION_PANEL_ACTIONS
    ] =
      "true";

    Object.assign(
      actions.style,
      {
        flex:
          "0 0 auto",
        display:
          "grid",
        gridTemplateColumns:
          "1fr auto",
        gap:
          "8px",
        padding:
          "10px 12px",
        borderTop:
          "1px solid #4b5563",
        background:
          "rgba(24, 33, 41, 0.99)",
      },
    );

    const saveButton =
      document.createElement(
        "button",
      );
    saveButton.type =
      "button";
    saveButton.dataset[
      "framelogicSavePreparedPackage"
    ] =
      "true";
    saveButton.textContent =
      "Guardar pieza FrameLogic";
    saveButton.title =
      "Descargar esta pieza preparada como archivo individual .flpiece";

    Object.assign(
      saveButton.style,
      {
        padding:
          "8px 10px",
        border:
          "1px solid #718096",
        borderRadius:
          "5px",
        background:
          "#334155",
        color:
          "white",
        cursor:
          "pointer",
        fontWeight:
          "600",
      },
    );

    saveButton.addEventListener(
      "click",
      () => {
        this.savePiece(
          preparationInstance.id,
        );
      },
    );

    const exitButton =
      document.createElement(
        "button",
      );
    exitButton.type =
      "button";
    exitButton.dataset[
      "framelogicPreparationPanelExit"
    ] =
      "true";
    exitButton.textContent =
      "Salir prep";
    exitButton.title =
      "Salir del modo de preparación y volver al Model Space";

    Object.assign(
      exitButton.style,
      {
        padding:
          "8px 12px",
        border:
          "1px solid #596875",
        borderRadius:
          "5px",
        background:
          "#1f2933",
        color:
          "white",
        cursor:
          "pointer",
      },
    );

    exitButton.addEventListener(
      "click",
      () => {
        const source =
          this.findPreparationToolbarExit(
            panel,
          );

        source?.click();
      },
    );

    actions.append(
      saveButton,
      exitButton,
    );

    panel.replaceChildren(
      header,
      scroll,
      actions,
    );
  }


  private findPreparationPanel():
    HTMLDivElement | null {
    for (
      const element
      of document.body
        .querySelectorAll<HTMLDivElement>(
          "div",
        )
    ) {
      if (
        element.style.position
          !== "fixed"
        || element.style.display
          === "none"
      ) {
        continue;
      }

      const header =
        element.firstElementChild;
      const title =
        header?.textContent
          ?.trim()
        ?? "";

      if (
        title.startsWith(
          "Preparar pieza ·",
        )
        && element.textContent
          ?.includes(
            "Workspace local aislado",
          )
      ) {
        return element;
      }
    }

    return null;
  }


  private findPreparationToolbarExit(
    panel:
      HTMLElement,
  ):
    HTMLButtonElement | null {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        "button",
      ),
    )
      .find(
        (
          button,
        ) =>
          !panel.contains(
            button,
          )
          && button.textContent
            ?.trim()
            === "Salir prep",
      )
      ?? null;
  }


  private restorePreparationToolbarExit(): void {
    for (
      const button
      of document.querySelectorAll<HTMLButtonElement>(
        `[data-${this.toKebabCase(
          PREPARATION_EXIT_SOURCE,
        )}="true"]`,
      )
    ) {
      button.style.display =
        "";
      delete button.dataset[
        PREPARATION_EXIT_SOURCE
      ];
    }
  }


  private toKebabCase(
    value: string,
  ): string {
    return value.replace(
      /[A-Z]/g,
      (
        match,
      ) =>
        `-${match.toLowerCase()}`,
    );
  }


  dispose(): void {
    if (
      this.disposed
    ) {
      return;
    }

    this.disposed =
      true;
    this.restorePreparationToolbarExit();
    this.observer.disconnect();
    this.sources.clear();
  }
}
