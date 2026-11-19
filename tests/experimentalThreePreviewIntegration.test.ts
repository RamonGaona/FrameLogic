import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("Experimental native Three.js renderer boundaries", () => {
  it("starts only through an explicit URL opt-in and leaves main rendering active", () => {
    const viewport = read("../apps/web/src/features/bim/BimViewport.tsx");
    expect(viewport).toContain('viewportFlags.get("threePreview") === "1"');
    expect(viewport).toContain("mountExperimentalNativeThreePreview({");
    expect(viewport).toContain("disposeNativePreview?.()");
    expect(viewport).toContain("disposeWithPanel()");
  });

  it("creates a separate WebGLRenderer, never disposes shared CAD scene materials", () => {
    const preview = read("../packages/bim/core/src/viewport/ExperimentalNativeThreePreview.ts");
    expect(preview).toContain("new THREE.WebGLRenderer({");
    expect(preview).toContain("renderer.render(options.viewport.scene, camera)");
    expect(preview).toContain("renderer.dispose()");
    expect(preview).toContain("renderer.forceContextLoss()");
    expect(preview).not.toContain("geometry.dispose()");
    expect(preview).not.toContain("material.dispose()");
    expect(preview).not.toContain("options.viewport.renderer.dispose()");
  });

  it("keeps drawing and IFC paths untouched, and navigation vendor-independent", () => {
    const navigation = read("../packages/bim/core/src/navigationIndex.ts");
    const state = read("../packages/bim/core/src/project/ProjectCameraStateController.ts");
    const mouse = read("../packages/bim/core/src/engine/createFrameLogicBimCoreNavigation.ts");
    const core = read("../packages/bim/core/src/engine/createBimCore.ts");
    expect(navigation).toContain("cameraControls.setMinimumZoom(");
    expect(navigation).toContain("cameraNavigation:\n        core.cameraNavigation");
    expect(state).toContain("readonly cameraNavigation:\n    FrameLogicCameraController");
    expect(mouse).toContain("controls: core.cameraNavigation.mouseBindings");
    expect(core).toContain('if (getCameraProjectionMode() === "ORTHOGRAPHIC")');
    expect(core).toContain("OBC.FragmentsManager");
    expect(core).toContain("OBC.IfcLoader");
    expect(read("../packages/bim/core/src/drawing/AssemblyViewShadingRenderer.ts"))
      .toContain("new THREE.OrthographicCamera(");
  });
});
