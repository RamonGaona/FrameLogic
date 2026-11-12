import type { ParsedCadReference } from "./CadDxfGeometryParser";

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
  let lowX = Infinity, lowY = Infinity, lowZ = Infinity;
  let highX = -Infinity, highY = -Infinity, highZ = -Infinity;
  const include = (p: { x: number; y: number; z: number }): void => {
    if (![p.x, p.y, p.z].every(Number.isFinite)) return;
    lowX = Math.min(lowX, p.x); lowY = Math.min(lowY, p.y); lowZ = Math.min(lowZ, p.z);
    highX = Math.max(highX, p.x); highY = Math.max(highY, p.y); highZ = Math.max(highZ, p.z);
  };
  for (const segment of parsed.segments) { include(segment.start); include(segment.end); }
  for (const point of parsed.points) include(point.point);
  const span = Math.max(highX - lowX, highY - lowY, highZ - lowZ);
  if (!Number.isFinite(span) || span < 5_000) return null;
  return { rawSpan: span, resultingSpanMm: span * factor };
}
