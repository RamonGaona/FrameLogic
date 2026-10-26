import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  /*
   * OpenCascade.js importa opencascade.full.wasm como un asset URL.
   * Vite debe tratar .wasm como archivo estático para conservar el URL
   * que Emscripten recibe mediante locateFile().
   */
  assetsInclude: ['**/*.wasm'],
})
