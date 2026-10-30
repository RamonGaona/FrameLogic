import {
  createBimCore as createNavigationBimCore,
} from "./navigationIndex";

import type {
  PrecisionBimCoreInstance as NavigationPrecisionBimCoreInstance,
} from "./navigationIndex";

import {
  CadCircleSceneController,
} from "./design/CadCircleSceneController";

import type {
  CadCircle,
} from "./design/CadCircleSceneController";

import {
  CadCirclePlacementController,
} from "./interaction/CadCirclePlacementController";

import {
  CadRectanglePlacementController,
} from "./interaction/CadRectanglePlacementController";

import {
  CadParallelLineController,
} from "./interaction/CadParallelLineController";

import {
  ModelSpaceToolbarOrganizerController,
} from "./navigation/ModelSpaceToolbarOrganizerController";

import type {
  FrameLogicProjectPackage,
} from "./project/FrameLogicProjectPackageController";

export * from "./index";

export {
  CadCircleSceneController,
} from "./design/CadCircleSceneController";

export type {
  CadCircle,
  CadCircleVector3Data,
  RegisterCadCircleInput,
} from "./design/CadCircleSceneController";

export {
  CadCirclePlacementController,
} from "./interaction/CadCirclePlacementController";

export type {
  CadCirclePlacementControllerOptions,
} from "./interaction/CadCirclePlacementController";

export {
  CadRectanglePlacementController,
} from "./interaction/CadRectanglePlacementController";

export type {
  CadRectanglePlacementControllerOptions,
} from "./interaction/CadRectanglePlacementController";

export {
  CadParallelLineController,
} from "./interaction/CadParallelLineController";

export type {
  CadParallelLineControllerOptions,
} from "./interaction/CadParallelLineController";


type CircleProjectPackage =
  FrameLogicProjectPackage
  & {
    readonly cadCircles?:
      readonly CadCircle[];
  };


interface FrameLogicCommandWindow extends Window {
  __frameLogicExternalCadCommandActive?:
    () => boolean;
  __frameLogicStartParallelLineCommand?:
    () => boolean;
  __frameLogicStartRectangleCommand?:
    () => boolean;
  __frameLogicCanStartRectangleTextCommand?:
    () => boolean;
}


function isEditableKeyboardTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}


export type PrecisionBimCoreInstance =
  NavigationPrecisionBimCoreInstance
  & {
    readonly cadCircleScene:
      CadCircleSceneController;

    readonly cadCirclePlacement:
      CadCirclePlacementController;

    readonly cadRectanglePlacement:
      CadRectanglePlacementController;

    readonly cadParallelLine:
      CadParallelLineController;

    readonly startCircleCommand:
      () => boolean;

    readonly startRectangleCommand:
      () => boolean;

    readonly startParallelLineCommand:
      () => boolean;
  };


export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core =
    await createNavigationBimCore(
      container,
    );

  const renderer =
    core.world.renderer;

  if (!renderer) {
    core.dispose();
    throw new Error(
      "FrameLogic CAD tools require an initialized renderer.",
    );
  }

  const cancelBaseCadTools = (): void => {
    core.cadTrim.deactivate();
    core.cancelActiveCadCommand();
    core.cadWindowSelection.cancel();
    core.cancelCadWorkPlaneEdit();
    core.cancelPreparedPieceOriginSnapEdit();
  };

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
        cadRectanglePlacement.cancel();
        cadParallelLine.cancel();
        cancelBaseCadTools();
      },
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
    });

  const cadRectanglePlacement =
    new CadRectanglePlacementController({
      container,
      domElement:
        renderer.three.domElement,
      scene:
        core.world.scene.three,
      cameraProvider: () =>
        core.world.camera.three,
      designModel:
        core.designModel,
      lineScene:
        core.cadLineScene,
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
        cadCirclePlacement.cancel();
        cadParallelLine.cancel();
        cancelBaseCadTools();
      },
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
    });

  const cadParallelLine =
    new CadParallelLineController({
      container,
      domElement:
        renderer.three.domElement,
      scene:
        core.world.scene.three,
      cameraProvider: () =>
        core.world.camera.three,
      designModel:
        core.designModel,
      lineScene:
        core.cadLineScene,
      lineSelection:
        core.cadLineSelection,
      pointSelection:
        core.cadPointSelection,
      designSelection:
        core.designSelection,
      workPlane:
        core.cadWorkPlane,
      history:
        core.cadHistory,
      beforeStart: () => {
        cadCirclePlacement.cancel();
        cadRectanglePlacement.cancel();
        cancelBaseCadTools();
      },
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
    });

  const toolbarOrganizer =
    new ModelSpaceToolbarOrganizerController({
      viewportContainer:
        container,
      startCircle: () =>
        cadCirclePlacement.start(),
      startRectangle: () =>
        cadRectanglePlacement.start(),
      startParallelLine: () =>
        cadParallelLine.start(),
    });

  const commandWindow =
    window as FrameLogicCommandWindow;

  const previousExternalCommandPredicate =
    commandWindow
      .__frameLogicExternalCadCommandActive;
  const previousStartParallel =
    commandWindow
      .__frameLogicStartParallelLineCommand;
  const previousStartRectangle =
    commandWindow
      .__frameLogicStartRectangleCommand;
  const previousCanStartRectangle =
    commandWindow
      .__frameLogicCanStartRectangleTextCommand;

  const externalCommandPredicate =
    (): boolean =>
      cadCirclePlacement.isActive
      || cadRectanglePlacement.isActive
      || cadParallelLine.isActive
      || (
        previousExternalCommandPredicate
          ?.()
        ?? false
      );

  const startParallelFromCommand =
    (): boolean =>
      cadParallelLine.start();

  const startRectangleFromCommand =
    (): boolean =>
      cadRectanglePlacement.start();

  const canStartRectangleFromText =
    (): boolean => {
      if (
        previousCanStartRectangle
        && !previousCanStartRectangle()
      ) {
        return false;
      }

      return core.designSelection
        .getSelectedIds()
        .length === 0
        && core.cadLineSelection
          .getSelectedIds()
          .length === 0
        && core.cadPointSelection
          .getSelectedIds()
          .length === 0;
    };

  commandWindow
    .__frameLogicExternalCadCommandActive =
      externalCommandPredicate;
  commandWindow
    .__frameLogicStartParallelLineCommand =
      startParallelFromCommand;
  commandWindow
    .__frameLogicStartRectangleCommand =
      startRectangleFromCommand;
  commandWindow
    .__frameLogicCanStartRectangleTextCommand =
      canStartRectangleFromText;

  /*
   * Los comandos externos son modales. Si el usuario cambia a una herramienta
   * histórica de FrameLogic, cerramos primero CIRCLE / RECTANGLE / PARALLEL y
   * arrancamos la nueva herramienta en el siguiente microtask.
   */
  const handleExternalCommandSwitch =
    (
      event: KeyboardEvent,
    ): void => {
      if (
        !(
          cadCirclePlacement.isActive
          || cadRectanglePlacement.isActive
          || cadParallelLine.isActive
        )
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || isEditableKeyboardTarget(
          event.target,
        )
      ) {
        return;
      }

      const key =
        event.key.toLowerCase();

      if (
        key !== "p"
        && key !== "l"
        && key !== "m"
        && key !== "r"
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      cadCirclePlacement.cancel();
      cadRectanglePlacement.cancel();
      cadParallelLine.cancel();

      window.queueMicrotask(
        () => {
          switch (key) {
            case "p":
              core.startPointCommand();
              break;
            case "l":
              core.startLineCommand();
              break;
            case "m":
              core.startMoveCommand();
              break;
            case "r":
              core.startRotateCommand();
              break;
          }
        },
      );
    };

  window.addEventListener(
    "keydown",
    handleExternalCommandSwitch,
    true,
  );

  const unsubscribeLayers =
    core.subscribeDesignLayers(
      () => {
        cadCircleScene.sync();
      },
    );

  /*
   * CIRCLE es entidad propia y por eso se agrega al .flproject. RECTANGLE y
   * PARALLEL producen CadLine normales, que ya forman parte del paquete base.
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
      cadRectanglePlacement.cancel();
      cadParallelLine.cancel();
      cadCircleScene.clear();

      await baseRestoreProjectPackage(
        project,
      );

      cadCircleScene.restore(
        (
          project as CircleProjectPackage
        ).cadCircles
        ?? [],
      );
    };

  const baseTrimActivate =
    core.cadTrim.activate.bind(
      core.cadTrim,
    );

  core.cadTrim.activate =
    (): boolean => {
      cadCirclePlacement.cancel();
      cadRectanglePlacement.cancel();
      cadParallelLine.cancel();
      return baseTrimActivate();
    };

  const startCircleCommand =
    (): boolean =>
      cadCirclePlacement.start();

  const startRectangleCommand =
    (): boolean =>
      cadRectanglePlacement.start();

  const startParallelLineCommand =
    (): boolean =>
      cadParallelLine.start();

  const cancelExternalTools = (): void => {
    cadCirclePlacement.cancel();
    cadRectanglePlacement.cancel();
    cadParallelLine.cancel();
  };

  const startPointCommand =
    (): boolean => {
      cancelExternalTools();
      return core.startPointCommand();
    };

  const startLineCommand =
    (): boolean => {
      cancelExternalTools();
      return core.startLineCommand();
    };

  const startMoveCommand =
    (): boolean => {
      cancelExternalTools();
      return core.startMoveCommand();
    };

  const startRotateCommand =
    (): boolean => {
      cancelExternalTools();
      return core.startRotateCommand();
    };

  const startTrimCommand =
    (): boolean => {
      cancelExternalTools();
      return core.startTrimCommand();
    };

  const cancelActiveCadCommand =
    (): void => {
      cancelExternalTools();
      core.cancelActiveCadCommand();
    };

  const undoCadAction =
    (): boolean => {
      cancelExternalTools();
      return core.undoCadAction();
    };

  const redoCadAction =
    (): boolean => {
      cancelExternalTools();
      return core.redoCadAction();
    };

  const baseDispose =
    core.dispose;
  let disposed = false;

  const dispose =
    (): void => {
      if (disposed) return;
      disposed = true;

      window.removeEventListener(
        "keydown",
        handleExternalCommandSwitch,
        true,
      );

      if (
        commandWindow
          .__frameLogicExternalCadCommandActive
        === externalCommandPredicate
      ) {
        commandWindow
          .__frameLogicExternalCadCommandActive =
            previousExternalCommandPredicate;
      }

      if (
        commandWindow
          .__frameLogicStartParallelLineCommand
        === startParallelFromCommand
      ) {
        commandWindow
          .__frameLogicStartParallelLineCommand =
            previousStartParallel;
      }

      if (
        commandWindow
          .__frameLogicStartRectangleCommand
        === startRectangleFromCommand
      ) {
        commandWindow
          .__frameLogicStartRectangleCommand =
            previousStartRectangle;
      }

      if (
        commandWindow
          .__frameLogicCanStartRectangleTextCommand
        === canStartRectangleFromText
      ) {
        commandWindow
          .__frameLogicCanStartRectangleTextCommand =
            previousCanStartRectangle;
      }

      unsubscribeLayers();
      toolbarOrganizer.dispose();
      cadParallelLine.dispose();
      cadRectanglePlacement.dispose();
      cadCirclePlacement.dispose();
      cadCircleScene.dispose();
      baseDispose();
    };

  return {
    ...core,
    cadCircleScene,
    cadCirclePlacement,
    cadRectanglePlacement,
    cadParallelLine,
    startCircleCommand,
    startRectangleCommand,
    startParallelLineCommand,
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
