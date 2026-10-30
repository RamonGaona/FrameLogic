import {
  createBimCore as createAdvancedCadBimCore,
} from "./advancedCadNavigationIndex";

import type {
  PrecisionBimCoreInstance as AdvancedCadPrecisionBimCoreInstance,
} from "./advancedCadNavigationIndex";

import {
  CadPolylineGripController,
} from "./interaction/CadPolylineGripController";


export * from "./advancedCadNavigationIndex";

export {
  CadPolylineGripController,
} from "./interaction/CadPolylineGripController";

export type {
  CadPolylineGripControllerOptions,
} from "./interaction/CadPolylineGripController";


export type PrecisionBimCoreInstance =
  AdvancedCadPrecisionBimCoreInstance
  & {
    readonly cadPolylineGrips:
      CadPolylineGripController;
  };


/**
 * Capa de grips directos para POLYLINE.
 *
 * Mantiene la selección CAD histórica a nivel de tramo para no alterar TRIM,
 * pero detecta la entidad POLYLINE padre y expone sus vértices como grips
 * arrastrables con SNAP / ORTO / Undo-Redo.
 */
export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core =
    await createAdvancedCadBimCore(
      container,
    );

  const renderer =
    core.world.renderer;

  if (!renderer) {
    core.dispose();
    throw new Error(
      "FrameLogic polyline grips require an initialized renderer.",
    );
  }

  const cadPolylineGrips =
    new CadPolylineGripController({
      domElement:
        renderer.three.domElement,
      cameraProvider: () =>
        core.world.camera.three,
      designModel:
        core.designModel,
      lineScene:
        core.cadLineScene,
      polylines:
        core.cadPolylines,
      lineSelection:
        core.cadLineSelection,
      workPlane:
        core.cadWorkPlane,
      history:
        core.cadHistory,
      findSnapPoint: (
        clientX,
        clientY,
      ) =>
        core.snapEngine
          .findSnap(
            clientX,
            clientY,
          )
          ?.point
          .clone()
        ?? null,
      setCameraEnabled: (
        enabled,
      ) => {
        core.world.camera.controls.enabled =
          enabled;
      },
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
    });

  const baseDispose =
    core.dispose;
  let disposed = false;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;

    cadPolylineGrips.dispose();
    baseDispose();
  };

  return {
    ...core,
    cadPolylineGrips,
    dispose,
  };
}
