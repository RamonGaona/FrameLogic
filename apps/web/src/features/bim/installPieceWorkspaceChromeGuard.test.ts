import { describe, expect, it } from "vitest";
import { MODEL_SPACE_CHROME_SELECTORS } from "./installPieceWorkspaceChromeGuard";
import pieceEditorCss from "./frameLogicMain.css?raw";

describe("isolated FrameLogic piece editor controls", () => {
  it("does not hide Render using the isolated-editor CSS !important rule", () => {
    // Earlier revisions removed only the JS guard selector, but left
    // display:none!important in this CSS rule; Render remained hidden.
    const isolatedSelector = pieceEditorCss.match(
      /html\[data-framelogic-piece-workspace-active="true"\]\s*:is\(([^)]*)\)/s,
    )?.[1];
    expect(isolatedSelector).toBeDefined();
    expect(isolatedSelector).toContain('[data-framelogic-model-space-panel-stack="true"]');
    expect(isolatedSelector).not.toContain('[data-framelogic-model-render-mode="true"]');
  });

  it("keeps Render and visual-quality controls available in the isolated editor", () => {
    expect(MODEL_SPACE_CHROME_SELECTORS).not.toContain(
      '[data-framelogic-model-render-mode="true"]',
    );
  });
});
