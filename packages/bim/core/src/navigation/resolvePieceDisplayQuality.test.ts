import { describe, expect, it } from "vitest";
import { resolvePieceDisplayQuality } from "./resolvePieceDisplayQuality";

describe("piece visual quality in the isolated editor", () => {
  it("honors Básico even when a piece is being prepared and selected", () => {
    expect(resolvePieceDisplayQuality("LOW", ["p1"], "p1")).toEqual({
      level: "LOW", detailInstanceIds: [],
    });
  });
  it("honors Diseño instead of forcing the prepared piece to full detail", () => {
    expect(resolvePieceDisplayQuality("DESIGN", ["p1"], "p1")).toEqual({
      level: "WORK", detailInstanceIds: [],
    });
  });
  it("shows Detalle for all instances when requested", () => {
    expect(resolvePieceDisplayQuality("DETAIL", [], "p1")).toEqual({
      level: "DETAIL", detailInstanceIds: [],
    });
  });
  it("shows Detalle seleccionado for the prepared piece only", () => {
    expect(resolvePieceDisplayQuality("SELECTED", [], "p1")).toEqual({
      level: "WORK", detailInstanceIds: ["p1"],
    });
  });
  it("deduplicates selected and prepared instances", () => {
    expect(resolvePieceDisplayQuality("SELECTED", ["p2", "p1"], "p1")).toEqual({
      level: "WORK", detailInstanceIds: ["p2", "p1"],
    });
  });
  it("preserves model-space detail selection outside the piece editor", () => {
    expect(resolvePieceDisplayQuality("SELECTED", ["p2"])).toEqual({
      level: "WORK", detailInstanceIds: ["p2"],
    });
  });
});
