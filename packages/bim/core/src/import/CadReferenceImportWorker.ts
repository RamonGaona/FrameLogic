import { parseCadDxf } from "./CadDxfGeometryParser";
import type { ImportedCadSegment, ParsedCadReference } from "./CadDxfGeometryParser";
import { CadDwgSegmentChunks } from "./CadDwgSegmentChunks";
import { decideDwgImport } from "./CadDwgRecoveryDecision";

// DWG conversion and recursive INSERT expansion always run off the UI thread.
// The fast WASM reader is the default; acad-ts loads only for recovery/fallback.
type Request =
  | { readonly type: "parse"; readonly extension: "dwg" | "dxf";
      readonly buffer: ArrayBuffer; readonly recoverDwg?: boolean }
  | { readonly type: "next" };
type Response =
  | { readonly ok: true; readonly parsed: ParsedCadReference }
  | { readonly ok: true; readonly phase: "begin"; readonly parsed: ParsedCadReference;
      readonly totalSegments: number }
  | { readonly ok: true; readonly phase: "segments"; readonly segments: readonly ImportedCadSegment[] }
  | { readonly ok: true; readonly phase: "done" }
  | { readonly ok: false; readonly error: string };
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null;
  postMessage: (message: Response) => void;
  location: Location;
};
const parse = (text: string, dwg: boolean): ParsedCadReference =>
  parseCadDxf(text, {
    omitOptionalGeometry: true, recoverDimensionGraphics: true,
    unlimitedSegments: dwg,
  });

let activeStream: CadDwgSegmentChunks<ImportedCadSegment> | null = null;
/**
 * The UI explicitly acknowledges each received chunk; there is never a
 * queue of hundreds of large structured-clone messages. DXF keeps its
 * original single-reply bounded protocol for backwards compatibility.
 */
const sendNext = (): void => {
  if (!activeStream) return;
  const chunk = activeStream.next();
  if (!chunk) {
    worker.postMessage({ ok: true, phase: "done" });
    activeStream = null;
    return;
  }
  worker.postMessage({ ok: true, phase: "segments", segments: chunk });
};

worker.onmessage = (event) => {
  if (event.data.type === "next") {
    sendNext();
    return;
  }
  void (async () => {
    try {
      const { extension, buffer, recoverDwg } = event.data;
      if (extension === "dxf") {
        const text = new TextDecoder().decode(buffer);
        if (text.startsWith("AutoCAD Binary DXF"))
          throw new Error("El DXF es binario; abre el DWG o exporta DXF ASCII.");
        worker.postMessage({ ok: true, parsed: parse(text, false) });
        return;
      }
      let principal: ParsedCadReference | null = null;
      let primaryError = "";
      try {
        const module = await import("dwgdxf");
        const wasmBase = new URL("/assets/wasm/", worker.location.origin).href;
        await module.init({ wasmBase });
        const converted = await module.convertDwgToDxf(new Uint8Array(buffer));
        principal = parse(new TextDecoder().decode(converted), true);
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
          alternativo = parse(await convertWithAlternateCadReader(buffer), true);
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
      const parsed = { ...decision.parsed, importDiagnostics: diagnostics };
      // The binary DWG may contain millions of segments. Do not clone the
      // entire array in one postMessage: announce metadata first, then send
      // acknowledged batches so the receiving main thread remains responsive.
      activeStream = new CadDwgSegmentChunks(parsed.segments);
      worker.postMessage({
        ok: true, phase: "begin", totalSegments: activeStream.total,
        parsed: { ...parsed, segments: [] },
      });
    } catch (error) {
      worker.postMessage({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
};
