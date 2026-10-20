import {
  createBimCore as createReleaseSafeBimCore,
} from "./createFrameLogicBimCoreReleaseSafe";

import type {
  BimCoreInstance,
} from "./createBimCore";


interface MoveControlsRuntime {
  axis:
    string | null;

  dragging:
    boolean;
}


interface MoveRuntime {
  readonly controls:
    MoveControlsRuntime;

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


function resetMoveTransientState(
  core:
    BimCoreInstance,
): void {

  const move =
    core.designTransform as unknown as
      MoveRuntime;


  move.controls.dragging =
    false;

  move.controls.axis =
    null;

  move.armedMoveAxis =
    null;

  move.armedPivot =
    false;

  move.dragMode =
    "NONE";

  move.activeMoveAxis =
    null;

  move.dragHistoryStart =
    null;


  core.designSnap
    .clearExcludedInstanceIds();


  core.designSelection
    .setEnabled(
      true,
    );


  core.world.camera.controls.enabled =
    true;


  if (
    !core.getPieceDefinitionPreparationState()
      .active
  ) {

    core.pieceDefinitionHelpers
      .setActiveInstanceId(
        null,
      );

  }

}


function selectionKey(
  core:
    BimCoreInstance,
): string {

  return core.getCadSelectionState()
    .items
    .map(
      (
        item,
      ) =>
        `${item.type}:${item.id}`,
    )
    .sort()
    .join(
      "|",
    );

}


function installSelectionScopedMoveState(
  core:
    BimCoreInstance,
): () => void {

  let previousSelectionKey =
    selectionKey(
      core,
    );


  const unsubscribe =
    core.subscribeCadSelection(
      () => {

        const nextSelectionKey =
          selectionKey(
            core,
          );


        if (
          nextSelectionKey
          === previousSelectionKey
        ) {

          return;

        }


        previousSelectionKey =
          nextSelectionKey;


        /*
         * Un eje armado pertenece exclusivamente a la selección que lo creó.
         * Si cambia la selección (por ejemplo al insertar/seleccionar una copia)
         * nunca debemos heredar dragging/armedMoveAxis de la pieza anterior.
         */
        resetMoveTransientState(
          core,
        );

      },
    );


  return unsubscribe;

}


function installArmedSnapHelperRefresh(
  core:
    BimCoreInstance,
): () => void {

  const move =
    core.designTransform as unknown as
      MoveRuntime;

  let timer:
    number | null =
      null;

  let disposed =
    false;


  const refresh =
    (): void => {

      timer =
        null;


      if (
        disposed
        || !core.designTransform.isActive
        || (
          !move.armedMoveAxis
          && !move.armedPivot
        )
        || core.getPieceDefinitionPreparationState()
          .active
      ) {

        return;

      }


      /*
       * Durante el segundo clic necesitamos ver las referencias persistentes
       * de TODAS las piezas visibles. La pieza seleccionada puede quedar
       * excluida del motor SNAP para evitar auto-snap, pero sus helpers y los
       * de las demás piezas permanecen sincronizados visualmente.
       */
      core.pieceDefinitionHelpers
        .setActiveInstanceId(
          null,
        );

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
        timer !== null
      ) {

        window.clearTimeout(
          timer,
        );

      }


      /*
       * El estado armedMoveAxis se establece en el mouseUp interno del gizmo.
       * Esperamos al siguiente turno para refrescar después de esa transición.
       */
      timer =
        window.setTimeout(
          refresh,
          0,
        );

    };


  window.addEventListener(
    "pointerup",
    handlePointerUp,
    true,
  );


  return () => {

    disposed =
      true;


    if (
      timer !== null
    ) {

      window.clearTimeout(
        timer,
      );

      timer =
        null;

    }


    window.removeEventListener(
      "pointerup",
      handlePointerUp,
      true,
    );

  };

}


export async function createBimCore(
  container:
    HTMLElement,
): Promise<BimCoreInstance> {

  const core =
    await createReleaseSafeBimCore(
      container,
    );


  const baseCreateDesignPieceInstance =
    core.createDesignPieceInstance;

  const baseDispose =
    core.dispose;


  const uninstallSelectionScopedMoveState =
    installSelectionScopedMoveState(
      core,
    );


  const uninstallArmedSnapHelperRefresh =
    installArmedSnapHelperRefresh(
      core,
    );


  let disposed =
    false;


  return {
    ...core,

    createDesignPieceInstance:
      (
        input,
      ) => {

        /*
         * Crear una nueva instancia delimita un nuevo contexto de interacción.
         * Una copia nunca debe heredar un clic/drag/eje armado de la anterior.
         */
        resetMoveTransientState(
          core,
        );


        const instance =
          baseCreateDesignPieceInstance(
            input,
          );


        resetMoveTransientState(
          core,
        );


        return instance;

      },

    dispose:
      () => {

        if (
          disposed
        ) {

          return;

        }


        disposed =
          true;


        uninstallSelectionScopedMoveState();

        uninstallArmedSnapHelperRefresh();


        baseDispose();

      },
  };

}
