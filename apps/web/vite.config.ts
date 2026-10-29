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