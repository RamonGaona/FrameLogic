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
  PrecisionCameraController,
} from "../precision/PrecisionCameraController";

import type {
  PrecisionCameraControls,
} from "../precision/PrecisionCameraController";

import {
  PrecisionSnapEngine,
} from "../precision/PrecisionSnapEngine";

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
  };


export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core = await createSelectionSafeBimCore(
    container,
  );
  const canvas = core.world.renderer.three.domElement;
  const geometryQuery = new GeometryQueryEngine(
    canvas,
    () => core.world.camera.three,
    core.designScene,
    core.designModel,
  );
  const snapRuntime = core.designSnap as unknown as DesignSnapRuntime;
  const legacyFindSnap = core.designSnap.findSnap.bind(
    core.designSnap,
  );
  const snapEngine = new PrecisionSnapEngine(
    canvas,
    () => core.world.camera.three,
    geometryQuery,
    legacyFindSnap,
    () => Array.from(
      snapRuntime.excludedInstanceIds,
    ),
    () => core.designSnap.isEnabled,
  );
  const measurement = new MeasurementEngine();
  const precisionCamera = new PrecisionCameraController(
    () => core.world.camera.three,
    core.world.camera.controls as unknown as PrecisionCameraControls,
  );

  snapRuntime.findSnap = (
    clientX,
    clientY,
  ) => snapEngine.findSnap(
    clientX,
    clientY,
  );

  const baseDispose = core.dispose;
  let disposed = false;

  return {
    ...core,
    geometryQuery,
    snapEngine,
    measurement,
    precisionCamera,

    dispose: () => {
      if (
        disposed
      ) {
        return;
      }

      disposed = true;

      snapRuntime.findSnap = legacyFindSnap;
      precisionCamera.dispose();
      geometryQuery.dispose();
      baseDispose();
    },
  };
}
