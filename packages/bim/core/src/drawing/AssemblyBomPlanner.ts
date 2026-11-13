/**
 * Bill of material from actual assembly occurrences and engineering metadata.
 * Never infer steel grade, density, mass, or profile designation from meshes.
 */
export interface AssemblyBomOccurrence {
  readonly definitionId: string;
  readonly label: string;
}
export interface AssemblyBomProperty {
  readonly material?: string;
  readonly grade?: string;
  /** Verified per-definition mass in kg, optional. */
  readonly unitMassKg?: number;
}
export interface AssemblyBomRow {
  readonly definitionId: string;
  readonly mark: string;
  readonly label: string;
  readonly quantity: number;
  readonly material?: string;
  readonly grade?: string;
  readonly unitMassKg?: number;
  readonly totalMassKg?: number;
}
export function buildAssemblyBom(
  occurrences: readonly AssemblyBomOccurrence[],
  marks: Readonly<Record<string, string>>,
  properties: Readonly<Record<string, AssemblyBomProperty>> = {},
): AssemblyBomRow[] {
  const groups = new Map<string, { label: string; quantity: number }>();
  for (const item of occurrences) {
    if (!item.definitionId) continue;
    const group = groups.get(item.definitionId);
    if (group) group.quantity++;
    else groups.set(item.definitionId, { label: item.label, quantity: 1 });
  }
  return [...groups].map(([definitionId, group]) => {
    const p = properties[definitionId];
    const unitMassKg = p?.unitMassKg;
    const verifiedMass = typeof unitMassKg === "number"
      && Number.isFinite(unitMassKg) && unitMassKg >= 0 ? unitMassKg : undefined;
    return {
      definitionId,
      mark: marks[definitionId] ?? "—",
      label: group.label,
      quantity: group.quantity,
      ...(p?.material?.trim() ? { material: p.material.trim() } : {}),
      ...(p?.grade?.trim() ? { grade: p.grade.trim() } : {}),
      ...(verifiedMass !== undefined ? {
        unitMassKg: verifiedMass, totalMassKg: verifiedMass * group.quantity,
      } : {}),
    };
  });
}
export function renderAssemblyBomRow(item: AssemblyBomRow, maxLabelLength = 42): string {
  const name = item.label.length <= maxLabelLength
    ? item.label : item.label.slice(0, Math.max(0, maxLabelLength - 1)) + "…";
  const material = [item.material, item.grade].filter(Boolean).join(" ");
  return [item.mark, item.quantity + " ud", name,
    material || "Material sin dato",
    item.totalMassKg === undefined ? "Masa sin dato"
      : item.totalMassKg.toFixed(2) + " kg"].join("  |  ");
}
