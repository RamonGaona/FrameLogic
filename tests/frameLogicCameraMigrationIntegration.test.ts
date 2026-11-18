import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("FrameLogic camera navigation migration boundary", () => {
  it("publishes a vendor-neutral camera controller while keeping the BIM world", () => {
    const engine = read("../packages/bim/core/src/engine/createBimCore.ts");
    const adapter = read("../packages/bim/core/src/viewport/ThatOpenViewportAdapter.ts");
    const controller = read("../packages/bim/core/src/viewport/FrameLogicCameraController.ts");
    expect(engine).toContain("createThatOpenCameraController(world)");
    expect(engine).toContain("cameraNavigation,");
    expect(engine).toContain("world,");
    expect(adapter).toContain("new FrameLogicCameraController(");
    expect(controller).not.toContain("@thatopen/");
  });

  it("uses the FrameLogic camera contract for CAD view orientation and event subscription", () => {
    const engine = read("../packages/bim/core/src/engine/createBimCore.ts");
    expect(engine).toContain("cameraNavigation.subscribeOrientation(callback)");
    expect(engine).toContain("return cameraNavigation.orientation;");
    expect(engine).toContain("controls.orientation.azimuth;");
    expect(engine).toContain("controls.orientation.polar;");
    expect(engine).toContain("cameraNavigation.setEnabled(enabled)");
  });

  it("uses camera port for CAD tool disable/enable but preserves specialized legacy controls", () => {
    for (const path of [
      "../packages/bim/core/src/gripCadNavigationIndex.ts",
      "../packages/bim/core/src/engine/createFrameLogicBimCoreDrawing.ts",
      "../packages/bim/core/src/engine/createFrameLogicBimCoreSelectionSafe.ts",
      "../packages/bim/core/src/engine/createFrameLogicBimCoreStable.ts",
    ]) {
      const source = read(path);
      expect(source).toMatch(/core\.cameraNavigation\.setEnabled\((enabled|true|false)\)/);
      expect(source).not.toMatch(/core\.world\.camera\.controls\.enabled\s*=/);
    }
  });

  it("keeps perspective disabled and Drawing/PDF cameras independent", () => {
    const engine = read("../packages/bim/core/src/engine/createBimCore.ts");
    const controller = read("../packages/bim/core/src/viewport/FrameLogicCameraController.ts");
    const drawing = read("../packages/bim/core/src/drawing/AssemblyViewShadingRenderer.ts");
    expect(engine).toContain('if (getCameraProjectionMode() === "ORTHOGRAPHIC")');
    expect(controller).not.toContain("projection.toggle()");
    expect(drawing).toContain("new THREE.OrthographicCamera(");
  });
});
