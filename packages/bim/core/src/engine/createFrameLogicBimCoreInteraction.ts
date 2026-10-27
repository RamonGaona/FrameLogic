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

import {
  disposeDesignOrthoController,
  getDesignOrthoController,
} from "../interaction/DesignOrthoController";

import type {
  DesignOrthoAxis,
  DesignOrthoController,
} from "../interaction/DesignOrthoController";


type RotateAxis =
  | "X"
  | "Y"
  | "Z";


type MoveAxis =
  | "X"
  | "Y"
  | "Z"
  | "XY"
  | "XZ"
  | "YZ"
  | "XYZ";


interface TransformControlsRuntime {
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
}


interface RotateRuntime {
  readonly controls:
    TransformControlsRuntime;

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


interface DesignMoveRuntime {
  readonly controls:
    TransformControlsRuntime;

  readonly pivot:
    THREE.Object3D;

  readonly previousPivotPosition:
    THREE.Vector3;

  readonly transformedObjects:
    Map<
      string,
      THREE.Object3D
    >;

  dragMode:
    string;

  activeMoveAxis:
    string | null;

  armedMoveAxis:
    string | null;

  armedPivot:
    boolean;
}


interface CadPointMoveRuntime {
  readonly controls:
    TransformControlsRuntime;

  readonly pivot:
    THREE.Object3D;

  readonly previousPivot:
    THREE.Vector3;

  applyDelta:
    (
      selectedIds:
        readonly string[],
      delta:
        THREE.Vector3,
    ) => void;
}


interface CadLineMoveRuntime {
  readonly controls:
    TransformControlsRuntime;

  readonly pivot:
    THREE.Object3D;

  readonly previousPivot:
    THREE.Vector3;

  armedMoveAxis:
    string | null;

  armedPivot:
    boolean;

  applyDelta:
    (
      selectedIds:
        readonly string[],
      delta:
        THREE.Vector3,
    ) => void;
}


interface CadMixedMoveRuntime {
  readonly controls:
    TransformControlsRuntime;

  readonly pivot:
    THREE.Object3D;

  readonly previousPivot:
    THREE.Vector3;

  armedMoveAxis:
    string | null;

  armedPivot:
    boolean;

  applyDelta:
    (
      delta:
        THREE.Vector3,
    ) => void;
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
    || axis === "XYZ"
  );

}


function getAllowedOrthoAxes(
  axis:
    MoveAxis,
): readonly DesignOrthoAxis[] {

  switch (
    axis
  ) {

    case "X":

      return [
        "X",
      ];


    case "Y":

      return [
        "Y",
      ];


    case "Z":

      return [
        "Z",
      ];


    case "XY":

      return [
        "X",
        "Y",
      ];


    case "XZ":

      return [
        "X",
        "Z",
      ];


    case "YZ":

      return [
        "Y",
        "Z",
      ];


    case "XYZ":

      return [
        "X",
        "Y",
        "Z",
      ];

  }

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


function installGlobalOrthoGuard(
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

  const ortho =
    getDesignOrthoController(
      canvas,
    );


  const cleanups:
    Array<() => void> = [];


  const constrainPivot =
    (
      startPivot:
        THREE.Vector3,

      runtimePivot:
        THREE.Object3D,

      previousPivot:
        THREE.Vector3,

      axis:
        MoveAxis,

      applyCorrection:
        (
          correction:
            THREE.Vector3,
        ) => void,
    ): void => {

      if (
        !ortho.isEnabled
      ) {

        return;

      }


      const constrained =
        ortho.constrainPoint(
          startPivot,
          runtimePivot.position,
          {
            axes:
              getAllowedOrthoAxes(
                axis,
              ),
          },
        );


      const correction =
        constrained
          .clone()
          .sub(
            runtimePivot.position,
          );


      if (
        correction.lengthSq()
        > 1e-20
      ) {

        applyCorrection(
          correction,
        );

      }


      runtimePivot.position.copy(
        constrained,
      );

      runtimePivot.updateMatrixWorld(
        true,
      );


      previousPivot.copy(
        constrained,
      );

  };


  const installDesignMove =
    (): void => {

      const runtime =
        core.designTransform as unknown as
          DesignMoveRuntime;

      const startPivot =
        new THREE.Vector3();

      let dragAxis:
        MoveAxis | null =
          null;


      const handleMouseDown =
        (): void => {

          if (
            runtime.controls.getMode()
              !== "translate"
            || !isMoveAxis(
              runtime.controls.axis,
            )
          ) {

            dragAxis =
              null;

            return;

          }


          dragAxis =
            runtime.controls.axis;


          startPivot.copy(
            runtime.pivot.position,
          );

      };


      const handleObjectChange =
        (): void => {

          if (
            !ortho.isEnabled
            || !dragAxis
            || dragAxis === "XYZ"
            || runtime.dragMode
              !== "MOVE_OBJECTS"
          ) {

            return;

          }


          constrainPivot(
            startPivot,
            runtime.pivot,
            runtime.previousPivotPosition,
            dragAxis,
            (
              correction,
            ) => {

              for (
                const object
                of runtime.transformedObjects
                  .values()
              ) {

                object.position.add(
                  correction,
                );

                object.updateMatrix();

                object.updateMatrixWorld(
                  true,
                );

              }


              core.designSelection
                .refreshHelpers();

            },
          );

      };


      const handlePointerDown =
        (
          event:
            PointerEvent,
        ): void => {

          if (
            event.button !== 0
            || !ortho.isEnabled
            || runtime.armedPivot
            || !isMoveAxis(
              runtime.armedMoveAxis,
            )
            || runtime.armedMoveAxis
              === "XYZ"
          ) {

            return;

          }


          const armedAxis =
            runtime.armedMoveAxis;


          if (
            armedAxis === "X"
            || armedAxis === "Y"
            || armedAxis === "Z"
          ) {

            return;

          }


          const snap =
            core.designSnap.findSnap(
              event.clientX,
              event.clientY,
            );


          if (
            !snap
          ) {

            return;

          }


          runtime.armedMoveAxis =
            ortho.getDominantAxis(
              runtime.pivot.position,
              snap.point,
              {
                axes:
                  getAllowedOrthoAxes(
                    armedAxis,
                  ),
              },
            );

      };


      const handlePointerUp =
        (
          event:
            PointerEvent,
        ): void => {

          if (
            event.button !== 0
            || !ortho.isEnabled
            || !dragAxis
            || dragAxis === "XYZ"
            || runtime.dragMode
              !== "MOVE_OBJECTS"
          ) {

            return;

          }


          const snap =
            core.designSnap.findSnap(
              event.clientX,
              event.clientY,
            );


          const target =
            snap
              ? snap.point
              : runtime.pivot.position;


          runtime.activeMoveAxis =
            ortho.getDominantAxis(
              startPivot,
              target,
              {
                axes:
                  getAllowedOrthoAxes(
                    dragAxis,
                  ),
              },
            );

      };


      const handleMouseUp =
        (): void => {

          dragAxis =
            null;

      };


      runtime.controls.addEventListener(
        "mouseDown",
        handleMouseDown,
      );

      runtime.controls.addEventListener(
        "objectChange",
        handleObjectChange,
      );

      runtime.controls.addEventListener(
        "mouseUp",
        handleMouseUp,
      );

      canvas.addEventListener(
        "pointerdown",
        handlePointerDown,
        true,
      );

      canvas.addEventListener(
        "pointerup",
        handlePointerUp,
        true,
      );


      cleanups.push(
        () => {

          runtime.controls.removeEventListener(
            "mouseDown",
            handleMouseDown,
          );

          runtime.controls.removeEventListener(
            "objectChange",
            handleObjectChange,
          );

          runtime.controls.removeEventListener(
            "mouseUp",
            handleMouseUp,
          );

          canvas.removeEventListener(
            "pointerdown",
            handlePointerDown,
            true,
          );

          canvas.removeEventListener(
            "pointerup",
            handlePointerUp,
            true,
          );

        },
      );

  };


  const installCadPointMove =
    (): void => {

      const runtime =
        core.cadPointMove as unknown as
          CadPointMoveRuntime;

      const startPivot =
        new THREE.Vector3();

      let dragAxis:
        MoveAxis | null =
          null;


      const handleMouseDown =
        (): void => {

          dragAxis =
            isMoveAxis(
              runtime.controls.axis,
            )
              ? runtime.controls.axis
              : null;


          startPivot.copy(
            runtime.pivot.position,
          );

      };


      const handleObjectChange =
        (): void => {

          if (
            !ortho.isEnabled
            || !dragAxis
          ) {

            return;

          }


          constrainPivot(
            startPivot,
            runtime.pivot,
            runtime.previousPivot,
            dragAxis,
            (
              correction,
            ) => {

              runtime.applyDelta(
                core.cadPointSelection
                  .getSelectedIds(),
                correction,
              );

            },
          );

      };


      const handleMouseUp =
        (): void => {

          dragAxis =
            null;

      };


      runtime.controls.addEventListener(
        "mouseDown",
        handleMouseDown,
      );

      runtime.controls.addEventListener(
        "objectChange",
        handleObjectChange,
      );

      runtime.controls.addEventListener(
        "mouseUp",
        handleMouseUp,
      );


      cleanups.push(
        () => {

          runtime.controls.removeEventListener(
            "mouseDown",
            handleMouseDown,
          );

          runtime.controls.removeEventListener(
            "objectChange",
            handleObjectChange,
          );

          runtime.controls.removeEventListener(
            "mouseUp",
            handleMouseUp,
          );

        },
      );

  };


  const installCadLineMove =
    (): void => {

      const runtime =
        core.cadLineMove as unknown as
          CadLineMoveRuntime;

      const startPivot =
        new THREE.Vector3();

      let dragAxis:
        MoveAxis | null =
          null;


      const handleMouseDown =
        (): void => {

          dragAxis =
            isMoveAxis(
              runtime.controls.axis,
            )
              ? runtime.controls.axis
              : null;


          startPivot.copy(
            runtime.pivot.position,
          );

      };


      const handleObjectChange =
        (): void => {

          if (
            !ortho.isEnabled
            || !dragAxis
            || dragAxis === "XYZ"
          ) {

            return;

          }


          constrainPivot(
            startPivot,
            runtime.pivot,
            runtime.previousPivot,
            dragAxis,
            (
              correction,
            ) => {

              runtime.applyDelta(
                core.cadLineSelection
                  .getSelectedIds(),
                correction,
              );

            },
          );

      };


      const handlePointerDown =
        (
          event:
            PointerEvent,
        ): void => {

          if (
            event.button !== 0
            || !ortho.isEnabled
            || runtime.armedPivot
            || !isMoveAxis(
              runtime.armedMoveAxis,
            )
            || runtime.armedMoveAxis
              === "XYZ"
          ) {

            return;

          }


          const armedAxis =
            runtime.armedMoveAxis;


          if (
            armedAxis === "X"
            || armedAxis === "Y"
            || armedAxis === "Z"
          ) {

            return;

          }


          const snap =
            core.designSnap.findSnap(
              event.clientX,
              event.clientY,
            );


          if (
            !snap
          ) {

            return;

          }


          runtime.armedMoveAxis =
            ortho.getDominantAxis(
              runtime.pivot.position,
              snap.point,
              {
                axes:
                  getAllowedOrthoAxes(
                    armedAxis,
                  ),
              },
            );

      };


      const handleMouseUp =
        (): void => {

          dragAxis =
            null;

      };


      runtime.controls.addEventListener(
        "mouseDown",
        handleMouseDown,
      );

      runtime.controls.addEventListener(
        "objectChange",
        handleObjectChange,
      );

      runtime.controls.addEventListener(
        "mouseUp",
        handleMouseUp,
      );

      canvas.addEventListener(
        "pointerdown",
        handlePointerDown,
        true,
      );


      cleanups.push(
        () => {

          runtime.controls.removeEventListener(
            "mouseDown",
            handleMouseDown,
          );

          runtime.controls.removeEventListener(
            "objectChange",
            handleObjectChange,
          );

          runtime.controls.removeEventListener(
            "mouseUp",
            handleMouseUp,
          );

          canvas.removeEventListener(
            "pointerdown",
            handlePointerDown,
            true,
          );

        },
      );

  };


  const installCadMixedMove =
    (): void => {

      const runtime =
        core.cadMixedMove as unknown as
          CadMixedMoveRuntime;

      const startPivot =
        new THREE.Vector3();

      let dragAxis:
        MoveAxis | null =
          null;


      const handleMouseDown =
        (): void => {

          dragAxis =
            isMoveAxis(
              runtime.controls.axis,
            )
              ? runtime.controls.axis
              : null;


          startPivot.copy(
            runtime.pivot.position,
          );

      };


      const handleObjectChange =
        (): void => {

          if (
            !ortho.isEnabled
            || !dragAxis
            || dragAxis === "XYZ"
          ) {

            return;

          }


          constrainPivot(
            startPivot,
            runtime.pivot,
            runtime.previousPivot,
            dragAxis,
            (
              correction,
            ) => {

              runtime.applyDelta(
                correction,
              );

            },
          );

      };


      const handlePointerDown =
        (
          event:
            PointerEvent,
        ): void => {

          if (
            event.button !== 0
            || !ortho.isEnabled
            || runtime.armedPivot
            || !isMoveAxis(
              runtime.armedMoveAxis,
            )
            || runtime.armedMoveAxis
              === "XYZ"
          ) {

            return;

          }


          const armedAxis =
            runtime.armedMoveAxis;


          if (
            armedAxis === "X"
            || armedAxis === "Y"
            || armedAxis === "Z"
          ) {

            return;

          }


          const snap =
            core.designSnap.findSnap(
              event.clientX,
              event.clientY,
            );


          if (
            !snap
          ) {

            return;

          }


          runtime.armedMoveAxis =
            ortho.getDominantAxis(
              runtime.pivot.position,
              snap.point,
              {
                axes:
                  getAllowedOrthoAxes(
                    armedAxis,
                  ),
              },
            );

      };


      const handleMouseUp =
        (): void => {

          dragAxis =
            null;

      };


      runtime.controls.addEventListener(
        "mouseDown",
        handleMouseDown,
      );

      runtime.controls.addEventListener(
        "objectChange",
        handleObjectChange,
      );

      runtime.controls.addEventListener(
        "mouseUp",
        handleMouseUp,
      );

      canvas.addEventListener(
        "pointerdown",
        handlePointerDown,
        true,
      );


      cleanups.push(
        () => {

          runtime.controls.removeEventListener(
            "mouseDown",
            handleMouseDown,
          );

          runtime.controls.removeEventListener(
            "objectChange",
            handleObjectChange,
          );

          runtime.controls.removeEventListener(
            "mouseUp",
            handleMouseUp,
          );

          canvas.removeEventListener(
            "pointerdown",
            handlePointerDown,
            true,
          );

        },
      );

  };


  installDesignMove();

  installCadPointMove();

  installCadLineMove();

  installCadMixedMove();


  return () => {

    for (
      const cleanup
      of cleanups
        .reverse()
    ) {

      cleanup();

    }


    disposeDesignOrthoController(
      canvas,
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


  const uninstallGlobalOrthoGuard =
    installGlobalOrthoGuard(
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

        uninstallGlobalOrthoGuard();

        uninstallRotateClickDragGuard();

        baseDispose();

      },
  };

}
