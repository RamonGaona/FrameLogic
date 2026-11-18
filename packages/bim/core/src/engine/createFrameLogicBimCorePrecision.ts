import {
  createEngineeringSnapshot,
  FrameLogicEngineeringModel,
  restoreEngineeringSnapshot,
} from "@framelogic/domain";

import type {
  FrameLogicEngineeringSnapshot,
} from "@framelogic/domain";

import type {
  StepGeometryDocument,
} from "@framelogic/geometry";

import type {
  BimCoreInstance,
} from "./createBimCore";

import {
  createBimCore as createSelectionSafeBimCore,
} from "./createFrameLogicBimCoreSelectionSafe";

import {
  GeometryQueryEngine,
} from "../precision/GeometryQueryEngine";

import {
  MeasurementEngine,
} from "../precision/MeasurementEngine";

import {
  MeshAnalyticFeatureProvider,
} from "../precision/MeshAnalyticFeatureProvider";

import {
  PrecisionCameraController,
} from "../precision/PrecisionCameraController";

import type {
  PrecisionCameraControls,
} from "../precision/PrecisionCameraController";

import {
  PrecisionSnapEngine,
} from "../precision/PrecisionSnapEngine";

import {
  StepEngineeringFeatureProvider,
} from "../precision/StepEngineeringFeatureProvider";

import {
  StructuralModelExtractor,
} from "../structural/StructuralModelExtractor";

import {
  importStepVisualPiece,
} from "../step/StepVisualImporter";

import type {
  ImportedStepVisualPiece,
  ImportStepVisualPieceInput,
} from "../step/StepVisualImporter";

import type {
  DesignSnapResult,
} from "../interaction/DesignSnapController";

import {
  PieceFrameLogicWorkspaceController,
} from "../interaction/PieceFrameLogicWorkspaceController";

import {
  PieceFrameLogicPackageController,
} from "../interaction/PieceFrameLogicPackageController";
import { MoveCadLineCommand } from "../commands/MoveCadLineCommand";
import { finishActiveLineForAxisConversion } from "../interaction/finishActiveLineForAxisConversion";


interface DesignSnapRuntime {
  readonly excludedInstanceIds: Set<string>;
  findSnap: (
    clientX: number,
    clientY: number,
  ) => DesignSnapResult | null;
}


interface PieceClipboardEntry {
  readonly definitionId: string;
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


interface PastedPieceEntry
  extends PieceClipboardEntry {
  readonly id: string;
}


export type PrecisionBimCoreInstance =
  BimCoreInstance
  & {
    readonly geometryQuery: GeometryQueryEngine;
    readonly snapEngine: PrecisionSnapEngine;
    readonly measurement: MeasurementEngine;
    readonly precisionCamera: PrecisionCameraController;

    /**
     * Datos de ingeniería independientes de IFC:
     * metadata, features STEP, ensamblajes y ejes estructurales.
     */
    readonly engineeringModel: FrameLogicEngineeringModel;

    /**
     * Workspace contextual para convertir/editar una pieza FrameLogic.
     */
    readonly pieceFrameLogicWorkspace:
      PieceFrameLogicWorkspaceController;

    /**
     * Conserva la geometría original y genera archivos .flpiece.
     */
    readonly pieceFrameLogicPackage:
      PieceFrameLogicPackageController;

    /**
     * Extrae ejes estructurales colocados y genera nodos/miembros.
     */
    readonly structuralModel: StructuralModelExtractor;

    /**
     * Importación STEP directa. No genera un IFC intermedio.
     */
    readonly importStepPiece: (
      document: StepGeometryDocument,
      input: ImportStepVisualPieceInput,
    ) => ImportedStepVisualPiece;

    /**
     * Snapshot persistente de metadata/ensambles/ejes independiente de IFC.
     */
    readonly createEngineeringSnapshot: () =>
      FrameLogicEngineeringSnapshot;

    readonly restoreEngineeringSnapshot: (
      snapshot: FrameLogicEngineeringSnapshot,
    ) => void;
  };


export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core =
    await createSelectionSafeBimCore(
      container,
    );
  const renderer =
    core.world.renderer;

  if (!renderer) {
    core.dispose();
    throw new Error(
      "FrameLogic precision model space requires an initialized renderer.",
    );
  }

  /*
   * FrameLogic es un espacio de trabajo de precisión.
   *
   * ORTHOGRAPHIC es la proyección primaria: evita la distorsión visual
   * de perspectiva y hace que TOP/FRONT/RIGHT/ISO se comporten como
   * vistas técnicas. PERSPECTIVE sigue disponible mediante el toggle,
   * pero deja de ser el estado inicial del model space.
   *
   * Un proyecto nuevo debe abrir siempre con Norte arriba y vista TOP.
   * Primero fijamos el azimut N y después TOP conserva ese azimut al
   * llevar el ángulo polar a 0. La restauración de un .flproject puede
   * sustituir posteriormente esta vista por la cámara guardada del proyecto.
   */
  if (
    core.getCameraProjectionMode()
    !== "ORTHOGRAPHIC"
  ) {
    await core.toggleCameraProjection();
  }

  await core.setCardinalDirection(
    "N",
  );

  await core.setStandardView(
    "TOP",
  );

  const canvas =
    core.viewport.canvas;
  const engineeringModel =
    new FrameLogicEngineeringModel();
  const geometryQuery =
    new GeometryQueryEngine(
      canvas,
      () => core.viewport.camera,
      core.designScene,
      core.designModel,
    );
  const meshAnalyticProvider =
    new MeshAnalyticFeatureProvider(
      core.designModel,
      core.designScene,
    );
  const stepEngineeringProvider =
    new StepEngineeringFeatureProvider(
      engineeringModel,
      core.designModel,
      core.designScene,
    );
  const removeMeshAnalyticProvider =
    geometryQuery.addProvider(
      meshAnalyticProvider,
    );
  const removeStepEngineeringProvider =
    geometryQuery.addProvider(
      stepEngineeringProvider,
    );
  const snapRuntime =
    core.designSnap as unknown as DesignSnapRuntime;
  const legacyFindSnap =
    core.designSnap.findSnap.bind(
      core.designSnap,
    );
  const snapEngine =
    new PrecisionSnapEngine(
      canvas,
      () => core.viewport.camera,
      geometryQuery,
      legacyFindSnap,
      () => Array.from(
        snapRuntime.excludedInstanceIds,
      ),
      () => core.designSnap.isEnabled,
    );
  const measurement =
    new MeasurementEngine();
  const precisionCamera =
    new PrecisionCameraController(
      () => core.viewport.camera,
      core.world.camera.controls as unknown as PrecisionCameraControls,
    );
  const structuralModel =
    new StructuralModelExtractor(
      core.designModel,
      core.designScene,
      engineeringModel,
    );

  const pieceFrameLogicPackage =
    new PieceFrameLogicPackageController(
      container,
      core.designModel,
      core.designSelection,
      engineeringModel,
      core.designScene,
    );

  const pieceFrameLogicWorkspace =
    new PieceFrameLogicWorkspaceController(
      container,
      canvas,
      core.designModel,
      core.designSelection,
      engineeringModel,
      {
        startPreparation: (
          instanceId,
        ) => {
          core.startPieceDefinitionPreparation(
            instanceId,
          );
        },
        stopPreparation: () => {
          core.stopPieceDefinitionPreparation();
        },
        startPoint: () => core.startPointCommand(),
        startOriginSnap: () => {
          const pinned = core.piecePreparation.getPinnedSnapId();
          if (pinned) core.piecePreparation.setOriginFromSnapId(pinned);
          else core.startPreparedPieceOriginSnapEdit();
        },
        addSnapsFromSelection: () =>
          core.addPreparedPieceSnapsFromSelection(),
        addAxesFromSelection: () =>
          core.addPreparedPieceAxesFromSelection(),
        startCadLineMove: () => {
          // Finalize the current LINE command but preserve its last segment.
          // Selecting a line after activation would reset native gizmo state.
          finishActiveLineForAxisConversion(
            core.cadCommandManager, core.cadLinePlacement, core.cadLineSelection,
            id => Boolean(core.designModel.cadLines.get(id)),
          );
          if (!core.cadLineSelection.getSelectedIds().length) return false;
          return core.cadCommandManager.start(new MoveCadLineCommand(core.cadLineMove));
        },
        setIsoView: () =>
          core.setStandardView(
            "ISO",
          ),
      },
    );

  const importStepPiece = (
    document: StepGeometryDocument,
    input: ImportStepVisualPieceInput,
  ):
    ImportedStepVisualPiece => {
    const imported =
      importStepVisualPiece(
        document,
        input,
        core.designModel,
        core.designScene,
        engineeringModel,
      );

    if (
      document.sourceData
    ) {
      pieceFrameLogicPackage
        .registerSource(
          imported.definition.id,
          {
            format:
              "STEP",
            fileName:
              document.sourceFileName,
            data:
              document.sourceData,
          },
        );
    }

    return imported;
  };

  const baseImportDesignPieceIfc =
    core.importDesignPieceIfc.bind(
      core,
    );

  const importDesignPieceIfc =
    async (
      file: File,
      input:
        Parameters<
          BimCoreInstance[
            "importDesignPieceIfc"
          ]
        >[1],
    ) => {
      const sourceData =
        new Uint8Array(
          await file.arrayBuffer(),
        );
      const imported =
        await baseImportDesignPieceIfc(
          file,
          input,
        );

      pieceFrameLogicPackage
        .registerSource(
          imported.definition.id,
          {
            format:
              "IFC",
            fileName:
              file.name,
            data:
              sourceData,
          },
        );

      return imported;
    };

  const baseLoadIfcFile =
    core.loadIfcFile.bind(
      core,
    );

  const loadIfcFile =
    async (
      file: File,
    ) => {
      const model =
        await baseLoadIfcFile(
          file,
        );

      /*
       * Un IFC de referencia no cambia la política de cámara de FrameLogic.
       * Después de cargarlo recuperamos una vista ISO ortográfica encuadrada.
       */
      if (
        core.getCameraProjectionMode()
        !== "ORTHOGRAPHIC"
      ) {
        await core.toggleCameraProjection();
      }

      await core.setStandardView(
        "ISO",
      );

      return model;
    };

  snapRuntime.findSnap = (
    clientX,
    clientY,
  ) =>
    snapEngine.findSnap(
      clientX,
      clientY,
    );

  let pieceClipboard:
    PieceClipboardEntry[] =
      [];

  const isEditableTarget = (
    target: EventTarget | null,
  ): boolean => {
    if (
      !(target instanceof HTMLElement)
    ) {
      return false;
    }

    return (
      target.isContentEditable
      || target.tagName === "INPUT"
      || target.tagName === "TEXTAREA"
      || target.tagName === "SELECT"
    );
  };

  const cloneClipboardEntry = (
    instanceId: string,
  ):
    PieceClipboardEntry
    | null => {
    const instance =
      core.designModel
        .pieceInstances
        .get(
          instanceId,
        );

    if (!instance) {
      return null;
    }

    return {
      definitionId:
        instance.definitionId,
      layerId:
        instance.layerId,
      transform: {
        position: {
          x:
            instance.transform.position.x,
          y:
            instance.transform.position.y,
          z:
            instance.transform.position.z,
        },
        rotation: {
          x:
            instance.transform.rotation.x,
          y:
            instance.transform.rotation.y,
          z:
            instance.transform.rotation.z,
        },
      },
      tags: [
        ...instance.tags,
      ],
    };
  };

  const createPastedPiece = (
    entry: PieceClipboardEntry,
    id?: string,
  ):
    PastedPieceEntry => {
    const instance =
      core.createDesignPieceInstance({
        id,
        definitionId:
          entry.definitionId,
        layerId:
          entry.layerId,
        transform: {
          position: {
            ...entry.transform.position,
          },
          rotation: {
            ...entry.transform.rotation,
          },
        },
        tags: [
          ...entry.tags,
        ],
      });

    return {
      id:
        instance.id,
      definitionId:
        instance.definitionId,
      layerId:
        instance.layerId,
      transform: {
        position: {
          ...instance.transform.position,
        },
        rotation: {
          ...instance.transform.rotation,
        },
      },
      tags: [
        ...instance.tags,
      ],
    };
  };

  const pasteClipboard = (): void => {
    if (
      pieceClipboard.length < 1
    ) {
      return;
    }

    core.cancelActiveCadCommand();

    const pasted =
      pieceClipboard.map(
        (
          entry,
        ) =>
          createPastedPiece(
            entry,
          ),
      );

    const pastedIds =
      pasted.map(
        (
          entry,
        ) =>
          entry.id,
      );

    core.designSelection
      .setSelection(
        pastedIds,
      );

    core.cadHistory
      .recordOperation(
        "PASTE_PIECES",
        () => {
          core.cancelActiveCadCommand();
          core.designSelection
            .clearSelection();

          for (
            const entry
            of pasted
          ) {
            core.removeDesignPieceInstance(
              entry.id,
            );
          }
        },
        () => {
          const restoredIds:
            string[] =
              [];

          for (
            const entry
            of pasted
          ) {
            const restored =
              createPastedPiece(
                entry,
                entry.id,
              );

            restoredIds.push(
              restored.id,
            );
          }

          core.designSelection
            .setSelection(
              restoredIds,
            );
        },
      );

    /*
     * La copia nace exactamente en la misma coordenada para no introducir
     * desplazamientos arbitrarios. MOVE queda activo para que el usuario
     * pueda colocarla inmediatamente. Escape oculta el gizmo y conserva
     * la copia en la posición original si se desea una superposición exacta.
     */
    core.startMoveCommand();
  };

  const handlePieceClipboardKeyDown =
    (
      event: KeyboardEvent,
    ): void => {
      if (
        isEditableTarget(
          event.target,
        )
      ) {
        return;
      }

      const commandModifier =
        event.ctrlKey
        || event.metaKey;

      if (
        !commandModifier
        || event.altKey
      ) {
        return;
      }

      const key =
        event.key.toLowerCase();

      if (
        key === "c"
      ) {
        const selectedIds =
          core.designSelection
            .getSelectedIds();

        const copied =
          selectedIds
            .map(
              cloneClipboardEntry,
            )
            .filter(
              (
                entry,
              ): entry is PieceClipboardEntry =>
                entry !== null,
            );

        if (
          copied.length < 1
        ) {
          return;
        }

        pieceClipboard =
          copied;

        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        key === "v"
        && pieceClipboard.length > 0
      ) {
        event.preventDefault();
        event.stopPropagation();
        pasteClipboard();
      }
    };

  window.addEventListener(
    "keydown",
    handlePieceClipboardKeyDown,
  );

  const baseDispose =
    core.dispose;
  let disposed =
    false;

  return {
    ...core,
    loadIfcFile,
    importDesignPieceIfc,
    geometryQuery,
    snapEngine,
    measurement,
    precisionCamera,
    engineeringModel,
    pieceFrameLogicWorkspace,
    pieceFrameLogicPackage,
    structuralModel,
    importStepPiece,
    createEngineeringSnapshot: () =>
      createEngineeringSnapshot(
        engineeringModel,
      ),
    restoreEngineeringSnapshot: (
      snapshot,
    ) => {
      restoreEngineeringSnapshot(
        engineeringModel,
        snapshot,
      );
      geometryQuery.clearCache();
    },
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      window.removeEventListener(
        "keydown",
        handlePieceClipboardKeyDown,
      );
      pieceClipboard =
        [];
      snapRuntime.findSnap =
        legacyFindSnap;
      pieceFrameLogicWorkspace.dispose();
      pieceFrameLogicPackage.dispose();
      snapEngine.dispose();
      precisionCamera.dispose();
      removeStepEngineeringProvider();
      removeMeshAnalyticProvider();
      meshAnalyticProvider.dispose();
      geometryQuery.dispose();
      baseDispose();
    },
  };
}
