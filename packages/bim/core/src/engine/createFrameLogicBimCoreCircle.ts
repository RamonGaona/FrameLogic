import {
  createBimCore as createDrawingBimCore,
} from "./createFrameLogicBimCoreDrawing";

import type {
  PrecisionBimCoreInstance as DrawingPrecisionBimCoreInstance,
} from "./createFrameLogicBimCoreDrawing";

import {
  CadCircleSceneController,
} from "../design/CadCircleSceneController";

import type {
  CadCircle,
} from "../design/CadCircleSceneController";

import {
  CadCirclePlacementController,
} from "../interaction/CadCirclePlacementController";

import type {
  FrameLogicProjectPackage,
} from "../project/FrameLogicProjectPackageController";


type CircleProjectPackage =
  FrameLogicProjectPackage
  & {
    readonly cadCircles?:
      readonly CadCircle[];
  };


export type PrecisionBimCoreInstance =
  DrawingPrecisionBimCoreInstance
  & {
    readonly cadCircleScene:
      CadCircleSceneController;

    readonly cadCirclePlacement:
      CadCirclePlacementController;

    readonly startCircleCommand:
      () => boolean;
  };


export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core =
    await createDrawingBimCore(
      container,
    );

  const renderer =
    core.world.renderer;

  if (!renderer) {
    core.dispose();
    throw new Error(
      "FrameLogic CIRCLE requires an initialized renderer.",
    );
  }

  const cadCircleScene =
    new CadCircleSceneController(
      core.world.scene.three,
      core.designModel,
    );

  const cadCirclePlacement =
    new CadCirclePlacementController({
      container,
      domElement:
        renderer.three.domElement,
      scene:
        core.world.scene.three,
      cameraProvider: () =>
        core.world.camera.three,
      designModel:
        core.designModel,
      circleScene:
        cadCircleScene,
      workPlane:
        core.cadWorkPlane,
      history:
        core.cadHistory,
      designSelection:
        core.designSelection,
      pointSelection:
        core.cadPointSelection,
      lineSelection:
        core.cadLineSelection,
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
      beforeStart: () => {
        core.cadTrim.deactivate();
        core.cancelActiveCadCommand();
        core.cadWindowSelection.cancel();
        core.cancelCadWorkPlaneEdit();
        core.cancelPreparedPieceOriginSnapEdit();
      },
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
    });

  const unsubscribeLayers =
    core.subscribeDesignLayers(
      () => {
        cadCircleScene.sync();
      },
    );

  /*
   * El paquete de proyecto v1 tolera propiedades adicionales. Conservamos
   * compatibilidad hacia atrás: proyectos viejos no traen cadCircles y se
   * restauran como una lista vacía; los nuevos guardan la entidad exacta.
   */
  const baseCreateProjectPackage =
    core.projectPackage
      .createProjectPackage
      .bind(
        core.projectPackage,
      );

  core.projectPackage.createProjectPackage =
    (
      name?: string,
    ) => {
      const project =
        baseCreateProjectPackage(
          name,
        );

      return {
        ...project,
        cadCircles:
          cadCircleScene.getAll(),
      } as FrameLogicProjectPackage;
    };

  const baseRestoreProjectPackage =
    core.projectPackage
      .restoreProjectPackage
      .bind(
        core.projectPackage,
      );

  core.projectPackage.restoreProjectPackage =
    async (
      project:
        FrameLogicProjectPackage,
    ): Promise<void> => {
      cadCirclePlacement.cancel();
      cadCircleScene.clear();

      await baseRestoreProjectPackage(
        project,
      );

      const circleProject =
        project as CircleProjectPackage;

      cadCircleScene.restore(
        circleProject.cadCircles
        ?? [],
      );
    };

  /*
   * TRIM y CIRCLE son herramientas modales hermanas. TT debe poder reemplazar
   * CIRCLE sin dejar dos controladores capturando el mismo clic.
   */
  const baseTrimActivate =
    core.cadTrim.activate.bind(
      core.cadTrim,
    );

  core.cadTrim.activate =
    (): boolean => {
      cadCirclePlacement.cancel();
      return baseTrimActivate();
    };

  const startCircleCommand =
    (): boolean =>
      cadCirclePlacement.start();

  const startPointCommand =
    (): boolean => {
      cadCirclePlacement.cancel();
      return core.startPointCommand();
    };

  const startLineCommand =
    (): boolean => {
      cadCirclePlacement.cancel();
      return core.startLineCommand();
    };

  const startMoveCommand =
    (): boolean => {
      cadCirclePlacement.cancel();
      return core.startMoveCommand();
    };

  const startRotateCommand =
    (): boolean => {
      cadCirclePlacement.cancel();
      return core.startRotateCommand();
    };

  const startTrimCommand =
    (): boolean => {
      cadCirclePlacement.cancel();
      return core.startTrimCommand();
    };

  const cancelActiveCadCommand =
    (): void => {
      cadCirclePlacement.cancel();
      core.cancelActiveCadCommand();
    };

  const undoCadAction =
    (): boolean => {
      cadCirclePlacement.cancel();
      return core.undoCadAction();
    };

  const redoCadAction =
    (): boolean => {
      cadCirclePlacement.cancel();
      return core.redoCadAction();
    };

  const baseDispose =
    core.dispose;
  let disposed = false;

  const dispose =
    (): void => {
      if (disposed) return;
      disposed = true;
      unsubscribeLayers();
      cadCirclePlacement.dispose();
      cadCircleScene.dispose();
      baseDispose();
    };

  return {
    ...core,
    cadCircleScene,
    cadCirclePlacement,
    startCircleCommand,
    startPointCommand,
    startLineCommand,
    startMoveCommand,
    startRotateCommand,
    startTrimCommand,
    cancelActiveCadCommand,
    undoCadAction,
    redoCadAction,
    dispose,
  };
}
