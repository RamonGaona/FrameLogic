import { describe, expect, it } from "vitest";
import { parseLocalChatCommand, parseLocalChatScript, type ChatPiece } from "./localChatCommand";

const pieces: ChatPiece[] = [
  { id: "first-uuid", name: "PS_1500P4L", code: "PS_1500P4L" },
  { id: "rec-a", name: "REC3000", code: "REC3000" },
  { id: "rec-b", name: "REC3000", code: "REC3000" },
];

describe("browser-local chat deterministic commands", () => {
  it("reads the model without requiring a paid AI service", () => {
    expect(parseLocalChatCommand("Lista las piezas", pieces, [])).toEqual({ kind: "list" });
    expect(parseLocalChatCommand("Resumen del modelo", pieces, [])).toEqual({ kind: "info" });
    expect(parseLocalChatCommand("Muestra los ejes de esta pieza", pieces, ["first-uuid"]))
      .toEqual({ kind: "axes", id: "first-uuid" });
  });

  it("prepares four copies with an explicit local axis and 1500 mm pitch", () => {
    expect(parseLocalChatCommand("Copia esta pieza 4 veces cada 1500 mm en X", pieces, ["first-uuid"]))
      .toEqual({ kind: "prepare", request: {
        operation: "copy_piece_array", id: "first-uuid", space: "local",
        direction: { x: 1, y: 0, z: 0 }, distance: 1500, count: 4,
      } });
  });

  it("uses local -Y for a move, never guessing a longitudinal axis", () => {
    expect(parseLocalChatCommand("Mueve PS_1500P4L 200 mm en -Y", pieces, []))
      .toEqual({ kind: "prepare", request: {
        operation: "move_piece", id: "first-uuid", space: "local",
        displacement: { x: 0, y: -200, z: 0 },
      } });
    expect(parseLocalChatCommand("Copia PS_1500P4L 4 veces cada 1500 mm", pieces, []).kind).toBe("unknown");
  });

  it("requires selection when multiple instances share a name", () => {
    expect(parseLocalChatCommand("Copia REC3000 1 vez cada 1500 mm en X", pieces, []).kind).toBe("unknown");
    expect(parseLocalChatCommand("Copia REC3000 1 vez cada 1500 mm en X", pieces, ["rec-b"]))
      .toMatchObject({ kind: "prepare", request: { id: "rec-b" } });
    expect(parseLocalChatCommand("Copia REC3000 1 vez cada 1500 mm en X", pieces, ["rec-a", "rec-b"]).kind).toBe("unknown");
  });

  it("rejects invalid count, missing distances and unsupported directions", () => {
    expect(parseLocalChatCommand("Copia esta pieza 101 veces cada 1500 mm en X", pieces, ["first-uuid"]).kind).toBe("unknown");
    expect(parseLocalChatCommand("Mueve esta pieza 20 cm en Z", pieces, ["first-uuid"]).kind).toBe("unknown");
    expect(parseLocalChatCommand("Mueve esta pieza -1500 mm en X", pieces, ["first-uuid"]).kind).toBe("unknown");
    expect(parseLocalChatCommand("Copia esta pieza 3 veces cada 1500 mm en eje largo", pieces, ["first-uuid"]).kind).toBe("unknown");
  });

  it("never accepts unreviewed chat confirmation", () => {
    expect(parseLocalChatCommand("Confirma todas las operaciones", pieces, []).kind).toBe("unknown");
    expect(parseLocalChatCommand("Deshacer", pieces, [])).toEqual({ kind: "undo" });
    expect(parseLocalChatCommand("Rehacer", pieces, [])).toEqual({ kind: "redo" });
  });
});

describe("Stage 3 local scripts and queries", () => {
  it("parses named and selected-object read-only queries", () => {
    expect(parseLocalChatCommand("Buscar piezas PS_1500P4L", pieces, []))
      .toEqual({ kind: "query", search: "PS_1500P4L" });
    expect(parseLocalChatCommand("Consultar piezas seleccionadas", pieces, []))
      .toEqual({ kind: "query", selectedOnly: true });
    expect(parseLocalChatCommand("Describe esta pieza", pieces, ["first-uuid"]))
      .toEqual({ kind: "describe", id: "first-uuid" });
  });
  it("prepares a deterministic two-command script without executing it", () => {
    const result = parseLocalChatScript(
      "Mueve esta pieza 200 mm en -Y; copia esta pieza 2 veces cada 1500 mm en X",
      pieces,
      ["first-uuid"],
    );
    expect(result).toMatchObject({
      kind: "commands",
      requests: [
        { operation: "move_piece", id: "first-uuid", displacement: { x: 0, y: -200, z: 0 } },
        { operation: "copy_piece_array", id: "first-uuid", count: 2, distance: 1500 },
      ],
    });
  });
  it("refuses partially recognized scripts, confirmations and ambiguous parts", () => {
    expect(parseLocalChatScript("Mueve esta pieza 200 mm en X; confirmar", pieces, ["first-uuid"])?.kind).toBe("unknown");
    expect(parseLocalChatScript("Mueve esta pieza 200 mm en X; copia REC3000 2 veces cada 500 mm en Y", pieces, ["first-uuid"])?.kind).toBe("unknown");
    expect(parseLocalChatScript("Mueve esta pieza 200 mm en X", pieces, ["first-uuid"])).toBeNull();
    expect(parseLocalChatScript("a; b; c; d; e; f; g; h; i", pieces, ["first-uuid"])?.kind).toBe("unknown");
  });
});
