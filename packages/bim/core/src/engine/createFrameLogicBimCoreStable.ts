import * as THREE from "three";

import {
  createBimCore as createEnhancedBimCore,
} from "./createFrameLogicBimCore";

import type {
  BimCoreInstance,
} from "./createBimCore";


type MoveAxis =
  | "X"
  | "Y"
  | "Z"
  | "XY"
  | "XZ"
  | "YZ";


interface MoveTransformRuntime {
  readonly controls: {
    axis: string | null;
    dragging: boolean;
    getMode: () => string;
  };
  readonly pivot: THREE.Object3D;
  readonly previousPivotPosition: THREE.Vector3;
  dragMode:
    | "NONE"
    | "MOVE_OBJECTS"
    | "MOVE_PIVOT"
    | "ROTATE_OBJECTS";
  activeMoveAxis:
    string | null;
  dragHistoryStart:
    unknown | null;
  armedMoveAxis:
    MoveAxis | null;
  armedPivot:
    boolean;
  armedPointerDownActive:
    boolean;
}


function isMoveAxis(
  axis:
    string | null,
): axis is MoveAxis {

  return (
    axis === "X"
    || axis === "Y"
    || axis === "Z"
    || axis === "XY"
    || axis === "XZ"
    || axis === "YZ"
  );

}


function installStableMoveAxisClick(
  core:
    BimCoreInstance,
): () => void {

  const renderer =
    core.world.renderer;


  if (
    !renderer
  ) {

    return () => {};

  }


  const canvas =
    renderer.three.domElement;

  const runtime =
    core.designTransform as unknown as
      MoveTransformRuntime;

  const clickThresholdPixels =
    5;

  let gestureActive =
    false;

  let pointerId:
    number | null =
      null;

  let startX =
    0;

  let startY =
    0;

  let axisAtPointerDown:
    MoveAxis | null =
      null;

  const startPivot =
    new THREE.Vector3();

  const startPositions =
    new Map<
      string,
      THREE.Vector3
    >();


  const restoreVisualStart =
    (): void => {

      runtime.pivot.position.copy(
        startPivot,
      );

      runtime.pivot.updateMatrixWorld(
        true,
      );

      runtime.previousPivotPosition.copy(
        startPivot,
      );


      for (
        const [
          instanceId,
          startPosition,
        ]
        of startPositions
      ) {

        const object =
          core.designScene
            .getInstanceObject(
              instanceId,
            );


        if (
          !object
        ) {

          continue;

        }


        object.position.copy(
          startPosition,
        );

        object.updateMatrix();

        object.updateMatrixWorld(
          true,
        );

      }


      core.designSelection
        .refreshHelpers();

  };


  const getMovement =
    (
      event:
        PointerEvent,
    ): number =>
      Math.hypot(
        event.clientX
        - startX,
        event.clientY
        - startY,
      );


  const resetGesture =
    (): void => {

      gestureActive =
        false;

      pointerId =
        null;

      axisAtPointerDown =
        null;

      startPositions.clear();

  };


  const handlePointerDown =
    (
      event:
        PointerEvent,
    ): void => {

      const axis =
        runtime.controls.axis;


      if (
        event.button !== 0
        || !core.designTransform.isActive
        || runtime.controls.getMode()
          !== "translate"
        || !isMoveAxis(
          axis,
        )
        || runtime.armedMoveAxis
        || runtime.armedPivot
      ) {

        return;

      }


      gestureActive =
        true;

      pointerId =
        event.pointerId;

      axisAtPointerDown =
        axis;

      startX =
        event.clientX;

      startY =
        event.clientY;

      startPivot.copy(
        runtime.pivot.position,
      );

      startPositions.clear();


      for (
        const instanceId
        of core.designSelection
          .getSelectedIds()
      ) {

        const object =
          core.designScene
            .getInstanceObject(
              instanceId,
            );


        if (
          object
        ) {

          startPositions.set(
            instanceId,
            object.position.clone(),
          );

        }

      }

  };


  const handlePointerMove =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !gestureActive
        || pointerId
          !== event.pointerId
      ) {

        return;

      }


      if (
        getMovement(
          event,
        ) > clickThresholdPixels
      ) {

        return;

      }


      /*
       * Mientras el puntero siga dentro del umbral de clic, no dejamos que
       * TransformControls convierta pequeñas vibraciones del mouse en un drag.
       * Si el usuario supera 5 px con el botón presionado, dejamos pasar los
       * siguientes pointermove y el arrastre tradicional continúa funcionando.
       */
      restoreVisualStart();

      event.preventDefault();

      event.stopImmediatePropagation();

  };


  const handlePointerUp =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !gestureActive
        || pointerId
          !== event.pointerId
      ) {

        return;

      }


      const axis =
        axisAtPointerDown;

      const movement =
        getMovement(
          event,
        );


      if (
        axis
        && movement
          <= clickThresholdPixels
      ) {

        /*
         * Un clic corto sobre un eje/plano NO termina como drag nativo.
         * Armamos explícitamente el eje para que el siguiente clic SNAP
         * ejecute el movimiento restringido.
         */
        restoreVisualStart();

        runtime.controls.dragging =
          false;

        runtime.controls.axis =
          null;

        runtime.dragMode =
          "NONE";

        runtime.activeMoveAxis =
          null;

        runtime.dragHistoryStart =
          null;

        runtime.armedMoveAxis =
          axis;

        runtime.armedPivot =
          false;

        runtime.armedPointerDownActive =
          false;


        core.designSnap
          .setExcludedInstanceIds(
            core.designSelection
              .getSelectedIds(),
          );


        core.designSelection
          .setEnabled(
            false,
          );


        core.cameraNavigation.setEnabled(true);


        event.preventDefault();

        event.stopImmediatePropagation();

      }


      resetGesture();

  };


  const handlePointerCancel =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !gestureActive
        || pointerId
          !== event.pointerId
      ) {

        return;

      }


      restoreVisualStart();

      runtime.controls.dragging =
        false;

      runtime.controls.axis =
        null;

      resetGesture();

  };


  canvas.addEventListener(
    "pointerdown",
    handlePointerDown,
    true,
  );

  canvas.addEventListener(
    "pointermove",
    handlePointerMove,
    true,
  );

  canvas.addEventListener(
    "pointerup",
    handlePointerUp,
    true,
  );

  canvas.addEventListener(
    "pointercancel",
    handlePointerCancel,
    true,
  );


  return () => {

    canvas.removeEventListener(
      "pointerdown",
      handlePointerDown,
      true,
    );

    canvas.removeEventListener(
      "pointermove",
      handlePointerMove,
      true,
    );

    canvas.removeEventListener(
      "pointerup",
      handlePointerUp,
      true,
    );

    canvas.removeEventListener(
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
    await createEnhancedBimCore(
      container,
    );

  const uninstallStableMoveAxisClick =
    installStableMoveAxisClick(
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

        uninstallStableMoveAxisClick();

        baseDispose();

      },
  };

}
