import {
  createBimCore as createPrecisionBimCore,
} from "./createFrameLogicBimCorePrecision";

import type {
  PrecisionBimCoreInstance as BasePrecisionBimCoreInstance,
} from "./createFrameLogicBimCorePrecision";

import {
  SectionDrawingController,
} from "../drawing/SectionDrawingController";

import {
  DrawingWorkspaceController,
} from "../drawing/DrawingWorkspaceController";

import {
  DrawingExperienceController,
} from "../drawing/DrawingExperienceController";

import {
  DrawingProductionController,
} from "../drawing/DrawingProductionController";

import type {
  FrameLogicDocumentationSnapshot,
} from "../drawing/DrawingProductionController";

import {
  DrawingProfessionalController,
} from "../drawing/DrawingProfessionalController";

import type {
  DrawingProfessionalSnapshot,
} from "../drawing/DrawingProfessionalModel";

import {
  DrawingFinishingController,
} from "../drawing/DrawingFinishingController";

import {
  DrawingCenterMarkController,
} from "../drawing/DrawingCenterMarkController";

import {
  DrawingUsabilityController,
} from "../drawing/DrawingUsabilityController";

import {
  CadReferenceImportController,
} from "../import/CadReferenceImportController";

import {
  CadReferenceLayerPanelController,
} from "../import/CadReferenceLayerPanelController";

import {
  CadReferenceTransformController,
} from "../import/CadReferenceTransformController";

import {
  ModelSpaceZoomExtentsController,
} from "../interaction/ModelSpaceZoomExtentsController";

import {
  OpenCascadeBrepAdvancedProvider,
} from "../precision/OpenCascadeBrepAdvancedProvider";

import {
  AssemblyConstraintSolver,
} from "../assemblies/AssemblyConstraintSolver";

import {
  FrameLogicProjectPackageController,
} from "../project/FrameLogicProjectPackageController";

import type {
  FrameLogicProjectPackage,
} from "../project/FrameLogicProjectPackageController";

import {
  ProjectAutosaveController,
} from "../project/ProjectAutosaveController";


export type PrecisionBimCoreInstance =
  BasePrecisionBimCoreInstance
  & {
    readonly sectionDrawing:
      SectionDrawingController;

    readonly drawingWorkspace:
      DrawingWorkspaceController;

    readonly drawingProduction:
      DrawingProductionController;

    readonly drawingProfessional:
      DrawingProfessionalController;

    readonly drawingFinishing:
      DrawingFinishingController;

    readonly assemblyConstraintSolver:
      AssemblyConstraintSolver;

    readonly projectPackage:
      FrameLogicProjectPackageController;

    readonly createDocumentationSnapshot: () =>
      FrameLogicDocumentationSnapshot;

    readonly restoreDocumentationSnapshot: (
      snapshot: FrameLogicDocumentationSnapshot,
    ) => void;

    readonly createProfessionalDrawingSnapshot: () =>
      DrawingProfessionalSnapshot;

    readonly restoreProfessionalDrawingSnapshot: (
      snapshot: DrawingProfessionalSnapshot,
    ) => void;

    readonly refreshExactDrawing: (
      sectionId?: string,
    ) => Promise<void>;

    readonly createProjectPackage: (
      name?: string,
    ) => FrameLogicProjectPackage;

    readonly restoreProjectPackage: (
      project: FrameLogicProjectPackage,
    ) => Promise<void>;
  };


export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core =
    await createPrecisionBimCore(
      container,
    );
  const renderer =
    core.world.renderer;

  if (!renderer) {
    core.dispose();
    throw new Error(
      "FrameLogic section drawing requires an initialized renderer.",
    );
  }

  const advancedBrepProvider =
    new OpenCascadeBrepAdvancedProvider(
      core.designModel,
      core.designScene,
    );
  const removeAdvancedBrepProvider =
    core.geometryQuery.addProvider(
      advancedBrepProvider,
    );

  const assemblyConstraintSolver =
    new AssemblyConstraintSolver(
      core.engineeringModel,
    );

  const sectionDrawing =
    new SectionDrawingController({
      container,
      canvas:
        renderer.three.domElement,
      scene:
        core.world.scene.three,
      cameraProvider: () =>
        core.world.camera.three,
      workPlane:
        core.cadWorkPlane,
      designScene:
        core.designScene,
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
      beforeStart: () => {
        core.cancelActiveCadCommand();
      },
    });

  const drawingWorkspace =
    new DrawingWorkspaceController({
      container,
      designScene:
        core.designScene,
      sectionDrawing,
    });

  const sectionPanel =
    container.querySelector(
      '[data-framelogic-section-panel="true"]',
    );
  const openDrawingButton =
    Array.from(
      sectionPanel
        ?.querySelectorAll(
          "button",
        )
      ?? [],
    ).find(
      (
        button,
      ) =>
        button.textContent
        === "PDF",
    )
      ?? null;

  if (openDrawingButton) {
    openDrawingButton.textContent =
      "Abrir plano";
  }

  const handleOpenDrawing =
    (
      event: Event,
    ): void => {
      if (
        !openDrawingButton
        || event.currentTarget
        !== openDrawingButton
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      drawingWorkspace
        .openActiveSection();
    };

  openDrawingButton?.addEventListener(
    "click",
    handleOpenDrawing,
    true,
  );

  const drawingProduction =
    new DrawingProductionController({
      container,
      designModel:
        core.designModel,
      designScene:
        core.designScene,
      sectionDrawing,
      drawingWorkspace,
    });

  const drawingExperience =
    new DrawingExperienceController({
      container,
      sectionDrawing,
      drawingWorkspace,
    });

  const drawingProfessional =
    new DrawingProfessionalController({
      container,
      designModel:
        core.designModel,
      designScene:
        core.designScene,
      engineeringModel:
        core.engineeringModel,
      sectionDrawing,
      drawingWorkspace,
      drawingProduction,
    });

  const drawingFinishing =
    new DrawingFinishingController({
      container,
      designModel:
        core.designModel,
      engineeringModel:
        core.engineeringModel,
      sectionDrawing,
      drawingWorkspace,
      drawingProduction,
      drawingProfessional,
    });

  const drawingCenterMarks =
    new DrawingCenterMarkController(
      core.designModel,
      core.designScene,
      drawingWorkspace,
    );

  const drawingUsability =
    new DrawingUsabilityController({
      container,
      sectionDrawing,
      drawingWorkspace,
      drawingProduction,
      drawingProfessional,
      drawingFinishing,
    });

  const cadReferenceLayers =
    new CadReferenceLayerPanelController({
      container,
      designModel:
        core.designModel,
      cadLineScene:
        core.cadLineScene,
      cadPointScene:
        core.cadPointScene,
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
    });

  const cadReferenceTransform =
    new CadReferenceTransformController({
      container,
      domElement:
        renderer.three.domElement,
      scene:
        core.world.scene.three,
      cameraProvider: () =>
        core.world.camera.three,
      designModel:
        core.designModel,
      cadLineScene:
        core.cadLineScene,
      cadPointScene:
        core.cadPointScene,
      setCameraEnabled: (
        enabled,
      ) => {
        core.world.camera.controls.enabled =
          enabled;
      },
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
      clearOtherSelections: () => {
        core.cancelActiveCadCommand();
        core.designSelection.clearSelection();
        core.cadLineSelection.clearSelection();
        core.cadPointSelection.clearSelection();
      },
    });

  const zoomExtents =
    new ModelSpaceZoomExtentsController({
      container,
      scene:
        core.world.scene.three,
      cameraProvider: () =>
        core.world.camera.three,
      controls:
        core.world.camera.controls,
      designScene:
        core.designScene,
      cadLineScene:
        core.cadLineScene,
      cadPointScene:
        core.cadPointScene,
      getLoadedModels: () =>
        core.getLoadedModels(),
      getSelectedObjects: () =>
        core.designSelection
          .getSelectedIds()
          .map((id) =>
            core.designScene
              .getInstanceObject(id),
          )
          .filter(
            (object): object is NonNullable<typeof object> =>
              object !== null
              && object !== undefined,
          ),
      getSelectedCadReferenceBounds: () =>
        cadReferenceTransform
          .getSelectedBounds(),
    });

  const baseLoadIfcFile =
    core.loadIfcFile.bind(
      core,
    );

  const projectPackage =
    new FrameLogicProjectPackageController({
      container,
      designModel:
        core.designModel,
      designScene:
        core.designScene,
      cadPointScene:
        core.cadPointScene,
      cadLineScene:
        core.cadLineScene,
      piecePackage:
        core.pieceFrameLogicPackage,
      createEngineeringSnapshot: () =>
        core.createEngineeringSnapshot(),
      restoreEngineeringSnapshot: (
        snapshot,
      ) =>
        core.restoreEngineeringSnapshot(
          snapshot,
        ),
      createDocumentationSnapshot: () =>
        drawingProduction
          .createDocumentationSnapshot(),
      restoreDocumentationSnapshot: (
        snapshot,
      ) =>
        drawingProduction
          .restoreDocumentationSnapshot(
            snapshot,
          ),
      createProfessionalSnapshot: () =>
        drawingProfessional
          .createProfessionalSnapshot(),
      restoreProfessionalSnapshot: (
        snapshot,
      ) =>
        drawingProfessional
          .restoreProfessionalSnapshot(
            snapshot,
          ),
      importStepPiece: (
        document,
        input,
      ) =>
        core.importStepPiece(
          document,
          input,
        ),
      importIfcPiece: (
        file,
        input,
      ) =>
        core.importDesignPieceIfc(
          file,
          input,
        ),
      createPieceInstance: (
        input,
      ) =>
        core.createDesignPieceInstance({
          id:
            input.id,
          definitionId:
            input.definitionId,
          layerId:
            input.layerId,
          transform:
            input.transform,
          tags:
            input.tags
              ? [...input.tags]
              : [],
        }),
      loadReferenceIfc:
        baseLoadIfcFile,
      setReferenceVisible: (
        id,
        visible,
      ) =>
        core.setModelVisible(
          id,
          visible,
        ),
      setReferenceLayer: (
        id,
        layerId,
      ) =>
        core.setReferenceModelLayer(
          id,
          layerId,
        ),
      clearReferenceModels: () =>
        core.clearModels(),
      cancelActiveCadCommand: () =>
        core.cancelActiveCadCommand(),
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
      onProjectRestored: async () => {
        cadReferenceLayers
          .ensureImportedLayersLocked();
        cadReferenceTransform.refresh();
        await drawingProfessional
          .refreshExactDrawing();
        drawingFinishing
          .markCurrentDrawingUpdated();
        await core.setStandardView(
          "ISO",
        );
        await zoomExtents
          .zoomExtents();
      },
    });

  const cadReferenceImport =
    new CadReferenceImportController({
      container,
      designModel:
        core.designModel,
      cadLineScene:
        core.cadLineScene,
      cadPointScene:
        core.cadPointScene,
      clearGeometryQueryCache: () =>
        core.geometryQuery.clearCache(),
      onImported: async () => {
        core.cancelActiveCadCommand();
        cadReferenceLayers
          .ensureImportedLayersLocked();
        cadReferenceTransform.refresh();
        await core.setStandardView(
          "TOP",
        );
        await zoomExtents
          .zoomExtents();
      },
    });

  const autosave =
    new ProjectAutosaveController({
      container,
      createProjectPackage: (
        name,
      ) =>
        projectPackage
          .createProjectPackage(
            name,
          ),
      restoreProjectPackage: (
        project,
      ) =>
        projectPackage
          .restoreProjectPackage(
            project,
          ),
    });

  const loadIfcFile =
    async (
      file: File,
    ) => {
      const model =
        await baseLoadIfcFile(
          file,
        );
      await projectPackage
        .registerReferenceIfc(
          file,
          model,
        );
      return model;
    };

  const baseDispose =
    core.dispose;
  let disposed =
    false;

  const dispose =
    (): void => {
      if (disposed) {
        return;
      }

      disposed =
        true;
      openDrawingButton?.removeEventListener(
        "click",
        handleOpenDrawing,
        true,
      );
      autosave.dispose();
      cadReferenceImport.dispose();
      zoomExtents.dispose();
      cadReferenceTransform.dispose();
      cadReferenceLayers.dispose();
      projectPackage.dispose();
      drawingUsability.dispose();
      drawingCenterMarks.dispose();
      drawingFinishing.dispose();
      drawingProfessional.dispose();
      drawingExperience.dispose();
      drawingProduction.dispose();
      drawingWorkspace.dispose();
      sectionDrawing.dispose();
      removeAdvancedBrepProvider();
      baseDispose();
    };

  return {
    ...core,
    loadIfcFile,
    sectionDrawing,
    drawingWorkspace,
    drawingProduction,
    drawingProfessional,
    drawingFinishing,
    assemblyConstraintSolver,
    projectPackage,
    createDocumentationSnapshot: () =>
      drawingProduction
        .createDocumentationSnapshot(),
    restoreDocumentationSnapshot: (
      snapshot,
    ) => {
      drawingProduction
        .restoreDocumentationSnapshot(
          snapshot,
        );
    },
    createProfessionalDrawingSnapshot: () =>
      drawingProfessional
        .createProfessionalSnapshot(),
    restoreProfessionalDrawingSnapshot: (
      snapshot,
    ) => {
      drawingProfessional
        .restoreProfessionalSnapshot(
          snapshot,
        );
    },
    refreshExactDrawing: (
      sectionId,
    ) =>
      drawingProfessional
        .refreshExactDrawing(
          sectionId,
        ),
    createProjectPackage: (
      name,
    ) =>
      projectPackage
        .createProjectPackage(
          name,
        ),
    restoreProjectPackage: (
      project,
    ) =>
      projectPackage
        .restoreProjectPackage(
          project,
        ),
    dispose,
  };
}
