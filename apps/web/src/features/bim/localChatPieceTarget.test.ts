import { describe, expect, it } from "vitest";
import { parseLocalChatCommand, type ChatPiece } from "./localChatCommand";
import { resolveChatPieceTarget, type ChatCadSelection } from "./localChatPieceTarget";

const pieces: ChatPiece[] = [
  { id: "rec-a", name: "REC3000", code: "REC3000" },
  { id: "rec-b", name: "REC3000", code: "REC3000" },
  { id: "unique", name: "PS1500", code: "PS1500" },
];
const selection = (pieceIds: string[], pointIds: string[] = [], lineIds: string[] = []): ChatCadSelection =>
  ({ pieceIds, pointIds, lineIds });

describe("live browser chat PieceInstance targeting", () => {
  it("takes the actual selected viewport instance, not its duplicated name", () => {
    const target = resolveChatPieceTarget(pieces, selection(["rec-b"]), null);
    expect(target.ids).toEqual(["rec-b"]);
    expect(parseLocalChatCommand("Muestra los ejes de esta pieza", pieces, target.ids))
      .toEqual({ kind: "axes", id: "rec-b" });
    expect(parseLocalChatCommand("Copia esta pieza 4 veces cada 1500 mm en X", pieces, target.ids))
      .toMatchObject({ kind: "prepare", request: { id: "rec-b", count: 4, distance: 1500 } });
  });
  it("reads each new viewer selection instead of caching an older instance", () => {
    let current = selection(["rec-a"]);
    const read = () => resolveChatPieceTarget(pieces, current, null);
    expect(read().ids).toEqual(["rec-a"]);
    current = selection(["unique"]);
    expect(read().ids).toEqual(["unique"]);
    current = selection([]);
    expect(read().ids).toEqual([]);
  });
  it("accepts an explicit unique instance chosen in the chat", () => {
    const target = resolveChatPieceTarget(pieces, selection([]), "rec-a");
    expect(target.ids).toEqual(["rec-a"]);
    expect(parseLocalChatCommand("Muestra los ejes de esta pieza", pieces, target.ids))
      .toEqual({ kind: "axes", id: "rec-a" });
  });
  it("does not guess between several selected pieces or duplicate labels", () => {
    const target = resolveChatPieceTarget(pieces, selection(["rec-a", "rec-b"]), null);
    expect(target.ids).toEqual([]);
    expect(target.issue).toMatch(/2 instancias/);
    expect(parseLocalChatCommand("Copia REC3000 4 veces cada 1500 mm en X", pieces, target.ids).kind)
      .toBe("unknown");
  });
  it("distinguishes CAD points and lines from PieceInstances", () => {
    const target = resolveChatPieceTarget(pieces, selection([], ["point-1"], ["line-1"]), null);
    expect(target.ids).toEqual([]);
    expect(target.issue).toMatch(/geometría CAD/);
  });
  it("rejects stale identifiers rather than targeting another piece", () => {
    expect(resolveChatPieceTarget(pieces, selection(["deleted"]), null).ids).toEqual([]);
    expect(resolveChatPieceTarget(pieces, selection(["rec-a"]), "deleted").ids).toEqual([]);
  });
});
