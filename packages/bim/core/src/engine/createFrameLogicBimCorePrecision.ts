import {
  FrameLogicEngineeringModel,
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

  const importStepPiece = (
    document: StepGeometryDocument,
    input: ImportStepVisualPieceInput,
  ):
    ImportedStepVisualPiece =>
      importStepVisualPiece(
        document,
        input,
        core.designModel,
        core.designScene,
        engineeringModel,
      );

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
    geometryQuery,
    snapEngine,
    measurement,
    precisionCamera,
    engineeringModel,
    structuralModel,
    importStepPiece,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      snapRuntime.findSnap =
        legacyFindSnap;
      precisionCamera.dispose();
      removeStepEngineeringProvider();
      removeMeshAnalyticProvider();
      meshAnalyticProvider.dispose();
      geometryQuery.dispose();
      baseDispose();
    },
  };
}
