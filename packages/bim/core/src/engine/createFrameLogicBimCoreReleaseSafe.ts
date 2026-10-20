import {
  createBimCore as createInteractionBimCore,
} from "./createFrameLogicBimCoreInteraction";

import type {
  BimCoreInstance,
} from "./createBimCore";


interface TransformControlsRuntime {
  axis:
    string | null;

  dragging:
    boolean;
}


interface MoveRuntime {
  readonly controls:
    TransformControlsRuntime;

  armedMoveAxis:
    unknown;

  armedPivot:
    boolean;

  dragMode:
    string;

  activeMoveAxis:
    string | null;

  dragHistoryStart:
    unknown | null;
}


interface RotateRuntime {
  readonly controls:
    TransformControlsRuntime;

  centerArmed:
    boolean;

  centerDragging:
    boolean;

  dragHistoryStart:
    unknown | null;
}


function installArmedReleaseNormalization(
  core:
    BimCoreInstance,
): () => void {

  const move =
    core.designTransform as unknown as
      MoveRuntime;

  const rotate =
    core.designRotate as unknown as
      RotateRuntime;


  let moveWasArmed =
    false;

  let rotateWasArmed =
    false;

  let disposed =
    false;

  let releaseTimer:
    number | null =
      null;


  const resetFlags =
    (): void => {

      moveWasArmed =
        false;

      rotateWasArmed =
        false;

  };


  const handlePointerDown =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        event.button !== 0
      ) {

        return;

      }


      /*
       * Solo intervenimos cuando el clic actual es el SEGUNDO clic de una
       * operación armada:
       *
       * - centro amarillo -> SNAP
       * - eje X/Y/Z/plano armado -> SNAP destino
       * - centro de ROTATE armado -> SNAP
       *
       * Un clic normal sobre un eje/anillo NO entra aquí. Así conservamos
       * exactamente el comportamiento que funcionaba antes del último parche.
       */
      moveWasArmed =
        core.designTransform.isActive
        && Boolean(
          move.armedMoveAxis
          || move.armedPivot,
        );


      rotateWasArmed =
        core.designRotate.isActive
        && rotate.centerArmed;

  };


  const normalizeArmedRelease =
    (): void => {

      if (
        disposed
      ) {

        return;

      }


      if (
        moveWasArmed
      ) {

        /*
         * El segundo clic armado puede hacer stopPropagation() antes de que
         * TransformControls reciba su pointerup. Si eso ocurre, Three.js puede
         * conservar dragging=true/axis anterior y el próximo eje entra a drag
         * instantáneamente. Limpiamos SOLO ese estado interno transitorio.
         *
         * No modificamos armedMoveAxis/armedPivot: si el clic no encontró SNAP,
         * la operación sigue armada para que el usuario pueda intentar de nuevo.
         */
        move.controls.dragging =
          false;

        move.controls.axis =
          null;

        move.dragMode =
          "NONE";

        move.activeMoveAxis =
          null;

        move.dragHistoryStart =
          null;

      }


      if (
        rotateWasArmed
      ) {

        rotate.controls.dragging =
          false;

        rotate.controls.axis =
          null;

        rotate.centerDragging =
          false;

        rotate.dragHistoryStart =
          null;

      }


      if (
        (
          moveWasArmed
          || rotateWasArmed
        )
        && !core.getPieceDefinitionPreparationState()
          .active
      ) {

        core.pieceDefinitionHelpers
          .sync();

      }


      resetFlags();

      releaseTimer =
        null;

  };


  const handlePointerUp =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        event.button !== 0
        || (
          !moveWasArmed
          && !rotateWasArmed
        )
      ) {

        return;

      }


      if (
        releaseTimer !== null
      ) {

        window.clearTimeout(
          releaseTimer,
        );

      }


      /*
       * Debe ejecutarse después de los handlers del canvas, porque ahí se
       * aplica el SNAP y se decide si la operación armada terminó o continúa.
       */
      releaseTimer =
        window.setTimeout(
          normalizeArmedRelease,
          0,
        );

  };


  const handlePointerCancel =
    (): void => {

      if (
        !moveWasArmed
        && !rotateWasArmed
      ) {

        return;

      }


      if (
        releaseTimer !== null
      ) {

        window.clearTimeout(
          releaseTimer,
        );

      }


      releaseTimer =
        window.setTimeout(
          normalizeArmedRelease,
          0,
        );

  };


  window.addEventListener(
    "pointerdown",
    handlePointerDown,
    true,
  );

  window.addEventListener(
    "pointerup",
    handlePointerUp,
    true,
  );

  window.addEventListener(
    "pointercancel",
    handlePointerCancel,
    true,
  );


  return () => {

    disposed =
      true;


    if (
      releaseTimer !== null
    ) {

      window.clearTimeout(
        releaseTimer,
      );

      releaseTimer =
        null;

    }


    resetFlags();


    window.removeEventListener(
      "pointerdown",
      handlePointerDown,
      true,
    );

    window.removeEventListener(
      "pointerup",
      handlePointerUp,
      true,
    );

    window.removeEventListener(
      "pointercancel",
      handlePointerCancel,
      true,
    );

  };

}


export async function createBimCore(
  container:
    HTMLElement,
): Promise<BimCoreInstance> {

  const core =
    await createInteractionBimCore(
      container,
    );


  const uninstallArmedReleaseNormalization =
    installArmedReleaseNormalization(
      core,
    );

  const baseDispose =
    core.dispose;

  let disposed =
    false;


  return {
    ...core,

    dispose:
      () => {

        if (
          disposed
        ) {

          return;

        }


        disposed =
          true;

        uninstallArmedReleaseNormalization();

        baseDispose();

      },
  };

}
