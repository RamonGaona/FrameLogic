import * as THREE from "three";

import {
  createBimCore as createFrameLogicBimCore,
} from "./createFrameLogicBimCore";

import type {
  BimCoreInstance,
} from "./createBimCore";

import type {
  CadTransformSnapshot,
} from "../interaction/CadHistoryController";


type RotateAxis =
  | "X"
  | "Y"
  | "Z";


interface RotateRuntime {
  readonly controls: {
    axis:
      string | null;
    getMode:
      () => string;
    addEventListener:
      (
        type: string,
        listener: () => void,
      ) => void;
    removeEventListener:
      (
        type: string,
        listener: () => void,
      ) => void;
  };

  readonly pivot:
    THREE.Object3D;

  readonly rotationStartPivotQuaternion:
    THREE.Quaternion;

  readonly rotationStartStates:
    Map<string, unknown>;

  dragHistoryStart:
    CadTransformSnapshot
    | null;
}


function isRotateAxis(
  axis:
    string | null,
): axis is RotateAxis {

  return (
    axis === "X"
    || axis === "Y"
    || axis === "Z"
  );

}


function restoreTransformSnapshot(
  core:
    BimCoreInstance,

  snapshot:
    CadTransformSnapshot,
): void {

  for (
    const [
      instanceId,
      state,
    ]
    of snapshot
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


    object.position.set(
      state.position.x,
      state.position.y,
      state.position.z,
    );


    object.rotation.set(
      state.rotation.x,
      state.rotation.y,
      state.rotation.z,
    );


    object.updateMatrix();

    object.updateMatrixWorld(
      true,
    );

  }


  core.designSelection
    .refreshHelpers();

}


function installRotateClickDragGuard(
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
    core.designRotate as unknown as
      RotateRuntime;

  const clickThreshold =
    5;

  let pointerDown =
    false;

  let gestureActive =
    false;

  let pointerId:
    number | null =
      null;

  let startX =
    0;

  let startY =
    0;

  let pointerMovement =
    0;

  let startSnapshot:
    CadTransformSnapshot
    | null =
      null;

  const startPivotQuaternion =
    new THREE.Quaternion();


  const resetGesture =
    (): void => {

      pointerDown =
        false;

      gestureActive =
        false;

      pointerId =
        null;

      pointerMovement =
        0;

      startSnapshot =
        null;

  };


  const updateMovement =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !pointerDown
        || pointerId
          !== event.pointerId
      ) {

        return;

      }


      pointerMovement =
        Math.max(
          pointerMovement,
          Math.hypot(
            event.clientX
            - startX,
            event.clientY
            - startY,
          ),
        );

  };


  const restoreShortClickStart =
    (): void => {

      if (
        startSnapshot
      ) {

        restoreTransformSnapshot(
          core,
          startSnapshot,
        );

      }


      runtime.pivot.quaternion.copy(
        startPivotQuaternion,
      );

      runtime.pivot.updateMatrixWorld(
        true,
      );


      runtime.rotationStartPivotQuaternion.copy(
        startPivotQuaternion,
      );

  };


  const handlePointerDown =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        event.button !== 0
        || !core.designRotate.isActive
      ) {

        return;

      }


      pointerDown =
        true;

      gestureActive =
        false;

      pointerId =
        event.pointerId;

      startX =
        event.clientX;

      startY =
        event.clientY;

      pointerMovement =
        0;

      startSnapshot =
        core.cadHistory.capture(
          core.designSelection
            .getSelectedIds(),
        );

      startPivotQuaternion.copy(
        runtime.pivot.quaternion,
      );

  };


  const handlePointerMove =
    (
      event:
        PointerEvent,
    ): void => {

      updateMovement(
        event,
      );

  };


  const handleRotateMouseDown =
    (): void => {

      if (
        !pointerDown
        || runtime.controls.getMode()
          !== "rotate"
        || !isRotateAxis(
          runtime.controls.axis,
        )
      ) {

        return;

      }


      gestureActive =
        true;

  };


  const handleRotateObjectChange =
    (): void => {

      if (
        !gestureActive
        || pointerMovement
          > clickThreshold
      ) {

        return;

      }


      /*
       * Un pequeño movimiento del mouse sigue siendo un clic sobre
       * el anillo, no una rotación. Restauramos continuamente el estado
       * hasta que el usuario supere el umbral de drag.
       */
      restoreShortClickStart();

  };


  const handlePointerUp =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !pointerDown
        || pointerId
          !== event.pointerId
      ) {

        return;

      }


      updateMovement(
        event,
      );


      if (
        gestureActive
        && pointerMovement
          <= clickThreshold
      ) {

        /*
         * El clic corto únicamente selecciona/activa el eje de ROTATE
         * (el controlador original ya abre la entrada numérica X/Y/Z).
         * No debe modificar la pieza ni generar una entrada de historial.
         */
        restoreShortClickStart();

        runtime.dragHistoryStart =
          null;

        runtime.rotationStartStates.clear();

      }

  };


  const handleRotateMouseUp =
    (): void => {

      resetGesture();

  };


  const handlePointerCancel =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        !pointerDown
        || pointerId
          !== event.pointerId
      ) {

        return;

      }


      if (
        gestureActive
        && pointerMovement
          <= clickThreshold
      ) {

        restoreShortClickStart();

        runtime.dragHistoryStart =
          null;

      }


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


  runtime.controls.addEventListener(
    "mouseDown",
    handleRotateMouseDown,
  );

  runtime.controls.addEventListener(
    "objectChange",
    handleRotateObjectChange,
  );

  runtime.controls.addEventListener(
    "mouseUp",
    handleRotateMouseUp,
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


    runtime.controls.removeEventListener(
      "mouseDown",
      handleRotateMouseDown,
    );

    runtime.controls.removeEventListener(
      "objectChange",
      handleRotateObjectChange,
    );

    runtime.controls.removeEventListener(
      "mouseUp",
      handleRotateMouseUp,
    );

  };

}


export async function createBimCore(
  container:
    HTMLElement,
): Promise<BimCoreInstance> {

  /*
   * IMPORTANTE:
   * Usamos UNA sola capa FrameLogic para MOVE.
   * No se vuelve a envolver createFrameLogicBimCore con el antiguo
   * createFrameLogicBimCoreStable, porque ambos instalaban listeners
   * sobre el mismo TransformControls y dejaban estados distintos entre
   * la primera instancia y las instancias insertadas después.
   */
  const core =
    await createFrameLogicBimCore(
      container,
    );


  const uninstallRotateClickDragGuard =
    installRotateClickDragGuard(
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

        uninstallRotateClickDragGuard();

        baseDispose();

      },
  };

}
