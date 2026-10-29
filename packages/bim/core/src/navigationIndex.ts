import "./drawing/PdfPaperNavigationAutoBootstrap";

import {
  createBimCore as createNavigationBimCore,
} from "./engine/createFrameLogicBimCoreNavigation";

import type {
  PrecisionBimCoreInstance,
} from "./engine/createFrameLogicBimCoreNavigation";

import {
  configureMillimeterRuntime,
  installMillimeterUnitSystem,
} from "./units/MillimeterUnitSystemController";

export * from "./index";

export type {
  PrecisionBimCoreInstance,
} from "./engine/createFrameLogicBimCoreNavigation";

/*
 * Debe instalarse antes de crear DrawingProduction / GeneralPdf para que las
 * escalas de Paper Space nazcan usando la unidad canónica del Model Space.
 */
installMillimeterUnitSystem();

export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core =
    await createNavigationBimCore(
      container,
    );
  const disposeMillimeterRuntime =
    configureMillimeterRuntime(
      core,
      container,
    );
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
      disposeMillimeterRuntime();
      baseDispose();
    };

  Object.defineProperty(
    core,
    "dispose",
    {
      configurable: true,
      enumerable: true,
      writable: true,
      value: dispose,
    },
  );

  return core;
}
