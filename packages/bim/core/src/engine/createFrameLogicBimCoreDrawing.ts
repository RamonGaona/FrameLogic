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
  OpenCascadeBrepAdvancedProvider,
} from "../precision/OpenCascadeBrepAdvancedProvider";

import {
  AssemblyConstraintSolver,
} from "../assemblies/AssemblyConstraintSolver";


export type PrecisionBimCoreInstance =
  BasePrecisionBimCoreInstance
  & {
    /**
     * Herramienta de planos de sección por recuadro + profundidad.
     */
    readonly sectionDrawing:
      SectionDrawingController;

    /**
     * Editor vectorial de planos: cotas, labels, textos y exportación PDF.
     */
    readonly drawingWorkspace:
      DrawingWorkspaceController;

    /**
     * Documentación de producción: hojas, escalas, referencias B-Rep,
     * cajetines, revisiones, vistas múltiples y persistencia.
     */
    readonly drawingProduction:
      DrawingProductionController;

    /**
     * Capa CAD profesional: Section/HLR OCCT, viewports, detalles,
     * DIMSTYLE/unidades, snaps avanzados, undo/redo y SVG/DXF.
     */
    readonly drawingProfessional:
      DrawingProfessionalController;

    /**
     * Solver incremental para constraints persistentes de ensamblaje.
     */
    readonly assemblyConstraintSolver:
      AssemblyConstraintSolver;

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
    sectionDrawing,
    drawingWorkspace,
    drawingProduction,
    drawingProfessional,
    assemblyConstraintSolver,
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
    dispose,
  };
}
