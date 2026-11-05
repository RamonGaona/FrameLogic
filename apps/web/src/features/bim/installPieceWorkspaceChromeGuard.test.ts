import { describe, expect, it } from "vitest";
import { MODEL_SPACE_CHROME_SELECTORS } from "./installPieceWorkspaceChromeGuard";
import pieceEditorCss from "./frameLogicMain.css?raw";

describe("isolated FrameLogic piece editor controls", () => {
  it("does not hide Render using the isolated-editor CSS !important rule", () => {
    // Earlier revisions removed only the JS guard selector, but left
    // display:none!important in this CSS rule; Render remained hidden.
    expect(pieceEditorCss).toContain("data-framelogic-piece-workspace-active");
    expect(pieceEditorCss).toContain("data-framelogic-model-space-panel-stack");
    expect(pieceEditorCss).not.toContain("data-framelogic-model-render-mode");
  });

  it("keeps Render and visual-quality controls available in the isolated editor", () => {
    expect(MODEL_SPACE_CHROME_SELECTORS).not.toContain(
      '[data-framelogic-model-render-mode="true"]',
    );
  });
});
