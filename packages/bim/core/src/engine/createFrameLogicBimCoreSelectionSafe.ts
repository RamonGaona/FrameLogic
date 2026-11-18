import * as THREE from "three";

import {
  createBimCore as createReleaseSafeBimCore,
} from "./createFrameLogicBimCoreReleaseSafe";

import type {
  BimCoreInstance,
} from "./createBimCore";

import {
  ModelSpaceDimensionController,
} from "../interaction/ModelSpaceDimensionController";


interface MoveControlsRuntime {
  axis:
    string | null;

  dragging:
    boolean;

  attach:
    (
      object: THREE.Object3D,
    ) => void;

  detach:
    () => void;
}


interface MoveRuntime {
  readonly controls:
    MoveControlsRuntime;

  readonly pivot:
    THREE.Object3D;

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


function refreshMoveControls(
  core:
    BimCoreInstance,
): void {

  if (
    !core.designTransform.isActive
  ) {

    return;

  }


  const move =
    core.designTransform as unknown as
      MoveRuntime;


  /*
   * Conservamos cualquier operación que siga armada. detach/attach se usa
   * únicamente para reconstruir el estado interno/picker de TransformControls
   * alrededor del pivot ACTUAL después de un movimiento programático por SNAP.
   */
  const armedMoveAxis =
    move.armedMoveAxis;

  const armedPivot =
    move.armedPivot;


  move.controls.dragging =
    false;

  move.controls.axis =
    null;


  move.controls.detach();

  move.controls.attach(
    move.pivot,
  );


  move.controls.dragging =
    false;

  move.controls.axis =
    null;


  move.armedMoveAxis =
    armedMoveAxis;

  move.armedPivot =
    armedPivot;


  move.pivot.updateMatrixWorld(
    true,
  );


  /*
   * Alternar ORTO/PERS o navegar puede reemplazar/actualizar la cámara THREE.
   * Resincronizarla aquí produce el mismo refresco que antes ocurría solamente
   * cuando el usuario movía o acercaba la cámara manualmente.
   */
  core.designTransform.setCamera(
    core.viewport.camera,
  );

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


  core.cameraNavigation.setEnabled(true);


  if (
    core.designTransform.isActive
  ) {

    refreshMoveControls(
      core,
    );

  }


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

  let frame:
    number | null =
      null;

  let disposed =
    false;

  let armedAtPointerDown =
    false;


  const refresh =
    (): void => {

      frame =
        null;


      if (
        disposed
      ) {

        return;

      }


      const completedArmedInteraction =
        armedAtPointerDown;

      armedAtPointerDown =
        false;


      /*
       * El segundo clic de centro->SNAP o eje->SNAP mueve el pivot/objetos
       * fuera del drag nativo de TransformControls. Reenganchamos el gizmo
       * justo antes del siguiente frame para que su picker use la posición
       * nueva inmediatamente, sin necesitar mover la cámara.
       */
      if (
        completedArmedInteraction
      ) {

        refreshMoveControls(
          core,
        );

      }


      if (
        !core.designTransform.isActive
        || core.getPieceDefinitionPreparationState()
          .active
      ) {

        return;

      }


      if (
        move.armedMoveAxis
        || move.armedPivot
      ) {

        /*
         * SNAP debe seguir activo mientras esperamos el segundo clic.
         * Los IDs de la selección móvil siguen excluidos por el controlador
         * MOVE para evitar auto-snap, pero las demás piezas continúan siendo
         * destinos válidos.
         */
        core.designSnap.setEnabled(
          true,
        );


        core.pieceDefinitionHelpers
          .setActiveInstanceId(
            null,
          );


        core.designTransform.setCamera(
          core.viewport.camera,
        );

        return;

      }


      if (
        completedArmedInteraction
      ) {

        core.pieceDefinitionHelpers
          .setActiveInstanceId(
            null,
          );

      }

  };


  const scheduleRefresh =
    (): void => {

    if (
      frame !== null
    ) {

      window.cancelAnimationFrame(
        frame,
      );

    }


    frame =
      window.requestAnimationFrame(
        refresh,
      );

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


      armedAtPointerDown =
        core.designTransform.isActive
        && Boolean(
          move.armedMoveAxis
          || move.armedPivot,
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


      /*
       * El primer clic puede armar el eje dentro del mouseUp del gizmo;
       * el segundo puede completar un SNAP programático. En ambos casos
       * refrescamos después de que todos los handlers del evento terminaron.
       */
      scheduleRefresh();

  };


  const handlePointerCancel =
    (): void => {

      armedAtPointerDown =
        false;

      scheduleRefresh();

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
      frame !== null
    ) {

      window.cancelAnimationFrame(
        frame,
      );

      frame =
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
    await createReleaseSafeBimCore(
      container,
    );


  const baseCreateDesignPieceInstance =
    core.createDesignPieceInstance;

  const baseDispose =
    core.dispose;


  const modelSpaceDimensions =
    core.world.renderer
      ? new ModelSpaceDimensionController({
          container,
          domElement:
            core.viewport.canvas,
          scene:
            core.viewport.scene,
          cameraProvider: () =>
            core.viewport.camera,
          snap:
            core.designSnap,
          workPlane:
            core.cadWorkPlane,
          designSelection:
            core.designSelection,
          pointSelection:
            core.cadPointSelection,
          lineSelection:
            core.cadLineSelection,
          beforeActivate: () => {
            core.cancelActiveCadCommand();
            core.cancelCadWorkPlaneEdit();
            core.cancelPreparedPieceOriginSnapEdit();
          },
        })
      : null;


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


        modelSpaceDimensions?.dispose();

        uninstallSelectionScopedMoveState();

        uninstallArmedSnapHelperRefresh();


        baseDispose();

      },
  };

}
