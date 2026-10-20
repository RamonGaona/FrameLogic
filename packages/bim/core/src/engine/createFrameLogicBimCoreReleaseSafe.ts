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


function installReleaseNormalization(
  core:
    BimCoreInstance,
): () => void {

  const move =
    core.designTransform as unknown as
      MoveRuntime;

  const rotate =
    core.designRotate as unknown as
      RotateRuntime;


  let movePivotWasArmed =
    false;

  let rotateCenterWasArmed =
    false;

  let disposed =
    false;

  let releaseTimer:
    number | null =
      null;


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


      movePivotWasArmed =
        core.designTransform.isActive
        && move.armedPivot;


      rotateCenterWasArmed =
        core.designRotate.isActive
        && rotate.centerArmed;

  };


  const normalizeAfterRelease =
    (): void => {

      if (
        disposed
      ) {

        return;

      }


      /*
       * IMPORTANTE:
       * Esto corre DESPUÉS del pointerup nativo. TransformControls ya tuvo
       * oportunidad de emitir mouseUp y nuestros controladores ya pudieron
       * convertir un clic corto en armedMoveAxis / centerArmed.
       *
       * A partir de aquí ningún gizmo debe quedar creyendo que el botón del
       * mouse sigue presionado. Este era el estado que hacía que una copia o
       * una pieza cuyo pivot acababa de cambiar entrara directamente a drag.
       */
      move.controls.dragging =
        false;

      rotate.controls.dragging =
        false;


      /*
       * Si acabamos de completar el segundo clic del cambio de punto base,
       * limpiamos únicamente el estado transitorio del drag anterior.
       * No tocamos armedMoveAxis: si el usuario acaba de hacer clic corto
       * sobre X/Y/Z debe conservarse para el siguiente clic SNAP.
       */
      if (
        movePivotWasArmed
        && !move.armedPivot
      ) {

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
        rotateCenterWasArmed
        && !rotate.centerArmed
      ) {

        rotate.controls.axis =
          null;

        rotate.centerDragging =
          false;

        rotate.dragHistoryStart =
          null;

      }


      /*
       * Los helpers de PieceDefinition están expresados en coordenadas de
       * mundo. Al mover/rotar una instancia hay que reconstruirlos para que
       * sus SNAPs/ejes visibles sigan exactamente a la pieza.
       */
      if (
        !core.getPieceDefinitionPreparationState()
          .active
      ) {

        core.pieceDefinitionHelpers
          .sync();

      }


      movePivotWasArmed =
        false;

      rotateCenterWasArmed =
        false;

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
       * setTimeout(0), no ejecución inmediata: hacerlo durante capture
       * impediría el mouseUp interno de TransformControls y rompería el
       * comportamiento clic -> armar eje.
       */
      releaseTimer =
        window.setTimeout(
          normalizeAfterRelease,
          0,
        );

  };


  const handlePointerCancel =
    (): void => {

      if (
        releaseTimer !== null
      ) {

        window.clearTimeout(
          releaseTimer,
        );

      }


      releaseTimer =
        window.setTimeout(
          normalizeAfterRelease,
          0,
        );

  };


  /*
   * Window + capture garantiza que también vemos el release cuando un
   * controlador CAD hace stopPropagation() en el canvas, por ejemplo el
   * segundo clic usado para colocar el pivot sobre un SNAP.
   */
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


  const uninstallReleaseNormalization =
    installReleaseNormalization(
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

        uninstallReleaseNormalization();

        baseDispose();

      },
  };

}
