import * as THREE from "three";

import {
  createBimCore as createBaseBimCore,
} from "./createBimCore";

import type {
  BimCoreInstance,
  ImportDesignPieceIfcInput,
} from "./createBimCore";

import {
  readFrameLogicPieceIfcMetadata,
} from "../ifc/FrameLogicPieceIfcMetadata";


function getSelectionCenter(
  core:
    BimCoreInstance,
): THREE.Vector3 | null {

  const selection =
    core.getCadSelectionState();


  if (
    selection.items.length < 1
  ) {

    return null;

  }


  const bounds =
    new THREE.Box3();

  let hasBounds =
    false;


  for (
    const item
    of selection.items
  ) {

    if (
      item.type === "PIECE"
    ) {

      const object =
        core.designScene
          .getInstanceObject(
            item.id,
          );


      if (
        !object
        || !object.visible
      ) {

        continue;

      }


      object.updateMatrixWorld(
        true,
      );


      const pieceBounds =
        new THREE.Box3()
          .setFromObject(
            object,
          );


      if (
        pieceBounds.isEmpty()
      ) {

        continue;

      }


      bounds.union(
        pieceBounds,
      );

      hasBounds =
        true;

      continue;

    }


    if (
      item.type === "POINT"
    ) {

      const point =
        core.designModel
          .cadPoints
          .get(
            item.id,
          );


      if (
        !point
      ) {

        continue;

      }


      bounds.expandByPoint(
        new THREE.Vector3(
          point.position.x,
          point.position.y,
          point.position.z,
        ),
      );

      hasBounds =
        true;

      continue;

    }


    const line =
      core.designModel
        .cadLines
        .get(
          item.id,
        );


    if (
      !line
    ) {

      continue;

    }


    bounds.expandByPoint(
      new THREE.Vector3(
        line.start.x,
        line.start.y,
        line.start.z,
      ),
    );


    bounds.expandByPoint(
      new THREE.Vector3(
        line.end.x,
        line.end.y,
        line.end.z,
      ),
    );


    hasBounds =
      true;

  }


  if (
    !hasBounds
    || bounds.isEmpty()
  ) {

    return null;

  }


  return bounds.getCenter(
    new THREE.Vector3(),
  );

}


function setCameraOrbitPointFromSelection(
  core:
    BimCoreInstance,
): void {

  const center =
    getSelectionCenter(
      core,
    );


  if (
    !center
  ) {

    return;

  }


  const controls =
    core.world.camera.controls as
      typeof core.world.camera.controls
      & {
        setOrbitPoint?:
          (
            x: number,
            y: number,
            z: number,
          ) => void;
      };


  if (
    controls.setOrbitPoint
  ) {

    controls.setOrbitPoint(
      center.x,
      center.y,
      center.z,
    );

    return;

  }


  void controls.setTarget(
    center.x,
    center.y,
    center.z,
    false,
  );

}


function syncPieceDefinitionHelpers(
  core:
    BimCoreInstance,
): void {

  if (
    core.getPieceDefinitionPreparationState()
      .active
  ) {

    return;

  }


  /*
   * En el espacio modelo general, null significa "todas las
   * PieceInstance visibles". De esta forma una pieza puede
   * usar como referencia los SNAPs/ejes persistentes de otra
   * aunque la otra pieza no esté seleccionada.
   */
  core.pieceDefinitionHelpers
    .setActiveInstanceId(
      null,
    );

}


interface MoveTransformRuntime {
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
  readonly armedMoveAxis:
    unknown;
  readonly armedPivot:
    boolean;
  readonly previousPivotPosition:
    THREE.Vector3;
  dragHistoryStart:
    unknown;
}


function installMoveClickArmGuard(
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

  const startPivot =
    new THREE.Vector3();

  const startPositions =
    new Map<
      string,
      THREE.Vector3
    >();


  const isMoveAxis =
    (
      axis:
        string | null,
    ): boolean =>
      axis === "X"
      || axis === "Y"
      || axis === "Z"
      || axis === "XY"
      || axis === "XZ"
      || axis === "YZ";


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

      startPositions.clear();

    };


  const restoreClickStart =
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

      startPositions.clear();

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


  const handleTransformMouseDown =
    (): void => {

      /*
       * El eje fiable se conoce aquí, no necesariamente durante
       * pointerdown. Esto evita que la segunda instancia (o una
       * selección recién cambiada) salte directamente a drag porque
       * TransformControls todavía reportaba axis=null en el capture.
       */
      if (
        !pointerDown
        || runtime.controls.getMode()
          !== "translate"
        || !isMoveAxis(
          runtime.controls.axis,
        )
        || runtime.armedMoveAxis
        || runtime.armedPivot
      ) {

        return;

      }


      gestureActive =
        true;

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


  const handleTransformObjectChange =
    (): void => {

      if (
        !gestureActive
        || pointerMovement
          > clickThreshold
      ) {

        return;

      }


      /*
       * Mientras el gesto siga dentro del umbral de clic, anulamos
       * cualquier traslación temprana producida por TransformControls.
       * Si supera 5 px, deja de restaurarse y se convierte en drag real.
       */
      restoreClickStart();

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
         * Este listener corre en capture, antes del mouseUp interno de
         * TransformControls. Restaurar aquí hace que DesignTransformController
         * vea desplazamiento cero y arme el eje para el segundo clic SNAP.
         */
        restoreClickStart();

        /*
         * Un clic de armado no debe introducir una entrada MOVE vacía
         * en Undo/Redo.
         */
        runtime.dragHistoryStart =
          null;

      }


      if (
        !gestureActive
      ) {

        resetGesture();

      }

    };


  const handleTransformMouseUp =
    (): void => {

      /*
       * Se ejecuta después del mouseUp del DesignTransformController,
       * cuando éste ya pudo convertir el clic corto en armedMoveAxis.
       */
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

        restoreClickStart();

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
    handleTransformMouseDown,
  );

  runtime.controls.addEventListener(
    "objectChange",
    handleTransformObjectChange,
  );

  runtime.controls.addEventListener(
    "mouseUp",
    handleTransformMouseUp,
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
      handleTransformMouseDown,
    );

    runtime.controls.removeEventListener(
      "objectChange",
      handleTransformObjectChange,
    );

    runtime.controls.removeEventListener(
      "mouseUp",
      handleTransformMouseUp,
    );

  };

}


async function restoreFrameLogicDefinitionMetadata(
  core:
    BimCoreInstance,

  file:
    File,

  definitionId:
    string,
): Promise<void> {

  const metadata =
    await readFrameLogicPieceIfcMetadata(
      file,
    );


  if (
    !metadata
  ) {

    return;

  }


  const registry =
    core.designModel
      .pieceDefinitions;


  for (
    const snap
    of metadata.snapPoints
  ) {

    registry.addSnapPoint(
      definitionId,
      {
        id:
          snap.id,
        name:
          snap.name,
        type:
          snap.type,
        position: {
          ...snap.position,
        },
        relatedAxisId:
          snap.relatedAxisId,
      },
    );

  }


  for (
    const axis
    of metadata.axisLines
  ) {

    registry.addReferenceAxisLine(
      definitionId,
      {
        id:
          axis.id,
        name:
          axis.name,
        type:
          axis.type,
        origin: {
          ...axis.origin,
        },
        direction: {
          ...axis.direction,
        },
        length:
          axis.length,
      },
    );

  }

}


export async function createBimCore(
  container:
    HTMLElement,
): Promise<BimCoreInstance> {

  const core =
    await createBaseBimCore(
      container,
    );


  const baseImportDesignPieceIfc =
    core.importDesignPieceIfc;

  const baseCreateDesignPieceInstance =
    core.createDesignPieceInstance;

  const baseStopPieceDefinitionPreparation =
    core.stopPieceDefinitionPreparation;

  const baseDispose =
    core.dispose;


  let disposed =
    false;

  let pendingImportedDefinitionId:
    string | null =
      null;


  const uninstallMoveClickArmGuard =
    installMoveClickArmGuard(
      core,
    );


  const unsubscribeSelection =
    core.subscribeCadSelection(
      () => {

        if (
          disposed
        ) {

          return;

        }


        syncPieceDefinitionHelpers(
          core,
        );


        setCameraOrbitPointFromSelection(
          core,
        );

      },
    );


  const handleCameraControlStart =
    (): void => {

      if (
        disposed
      ) {

        return;

      }


      /*
       * Recalculamos justo antes de navegar para que el centro de órbita
       * siga a una pieza, punto o línea que se haya movido después de
       * haber sido seleccionada.
       */
      setCameraOrbitPointFromSelection(
        core,
      );

    };


  core.world.camera.controls
    .addEventListener(
      "controlstart",
      handleCameraControlStart,
    );


  const enhanced:
    BimCoreInstance = {
      ...core,

      importDesignPieceIfc:
        async (
          file:
            File,

          input:
            ImportDesignPieceIfcInput,
        ) => {

          const result =
            await baseImportDesignPieceIfc(
              file,
              input,
            );


          try {

            await restoreFrameLogicDefinitionMetadata(
              core,
              file,
              result.definition.id,
            );

          }
          catch (
            error
          ) {

            core.designModel
              .removePieceDefinition(
                result.definition.id,
              );

            core.designModel
              .removeAsset(
                result.asset.id,
              );


            throw error;

          }


          pendingImportedDefinitionId =
            result.definition.id;


          return {
            asset:
              result.asset,
            definition:
              core.designModel
                .pieceDefinitions
                .get(
                  result.definition.id,
                )
              ?? result.definition,
          };

        },

      createDesignPieceInstance:
        (
          input,
        ) => {

          const instance =
            baseCreateDesignPieceInstance(
              input,
            );


          if (
            pendingImportedDefinitionId
            === input.definitionId
          ) {

            pendingImportedDefinitionId =
              null;


            core.selectPieceInstance(
              instance.id,
            );

          }


          syncPieceDefinitionHelpers(
            core,
          );


          return instance;

        },

      stopPieceDefinitionPreparation:
        () => {

          baseStopPieceDefinitionPreparation();


          syncPieceDefinitionHelpers(
            core,
          );

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


          uninstallMoveClickArmGuard();


          unsubscribeSelection();


          core.world.camera.controls
            .removeEventListener(
              "controlstart",
              handleCameraControlStart,
            );


          baseDispose();

        },
    };


  syncPieceDefinitionHelpers(
    core,
  );


  return enhanced;

}
