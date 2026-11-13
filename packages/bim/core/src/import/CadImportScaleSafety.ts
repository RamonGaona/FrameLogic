import type { ParsedCadReference } from "./CadDxfGeometryParser";
import { rawCadExtent } from "./CadImportUnitDialog";

/**
 * A DWG converted with a wrong $INSUNITS can accidentally become 1,000 times
 * larger. Never silently override the user's chosen unit: instead request a
 * second confirmation when raw geometry already spans kilometre-sized units.
 */
export function suspiciousDwgMeterScale(
  parsed: Pick<ParsedCadReference, "segments" | "points">,
  factor: number,
): { rawSpan: number; resultingSpanMm: number } | null {
  if (!Number.isFinite(factor) || factor < 1000) return null;
  const span = rawCadExtent(parsed);
  if (!Number.isFinite(span) || span < 5_000) return null;
  return { rawSpan: span, resultingSpanMm: span * factor };
}
