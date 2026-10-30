import {
  createBimCore as createPolylineBimCore,
} from "./polylineNavigationIndex";

import type {
  PrecisionBimCoreInstance as PolylinePrecisionBimCoreInstance,
} from "./polylineNavigationIndex";

import {
  CadCopyController,
} from "./interaction/CadCopyController";

import {
  CadStretchController,
} from "./interaction/CadStretchController";

import {
  CadPolylineEditController,
} from "./interaction/CadPolylineEditController";


export * from "./polylineNavigationIndex";

export {
  CadCopyController,
} from "./interaction/CadCopyController";

export type {
  CadCopyControllerOptions,
} from "./interaction/CadCopyController";

export {
  CadStretchController,
} from "./interaction/CadStretchController";

export type {
  CadStretchControllerOptions,
} from "./interaction/CadStretchController";

export {
  CadPolylineEditController,
} from "./interaction/CadPolylineEditController";

export type {
  CadPolylineEditControllerOptions,
} from "./interaction/CadPolylineEditController";


function isEditableKeyboardTarget(
  target: EventTarget | null,
): boolean {
  return target instanceof HTMLElement
    && (
      target.isContentEditable
      || target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
    );
}


export type PrecisionBimCoreInstance =
  PolylinePrecisionBimCoreInstance
  & {
    readonly cadCopy:
      CadCopyController;
    readonly cadStretch:
      CadStretchController;
    readonly cadPolylineEdit:
      CadPolylineEditController;
    readonly startCopyCommand:
      () => boolean;
    readonly startStretchCommand:
      () => boolean;
    readonly startPolylineEditCommand:
      () => boolean;
  };


/**
 * Capa de edición CAD básica sobre POLYLINE:
 * COPY, STRETCH y PEDIT.
 */
export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core =
    await createPolylineBimCore(
      container,
    );

  const renderer =
    core.world.renderer;

  if (!renderer) {
    core.dispose();
    throw new Error(
      "FrameLogic CAD editing tools require an initialized renderer.",
    );
  }

  const baseCancelActiveCadCommand =
    core.cancelActiveCadCommand;

  let cadCopy: CadCopyController;
  let cadStretch: CadStretchController;
  let cadPolylineEdit: CadPolylineEditController;

  const cancelBaseCadTools = (): void => {
    core.cadTrim.deactivate();
    core.cadJoinLines.cancel();
    baseCancelActiveCadCommand();
    core.cadWindowSelection.cancel();
    core.cancelCadWorkPlaneEdit();
    core.cancelPreparedPieceOriginSnapEdit();
  };

  const findSnapPoint =
    (
      clientX: number,
      clientY: number,
    ) =>
      core.snapEngine
        .findSnap(
          clientX,
          clientY,
        )
        ?.point
        .clone()
      ?? null;

  cadCopy =
    new CadCopyController({
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
      pointSelection:
        core.cadPointSelection,
      designSelection:
        core.designSelection,
      workPlane:
        core.cadWorkPlane,
      history:
        core.cadHistory,
      findSnapPoint,
      beforeStart: () => {
        cadStretch?.cancel();
        cadPolylineEdit?.cancel();
        cancelBaseCadTools();
      },
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
    });

  cadStretch =
    new CadStretchController({
      domElement:
        renderer.three.domElement,
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
      findSnapPoint,
      beforeStart: () => {
        cadCopy.cancel();
        cadPolylineEdit?.cancel();
        cancelBaseCadTools();
      },
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
    });

  cadPolylineEdit =
    new CadPolylineEditController({
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
      pointSelection:
        core.cadPointSelection,
      designSelection:
        core.designSelection,
      workPlane:
        core.cadWorkPlane,
      history:
        core.cadHistory,
      findSnapPoint,
      beforeStart: () => {
        cadCopy.cancel();
        cadStretch.cancel();
        cancelBaseCadTools();
      },
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
    });

  const cancelAdvancedTools = (): void => {
    cadCopy.cancel();
    cadStretch.cancel();
    cadPolylineEdit.cancel();
  };

  /*
   * Las herramientas CAD creadas en capas anteriores también deben cerrar las
   * nuevas operaciones antes de capturar clicks o selección.
   */
  const baseCircleStart =
    core.cadCirclePlacement.start.bind(
      core.cadCirclePlacement,
    );
  const baseRectangleStart =
    core.cadRectanglePlacement.start.bind(
      core.cadRectanglePlacement,
    );
  const baseParallelStart =
    core.cadParallelLine.start.bind(
      core.cadParallelLine,
    );
  const baseJoinStart =
    core.cadJoinLines.start.bind(
      core.cadJoinLines,
    );
  const baseTrimActivate =
    core.cadTrim.activate.bind(
      core.cadTrim,
    );

  core.cadCirclePlacement.start =
    (): boolean => {
      cancelAdvancedTools();
      return baseCircleStart();
    };
  core.cadRectanglePlacement.start =
    (): boolean => {
      cancelAdvancedTools();
      return baseRectangleStart();
    };
  core.cadParallelLine.start =
    (): boolean => {
      cancelAdvancedTools();
      return baseParallelStart();
    };
  core.cadJoinLines.start =
    (): boolean => {
      cancelAdvancedTools();
      return baseJoinStart();
    };
  core.cadTrim.activate =
    (): boolean => {
      cancelAdvancedTools();
      return baseTrimActivate();
    };

  const baseStartPointCommand =
    core.startPointCommand;
  const baseStartLineCommand =
    core.startLineCommand;
  const baseStartMoveCommand =
    core.startMoveCommand;
  const baseStartRotateCommand =
    core.startRotateCommand;
  const baseStartTrimCommand =
    core.startTrimCommand;
  const baseUndoCadAction =
    core.undoCadAction;
  const baseRedoCadAction =
    core.redoCadAction;

  const startPointCommand = (): boolean => {
    cancelAdvancedTools();
    return baseStartPointCommand();
  };
  const startLineCommand = (): boolean => {
    cancelAdvancedTools();
    return baseStartLineCommand();
  };
  const startMoveCommand = (): boolean => {
    cancelAdvancedTools();
    return baseStartMoveCommand();
  };
  const startRotateCommand = (): boolean => {
    cancelAdvancedTools();
    return baseStartRotateCommand();
  };
  const startTrimCommand = (): boolean => {
    cancelAdvancedTools();
    return baseStartTrimCommand();
  };

  const cancelActiveCadCommand = (): void => {
    cancelAdvancedTools();
    baseCancelActiveCadCommand();
  };

  const undoCadAction = (): boolean => {
    cancelAdvancedTools();
    return baseUndoCadAction();
  };

  const redoCadAction = (): boolean => {
    cancelAdvancedTools();
    return baseRedoCadAction();
  };

  /*
   * Si una nueva herramienta está activa y el usuario cambia con las teclas
   * históricas P/L/M/R, se cancela primero el modo actual.
   */
  const handleAdvancedCommandSwitch =
    (
      event: KeyboardEvent,
    ): void => {
      if (
        !(
          cadCopy.isActive
          || cadStretch.isActive
          || cadPolylineEdit.isActive
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
      cancelAdvancedTools();

      window.queueMicrotask(
        () => {
          switch (key) {
            case "p":
              baseStartPointCommand();
              break;
            case "l":
              baseStartLineCommand();
              break;
            case "m":
              baseStartMoveCommand();
              break;
            case "r":
              baseStartRotateCommand();
              break;
          }
        },
      );
    };

  window.addEventListener(
    "keydown",
    handleAdvancedCommandSwitch,
    true,
  );

  const startCopyCommand =
    (): boolean =>
      cadCopy.start();
  const startStretchCommand =
    (): boolean =>
      cadStretch.start();
  const startPolylineEditCommand =
    (): boolean =>
      cadPolylineEdit.start();

  const baseDispose =
    core.dispose;
  let disposed = false;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;

    window.removeEventListener(
      "keydown",
      handleAdvancedCommandSwitch,
      true,
    );

    core.cadCirclePlacement.start =
      baseCircleStart;
    core.cadRectanglePlacement.start =
      baseRectangleStart;
    core.cadParallelLine.start =
      baseParallelStart;
    core.cadJoinLines.start =
      baseJoinStart;
    core.cadTrim.activate =
      baseTrimActivate;

    cadPolylineEdit.dispose();
    cadStretch.dispose();
    cadCopy.dispose();
    baseDispose();
  };

  return {
    ...core,
    cadCopy,
    cadStretch,
    cadPolylineEdit,
    startCopyCommand,
    startStretchCommand,
    startPolylineEditCommand,
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
