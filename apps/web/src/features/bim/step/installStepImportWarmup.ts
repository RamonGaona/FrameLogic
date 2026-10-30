import {
  warmupStepGeometryKernels,
} from "./OcctStepGeometryAdapter";


const IMPORT_PIECE_BUTTON_SELECTOR =
  'button[title^="Importa una pieza externa STEP/STP"]';


/**
 * Mantiene el arranque CAD ligero. Los kernels STEP/WASM solo empiezan a
 * inicializarse cuando el usuario expresa intención de importar una pieza.
 *
 * El listener corre en captura, antes del handler React que abre el selector
 * de archivos, de modo que la inicialización puede avanzar mientras el usuario
 * elige el STEP sin retrasar la apertura del file picker.
 */
export function installStepImportWarmup():
  () => void {
  let warmupStarted =
    false;

  const startWarmup =
    (): void => {
      if (warmupStarted) {
        return;
      }

      warmupStarted =
        true;

      void warmupStepGeometryKernels()
        .catch(
          (
            error: unknown,
          ) => {
            warmupStarted =
              false;

            console.warn(
              "FrameLogic STEP kernel warmup failed:",
              error,
            );
          },
        );
    };

  const handleClick =
    (
      event: MouseEvent,
    ): void => {
      const target =
        event.target;

      if (
        !(target instanceof Element)
      ) {
        return;
      }

      if (
        target.closest(
          IMPORT_PIECE_BUTTON_SELECTOR,
        )
      ) {
        startWarmup();
      }
    };

  document.addEventListener(
    "click",
    handleClick,
    true,
  );

  return () => {
    document.removeEventListener(
      "click",
      handleClick,
      true,
    );
  };
}
