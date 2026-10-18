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


function syncSelectedPieceDefinitionHelpers(
  core:
    BimCoreInstance,
): void {

  if (
    core.getPieceDefinitionPreparationState()
      .active
  ) {

    return;

  }


  const selection =
    core.getCadSelectionState();


  const instanceId =
    selection.items.length === 1
    && selection.pieceIds.length === 1
      ? selection.pieceIds[0]
      : null;


  core.pieceDefinitionHelpers
    .setActiveInstanceId(
      instanceId
      ?? null,
    );

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


  const unsubscribeSelection =
    core.subscribeCadSelection(
      () => {

        if (
          disposed
        ) {

          return;

        }


        syncSelectedPieceDefinitionHelpers(
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


          return instance;

        },

      stopPieceDefinitionPreparation:
        () => {

          baseStopPieceDefinitionPreparation();


          syncSelectedPieceDefinitionHelpers(
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


          unsubscribeSelection();


          core.world.camera.controls
            .removeEventListener(
              "controlstart",
              handleCameraControlStart,
            );


          baseDispose();

        },
    };


  return enhanced;

}
