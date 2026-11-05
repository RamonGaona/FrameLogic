import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("isolated FrameLogic editor visibility", () => {
  it("does not suppress the Render / visual quality panel", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./installPieceWorkspaceChromeGuard.ts", import.meta.url)),
      "utf8",
    );
    const selectors = source.slice(
      source.indexOf("const MODEL_SPACE_CHROME_SELECTORS"),
      source.indexOf("] as const;"),
    );
    expect(selectors).not.toMatch(/^\s*['"]\[data-framelogic-model-render-mode=/m);
  });
});
