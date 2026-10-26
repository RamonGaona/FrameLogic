import openCascadeFull from "opencascade.js/dist/opencascade.full.js";
import openCascadeWasmUrl from "opencascade.js/dist/opencascade.full.wasm?url";


/**
 * Entrada de OpenCascade.js específica para Vite.
 *
 * El index.js oficial de opencascade.js importa el .wasm sin ?url. Vite 8
 * intenta entonces tratar ese WASM como un módulo ESM y resolver sus imports
 * internos minificados (por ejemplo "a"), lo que produce el error
 * "Failed to resolve import 'a'".
 *
 * Aquí entregamos explícitamente a Emscripten la URL estática del WASM. El
 * kernel sigue siendo exactamente opencascade.full; solo cambia cómo Vite
 * localiza el binario.
 */
export default function initOpenCascadeForVite({
  mainJS = openCascadeFull,
  mainWasm = openCascadeWasmUrl,
  worker = undefined,
  libs = [],
  module = {},
} = {}) {
  return mainJS({
    locateFile(path) {
      if (
        path.endsWith(".wasm")
      ) {
        return mainWasm;
      }

      if (
        path.endsWith(".worker.js")
        && worker
      ) {
        return worker;
      }

      return path;
    },
    ...module,
  }).then(
    async (oc) => {
      for (
        const lib
        of libs
      ) {
        await oc.loadDynamicLibrary(
          lib,
          {
            loadAsync: true,
            global: true,
            nodelete: true,
            allowUndefined: false,
          },
        );
      }

      return oc;
    },
  );
}
