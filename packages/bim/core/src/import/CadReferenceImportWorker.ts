import { parseCadDxf } from "./CadDxfGeometryParser";
import type { ParsedCadReference } from "./CadDxfGeometryParser";
import { decideDwgImport } from "./CadDwgRecoveryDecision";

// DWG conversion and recursive INSERT expansion always run off the UI thread.
// The fast WASM reader is the default; acad-ts loads only for recovery/fallback.
type Request = {
  readonly extension: "dwg" | "dxf";
  readonly buffer: ArrayBuffer;
  readonly recoverDwg?: boolean;
};
type Response =
  | { readonly ok: true; readonly parsed: ParsedCadReference }
  | { readonly ok: false; readonly error: string };
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: Response) => void;
  location: Location;
};
const parse = (text: string): ParsedCadReference =>
  parseCadDxf(text, { omitOptionalGeometry: true, recoverDimensionGraphics: true });

worker.onmessage = (event) => {
  void (async () => {
    try {
      const { extension, buffer, recoverDwg } = event.data;
      if (extension === "dxf") {
        const text = new TextDecoder().decode(buffer);
        if (text.startsWith("AutoCAD Binary DXF"))
          throw new Error("El DXF es binario; abre el DWG o exporta DXF ASCII.");
        worker.postMessage({ ok: true, parsed: parse(text) });
        return;
      }
      let principal: ParsedCadReference | null = null;
      let primaryError = "";
      try {
        const module = await import("dwgdxf");
        const wasmBase = new URL("/assets/wasm/", worker.location.origin).href;
        await module.init({ wasmBase });
        const converted = await module.convertDwgToDxf(new Uint8Array(buffer));
        principal = parse(new TextDecoder().decode(converted));
      } catch (error) {
        primaryError = error instanceof Error ? error.message : String(error);
      }
      let alternativo: ParsedCadReference | null = null;
      let alternateError = "";
      // User explicitly opts in to the slower comparison. Automatic fallback
      // also occurs when the fast reader fails or returns no geometry.
      if (recoverDwg || !principal || (!principal.segments.length && !principal.points.length)) {
        try {
          const { convertWithAlternateCadReader } = await import("./CadAlternateDwgReader");
          alternativo = parse(await convertWithAlternateCadReader(buffer));
        } catch (error) {
          alternateError = error instanceof Error ? error.message : String(error);
        }
      }
      if (!principal && !alternativo)
        throw new Error("Lector principal: " + primaryError + "; alternativo: " + alternateError);
      const decision = decideDwgImport(principal, alternativo);
      const diagnostics = recoverDwg || primaryError || alternateError
        ? "\nDiagnóstico DWG: " + decision.explanation
          + (primaryError ? "\nLector principal: " + primaryError : "")
          + (alternateError ? "\nLector alternativo: " + alternateError : "")
        : "";
      worker.postMessage({
        ok: true,
        parsed: { ...decision.parsed, importDiagnostics: diagnostics },
      });
    } catch (error) {
      worker.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
};
