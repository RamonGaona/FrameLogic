import { copyFile, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceDir = resolve(root, "node_modules/dwgdxf/dist/wasm");
const destinationDir = resolve(root, "apps/web/public/assets/wasm");
const assets = ["dwgdxf.js", "dwgdxf_bg.wasm"];

async function main() {
  await mkdir(destinationDir, { recursive: true });
  for (const file of assets) {
    const source = join(sourceDir, file);
    const destination = join(destinationDir, file);
    let size;
    try {
      size = (await stat(source)).size;
    } catch {
      throw new Error(
        `Falta ${source}. Ejecuta npm install; FrameLogic requiere dwgdxf 2.0.1 para abrir DWG.`,
      );
    }
    if (size === 0) throw new Error(`El recurso DWG ${source} está vacío.`);
    await copyFile(source, destination);
    const copied = (await stat(destination)).size;
    if (copied !== size) throw new Error(`Copia incompleta de ${file}: ${copied}/${size} bytes.`);
    console.log(`DWG WASM asset: ${file} (${copied} bytes)`);
  }
}

await main();
