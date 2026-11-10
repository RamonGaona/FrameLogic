import { validateAssemblyHierarchy } from "@framelogic/domain";
import type {
  Assembly,
  CadLine,
  CadPoint,
  DesignLayer,
  DesignModel,
  FrameLogicEngineeringSnapshot,
  PieceDefinition,
  PieceInstance,
} from "@framelogic/domain";

import {
  OcctStepGeometryAdapter,
} from "@framelogic/geometry";

import type {
  StepGeometryDocument,
} from "@framelogic/geometry";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  CadPointSceneController,
} from "../design/CadPointSceneController";

import type {
  CadLineSceneController,
} from "../design/CadLineSceneController";

import type {
  FrameLogicDocumentationSnapshot,
} from "../drawing/DrawingProductionController";

import type {
  DrawingProfessionalSnapshot,
} from "../drawing/DrawingProfessionalModel";

import type {
  FrameLogicPieceSourceGeometry,
  PieceFrameLogicPackageController,
} from "../interaction/PieceFrameLogicPackageController";

import type {
  LoadedModelInfo,
} from "../models/LoadedModel";

interface PiecePackageRuntime {
  readonly sources: Map<
    string,
    FrameLogicPieceSourceGeometry
  >;
}

export interface ProjectGeometrySource {
  readonly definitionId: string;
  readonly format: "STEP" | "IFC";
  readonly fileName: string;
  readonly dataBase64: string;
}

export interface ProjectReferenceSource {
  readonly fileName: string;
  readonly dataBase64: string;
  readonly layerId?: string;
  readonly visible?: boolean;
}

export interface FrameLogicProjectPackageV1 {
  readonly schema: "FRAMELOGIC_PROJECT";
  readonly version: 1;
  readonly createdAt: string;
  readonly name: string;
  readonly activeLayerId: string;
  readonly layers: readonly DesignLayer[];
  readonly pieceDefinitions: readonly PieceDefinition[];
  readonly pieceInstances: readonly PieceInstance[];
  readonly assemblies: readonly Assembly[];
  readonly cadPoints: readonly CadPoint[];
  readonly cadLines: readonly CadLine[];
  readonly geometrySources: readonly ProjectGeometrySource[];
  readonly referenceSources: readonly ProjectReferenceSource[];
  readonly engineering: FrameLogicEngineeringSnapshot;
  readonly documentation: FrameLogicDocumentationSnapshot;
  readonly professionalDrawing: DrawingProfessionalSnapshot;
}

export type FrameLogicProjectPackage =
  FrameLogicProjectPackageV1;

export interface FrameLogicProjectPackageControllerOptions {
  readonly container: HTMLElement;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly cadPointScene: CadPointSceneController;
  readonly cadLineScene: CadLineSceneController;
  readonly piecePackage: PieceFrameLogicPackageController;
  readonly createEngineeringSnapshot: () => FrameLogicEngineeringSnapshot;
  readonly restoreEngineeringSnapshot: (snapshot: FrameLogicEngineeringSnapshot) => void;
  readonly createDocumentationSnapshot: () => FrameLogicDocumentationSnapshot;
  readonly restoreDocumentationSnapshot: (snapshot: FrameLogicDocumentationSnapshot) => void;
  readonly createProfessionalSnapshot: () => DrawingProfessionalSnapshot;
  readonly restoreProfessionalSnapshot: (snapshot: DrawingProfessionalSnapshot) => void;
  readonly importStepPiece: (
    document: StepGeometryDocument,
    input: {
      readonly code: string;
      readonly name: string;
      readonly classification?: string;
      readonly tags?: readonly string[];
    },
  ) => {
    readonly definition: PieceDefinition;
  };
  readonly importIfcPiece: (
    file: File,
    input: {
      code: string;
      name?: string;
      classification?: string;
      tags?: string[];
    },
  ) => Promise<{
    readonly definition: PieceDefinition;
  }>;
  readonly createPieceInstance: (
    input: {
      readonly id?: string;
      readonly definitionId: string;
      readonly layerId?: string;
      readonly transform?: PieceInstance["transform"];
      readonly tags?: readonly string[];
    },
  ) => PieceInstance;
  readonly loadReferenceIfc: (file: File) => Promise<LoadedModelInfo>;
  readonly setReferenceVisible: (id: string, visible: boolean) => boolean;
  readonly setReferenceLayer: (id: string, layerId: string) => boolean;
  readonly clearReferenceModels: () => void;
  readonly cancelActiveCadCommand: () => void;
  readonly clearCadHistory?: () => void;
  readonly clearGeometryQueryCache: () => void;
  readonly onProjectRestored?: () => void | Promise<void>;
}

interface RegisteredReference {
  readonly fileName: string;
  readonly data: Uint8Array<ArrayBuffer>;
  layerId?: string;
  visible?: boolean;
}

/**
 * Paquete autocontenido de proyecto. A diferencia del snapshot de Drawing,
 * conserva los bytes originales STEP/IFC necesarios para reconstruir los
 * prototipos visuales y el B-Rep al volver a abrir el archivo.
 */
export class FrameLogicProjectPackageController {
  private readonly options: FrameLogicProjectPackageControllerOptions;
  private readonly pieceRuntime: PiecePackageRuntime;
  private readonly references: RegisteredReference[] = [];
  private readonly toolbar: HTMLDivElement;
  private readonly fileInput: HTMLInputElement;
  private disposed = false;

  constructor(
    options: FrameLogicProjectPackageControllerOptions,
  ) {
    this.options = options;
    this.pieceRuntime = options.piecePackage as unknown as PiecePackageRuntime;
    this.toolbar = this.createToolbar(options.container);
    this.fileInput = this.createFileInput(options.container);
  }

  async registerReferenceIfc(
    file: File,
    model?: LoadedModelInfo,
  ): Promise<void> {
    const data =
      cloneBytes(
        new Uint8Array(
          await file.arrayBuffer(),
        ),
      );
    this.references.push({
      fileName: file.name,
      data,
      layerId: model?.layerId,
      visible: model?.visible,
    });
  }

  createProjectPackage(
    name = "FrameLogic Project",
  ): FrameLogicProjectPackage {
    const definitions =
      this.options.designModel
        .pieceDefinitions
        .getAll();
    const geometrySources:
      ProjectGeometrySource[] = [];

    for (const definition of definitions) {
      const source =
        this.pieceRuntime.sources.get(
          definition.id,
        );
      if (!source) {
        throw new Error(
          `La pieza ${definition.code} no conserva su STEP/IFC original. Reimpórtala antes de guardar el proyecto.`,
        );
      }
      geometrySources.push({
        definitionId: definition.id,
        format: source.format,
        fileName: source.fileName,
        dataBase64: encodeBase64(source.data),
      });
    }

    return {
      schema: "FRAMELOGIC_PROJECT",
      version: 1,
      createdAt: new Date().toISOString(),
      name,
      activeLayerId:
        this.options.designModel.layers.activeLayerId,
      layers:
        cloneJson(
          this.options.designModel.layers.getAll(),
        ),
      pieceDefinitions:
        cloneJson(definitions),
      pieceInstances:
        cloneJson(
          this.options.designModel.pieceInstances.getAll(),
        ),
      assemblies:
        cloneJson(
          this.options.designModel.assemblies.getAll(),
        ),
      cadPoints:
        cloneJson(
          this.options.designModel.cadPoints.getAll(),
        ),
      cadLines:
        cloneJson(
          this.options.designModel.cadLines.getAll(),
        ),
      geometrySources,
      referenceSources:
        this.references.map(
          (reference) => ({
            fileName: reference.fileName,
            dataBase64: encodeBase64(reference.data),
            layerId: reference.layerId,
            visible: reference.visible,
          }),
        ),
      engineering:
        this.options.createEngineeringSnapshot(),
      documentation:
        this.options.createDocumentationSnapshot(),
      professionalDrawing:
        this.options.createProfessionalSnapshot(),
    };
  }

  saveProject(
    name?: string,
  ): void {
    const packageValue =
      this.createProjectPackage(
        name
        ?? "FrameLogic Project",
      );
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
          type: "application/json",
        },
      );
    const url =
      URL.createObjectURL(blob);
    const anchor =
      document.createElement("a");
    anchor.href = url;
    anchor.download =
      `${safeFileName(packageValue.name)}.flproject`;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async openProjectFile(
    file: File,
  ): Promise<void> {
    const packageValue =
      parseProjectPackage(
        await file.text(),
      );
    await this.restoreProjectPackage(
      packageValue,
    );
  }

  async restoreProjectPackage(
    packageValue: FrameLogicProjectPackage,
  ): Promise<void> {
    // Fail before clearing the running model: malformed hierarchy in a
    // .flproject must never replace a healthy in-memory project.
    if (!Array.isArray(packageValue.assemblies)) {
      throw new Error("El proyecto no contiene una lista válida de ensambles.");
    }
    validateAssemblyHierarchy(packageValue.assemblies);
    // Undo/Redo from another .flproject must never restore that project's
    // assembly structure into the newly opened project.
    this.options.clearCadHistory?.();
    this.options.cancelActiveCadCommand();
    this.options.clearReferenceModels();
    this.references.length = 0;

    this.options.designScene.clearInstances();
    this.options.designScene.clearAssetPrototypes();
    this.options.designModel.clear();
    this.options.cadPointScene.sync();
    this.options.cadLineScene.sync();
    this.pieceRuntime.sources.clear();

    restoreLayers(
      this.options.designModel,
      packageValue.layers,
      packageValue.activeLayerId,
    );

    const definitionByOldId =
      new Map<string, string>();
    const sourceByDefinition =
      new Map(
        packageValue.geometrySources.map(
          (source) => [
            source.definitionId,
            source,
          ] as const,
        ),
      );
    const stepAdapter =
      new OcctStepGeometryAdapter();

    for (const oldDefinition of packageValue.pieceDefinitions) {
      const source =
        sourceByDefinition.get(
          oldDefinition.id,
        );
      if (!source) {
        throw new Error(
          `El proyecto no contiene la geometría original de ${oldDefinition.code}.`,
        );
      }
      const bytes =
        decodeBase64(source.dataBase64);
      const input = {
        code: oldDefinition.code,
        name: oldDefinition.name,
        classification: oldDefinition.classification,
        tags: [...oldDefinition.tags],
      };
      const imported =
        source.format === "STEP"
          ? this.options.importStepPiece(
              await stepAdapter.load(
                bytes,
                {
                  sourceFileName: source.fileName,
                  targetUnit: "meter",
                  includeExactFeatures: true,
                },
              ),
              input,
            )
          : await this.options.importIfcPiece(
              new File(
                [bytes],
                source.fileName,
                {
                  type: "application/octet-stream",
                },
              ),
              {
                code: input.code,
                name: input.name,
                classification: input.classification,
                tags: input.tags,
              },
            );

      definitionByOldId.set(
        oldDefinition.id,
        imported.definition.id,
      );
      restoreDefinitionMetadata(
        this.options.designModel,
        imported.definition.id,
        oldDefinition,
      );
    }

    const engineering =
      remapEngineeringSnapshot(
        packageValue.engineering,
        definitionByOldId,
      );
    this.options.restoreEngineeringSnapshot(
      engineering,
    );

    for (const oldInstance of packageValue.pieceInstances) {
      const definitionId =
        definitionByOldId.get(
          oldInstance.definitionId,
        );
      if (!definitionId) {
        throw new Error(
          `No se pudo reconstruir la definición de la instancia ${oldInstance.id}.`,
        );
      }
      this.options.createPieceInstance({
        id: oldInstance.id,
        definitionId,
        layerId:
          this.options.designModel.layers.get(oldInstance.layerId)
            ? oldInstance.layerId
            : undefined,
        transform: cloneJson(oldInstance.transform),
        tags: [...oldInstance.tags],
      });
    }

    for (const point of packageValue.cadPoints) {
      this.options.designModel.registerCadPoint({
        id: point.id,
        layerId:
          this.options.designModel.layers.get(point.layerId)
            ? point.layerId
            : undefined,
        position: { ...point.position },
      });
    }
    this.options.cadPointScene.sync();

    for (const line of packageValue.cadLines) {
      this.options.designModel.registerCadLine({
        id: line.id,
        layerId:
          this.options.designModel.layers.get(line.layerId)
            ? line.layerId
            : undefined,
        start: { ...line.start },
        end: { ...line.end },
      });
    }
    this.options.cadLineScene.sync();

    for (const assembly of packageValue.assemblies) {
      this.options.designModel.assemblies.register({
        id: assembly.id,
        name: assembly.name,
        layerId:
          this.options.designModel.layers.get(assembly.layerId)
            ? assembly.layerId
            : undefined,
        classification: assembly.classification,
        tags: [...assembly.tags],
        pieceInstanceIds: [...assembly.pieceInstanceIds],
        parentAssemblyId: assembly.parentAssemblyId,
        locked: assembly.locked,
      });
    }

    this.options.restoreDocumentationSnapshot(
      packageValue.documentation,
    );
    this.options.restoreProfessionalSnapshot(
      packageValue.professionalDrawing,
    );

    for (const reference of packageValue.referenceSources) {
      const bytes =
        decodeBase64(
          reference.dataBase64,
        );
      const file =
        new File(
          [bytes],
          reference.fileName,
          {
            type: "application/octet-stream",
          },
        );
      const model =
        await this.options.loadReferenceIfc(file);
      await this.registerReferenceIfc(
        file,
        model,
      );
      if (
        reference.layerId
        && this.options.designModel.layers.get(reference.layerId)
      ) {
        this.options.setReferenceLayer(
          model.id,
          reference.layerId,
        );
      }
      if (reference.visible !== undefined) {
        this.options.setReferenceVisible(
          model.id,
          reference.visible,
        );
      }
    }

    this.options.clearGeometryQueryCache();
    await this.options.onProjectRestored?.();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.toolbar.remove();
    this.fileInput.remove();
    this.references.length = 0;
  }

  private createToolbar(
    container: HTMLElement,
  ): HTMLDivElement {
    const bar =
      document.createElement("div");
    bar.dataset["framelogicProjectToolbar"] = "true";
    Object.assign(
      bar.style,
      {
        position: "absolute",
        left: "16px",
        top: "16px",
        zIndex: "125",
        display: "flex",
        gap: "5px",
        padding: "5px",
        border: "1px solid rgba(255,255,255,0.15)",
        borderRadius: "6px",
        background: "rgba(18,25,30,0.92)",
        font: "12px system-ui, sans-serif",
      },
    );
    const save =
      makeButton(
        "Guardar proyecto",
      );
    const open =
      makeButton(
        "Abrir proyecto",
      );
    save.dataset["framelogicFileCommand"] = "save-project";
    open.dataset["framelogicFileCommand"] = "open-project";
    save.addEventListener(
      "click",
      () => {
        try {
          const name =
            window.prompt(
              "Nombre del proyecto",
              "FrameLogic Project",
            );
          if (name === null) return;
          this.saveProject(
            name.trim()
            || "FrameLogic Project",
          );
        }
        catch (error) {
          window.alert(
            error instanceof Error
              ? error.message
              : String(error),
          );
        }
      },
    );
    open.addEventListener(
      "click",
      () =>
        this.fileInput.click(),
    );
    bar.append(save, open);
    container.append(bar);
    return bar;
  }

  private createFileInput(
    container: HTMLElement,
  ): HTMLInputElement {
    const input =
      document.createElement("input");
    input.type = "file";
    input.accept = ".flproject,.json";
    input.hidden = true;
    input.addEventListener(
      "change",
      () => {
        const file =
          input.files?.[0];
        if (!file) return;
        void this.openProjectFile(file)
          .catch(
            (error) => {
              console.error(
                "Error opening FrameLogic project:",
                error,
              );
              window.alert(
                `No se pudo abrir el proyecto.\n\n${
                  error instanceof Error
                    ? error.message
                    : String(error)
                }`,
              );
            },
          )
          .finally(
            () => {
              input.value = "";
            },
          );
      },
    );
    container.append(input);
    return input;
  }
}

export function parseProjectPackage(
  text: string,
): FrameLogicProjectPackage {
  const value =
    JSON.parse(text) as Partial<FrameLogicProjectPackage>;
  if (
    value.schema !== "FRAMELOGIC_PROJECT"
    || value.version !== 1
    || !Array.isArray(value.pieceDefinitions)
    || !Array.isArray(value.pieceInstances)
    || !Array.isArray(value.assemblies)
    || !Array.isArray(value.geometrySources)
  ) {
    throw new Error(
      "El archivo no es un proyecto FrameLogic compatible.",
    );
  }
  return value as FrameLogicProjectPackage;
}

function restoreLayers(
  designModel: DesignModel,
  layers: readonly DesignLayer[],
  activeLayerId: string,
): void {
  for (const layer of layers) {
    const current =
      designModel.layers.get(layer.id);
    if (current) {
      designModel.layers.update(
        layer.id,
        {
          name: layer.name,
          visible: layer.visible,
          locked: layer.locked,
          snapEnabled: layer.snapEnabled,
        },
      );
    }
    else {
      designModel.layers.create({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        snapEnabled: layer.snapEnabled,
      });
    }
  }
  if (designModel.layers.get(activeLayerId)) {
    designModel.layers.setActiveLayer(activeLayerId);
  }
}

function restoreDefinitionMetadata(
  designModel: DesignModel,
  newDefinitionId: string,
  oldDefinition: PieceDefinition,
): void {
  designModel.pieceDefinitions.updateCoordinateSystem(
    newDefinitionId,
    cloneJson(oldDefinition.coordinateSystem),
    false,
  );
  for (const snap of oldDefinition.snapPoints) {
    designModel.pieceDefinitions.addSnapPoint(
      newDefinitionId,
      {
        id: snap.id,
        name: snap.name,
        type: snap.type,
        position: { ...snap.position },
        relatedAxisId: snap.relatedAxisId,
      },
    );
  }
  for (const axis of oldDefinition.referenceGeometry.axisLines) {
    designModel.pieceDefinitions.addReferenceAxisLine(
      newDefinitionId,
      {
        id: axis.id,
        name: axis.name,
        type: axis.type,
        origin: { ...axis.origin },
        direction: { ...axis.direction },
        length: axis.length,
      },
    );
  }
}

function remapEngineeringSnapshot(
  snapshot: FrameLogicEngineeringSnapshot,
  definitionMap: ReadonlyMap<string, string>,
): FrameLogicEngineeringSnapshot {
  return {
    schema: "FRAMELOGIC_ENGINEERING",
    version: 1,
    pieces:
      snapshot.pieces.map(
        (piece) => ({
          ...cloneJson(piece),
          pieceDefinitionId:
            definitionMap.get(piece.pieceDefinitionId)
            ?? piece.pieceDefinitionId,
        }),
      ),
    assemblies:
      snapshot.assemblies.map(
        (assembly) => ({
          ...cloneJson(assembly),
          components:
            assembly.components.map(
              (component) => ({
                ...cloneJson(component),
                pieceDefinitionId:
                  definitionMap.get(component.pieceDefinitionId)
                  ?? component.pieceDefinitionId,
              }),
            ),
        }),
      ),
  };
}

function cloneBytes(
  data: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const buffer =
    new ArrayBuffer(data.byteLength);
  const clone =
    new Uint8Array(buffer);
  clone.set(data);
  return clone;
}

function encodeBase64(
  data: Uint8Array,
): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
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
    chunks.join(""),
  );
}

function decodeBase64(
  value: string,
): Uint8Array<ArrayBuffer> {
  const binary =
    window.atob(value);
  const buffer =
    new ArrayBuffer(binary.length);
  const bytes =
    new Uint8Array(buffer);
  for (
    let index = 0;
    index < binary.length;
    index += 1
  ) {
    bytes[index] =
      binary.charCodeAt(index);
  }
  return bytes;
}

function cloneJson<T>(
  value: T,
): T {
  return JSON.parse(
    JSON.stringify(value),
  ) as T;
}

function safeFileName(
  value: string,
): string {
  return value
    .trim()
    .replace(
      /[^a-zA-Z0-9._-]+/g,
      "_",
    )
    .replace(
      /^_+|_+$/g,
      "",
    )
    || "framelogic_project";
}

function makeButton(
  label: string,
): HTMLButtonElement {
  const button =
    document.createElement("button");
  button.type = "button";
  button.textContent = label;
  Object.assign(
    button.style,
    {
      padding: "5px 8px",
      border: "1px solid rgba(255,255,255,0.16)",
      borderRadius: "4px",
      background: "#27343c",
      color: "#f3f7f9",
      cursor: "pointer",
    },
  );
  return button;
}
