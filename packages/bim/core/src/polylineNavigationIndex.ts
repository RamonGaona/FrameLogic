import {
  createBimCore as createCadBimCore,
} from "./circleNavigationIndex";

import type {
  PrecisionBimCoreInstance as CadPrecisionBimCoreInstance,
} from "./circleNavigationIndex";

import {
  CadPolylineRegistryController,
} from "./design/CadPolylineRegistryController";

import type {
  CadPolyline,
} from "./design/CadPolylineRegistryController";

import {
  CadPolylineLifecycleController,
} from "./interaction/CadPolylineLifecycleController";

import {
  CadJoinLinesController,
} from "./interaction/CadJoinLinesController";

import type {
  FrameLogicProjectPackage,
} from "./project/FrameLogicProjectPackageController";


export * from "./circleNavigationIndex";

export {
  CadPolylineRegistryController,
} from "./design/CadPolylineRegistryController";

export type {
  CadPolyline,
  CadPolylineSegmentRef,
  RegisterCadPolylineInput,
} from "./design/CadPolylineRegistryController";

export {
  CadPolylineLifecycleController,
} from "./interaction/CadPolylineLifecycleController";

export {
  CadJoinLinesController,
} from "./interaction/CadJoinLinesController";

export type {
  CadJoinLinesControllerOptions,
} from "./interaction/CadJoinLinesController";


type PolylineProjectPackage =
  FrameLogicProjectPackage
  & {
    readonly cadPolylines?:
      readonly CadPolyline[];
  };


interface FrameLogicCommandWindow extends Window {
  __frameLogicExternalCadCommandActive?:
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
  CadPrecisionBimCoreInstance
  & {
    readonly cadPolylines:
      CadPolylineRegistryController;

    readonly cadPolylineLifecycle:
      CadPolylineLifecycleController;

    readonly cadJoinLines:
      CadJoinLinesController;

    readonly startJoinLinesCommand:
      () => boolean;
  };


/**
 * Capa POLYLINE sobre el runtime CAD existente.
 *
 * La entidad padre conserva identidad/orden/cierre, mientras sus segmentos
 * continúan siendo CadLine para reutilizar el motor de precisión ya estable.
 */
export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core =
    await createCadBimCore(
      container,
    );

  const cadPolylines =
    new CadPolylineRegistryController(
      core.designModel,
    );

  const cadPolylineLifecycle =
    new CadPolylineLifecycleController(
      core.designModel,
      cadPolylines,
    );

  /*
   * LINE: el primer tramo permanece LINE. Al crear el segundo sin cancelar,
   * Lifecycle registra una POLYLINE y agrega todos los tramos posteriores.
   */
  const baseLineActivate =
    core.cadLinePlacement.activate.bind(
      core.cadLinePlacement,
    );
  const baseLineDeactivate =
    core.cadLinePlacement.deactivate.bind(
      core.cadLinePlacement,
    );

  core.cadLinePlacement.activate =
    (): boolean => {
      cadPolylineLifecycle.beginLineSession();
      const started =
        baseLineActivate();

      if (!started) {
        cadPolylineLifecycle.endLineSession();
      }

      return started;
    };

  core.cadLinePlacement.deactivate =
    (): void => {
      cadPolylineLifecycle.endLineSession();
      baseLineDeactivate();
    };

  /* RECTANGLE: sus cuatro CadLine se registran como una POLYLINE cerrada. */
  const baseRectangleStart =
    core.cadRectanglePlacement.start.bind(
      core.cadRectanglePlacement,
    );
  const baseRectangleCancel =
    core.cadRectanglePlacement.cancel.bind(
      core.cadRectanglePlacement,
    );

  core.cadRectanglePlacement.start =
    (): boolean => {
      cadPolylineLifecycle.beginRectangleSession();
      const started =
        baseRectangleStart();

      if (!started) {
        cadPolylineLifecycle.endRectangleSession();
      }

      return started;
    };

  core.cadRectanglePlacement.cancel =
    (): void => {
      cadPolylineLifecycle.endRectangleSession();
      baseRectangleCancel();
    };

  const cadJoinLines =
    new CadJoinLinesController({
      designModel:
        core.designModel,
      polylines:
        cadPolylines,
      lineSelection:
        core.cadLineSelection,
      pointSelection:
        core.cadPointSelection,
      designSelection:
        core.designSelection,
      history:
        core.cadHistory,
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

  /*
   * CadCommandInputController consulta este predicado antes de capturar L/R.
   * Mientras JOIN esté abierto evitamos que otra entrada textual compita por
   * las mismas teclas.
   */
  const commandWindow =
    window as FrameLogicCommandWindow;
  const previousExternalPredicate =
    commandWindow
      .__frameLogicExternalCadCommandActive;
  const polylineExternalPredicate =
    (): boolean =>
      cadJoinLines.isActive
      || (
        previousExternalPredicate
          ?.()
        ?? false
      );

  commandWindow
    .__frameLogicExternalCadCommandActive =
      polylineExternalPredicate;

  /*
   * Cambiar de JOIN a otra herramienta histórica debe cerrar JOIN primero.
   */
  const handleJoinCommandSwitch =
    (
      event: KeyboardEvent,
    ): void => {
      if (
        !cadJoinLines.isActive
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
      cadJoinLines.cancel();

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
    handleJoinCommandSwitch,
    true,
  );

  /* TRIM/TT cancela JOIN antes de activar su selección segmento a segmento. */
  const baseTrimActivate =
    core.cadTrim.activate.bind(
      core.cadTrim,
    );

  core.cadTrim.activate =
    (): boolean => {
      cadJoinLines.cancel();
      return baseTrimActivate();
    };

  /*
   * Persistencia compatible hacia atrás: el schema base continúa en v1 y la
   * propiedad cadPolylines es opcional, como ya ocurre con cadCircles.
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
        baseCreateProjectPackage(name);

      const validPolylines =
        cadPolylines
          .getAll()
          .filter(
            (polyline) =>
              polyline.segments.length >= 2
              && polyline.segments.every(
                (segment) =>
                  core.designModel.cadLines.get(
                    segment.lineId,
                  ) !== undefined,
              ),
          );

      return {
        ...project,
        cadPolylines:
          validPolylines,
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
      project: FrameLogicProjectPackage,
    ): Promise<void> => {
      cadJoinLines.cancel();
      cadPolylines.clear();

      await baseRestoreProjectPackage(
        project,
      );

      cadPolylines.restore(
        (
          project as PolylineProjectPackage
        ).cadPolylines
        ?? [],
      );
    };

  const startJoinLinesCommand =
    (): boolean =>
      cadJoinLines.start();

  const baseCancelActiveCadCommand =
    core.cancelActiveCadCommand;

  const cancelActiveCadCommand =
    (): void => {
      cadJoinLines.cancel();
      baseCancelActiveCadCommand();
    };

  const baseUndoCadAction =
    core.undoCadAction;
  const undoCadAction =
    (): boolean => {
      cadJoinLines.cancel();
      return baseUndoCadAction();
    };

  const baseRedoCadAction =
    core.redoCadAction;
  const redoCadAction =
    (): boolean => {
      cadJoinLines.cancel();
      return baseRedoCadAction();
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
        handleJoinCommandSwitch,
        true,
      );

      if (
        commandWindow
          .__frameLogicExternalCadCommandActive
        === polylineExternalPredicate
      ) {
        commandWindow
          .__frameLogicExternalCadCommandActive =
            previousExternalPredicate;
      }

      core.cadLinePlacement.activate =
        baseLineActivate;
      core.cadLinePlacement.deactivate =
        baseLineDeactivate;
      core.cadRectanglePlacement.start =
        baseRectangleStart;
      core.cadRectanglePlacement.cancel =
        baseRectangleCancel;
      core.cadTrim.activate =
        baseTrimActivate;

      cadJoinLines.dispose();
      cadPolylineLifecycle.dispose();
      cadPolylines.clear();
      baseDispose();
    };

  return {
    ...core,
    cadPolylines,
    cadPolylineLifecycle,
    cadJoinLines,
    startJoinLinesCommand,
    cancelActiveCadCommand,
    undoCadAction,
    redoCadAction,
    dispose,
  };
}
