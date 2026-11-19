import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Native Three.js shared project scene inspection", () => {
  it("uses the same authoritative Three.js scene instead of copying STEP, IFC, DWG or assembly data", () => {
    const preview = read("../packages/bim/core/src/viewport/ExperimentalNativeThreePreview.ts");
    const core = read("../packages/bim/core/src/engine/createFrameLogicBimCoreDrawing.ts");
    expect(preview).toContain("renderer.render(options.viewport.scene, camera)");
    expect(preview).toContain("const source = options.viewport.camera");
    expect(core).toContain("core.viewport.scene");
    expect(core).toContain("core.viewport.canvas");
    expect(core).toContain("projectPackage,");
    expect(preview).not.toContain("parseFrameLogicPiecePackage");
    expect(preview).not.toContain("loadIfc");
    expect(preview).not.toContain("loadDwg");
    expect(preview).not.toContain("JSON.parse");
  });

  it("only creates an extra renderer on deliberate user action or original preview URL flag", () => {
    const web = read("../apps/web/src/features/bim/BimViewport.tsx");
    const preview = read("../packages/bim/core/src/viewport/ExperimentalNativeThreePreview.ts");
    expect(web).not.toContain('data-native-project-inspection="true"');
    expect(web).toContain("toggleNativeProjectPreview();");
    expect(web).toContain("mountExperimentalNativeThreePreview({");
    expect(web).toContain("viewport: instance.viewport");
    expect(web).toContain("width: 640");
    expect(web).toContain("height: 360");
    expect(web).toContain('viewportFlags.get("threePreview") === "1"');
    expect(web).toContain("disposeNativePreview?.()");
    expect(web).toContain("disposeWithPanel()");
    expect(preview).toContain("readonly onClose?: () => void");
    expect(preview).toContain("options.onClose?.()");
  });

  it("does not hijack CAD input, persistence, drawings, or ownership of shared scene", () => {
    const web = read("../apps/web/src/features/bim/BimViewport.tsx");
    const preview = read("../packages/bim/core/src/viewport/ExperimentalNativeThreePreview.ts");
    const core = read("../packages/bim/core/src/engine/createFrameLogicBimCoreDrawing.ts");
    expect(preview).toContain('pointer-events:none');
    expect(preview).toContain("renderer.dispose()");
    expect(preview).toContain("renderer.forceContextLoss()");
    expect(preview).not.toContain("options.viewport.renderer.dispose()");
    expect(preview).not.toContain("geometry.dispose()");
    expect(preview).not.toContain("material.dispose()");
    expect(web).toContain("const disposeWithPanel = instance.dispose");
    expect(web).toContain("disposeAutomationPanel()");
    expect(web).toContain("disposeClashDetectionPanel()");
    expect(web).toContain("disposeLocalChatPanel()");
    expect(core).toContain("new FrameLogicProjectPackageController({");
    expect(core).toContain("new DrawingWorkspaceController({");
    expect(core).toContain("new DrawingProductionController(");
    expect(web).not.toContain('data-native-step-workspace-launch="true"');
  });
});
