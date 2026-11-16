import { describe, expect, it } from "vitest";
import {
  addPositionDefinition, combinePositionRanges, duplicatePositionDefinition,
  firstFreePosition, insertPositionSlot, markPositionsModified,
  movePositionSlot, movePositionRange, newPositionsFile, normalizePositionsFile, parsePositionsFile,
  positionRows, removePositionDefinition, reorderPositionDefinition,
  serializePositionsFile, sortPositionDefinitions, splitPositionRange, usageAt,
  type PositionsFile,
} from "./positionsCatalog";

const fixture = (): PositionsFile => ({
  schemaVersion: 1,
  families: [
    { family: "MP", positions: [
      { from: 29, to: 29, components: [] },
      { from: 30, to: 30, components: [{ priority: 1, code: "A", name: "Placa",
        lengthMm: 20, openingMinMm: null, openingMaxMm: null, angleMinDeg: null,
        angleMaxDeg: null, notes: null, active: true }] },
      { from: 31, to: 49, components: [{ priority: 1, code: "B", name: "Barra",
        lengthMm: 2700, openingMinMm: null, openingMaxMm: null, angleMinDeg: null,
        angleMaxDeg: null, notes: null }] },
    ] },
    { family: "P6", positions: [
      { from: 30, to: 30, components: [{ priority: 2, code: "C", name: "Placa alternativa",
        lengthMm: 30, openingMinMm: null, openingMaxMm: null, angleMinDeg: null,
        angleMaxDeg: null, notes: null }] },
    ] },
  ],
});

describe("POSITIONS.json editor, original families/from/to/components schema", () => {
  it("roundtrips without losing active or legacy custom properties", () => {
    const before = fixture();
    before.families[0]!.positions[1]!.custom = { reference: "legacy" };
    const parsed = parsePositionsFile(serializePositionsFile(before));
    expect(parsed).toEqual(before);
    expect(parsed.version).toBeUndefined();
  });
  it("finds free global slots and prevents collision within one family", () => {
    expect(firstFreePosition(fixture())).toBe(0);
    expect(() => addPositionDefinition(fixture(), "MP", 31)).toThrow(/ya utiliza/);
    const next = addPositionDefinition(fixture(), "MP", 80);
    expect(next.families[0]!.positions.at(-1)!.from).toBe(80);
  });
  it("inserts in 40, leaving existing 31-49 free at 40 by default", () => {
    const next = insertPositionSlot(fixture(), "P6", 40);
    const mp = next.families[0]!.positions.map((p) => [p.from, p.to]);
    expect(mp).toContainEqual([31,39]);
    expect(mp).toContainEqual([41,50]);
    expect(mp).not.toContainEqual([31,50]);
    expect(next.families[1]!.positions.some((p) => p.from === 40 && p.to === 40)).toBe(true);
    expect(next.families[0]!.positions.find((p) => p.from === 41)!.components[0]!.code).toBe("B");
  });
  it("inserts and inherits a covering range only with explicit choice", () => {
    const next = insertPositionSlot(fixture(), "P6", 40, true);
    expect(next.families[0]!.positions.some((p) => p.from === 31 && p.to === 50)).toBe(true);
  });
  it("moves a shared slot 30 to 35 in every family without dropping components", () => {
    const next = movePositionSlot(fixture(), 30, 35);
    expect(next.families[0]!.positions.some((p) =>
      p.from === 35 && p.to === 35 && p.components.some((c) => c.code === "A"))).toBe(true);
    expect(next.families[1]!.positions.some((p) => p.from === 35
      && p.components.some((c) => c.code === "C"))).toBe(true);
    expect(positionRows(next).flatMap((r) => r.position.components).length)
      .toBeGreaterThanOrEqual(positionRows(fixture()).flatMap((r) => r.position.components).length);
  });
  it("moves 35 toward 30 and returns unchanged when destination equals source", () => {
    const next = movePositionSlot(fixture(), 35, 30);
    expect(next.families[0]!.positions.some((p) =>
      p.from === 30 && p.to === 30 && p.components[0]?.code === "B")).toBe(true);
    expect(movePositionSlot(fixture(), 35, 35)).toEqual(fixture());
  });
  it("moves the complete range 31–49 up one slot without losing members", () => {
    const next = movePositionRange(fixture(), 31, 49, 30);
    expect(next.families[0]!.positions.some((p) =>
      p.from === 30 && p.to === 48 && p.components.some((c) => c.code === "B"))).toBe(true);
    expect(next.families[0]!.positions.some((p) =>
      p.from === 49 && p.components.some((c) => c.code === "A"))).toBe(true);
  });
  it("deletes a definition without changing other families", () => {
    const next = removePositionDefinition(fixture(), { familyIndex: 0, rowIndex: 1 });
    expect(next.families[0]!.positions.some((p) => p.from === 30)).toBe(false);
    expect(next.families[1]!.positions[0]!.from).toBe(30);
  });
  it("blocks closing a slot still shared by another family", () => {
    expect(() => removePositionDefinition(fixture(), { familyIndex: 0, rowIndex: 1 }, true))
      .toThrow(/compartida/);
  });
  it("closes an unshared deleted slot globally", () => {
    const next = removePositionDefinition(fixture(), { familyIndex: 0, rowIndex: 0 }, true);
    expect(next.families[0]!.positions[0]!.from).toBe(29);
    expect(next.families[1]!.positions[0]!.from).toBe(29);
  });
  it("detects shared alternatives and updates audit date only when explicitly invoked", () => {
    const before = fixture();
    expect(usageAt(before, 30).families).toEqual(["MP", "P6"]);
    expect(usageAt(before, 30).shared).toBe(true);
    const marked = markPositionsModified(before, new Date("2026-11-16T15:00:00Z"));
    expect(marked.fecha_modificacion).toBe("2026-11-16T15:00:00.000Z");
    expect(before.fecha_modificacion).toBeUndefined();
  });
  it("rejects invalid ranges and malformed component types", () => {
    const malformed = fixture();
    malformed.families[0]!.positions[0]!.to = 25;
    expect(() => normalizePositionsFile(malformed)).toThrow(/inicio/);
    expect(() => parsePositionsFile("{")).toThrow(/JSON válido/);
  });
  it("duplicates a range without changing the original, and preserves every component", () => {
    const before = fixture();
    const next = duplicatePositionDefinition(before, { familyIndex: 0, rowIndex: 2 }, 200);
    expect(before.families[0]!.positions.length).toBe(3);
    expect(next.families[0]!.positions.some((p) =>
      p.from === 200 && p.to === 218 && p.components[0]?.code === "B")).toBe(true);
  });
  it("visually reorders a row without altering global position values", () => {
    const before = fixture();
    const swapped = reorderPositionDefinition(before, { familyIndex: 0, rowIndex: 0 }, 1);
    expect(swapped.families[0]!.positions[0]!.from).toBe(30);
    expect(swapped.families[0]!.positions[1]!.from).toBe(29);
    expect(sortPositionDefinitions(swapped)).toEqual(before);
  });
  it("splits and recombines a range preserving all properties", () => {
    const before = fixture();
    const split = splitPositionRange(before, { familyIndex: 0, rowIndex: 2 }, 40);
    expect(split.families[0]!.positions.slice(2).map((p) => [p.from,p.to]))
      .toEqual([[31,39],[40,49]]);
    const combined = combinePositionRanges(split, { familyIndex: 0, rowIndex: 2 });
    expect(combined).toEqual(before);
  });
  it("creates a fresh versioned file while retaining old files without metadata", () => {
    expect(newPositionsFile().version).toBe("1.0.0");
    expect(parsePositionsFile(serializePositionsFile(fixture())).version).toBeUndefined();
  });
});
