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

  it("publishes a FrameLogic-owned port for CAD consumers", () => {
    const core = read("../packages/bim/core/src/engine/createBimCore.ts");
    const adapter = read("../packages/bim/core/src/viewport/ThatOpenViewportAdapter.ts");
    expect(core).toContain("viewport: viewportPort");
    expect(adapter).toContain("createLiveFrameLogicViewport({");
    expect(adapter).toContain("getCamera: () => world.camera.three");
  });

  it("routes selected CAD tools through the native Three.js port", () => {
    const consumers = [
      "../packages/bim/core/src/engine/createFrameLogicBimCorePrecision.ts",
      "../packages/bim/core/src/engine/createFrameLogicBimCoreSelectionSafe.ts",
      "../packages/bim/core/src/circleNavigationIndex.ts",
      "../packages/bim/core/src/advancedCadNavigationIndex.ts",
      "../packages/bim/core/src/gripCadNavigationIndex.ts",
      "../packages/bim/core/src/engine/createFrameLogicBimCoreDrawing.ts",
      "../packages/bim/core/src/engine/createFrameLogicBimCoreNavigation.ts",
    ];
    for (const file of consumers) {
      const source = read(file);
      expect(source).toContain("core.viewport.camera");
      expect(source).not.toContain("core.world.camera.three");
      expect(source).not.toContain("core.world.scene.three");
    }
  });

});
