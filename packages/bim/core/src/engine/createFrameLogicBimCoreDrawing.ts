import {
  createBimCore as createPrecisionBimCore,
} from "./createFrameLogicBimCorePrecision";

import type {
  PrecisionBimCoreInstance as BasePrecisionBimCoreInstance,
} from "./createFrameLogicBimCorePrecision";

import {
  SectionDrawingController,
} from "../drawing/SectionDrawingController";


export type PrecisionBimCoreInstance =
  BasePrecisionBimCoreInstance
  & {
    /**
     * Herramienta de planos de sección por recuadro + profundidad.
     */
    readonly sectionDrawing:
      SectionDrawingController;
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
      sectionDrawing.dispose();
      baseDispose();
    };

  return {
    ...core,
    sectionDrawing,
    dispose,
  };
}
