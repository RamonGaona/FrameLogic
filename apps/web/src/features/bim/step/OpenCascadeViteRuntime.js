import openCascadeFull from "opencascade.js/dist/opencascade.full.js";


const OPENCASCADE_PACKAGE_VERSION =
  "2.0.0-beta.b5ff984";

const DEFAULT_OPENCASCADE_WASM_URL =
  `https://cdn.jsdelivr.net/npm/opencascade.js@${OPENCASCADE_PACKAGE_VERSION}/dist/opencascade.full.wasm`;

const configuredOpenCascadeWasmUrl =
  import.meta.env.VITE_OPENCASCADE_WASM_URL?.trim();


/**
 * Entrada de OpenCascade.js específica para Vite.
 *
 * El index.js oficial de opencascade.js importa el .wasm sin ?url. Vite 8
 * intenta entonces tratar ese WASM como un módulo ESM y resolver sus imports
 * internos minificados (por ejemplo "a"), lo que produce el error
 * "Failed to resolve import 'a'".
 *
 * Cloudflare Pages tampoco permite publicar archivos individuales mayores de
 * 25 MiB. opencascade.full.wasm ronda los 48 MiB, por lo que no debe formar
 * parte de apps/web/dist. El runtime carga ese binario bajo demanda desde una
 * URL externa. Por defecto usa jsDelivr fijado a la misma versión del paquete
 * que FrameLogic instala; puede sustituirse con VITE_OPENCASCADE_WASM_URL
 * (por ejemplo, una URL de Cloudflare R2) sin cambiar el código.
 */
export default function initOpenCascadeForVite({
  mainJS = openCascadeFull,
  mainWasm = configuredOpenCascadeWasmUrl
    || DEFAULT_OPENCASCADE_WASM_URL,
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
