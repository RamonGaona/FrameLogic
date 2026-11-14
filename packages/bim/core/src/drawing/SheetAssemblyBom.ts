/**
 * Sheet-scoped engineering BOM. Assembly hierarchy is traversed only within
 * the specified root, not across the entire FrameLogic project.
 *
 * Assembly rows are logical occurrences (qty=1). Piece rows count distinct
 * placed instance IDs, grouped by definition within their direct owner.
 * No inferred material, profile, density or weight is introduced.
 */
export type SheetBomMode = "HIERARCHY" | "FLAT";
export interface SheetBomPlacement {
  rootAssemblyId: string;
  sourceViewId: string;
  mode: SheetBomMode;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Optional slice for a full multi-page BOM; regular inserts show from row 0. */
  pageStart?: number;
  pageIndex?: number;
  pageCount?: number;
  generatedFromSheetId?: string;
}
export interface SheetBomAssembly {
  readonly id: string;
  readonly name: string;
  readonly parentAssemblyId?: string;
  readonly pieceInstanceIds: readonly string[];
}
export interface SheetBomPiece {
  readonly id: string;
  readonly definitionId: string;
  readonly label: string;
  readonly material?: string;
  readonly grade?: string;
  readonly unitMassKg?: number;
}
export interface SheetBomRow {
  readonly kind: "ASSEMBLY" | "PIECE";
  readonly key: string;
  readonly mark: string;
  readonly label: string;
  readonly depth: number;
  readonly quantity: number;
  readonly material?: string;
  readonly grade?: string;
  readonly unitMassKg?: number;
  readonly totalMassKg?: number;
}
export interface SheetBomResult {
  readonly rows: readonly SheetBomRow[];
  readonly totalPieces: number;
  readonly missingPieces: readonly string[];
  readonly rootFound: boolean;
}

export function buildSheetAssemblyBom(
  rootAssemblyId: string,
  assemblies: readonly SheetBomAssembly[],
  pieces: Readonly<Record<string, SheetBomPiece>>,
  marks: Readonly<Record<string, string>> = {},
  mode: SheetBomMode = "HIERARCHY",
): SheetBomResult {
  const byId = new Map(assemblies.map((assembly) => [assembly.id, assembly]));
  const root = byId.get(rootAssemblyId);
  if (!root) {
    return { rows: [], totalPieces: 0, missingPieces: [], rootFound: false };
  }
  const children = new Map<string, SheetBomAssembly[]>();
  for (const a of assemblies) {
    if (!a.parentAssemblyId) continue;
    const list = children.get(a.parentAssemblyId) ?? [];
    list.push(a);
    children.set(a.parentAssemblyId, list);
  }
  const visitedAssemblies = new Set<string>();
  const visiting = new Set<string>();
  const seenPieces = new Set<string>();
  const missingPieces = new Set<string>();
  const output: SheetBomRow[] = [];
  const occurrences: SheetBomPiece[] = [];
  let assemblySequence = 0;
  let fallbackMarkSequence = 0;
  const generatedMarks = new Map<string, string>();
  const usableMark = (part: SheetBomPiece): string => {
    const explicit = marks[part.definitionId]?.trim();
    if (explicit) return explicit;
    // A definition's own piece code/label should be preferred by the caller.
    let temporary = generatedMarks.get(part.definitionId);
    if (!temporary) {
      temporary = "P" + ++fallbackMarkSequence;
      generatedMarks.set(part.definitionId, temporary);
    }
    return temporary;
  };
  const property = (value?: string): string | undefined => value?.trim() || undefined;
  const validMass = (value: number | undefined): number | undefined =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
  const addParts = (ids: readonly string[], depth: number, target: SheetBomRow[]): void => {
    const groups = new Map<string, { part: SheetBomPiece; quantity: number }>();
    for (const id of ids) {
      const part = pieces[id];
      if (!part) {
        missingPieces.add(id);
        continue;
      }
      if (!part.definitionId || seenPieces.has(id)) continue;
      seenPieces.add(id);
      occurrences.push(part);
      const group = groups.get(part.definitionId);
      if (group) group.quantity++;
      else groups.set(part.definitionId, { part, quantity: 1 });
    }
    for (const [definitionId, { part, quantity }] of groups) {
      const mass = validMass(part.unitMassKg);
      target.push({
        kind: "PIECE", key: "piece:" + definitionId + ":" + depth + ":" + target.length,
        mark: usableMark(part), label: part.label, depth, quantity,
        ...(property(part.material) ? { material: property(part.material) } : {}),
        ...(property(part.grade) ? { grade: property(part.grade) } : {}),
        ...(mass !== undefined ? { unitMassKg: mass, totalMassKg: mass * quantity } : {}),
      });
    }
  };
  const walk = (id: string, depth: number): void => {
    if (visiting.has(id)) throw new Error("BOM: circular assembly hierarchy.");
    if (visitedAssemblies.has(id)) throw new Error("BOM: duplicated assembly relationship.");
    const assembly = byId.get(id);
    if (!assembly) return;
    visitedAssemblies.add(id);
    visiting.add(id);
    if (mode === "HIERARCHY") {
      const mark = "E" + ++assemblySequence;
      output.push({
        kind: "ASSEMBLY", key: "assembly:" + id, mark,
        label: assembly.name || "Ensamble sin nombre", depth, quantity: 1,
      });
      addParts(assembly.pieceInstanceIds, depth + 1, output);
    } else {
      addParts(assembly.pieceInstanceIds, depth, []);
    }
    for (const child of children.get(id) ?? []) walk(child.id, depth + 1);
    visiting.delete(id);
  };
  if (mode === "FLAT") {
    // Deduplicate globally and group by definition, not by subassembly.
    const collect = (id: string): void => {
      if (visiting.has(id)) throw new Error("BOM: circular assembly hierarchy.");
      if (visitedAssemblies.has(id)) throw new Error("BOM: duplicated assembly relationship.");
      const a = byId.get(id);
      if (!a) return;
      visiting.add(id);
      visitedAssemblies.add(id);
      for (const pieceId of a.pieceInstanceIds) {
        const part = pieces[pieceId];
        if (!part) { missingPieces.add(pieceId); continue; }
        if (!part.definitionId || seenPieces.has(pieceId)) continue;
        seenPieces.add(pieceId);
        occurrences.push(part);
      }
      for (const child of children.get(id) ?? []) collect(child.id);
      visiting.delete(id);
    };
    collect(root.id);
    const groups = new Map<string, { part: SheetBomPiece; quantity: number }>();
    for (const part of occurrences) {
      const group = groups.get(part.definitionId);
      if (group) group.quantity++;
      else groups.set(part.definitionId, { part, quantity: 1 });
    }
    for (const [definitionId, { part, quantity }] of groups) {
      const mass = validMass(part.unitMassKg);
      output.push({
        kind: "PIECE", key: "piece:" + definitionId, mark: usableMark(part),
        label: part.label, depth: 0, quantity,
        ...(property(part.material) ? { material: property(part.material) } : {}),
        ...(property(part.grade) ? { grade: property(part.grade) } : {}),
        ...(mass !== undefined ? { unitMassKg: mass, totalMassKg: mass * quantity } : {}),
      });
    }
  } else {
    walk(root.id, 0);
  }
  return { rows: output, totalPieces: seenPieces.size, missingPieces: [...missingPieces], rootFound: true };
}

/** Full physical frame for a BOM; use the same policy for insertion and drag. */
export interface SheetBomRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export function sheetBomOverlaps(
  a: SheetBomRect, b: SheetBomRect, pad = 3,
): boolean {
  return a.x < b.x + b.width + pad && a.x + a.width + pad > b.x
    && a.y < b.y + b.height + pad && a.y + a.height + pad > b.y;
}
export function chooseSheetBomPlacement(
  occupied: readonly SheetBomRect[],
  rows: number,
  sheet: SheetBomRect = { x: 0, y: 0, width: 1120, height: 792 },
): SheetBomRect | null {
  const width = 648;
  // 120-190 SVG units; more space if the page is genuinely free.
  const height = Math.min(460, Math.max(142, 49 + rows * 13));
  const candidates: SheetBomRect[] = [
    { x: 55, y: 624, width, height: Math.min(152, height) },
    { x: 55, y: 365, width, height },
    { x: 55, y: 54, width, height },
    { x: 55, y: 54, width: 480, height },
    { x: 55, y: 624, width: 480, height: Math.min(152, height) },
  ];
  for (const candidate of candidates) {
    if (candidate.x < sheet.x + 10 || candidate.y < sheet.y + 10
      || candidate.x + candidate.width > sheet.x + sheet.width - 10
      || candidate.y + candidate.height > sheet.y + sheet.height - 10) continue;
    if (!occupied.some((entry) => sheetBomOverlaps(candidate, entry))) return candidate;
  }
  return null;
}
