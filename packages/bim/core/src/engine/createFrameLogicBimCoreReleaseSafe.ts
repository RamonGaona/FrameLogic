import * as THREE from "three";

import {
  createBimCore as createInteractionBimCore,
} from "./createFrameLogicBimCoreInteraction";

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


interface TransformControlsRuntime {
  axis:
    string | null;

  dragging:
    boolean;

  getMode:
    () => string;
}


interface MoveRuntime {
  readonly controls:
    TransformControlsRuntime;

  readonly pivot:
    THREE.Object3D;

  readonly previousPivotPosition:
    THREE.Vector3;

  readonly dragStartPivotPosition:
    THREE.Vector3;

  armedMoveAxis:
    MoveAxis | null;

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


function projectToClient(
  point:
    THREE.Vector3,

  camera:
    THREE.Camera,

  rect:
    DOMRect,
): THREE.Vector2 | null {

  const projected =
    point.clone()
      .project(
        camera,
      );


  if (
    !Number.isFinite(
      projected.x,
    )
    || !Number.isFinite(
      projected.y,
    )
  ) {

    return null;

  }


  return new THREE.Vector2(
    rect.left
      + (
          projected.x + 1
        )
        * 0.5
        * rect.width,

    rect.top
      + (
          1 - projected.y
        )
        * 0.5
        * rect.height,
  );

}


/*
 * TransformControls usa pickers internos distintos para cada parte visible
 * del gizmo. En determinadas vistas, +X y -X (o +Y/-Y, +/-Z) pueden terminar
 * entrando por estados diferentes aunque visualmente sean el mismo eje.
 *
 * Para el comportamiento CAD de FrameLogic necesitamos otra regla:
 * ambos sentidos de una misma recta representan exactamente el mismo eje.
 * Por eso hacemos este hit test simétrico en pantalla alrededor del pivot.
 */
function getSymmetricMoveAxisAtPointer(
  core:
    BimCoreInstance,

  runtime:
    MoveRuntime,

  clientX:
    number,

  clientY:
    number,
): MoveAxis | null {

  const hoveredAxis =
    runtime.controls.axis;


  /*
   * Los planos XY/XZ/YZ no tienen el problema +/-.
   * Conservamos el picker nativo cuando Three.js los identifica.
   */
  if (
    hoveredAxis === "XY"
    || hoveredAxis === "XZ"
    || hoveredAxis === "YZ"
  ) {

    return hoveredAxis;

  }


  const renderer =
    core.world.renderer;


  if (
    !renderer
  ) {

    return isMoveAxis(
      hoveredAxis,
    )
      ? hoveredAxis
      : null;

  }


  const rect =
    renderer.three.domElement
      .getBoundingClientRect();


  if (
    rect.width <= 0
    || rect.height <= 0
  ) {

    return isMoveAxis(
      hoveredAxis,
    )
      ? hoveredAxis
      : null;

  }


  const camera =
    core.world.camera.three;


  runtime.pivot.updateMatrixWorld(
    true,
  );


  const pivotWorld =
    new THREE.Vector3();

  runtime.pivot.getWorldPosition(
    pivotWorld,
  );


  const pivotClient =
    projectToClient(
      pivotWorld,
      camera,
      rect,
    );


  if (
    !pivotClient
  ) {

    return isMoveAxis(
      hoveredAxis,
    )
      ? hoveredAxis
      : null;

  }


  const pointer =
    new THREE.Vector2(
      clientX,
      clientY,
    );


  const fromPivot =
    pointer.clone()
      .sub(
        pivotClient,
      );


  const radialDistance =
    fromPivot.length();


  /*
   * No robamos el centro XYZ. El centro conserva su flujo especial
   * centro amarillo -> SNAP para cambiar únicamente el punto base.
   */
  if (
    radialDistance < 16
  ) {

    return null;

  }


  const cameraPosition =
    new THREE.Vector3();

  camera.getWorldPosition(
    cameraPosition,
  );


  const sampleDistance =
    Math.max(
      0.05,
      cameraPosition.distanceTo(
        pivotWorld,
      ) * 0.05,
    );


  const axes:
    readonly [
      MoveAxis,
      THREE.Vector3,
    ][] = [
      [
        "X",
        new THREE.Vector3(
          1,
          0,
          0,
        ),
      ],
      [
        "Y",
        new THREE.Vector3(
          0,
          1,
          0,
        ),
      ],
      [
        "Z",
        new THREE.Vector3(
          0,
          0,
          1,
        ),
      ],
    ];


  let bestAxis:
    MoveAxis | null =
      null;

  let bestScore =
    Number.POSITIVE_INFINITY;


  for (
    const [
      axis,
      direction,
    ]
    of axes
  ) {

    /*
     * Si algún día el gizmo usa espacio local, respetamos también
     * la orientación actual del pivot. En world hoy es identidad.
     */
    direction.applyQuaternion(
      runtime.pivot.quaternion,
    );


    const plusClient =
      projectToClient(
        pivotWorld.clone()
          .addScaledVector(
            direction,
            sampleDistance,
          ),
        camera,
        rect,
      );


    const minusClient =
      projectToClient(
        pivotWorld.clone()
          .addScaledVector(
            direction,
            -sampleDistance,
          ),
        camera,
        rect,
      );


    if (
      !plusClient
      || !minusClient
    ) {

      continue;

    }


    const screenDirection =
      plusClient.clone()
        .sub(
          minusClient,
        );


    if (
      screenDirection.lengthSq()
      < 4
    ) {

      continue;

    }


    screenDirection.normalize();


    const along =
      fromPivot.dot(
        screenDirection,
      );


    const perpendicular =
      Math.abs(
        fromPivot.x
          * screenDirection.y
        - fromPivot.y
          * screenDirection.x,
      );


    /*
     * El signo de along NO importa: +X y -X son X, etc.
     * El rango cubre la línea y las dos cabezas visibles del gizmo.
     */
    if (
      Math.abs(
        along,
      ) < 14
      || Math.abs(
        along,
      ) > 220
      || perpendicular > 14
    ) {

      continue;

    }


    const hoveredBonus =
      hoveredAxis === axis
        ? -4
        : 0;


    const score =
      perpendicular
      + hoveredBonus;


    if (
      score < bestScore
    ) {

      bestScore =
        score;

      bestAxis =
        axis;

    }

  }


  if (
    bestAxis
  ) {

    return bestAxis;

  }


  return isMoveAxis(
    hoveredAxis,
  )
    ? hoveredAxis
    : null;

}


function installSymmetricMoveClickGuard(
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
      MoveRuntime;

  const clickThreshold =
    5;


  let pointerDown =
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

  let pendingAxis:
    MoveAxis | null =
      null;


  const startPivot =
    new THREE.Vector3();

  const startPositions =
    new Map<
      string,
      THREE.Vector3
    >();


  const resetGesture =
    (): void => {

      pointerDown =
        false;

      pointerId =
        null;

      pointerMovement =
        0;

      pendingAxis =
        null;

      startPositions.clear();

  };


  const restoreStart =
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
          position,
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
          position,
        );

        object.updateMatrix();

        object.updateMatrixWorld(
          true,
        );

      }


      core.designSelection
        .refreshHelpers();

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


  const handlePointerDown =
    (
      event:
        PointerEvent,
    ): void => {

      if (
        event.button !== 0
        || !core.designTransform.isActive
        || runtime.controls.getMode()
          !== "translate"
        || runtime.armedMoveAxis
        || runtime.armedPivot
      ) {

        return;

      }


      /*
       * Cada gesto nuevo empieza limpio. Si un pointerup anterior quedó
       * bloqueado por una operación SNAP, nunca heredamos dragging=true.
       */
      runtime.controls.dragging =
        false;


      const axis =
        getSymmetricMoveAxisAtPointer(
          core,
          runtime,
          event.clientX,
          event.clientY,
        );


      if (
        !axis
      ) {

        return;

      }


      pointerDown =
        true;

      pointerId =
        event.pointerId;

      startX =
        event.clientX;

      startY =
        event.clientY;

      pointerMovement =
        0;

      pendingAxis =
        axis;


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


      /*
       * El drag nativo también debe usar el mismo eje simétrico.
       * Así un drag intencional desde +X o -X continúa siendo X.
       */
      runtime.controls.axis =
        axis;

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


      const axis =
        pendingAxis;


      if (
        axis
        && pointerMovement
          <= clickThreshold
      ) {

        /*
         * Dejamos que el mouseUp nativo continúe, pero antes fijamos el
         * estado EXACTO que DesignTransformController espera para reconocer
         * un clic corto. De este modo también se ejecuta la limpieza interna
         * normal de TransformControls y no queda ningún drag pegado.
         */
        restoreStart();


        runtime.controls.axis =
          axis;

        runtime.activeMoveAxis =
          axis;

        runtime.dragMode =
          "MOVE_OBJECTS";

        runtime.dragStartPivotPosition.copy(
          startPivot,
        );

        runtime.previousPivotPosition.copy(
          startPivot,
        );

        runtime.dragHistoryStart =
          null;

      }


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
        pointerMovement
        <= clickThreshold
      ) {

        restoreStart();

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


/*
 * Limpieza limitada exclusivamente al SEGUNDO clic de operaciones armadas.
 * No toca clics normales sobre X/Y/Z ni los anillos de ROTATE.
 */
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


  const uninstallSymmetricMoveClickGuard =
    installSymmetricMoveClickGuard(
      core,
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


        uninstallSymmetricMoveClickGuard();

        uninstallArmedReleaseNormalization();

        baseDispose();

      },
  };

}
