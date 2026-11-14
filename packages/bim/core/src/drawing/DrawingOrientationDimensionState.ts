/**
 * Manual STEP dimensions belong to a projected View, not to the source model.
 * Their A/B endpoints are 2D points: reusing them in a different orientation
 * or after the source geometry changed could silently produce a false value.
 */
import type { EngineeringDimensionInstruction } from "./EngineeringAutoDimensionPlanner";
import { workshopDimensionKey, type WorkshopDimensionOverride } from "./WorkshopDimensionLayout";
import type { AssemblyViewOrientationMode } from "./AssemblyViewOrientationControls";

export type OrientationDimensionOverrides = Partial<
  Record<AssemblyViewOrientationMode, Record<string, WorkshopDimensionOverride>>>;
export type OrientationDimensionSignatures = Partial<Record<AssemblyViewOrientationMode, string>>;

export interface OrientationDimensionState {
  readonly orientationMode?: AssemblyViewOrientationMode;
  readonly dimensionOverrides?: Record<string, WorkshopDimensionOverride>;
  readonly orientationDimensionOverrides?: OrientationDimensionOverrides;
  readonly orientationDimensionSignatures?: OrientationDimensionSignatures;
  readonly geometrySignature?: string;
}

export interface OrientationDimensionTransition {
  readonly active: Record<string, WorkshopDimensionOverride>;
  readonly saved: OrientationDimensionOverrides;
  readonly signatures: OrientationDimensionSignatures;
  readonly warnings: readonly string[];
}

/** Commit the result only when the target geometric projection succeeded. */
export function transitionOrientationDimensions(
  state: OrientationDimensionState,
  targetMode: AssemblyViewOrientationMode,
  nextDimensions: readonly EngineeringDimensionInstruction[],
  sourceSignature: string,
): OrientationDimensionTransition {
  const previousMode = state.orientationMode ?? "CURRENT";
  const saved: OrientationDimensionOverrides = {
    ...state.orientationDimensionOverrides,
    [previousMode]: { ...state.dimensionOverrides },
  };
  const signatures: OrientationDimensionSignatures = {
    ...state.orientationDimensionSignatures,
    [previousMode]: state.geometrySignature ?? sourceSignature,
  };
  const targetEdits = previousMode === targetMode
    ? state.dimensionOverrides ?? {} : saved[targetMode] ?? {};
  const sameModel = signatures[targetMode] === sourceSignature;
  const keys = new Set(nextDimensions.map(workshopDimensionKey));
  const active: Record<string, WorkshopDimensionOverride> = {};
  let staleAnchors = 0;
  let unmatched = 0;
  for (const [key, edit] of Object.entries(targetEdits)) {
    if (!keys.has(key)) {
      unmatched++;
      continue;
    }
    if (!sameModel && (edit.anchorA || edit.anchorB)) {
      // No source topology ID is stored for manually re-snapped 2D endpoints.
      // Preserve line/text offsets but restore physically valid STEP points.
      const { anchorA: _discardA, anchorB: _discardB, ...safe } = edit;
      active[key] = safe;
      staleAnchors++;
    } else {
      active[key] = { ...edit };
    }
  }
  saved[targetMode] = { ...active };
  signatures[targetMode] = sourceSignature;
  const warnings: string[] = [];
  if (staleAnchors) warnings.push(
    String(staleAnchors) + " referencia(s) A/B editada(s) ya no son válidas; "
    + "se restauraron los puntos STEP originales.");
  if (unmatched) warnings.push(
    String(unmatched) + " ajuste(s) de cotas no corresponden a la proyección "
    + "actual y no se han aplicado; no se inventaron medidas.");
  return { active, saved, signatures, warnings };
}
