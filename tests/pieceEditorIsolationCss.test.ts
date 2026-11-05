import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// This regression intentionally lives outside apps/web/src: the web TypeScript
// build must not import Node fs, while Vitest's Vite CSS ?raw transform returns
// an empty string in this repository's test configuration.
const css = readFileSync(
  new URL("../apps/web/src/features/bim/frameLogicMain.css", import.meta.url),
  "utf8",
);

describe("isolated piece editor CSS rendering", () => {
  it("hides general model chrome but does not hide Render and quality controls", () => {
    const start = css.indexOf(
      'html[data-framelogic-piece-workspace-active="true"] :is(',
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const end = css.indexOf(") {", start);
    expect(end).toBeGreaterThan(start);
    const selectors = css.slice(start, end);
    expect(selectors).toContain('[data-framelogic-model-space-panel-stack="true"]');
    expect(selectors).toContain('[data-framelogic-section-panel="true"]');
    expect(selectors).not.toContain('[data-framelogic-model-render-mode="true"]');
  });
});
