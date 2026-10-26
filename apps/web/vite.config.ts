import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

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
