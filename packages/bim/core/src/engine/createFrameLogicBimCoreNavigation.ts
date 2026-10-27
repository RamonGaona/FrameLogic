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
  AlignController,
} from "../interaction/AlignController";

export type PrecisionBimCoreInstance =
  DrawingPrecisionBimCoreInstance
  & {
    readonly instanceTree:
      InstanceTreeController;
    readonly align:
      AlignController;
  };

export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core = await createDrawingBimCore(container);
  const cadReferenceBlocks =
    getActiveCadReferenceBlockController();

  if (!cadReferenceBlocks) {
    core.dispose();
    throw new Error(
      "FrameLogic navigation requires the CAD reference block controller.",
    );
  }

  const instanceTree = new InstanceTreeController({
    container,
    designModel: core.designModel,
    designSelection: core.designSelection,
    cadReferenceBlocks,
    cancelActiveCommand: () =>
      core.cancelActiveCadCommand(),
  });

  const align = new AlignController({
    container,
    designModel: core.designModel,
    designScene: core.designScene,
    designSelection: core.designSelection,
    cadReferenceBlocks,
    cancelActiveCommand: () =>
      core.cancelActiveCadCommand(),
    clearGeometryQueryCache: () =>
      core.geometryQuery.clearCache(),
  });

  const baseDispose = core.dispose;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    align.dispose();
    instanceTree.dispose();
    baseDispose();
  };

  return {
    ...core,
    instanceTree,
    align,
    dispose,
  };
}
