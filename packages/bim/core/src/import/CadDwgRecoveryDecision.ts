import type { ParsedCadReference, CadDxfPoint3 } from "./CadDxfGeometryParser";

export interface DwgImportDecision {
  readonly parsed: ParsedCadReference;
  readonly source: "principal" | "alternativo";
  readonly explanation: string;
}

/** Ignore optional DIMENSION linework when comparing structural coverage. */
export function cadStructuralSegments(parsed: ParsedCadReference): number {
  return Math.max(0, parsed.segments.length - (parsed.recoveredDimensionSegments ?? 0));
}

function boundsDiagonal(parsed: ParsedCadReference): number {
  const points: CadDxfPoint3[] = [];
  for (const segment of parsed.segments) points.push(segment.start, segment.end);
  for (const point of parsed.points) points.push(point.point);
  if (!points.length) return 0;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity;
  let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); z0 = Math.min(z0, p.z);
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); z1 = Math.max(z1, p.z);
  }
  return Math.hypot(x1 - x0, y1 - y0, z1 - z0);
}

function comparableExtent(a: ParsedCadReference, b: ParsedCadReference): boolean {
  const da = boundsDiagonal(a), db = boundsDiagonal(b);
  if (da === 0 || db === 0) return true;
  return db / da >= 0.5 && db / da <= 2; // reject x1000 scale errors
}

export function decideDwgImport(
  principal: ParsedCadReference | null,
  alternativo: ParsedCadReference | null,
): DwgImportDecision {
  if (!principal && !alternativo) throw new Error("Ningún lector recuperó geometría DWG.");
  if (!principal) return {
    parsed: alternativo!, source: "alternativo",
    explanation: "El lector principal falló; se empleó el lector alternativo.",
  };
  if (!alternativo) return {
    parsed: principal, source: "principal",
    explanation: "Se conservó el resultado del lector principal.",
  };
  const a = cadStructuralSegments(principal);
  const b = cadStructuralSegments(alternativo);
  const labelsA = principal.texts.length, labelsB = alternativo.texts.length;
  const sameScale = comparableExtent(principal, alternativo);
  const sameUnits = principal.insUnits === alternativo.insUnits;
  const noWorseTruncation = !alternativo.truncated || principal.truncated;
  const moreStructure = b > a * 1.10 && labelsB >= labelsA;
  const moreLabels = labelsB > labelsA && b >= a * 0.90;
  const resolvesBlocks = principal.unresolvedBlocks.length > alternativo.unresolvedBlocks.length
    && b >= a && labelsB >= labelsA;
  const choseAlternate = sameScale && sameUnits && noWorseTruncation
    && (moreStructure || moreLabels || resolvesBlocks);
  const selected = choseAlternate ? alternativo : principal;
  const details = "Principal: " + a + " segmentos, " + labelsA
    + " textos; alternativo: " + b + " segmentos, " + labelsB + " textos.";
  const warning = !sameScale || !sameUnits
    ? " Escala o INSUNITS distintos: no se reemplazó automáticamente el dibujo."
    : "";
  return {
    parsed: selected,
    source: choseAlternate ? "alternativo" : "principal",
    explanation: details + " Seleccionado: " + (choseAlternate ? "alternativo." : "principal.") + warning,
  };
}
