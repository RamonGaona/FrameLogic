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


interface DesignSnapRuntime {
  readonly excludedInstanceIds: Set<string>;
  findSnap: (
    clientX: number,
    clientY: number,
  ) => DesignSnapResult | null;
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

  const canvas =
    renderer.three.domElement;
  const engineeringModel =
    new FrameLogicEngineeringModel();
  const geometryQuery =
    new GeometryQueryEngine(
      canvas,
      () => core.world.camera.three,
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
      () => core.world.camera.three,
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
      () => core.world.camera.three,
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
        startOriginSnap: () => {
          core.startPreparedPieceOriginSnapEdit();
        },
        addSnapsFromSelection: () =>
          core.addPreparedPieceSnapsFromSelection(),
        addAxesFromSelection: () =>
          core.addPreparedPieceAxesFromSelection(),
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
