import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

const packageJson = JSON.parse(
  readFileSync(
    new URL('../../package.json', import.meta.url),
    'utf-8',
  ),
) as { version?: string }

const appVersion =
  packageJson.version
  ?? '0.0.0'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // acad-ts resolves DWG/DXF classes using constructor.name at runtime.
  // Production minification must preserve class names in BOTH the web bundle
  // and the separate CAD import Web Worker. Otherwise recovery crashes with
  // "na is not a DXF subclass" even though dev/tests pass.
  // Cota established the same fix in its v2.10.4 release (Apache-2.0).
  // https://github.com/mxchristian17/cota/blob/main/services/web/vite.config.ts
  build: { rolldownOptions: { output: { keepNames: true } } },
  worker: { rolldownOptions: { output: { keepNames: true } } },

  define: {
    __FRAMELOGIC_VERSION__: JSON.stringify(appVersion),
  },

  /*
   * opencascade.js/dist/index.js importa opencascade.full.wasm sin ?url.
   * Vite 8 intenta interpretarlo como módulo WebAssembly ESM y falla al
   * resolver los imports internos minificados del binario (por ejemplo "a").
   *
   * El alias conserva los tipos del paquete durante typecheck, pero en runtime
   * usa una entrada local que carga opencascade.full.wasm explícitamente como
   * URL estática para Emscripten.
   */
  resolve: {
    alias: [
      {
        find: /^opencascade\.js$/,
        replacement: fileURLToPath(
          new URL(
            './src/features/bim/step/OpenCascadeViteRuntime.js',
            import.meta.url,
          ),
        ),
      },
    ],
  },
})