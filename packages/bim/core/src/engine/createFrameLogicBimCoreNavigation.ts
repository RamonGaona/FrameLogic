import {
  createBimCore as createDrawingBimCore,
} from "./createFrameLogicBimCoreDrawing";

import type {
  PrecisionBimCoreInstance as DrawingPrecisionBimCoreInstance,
} from "./createFrameLogicBimCoreDrawing";

import {
  getActiveCadReferenceBlockController,
} from "../import/CadReferenceTransformController";

import {
  InstanceTreeController,
} from "../navigation/InstanceTreeController";

import {
  ModelSpaceInstanceTreeBridgeController,
} from "../navigation/ModelSpaceInstanceTreeBridgeController";

import {
  InstanceTreeConsistencyController,
} from "../navigation/InstanceTreeConsistencyController";

import {
  AssemblyClipboardController,
} from "../navigation/AssemblyClipboardController";

import {
  LinkedAssemblyInstanceController,
} from "../navigation/LinkedAssemblyInstanceController";

import {
  LinkedAssemblyInteractionController,
} from "../navigation/LinkedAssemblyInteractionController";

import {
  LinkedAssemblyUnlinkHistoryController,
} from "../navigation/LinkedAssemblyUnlinkHistoryController";

import {
  InstanceTreeGroupVisibilityController,
} from "../navigation/InstanceTreeGroupVisibilityController";

import {
  BuildVersionBadgeController,
} from "../navigation/BuildVersionBadgeController";

import {
  PieceAppearanceController,
} from "../navigation/PieceAppearanceController";

import {
  ModelRenderModeController,
} from "../navigation/ModelRenderModeController";

import {
  CadMouseNavigationController,
} from "../navigation/CadMouseNavigationController";

import {
  AlignController,
} from "../interaction/AlignController";

import {
  SmartPieceInsertionController,
} from "../interaction/SmartPieceInsertionController";

import {
  MoveRulerExperienceController,
} from "../interaction/MoveRulerExperienceController";

import {
  DrawingViewRenderStyleController,
} from "../drawing/DrawingViewRenderStyleController";

import {
  DrawingModelVisibilityBridgeController,
} from "../drawing/DrawingModelVisibilityBridgeController";

import {
  SectionInstanceTreeBridgeController,
} from "../drawing/SectionInstanceTreeBridgeController";

import {
  SectionModelInteractionController,
} from "../drawing/SectionModelInteractionController";

import {
  SectionAxisDragStabilityController,
} from "../drawing/SectionAxisDragStabilityController";

import {
  GeneralPdfController,
} from "../drawing/GeneralPdfController";

import {
  GeneralPdfTreeBridgeController,
} from "../drawing/GeneralPdfTreeBridgeController";

import {
  GeneralPdfTreeInteractionController,
} from "../drawing/GeneralPdfTreeInteractionController";

import {
  UnifiedPdfNavigationController,
} from "../drawing/UnifiedPdfNavigationController";

import {
  UnifiedPdfProjectBridgeController,
} from "../drawing/UnifiedPdfProjectBridgeController";

export type PrecisionBimCoreInstance =
  DrawingPrecisionBimCoreInstance
  & {
    readonly instanceTree:
      InstanceTreeController;
    readonly align:
      AlignController;
    readonly smartPieceInsertion:
      SmartPieceInsertionController;
  };

export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core = await createDrawingBimCore(container);

  /*
   * Preparar pieza define metadata/local frame; no es una transformación
   * geométrica de la instancia que el usuario está viendo.
   *
   * PieceDefinitionPreparationController conserva todavía una matriz local
   * histórica para presentar el origen en (0,0,0). En Model Space esa matriz
   * hacía que el STEP saltara al elegir un nuevo origen. Restauramos de forma
   * inmediata la transformación real de la PieceInstance y resincronizamos
   * los helpers. Así el origen cambia, pero la geometría permanece inmóvil.
   */
  const restorePreparedPieceVisualPlacement = (): void => {
    const state = core.piecePreparation.getState();
    if (state.instanceId) {
      const object = core.designScene.getInstanceObject(
        state.instanceId,
      );
      if (object) {
        object.matrixAutoUpdate = true;
      }
    }

    core.designScene.sync();
    core.pieceDefinitionHelpers.sync();
    core.geometryQuery.clearCache();
  };

  const baseStartPiecePreparation =
    core.piecePreparation.start.bind(
      core.piecePreparation,
    );
  core.piecePreparation.start = (
    instanceId,
  ) => {
    const state = baseStartPiecePreparation(
      instanceId,
    );
    restorePreparedPieceVisualPlacement();
    return state;
  };

  const baseSetPreparedPieceOrigin =
    core.piecePreparation.setOriginFromWorldPoint.bind(
      core.piecePreparation,
    );
  core.piecePreparation.setOriginFromWorldPoint = (
    worldPoint,
  ) => {
    const definition = baseSetPreparedPieceOrigin(
      worldPoint,
    );
    restorePreparedPieceVisualPlacement();
    return definition;
  };

  /*
   * SNAP no debe anunciarse permanentemente en Model Space.
   * Se habilita más abajo únicamente mientras una herramienta
   * que realmente consume SNAP está activa.
   */
  core.designSnap.setEnabled(false);

  const cadReferenceBlocks =
    getActiveCadReferenceBlockController();

  if (!cadReferenceBlocks) {
    core.dispose();
    throw new Error(
      "FrameLogic navigation requires the CAD reference block controller.",
    );
  }

  const renderer = core.world.renderer;
  if (!renderer) {
    core.dispose();
    throw new Error(
      "FrameLogic navigation requires an initialized renderer.",
    );
  }

  const canvas = renderer.three.domElement;
  const cadMouseNavigation =
    new CadMouseNavigationController({
      canvas,
      controls: core.world.camera.controls,
    });

  const buildVersion =
    new BuildVersionBadgeController(container);

  const pieceAppearance =
    new PieceAppearanceController({
      container,
      designModel: core.designModel,
      designScene: core.designScene,
      designSelection: core.designSelection,
    });

  const modelRenderMode =
    new ModelRenderModeController({
      container,
      designScene: core.designScene,
    });

  const smartPieceInsertion =
    new SmartPieceInsertionController({
      container,
      canvas,
      scene: core.world.scene.three,
      cameraProvider: () =>
        core.world.camera.three,
      designModel: core.designModel,
      designScene: core.designScene,
      workPlane: core.cadWorkPlane,
      findSnapPoint: (
        clientX,
        clientY,
      ) =>
        core.snapEngine
          .findSnap(clientX, clientY)
          ?.point
          .clone()
        ?? null,
      beforeStart: () => {
        core.cancelActiveCadCommand();
        core.cancelDesignPiecePlacement();
      },
    });

  /*
   * El cálculo/feedback del DesignSnapController queda activo sólo
   * durante operaciones que realmente lo necesitan. Así desaparecen
   * etiquetas como ENDPOINT/MIDPOINT/CENTER mientras el usuario sólo
   * navega, selecciona o inspecciona el modelo.
   */
  let snapFeedbackFrame:
    number | null =
      null;
  let snapFeedbackDisposed =
    false;
  let snapFeedbackEnabled =
    false;

  const syncSnapFeedback =
    (): void => {
      if (snapFeedbackDisposed) {
        return;
      }

      const workPlaneEditActive =
        core.getCadWorkPlaneEditState()
          .mode !== "NONE";
      const pieceOriginEditActive =
        core.getPieceDefinitionOriginEditState()
          .active;

      const shouldEnable =
        smartPieceInsertion.isActive
        || align.isActive
        || core.cadPointPlacement.isActive
        || core.cadLinePlacement.isActive
        || core.cadLineMove.isActive
        || core.cadMixedMove.isActive
        || core.designTransform.isActive
        || core.designRotate.isActive
        || workPlaneEditActive
        || pieceOriginEditActive;

      if (
        shouldEnable
        !== snapFeedbackEnabled
      ) {
        snapFeedbackEnabled =
          shouldEnable;
        core.designSnap.setEnabled(
          shouldEnable,
        );
      }

      snapFeedbackFrame =
        window.requestAnimationFrame(
          syncSnapFeedback,
        );
    };

  snapFeedbackFrame =
    window.requestAnimationFrame(
      syncSnapFeedback,
    );

  const moveRuler =
    new MoveRulerExperienceController({
      container,
    });

  const drawingViewRenderStyles =
    new DrawingViewRenderStyleController({
      drawingWorkspace: core.drawingWorkspace,
      drawingProduction: core.drawingProduction,
      drawingProfessional: core.drawingProfessional,
      sectionDrawing: core.sectionDrawing,
    });

  const drawingModelVisibilityBridge =
    new DrawingModelVisibilityBridgeController({
      designModel: core.designModel,
      designScene: core.designScene,
      drawingWorkspace: core.drawingWorkspace,
    });

  /*
   * Único motor PDF. No se instancia AssemblyPdfController ni ninguno de sus
   * controladores asociados. Secciones y ensambles comparten el mismo store de
   * DrawingProduction, el mismo DrawingWorkspace y el mismo árbol VIEWS.
   */
  const generalPdf =
    new GeneralPdfController({
      container,
      designModel: core.designModel,
      designScene: core.designScene,
      drawingProduction: core.drawingProduction,
      drawingProfessional: core.drawingProfessional,
      drawingWorkspace: core.drawingWorkspace,
      sectionDrawing: core.sectionDrawing,
    });

  const unifiedPdfNavigation =
    new UnifiedPdfNavigationController({
      container,
      drawingWorkspace: core.drawingWorkspace,
      generalPdf,
    });

  generalPdf.setOrderProvider(
    () => unifiedPdfNavigation.getOrderedKeys(),
  );

  const unifiedPdfProjectBridge =
    new UnifiedPdfProjectBridgeController({
      projectPackage: core.projectPackage,
      navigation: unifiedPdfNavigation,
      generalPdf,
    });

  const instanceTree = new InstanceTreeController({
    container,
    canvas,
    designModel: core.designModel,
    designScene: core.designScene,
    designSelection: core.designSelection,
    cadReferenceBlocks,
    cancelActiveCommand: () =>
      core.cancelActiveCadCommand(),
  });

  const assemblyClipboard =
    new AssemblyClipboardController({
      designModel: core.designModel,
      designScene: core.designScene,
      designSelection: core.designSelection,
      instanceTree,
    });

  const linkedAssemblyInstances =
    new LinkedAssemblyInstanceController({
      designModel: core.designModel,
      designScene: core.designScene,
      designSelection: core.designSelection,
      instanceTree,
    });

  const linkedAssemblyInteraction =
    new LinkedAssemblyInteractionController({
      designModel: core.designModel,
      designScene: core.designScene,
      designSelection: core.designSelection,
      instanceTree,
      linkedAssemblies: linkedAssemblyInstances,
    });

  const linkedAssemblyUnlinkHistory =
    new LinkedAssemblyUnlinkHistoryController({
      designModel: core.designModel,
      instanceTree,
      linkedAssemblies: linkedAssemblyInstances,
      cadHistory: core.cadHistory,
    });

  const modelSpaceInstanceTreeBridge =
    new ModelSpaceInstanceTreeBridgeController({
      container,
      designModel: core.designModel,
      lineScene: core.cadLineScene,
      pointScene: core.cadPointScene,
      lineSelection: core.cadLineSelection,
      pointSelection: core.cadPointSelection,
      unifiedPdfNavigation,
      cancelActiveCommand: () =>
        core.cancelActiveCadCommand(),
      deleteCadSelection: () =>
        core.deleteCadSelection(),
    });

  const generalPdfTreeInteraction =
    new GeneralPdfTreeInteractionController(
      container,
    );

  const instanceTreeConsistency =
    new InstanceTreeConsistencyController({
      container,
      sectionDrawing: core.sectionDrawing,
      unifiedPdfNavigation,
      modelSpaceTree: modelSpaceInstanceTreeBridge,
    });

  const sectionInstanceTreeBridge =
    new SectionInstanceTreeBridgeController({
      container,
      sectionDrawing: core.sectionDrawing,
      drawingWorkspace: core.drawingWorkspace,
      drawingProduction: core.drawingProduction,
    });

  const instanceTreeGroupVisibility =
    new InstanceTreeGroupVisibilityController({
      container,
      designModel: core.designModel,
      lineScene: core.cadLineScene,
      pointScene: core.cadPointScene,
      lineSelection: core.cadLineSelection,
      pointSelection: core.cadPointSelection,
      sectionDrawing: core.sectionDrawing,
      sectionTree: sectionInstanceTreeBridge,
    });

  const sectionModelInteraction =
    new SectionModelInteractionController({
      container,
      canvas,
      cameraProvider: () =>
        core.world.camera.three,
      sectionDrawing: core.sectionDrawing,
      drawingProfessional: core.drawingProfessional,
    });

  const sectionAxisDragStability =
    new SectionAxisDragStabilityController({
      canvas,
      cameraProvider: () =>
        core.world.camera.three,
      sectionDrawing: core.sectionDrawing,
    });

  const generalPdfTreeBridge =
    new GeneralPdfTreeBridgeController({
      designModel: core.designModel,
      workPlane: core.cadWorkPlane,
      generalPdf,
    });

  const align = new AlignController({
    container,
    canvas,
    designModel: core.designModel,
    designScene: core.designScene,
    designSelection: core.designSelection,
    cadReferenceBlocks,
    cancelActiveCommand: () =>
      core.cancelActiveCadCommand(),
    clearGeometryQueryCache: () =>
      core.geometryQuery.clearCache(),
    findSnapPoint: (
      clientX,
      clientY,
    ) =>
      core.snapEngine
        .findSnap(clientX, clientY)
        ?.point
        .clone()
      ?? null,
  });

  /*
   * La UI web importa primero la PieceDefinition y luego crea una instancia
   * inicial en 0,0,0. Marcamos únicamente esa siguiente creación para
   * reemplazarla visualmente por el flujo de inserción inteligente sin tocar
   * restauración de proyectos ni PASTE.
   */
  let pendingInitialPlacementDefinitionId:
    string | null = null;

  const baseImportStepPiece =
    core.importStepPiece.bind(core);
  const importStepPiece:
    DrawingPrecisionBimCoreInstance["importStepPiece"] =
    (document, input) => {
      const imported = baseImportStepPiece(document, input);
      pendingInitialPlacementDefinitionId =
        imported.definition.id;
      return imported;
    };

  const baseImportDesignPieceIfc =
    core.importDesignPieceIfc.bind(core);
  const importDesignPieceIfc:
    DrawingPrecisionBimCoreInstance["importDesignPieceIfc"] =
    async (file, input) => {
      const imported =
        await baseImportDesignPieceIfc(file, input);
      pendingInitialPlacementDefinitionId =
        imported.definition.id;
      return imported;
    };

  const baseCreateDesignPieceInstance =
    core.createDesignPieceInstance.bind(core);
  const createDesignPieceInstance:
    DrawingPrecisionBimCoreInstance["createDesignPieceInstance"] =
    (input) => {
      const instance =
        baseCreateDesignPieceInstance(input);

      if (
        pendingInitialPlacementDefinitionId
        === input.definitionId
      ) {
        pendingInitialPlacementDefinitionId = null;
        const placeholderObject =
          core.designScene.getInstanceObject(instance.id);
        if (placeholderObject) {
          placeholderObject.visible = false;
        }

        window.setTimeout(() => {
          void smartPieceInsertion
            .start(input.definitionId)
            .then((placed) => {
              if (placed) {
                core.removeDesignPieceInstance(instance.id);
              }
              else {
                /* Cancelar conserva la instancia inicial en 0,0,0. */
                core.designScene.sync();
              }
              core.geometryQuery.clearCache();
              instanceTree.refresh();
            })
            .catch((error) => {
              console.error(
                "Smart initial piece insertion failed:",
                error,
              );
              core.designScene.sync();
            });
        }, 0);
      }

      return instance;
    };

  const startDesignPiecePlacement = (
    definitionId: string,
  ) => smartPieceInsertion.start(definitionId);

  const cancelDesignPiecePlacement = (): void => {
    smartPieceInsertion.cancel();
    core.cancelDesignPiecePlacement();
  };

  const baseDispose = core.dispose;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    snapFeedbackDisposed = true;
    if (snapFeedbackFrame !== null) {
      window.cancelAnimationFrame(
        snapFeedbackFrame,
      );
      snapFeedbackFrame = null;
    }
    core.designSnap.setEnabled(false);
    unifiedPdfProjectBridge.dispose();
    instanceTreeGroupVisibility.dispose();
    instanceTreeConsistency.dispose();
    generalPdfTreeInteraction.dispose();
    modelSpaceInstanceTreeBridge.dispose();
    linkedAssemblyUnlinkHistory.dispose();
    linkedAssemblyInteraction.dispose();
    linkedAssemblyInstances.dispose();
    assemblyClipboard.dispose();
    unifiedPdfNavigation.dispose();
    generalPdfTreeBridge.dispose();
    sectionAxisDragStability.dispose();
    sectionModelInteraction.dispose();
    sectionInstanceTreeBridge.dispose();
    generalPdf.dispose();
    drawingModelVisibilityBridge.dispose();
    drawingViewRenderStyles.dispose();
    moveRuler.dispose();
    smartPieceInsertion.dispose();
    align.dispose();
    instanceTree.dispose();
    modelRenderMode.dispose();
    pieceAppearance.dispose();
    cadMouseNavigation.dispose();
    buildVersion.dispose();
    baseDispose();
  };

  return {
    ...core,
    importStepPiece,
    importDesignPieceIfc,
    createDesignPieceInstance,
    startDesignPiecePlacement,
    cancelDesignPiecePlacement,
    instanceTree,
    align,
    smartPieceInsertion,
    dispose,
  };
}
