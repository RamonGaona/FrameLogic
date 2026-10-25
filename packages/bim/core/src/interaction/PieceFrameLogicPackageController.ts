import type {
  DesignModel,
  FrameLogicEngineeringModel,
  PieceEngineeringData,
} from "@framelogic/domain";

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
          this.attachSaveButton();
        },
      );

    this.observer.observe(
      container,
      {
        childList:
          true,
        subtree:
          true,
      },
    );
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


  private attachSaveButton(): void {
    if (
      this.disposed
    ) {
      return;
    }

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


  private saveSelectedPiece(): void {
    try {
      const selectedIds =
        this.selection
          .getSelectedIds();

      if (
        selectedIds.length
        !== 1
      ) {
        throw new Error(
          "Selecciona una sola pieza antes de guardarla.",
        );
      }

      const instance =
        this.designModel
          .pieceInstances
          .get(
            selectedIds[0],
          );

      if (!instance) {
        throw new Error(
          "No se encontró la instancia seleccionada.",
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
        !hasUserDefinedEngineering(
          engineering,
        )
      ) {
        throw new Error(
          "Primero guarda al menos un metadato FrameLogic real para esta pieza.",
        );
      }

      if (!engineering) {
        throw new Error(
          "No se encontraron metadatos de ingeniería para la pieza.",
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

      const packageValue = {
        schema:
          "FRAMELOGIC_PIECE" as const,
        version:
          1 as const,
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
          tags: [
            ...definition.tags,
          ],
          coordinateSystem:
            definition.coordinateSystem,
          snapPoints:
            definition.snapPoints,
          referenceGeometry:
            definition.referenceGeometry,
        },
        engineering: {
          revision:
            engineering.revision,
          material:
            engineering.material,
          commercial:
            engineering.commercial,
          physical:
            engineering.physical,
          structuralAxis:
            engineering.structuralAxis,
          features: [
            ...engineering.features,
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


  dispose(): void {
    if (
      this.disposed
    ) {
      return;
    }

    this.disposed =
      true;
    this.observer.disconnect();
    this.sources.clear();
  }
}
