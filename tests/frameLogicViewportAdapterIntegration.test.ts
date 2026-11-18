import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("FrameLogic viewer migration boundaries", () => {
  it("keeps world, renderer and camera construction out of the CAD engine", () => {
    const core = read("../packages/bim/core/src/engine/createBimCore.ts");

    expect(core).toContain("createFrameLogicViewportWorld(components)");
    expect(core).toContain("attachFrameLogicViewportRenderer(");
    expect(core).toContain("attachFrameLogicViewportCamera(");
    expect(core).toContain("getFrameLogicViewportPort(world)");
    expect(core).not.toContain("new OBC.SimpleScene(");
    expect(core).not.toContain("new OBC.SimpleRenderer(");
    expect(core).not.toContain("new OBC.OrthoPerspectiveCamera(");
  });

  it("preserves IFC and Fragments integration independently of the viewport", () => {
    const core = read("../packages/bim/core/src/engine/createBimCore.ts");

    expect(core).toContain("OBC.FragmentsManager");
    expect(core).toContain("OBC.IfcLoader");
    expect(core).toContain("OBF.Mesher");
  });
});
