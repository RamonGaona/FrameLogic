import { parseCadDxf } from "./CadDxfGeometryParser";
import type { ParsedCadReference } from "./CadDxfGeometryParser";

// All DWG conversion and recursive INSERT expansion happens in a Web Worker.
// Main-thread DOM events, camera navigation and the browser's "responsive"
// watchdog must not be blocked while decoding a complex drawing.
type Request = { readonly extension: "dwg" | "dxf"; readonly buffer: ArrayBuffer };
type Response =
  | { readonly ok: true; readonly parsed: ParsedCadReference }
  | { readonly ok: false; readonly error: string };

const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: Response) => void;
  location: Location;
};

worker.onmessage = (event) => {
  void (async () => {
    try {
      const { extension, buffer } = event.data;
      let text: string;
      if (extension === "dwg") {
        const module = await import("dwgdxf");
        // The runtime publishes its WASM glue and binary in this public path.
        const wasmBase = new URL("/assets/wasm/", worker.location.origin).href;
        await module.init({ wasmBase });
        const converted = await module.convertDwgToDxf(new Uint8Array(buffer));
        text = new TextDecoder().decode(converted);
      }
      else text = new TextDecoder().decode(buffer);
      if (text.startsWith("AutoCAD Binary DXF")) {
        throw new Error("El DXF es binario; abre el DWG o exporta DXF ASCII.");
      }
      // Prioritize construction geometry for large DWG imports. TEXT/MTEXT/
      // ATTRIB remain independent of the segment budget.
      const parsed = parseCadDxf(text, { omitOptionalGeometry: true, recoverDimensionGraphics: true });
      worker.postMessage({ ok: true, parsed });
    }
    catch (error) {
      worker.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
};
