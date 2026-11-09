import { ModelOperations } from "./automation/ModelOperations";
export { ModelOperations } from "./automation/ModelOperations";
export type { ChangeRequest, Proposal, CommandsProposal, ObjectQuery, ModelObjectSummary, OperationPorts } from "./automation/ModelOperations";
export { connectAutomationBridge } from "./automation/BrowserBridge";
import {
  createBimCore as createAdvancedCadBimCore,
} from "./advancedCadNavigationIndex";

import type {
  PrecisionBimCoreInstance as AdvancedCadPrecisionBimCoreInstance,
} from "./advancedCadNavigationIndex";

import {
  CadPolylineGripController,
} from "./interaction/CadPolylineGripController";

import {
  CadLayerColorController,
} from "./interaction/CadLayerColorController";


export * from "./advancedCadNavigationIndex";

export {
  CadPolylineGripController,
} from "./interaction/CadPolylineGripController";

export type {
  CadPolylineGripControllerOptions,
} from "./interaction/CadPolylineGripController";

export {
  CadLayerColorController,
} from "./interaction/CadLayerColorController";

export type {
  CadLayerColorControllerOptions,
} from "./interaction/CadLayerColorController";


export type PrecisionBimCoreInstance =
  AdvancedCadPrecisionBimCoreInstance
  & {
    readonly automation: ModelOperations;
    readonly cadPolylineGrips:
      CadPolylineGripController;
    readonly cadLayerColors:
      CadLayerColorController;
  };


/**
 * Capa de edición visual CAD:
 * - grips directos para POLYLINE;
 * - color CAD heredado desde DesignLayer.
 */
export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core =
    await createAdvancedCadBimCore(
      container,
    );

  const renderer =
    core.world.renderer;

  if (!renderer) {
    core.dispose();
    throw new Error(
      "FrameLogic CAD visual tools require an initialized renderer.",
    );
  }

  const cadLayerColors =
    new CadLayerColorController({
      designModel:
        core.designModel,
      lineScene:
        core.cadLineScene,
      pointScene:
        core.cadPointScene,
      circleScene:
        core.cadCircleScene,
      lineSelection:
        core.cadLineSelection,
      pointSelection:
        core.cadPointSelection,
    });

  const cadPolylineGrips =
    new CadPolylineGripController({
      domElement:
        renderer.three.domElement,
      cameraProvider: () =>
        core.world.camera.three,
      designModel:
        core.designModel,
      lineScene:
        core.cadLineScene,
      polylines:
        core.cadPolylines,
      lineSelection:
        core.cadLineSelection,
      workPlane:
        core.cadWorkPlane,
      history:
        core.cadHistory,
      findSnapPoint: (
        clientX,
        clientY,
      ) =>
        core.snapEngine
          .findSnap(
            clientX,
            clientY,
          )
          ?.point
          .clone()
        ?? null,
      setCameraEnabled: (
        enabled,
      ) => {
        core.world.camera.controls.enabled =
          enabled;
      },
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
    });

  /*
   * El schema del proyecto se mantiene en v1. DesignLayer se serializa como
   * objeto completo, así que los proyectos nuevos guardan `color`. Al abrir
   * proyectos anteriores la ausencia de color conserva el tono CAD neutro.
   * La restauración base todavía ignora campos nuevos, por eso reaplicamos el
   * color opcional después de reconstruir los layers.
   */
  const baseRestoreProjectPackage =
    core.projectPackage
      .restoreProjectPackage
      .bind(
        core.projectPackage,
      );

  let projectLoading = false;
  core.projectPackage.restoreProjectPackage =
    async (
      project,
    ): Promise<void> => {
      projectLoading = true;
      try {
      await baseRestoreProjectPackage(
        project,
      );

      for (const layer of project.layers) {
        if (!layer.color) continue;

        core.designModel.layers.update(
          layer.id,
          {
            color:
              layer.color,
          },
        );
      }

      cadLayerColors.sync();
      } finally { projectLoading = false; }
    };

  const automation = new ModelOperations(core.designModel, core.cadHistory, {
    sync: () => { core.designScene.sync(); core.designSelection.refreshHelpers(); },
    getSelection: () => [...core.designSelection.getSelectedIds()],
    setSelection: ids => core.designSelection.setSelection(ids),
    getInstanceBounds: id => {
      const bounds = core.designScene.getInstanceWorldBounds(id);
      if (!bounds) return null;
      return {
        min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
        max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
      };
    },
    assertReady: () => {
      if (disposed || projectLoading || core.cadCommandManager.hasActiveCommand || core.designTransform.isActive
        || core.align.isActive || core.smartPieceInsertion.isActive || core.designRotate.isActive
        || core.cadLineMove.isActive || core.cadMixedMove.isActive
        || core.cadPointPlacement.isActive || core.cadLinePlacement.isActive
        || core.piecePreparation.isActive || core.pieceFrameLogicWorkspace.editingInstanceId)
        throw new Error("Close the active command or piece editor before automation");
    },
  });

  const baseDispose =
    core.dispose;
  let disposed = false;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;

    core.projectPackage.restoreProjectPackage =
      baseRestoreProjectPackage;

    cadPolylineGrips.dispose();
    cadLayerColors.dispose();
    baseDispose();
  };

  return {
    ...core,
    cadPolylineGrips,
    cadLayerColors,
    automation,
    dispose,
  };
}

