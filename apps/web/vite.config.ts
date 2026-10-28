import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

const buildSha =
  process.env.CF_PAGES_COMMIT_SHA
  ?? process.env.GITHUB_SHA
  ?? 'local'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  define: {
    __FRAMELOGIC_BUILD_SHA__: JSON.stringify(buildSha),
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