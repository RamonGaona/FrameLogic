import { describe, expect, it } from "vitest";
import { MODEL_SPACE_CHROME_SELECTORS } from "./installPieceWorkspaceChromeGuard";

describe("isolated FrameLogic piece editor controls", () => {
  it("keeps Render and visual-quality controls available in the isolated editor", () => {
    expect(MODEL_SPACE_CHROME_SELECTORS).not.toContain(
      '[data-framelogic-model-render-mode="true"]',
    );
  });
});
