import { describe, expect, it } from "vitest";
import { parseLocalAssemblyCommand, type ChatAssembly } from "./localChatAssemblyCommand";

const assemblies: ChatAssembly[] = [
  { id: "root-id", name: "Cercha principal", parentAssemblyId: null, pieceCount: 8, locked: false },
  { id: "child-id", name: "Soporte", parentAssemblyId: "root-id", pieceCount: 3, locked: false },
  { id: "child-2", name: "Soporte", parentAssemblyId: "root-id", pieceCount: 3, locked: false },
];

describe("deterministic assembly chat commands", () => {
  it("uses the explicit tree selection for group copies, never a piece guess", () => {
    const result = parseLocalAssemblyCommand("Copia este ensamble 3 veces cada 1500 mm en X", assemblies, ["root-id"]);
    expect(result).toEqual({ kind: "prepare", request: {
      operation: "copy_assembly_array", id: "root-id", space: "world",
      displacement: { x: 1500, y: 0, z: 0 }, count: 3,
    } });
  });
  it("moves the selected assembly on a negative global axis", () => {
    const result = parseLocalAssemblyCommand("Mueve el ensamble seleccionado 250 mm en -Y", assemblies, ["child-id"]);
    expect(result).toEqual({ kind: "prepare", request: {
      operation: "move_assembly", id: "child-id", space: "world",
      displacement: { x: 0, y: -250, z: 0 },
    } });
  });
  it("can address an assembly by unique name or ID, not duplicate names", () => {
    expect(parseLocalAssemblyCommand("Mueve Cercha principal 100 mm en Z", assemblies, [])).toMatchObject({
      kind: "prepare", request: { id: "root-id" },
    });
    expect(parseLocalAssemblyCommand("Copia ensamble Soporte 100 mm en Z", assemblies, [])?.kind).toBe("unknown");
    expect(parseLocalAssemblyCommand("Copia ensamble Soporte 100 mm en Z", assemblies, ["child-2"])).toMatchObject({
      kind: "prepare", request: { id: "child-2" },
    });
  });
  it("requires explicit selection and refuses local axes for a hierarchy", () => {
    expect(parseLocalAssemblyCommand("Mueve este ensamble 200 mm en X", assemblies, [])).toMatchObject({
      kind: "unknown",
    });
    expect(parseLocalAssemblyCommand("Mueve este ensamble 200 mm en eje local X", assemblies, ["root-id"])).toMatchObject({
      kind: "unknown",
    });
    expect(parseLocalAssemblyCommand("Mueve esta pieza 200 mm en X", assemblies, [])).toBeNull();
  });
  it("provides read-only list and selected context actions", () => {
    expect(parseLocalAssemblyCommand("Lista los ensambles", assemblies, [])).toEqual({ kind: "list" });
    expect(parseLocalAssemblyCommand("Cuáles ensambles están seleccionados", assemblies, [])).toEqual({ kind: "selection" });
  });
});
