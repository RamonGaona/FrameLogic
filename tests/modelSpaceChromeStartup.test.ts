import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isModelSpaceChromeLayoutComplete } from "../apps/web/src/features/bim/modelSpaceChromeReadiness";

const css = readFileSync(
  new URL("../apps/web/src/features/bim/frameLogicMain.css", import.meta.url),
  "utf8",
);

describe("Model Space initial chrome", () => {
  it("keeps the React toolbar hidden until both the core and stable layout are ready", () => {
    expect(css).toContain('html:not([data-framelogic-bim-core-ready="true"]) :is(');
    expect(css).toContain('html:not([data-framelogic-model-space-layout-ready="true"]) :is(');
    expect(css).toContain(".bim-toolbar");
    expect(css).toContain('[data-framelogic-project-toolbar="true"]');
    expect(css).toContain("visibility: hidden !important;");
    expect(css).toContain("pointer-events: none !important;");
    const startupRule = css.slice(
      css.indexOf('html:not([data-framelogic-bim-core-ready="true"]) :is('),
      css.indexOf("}", css.indexOf('html:not([data-framelogic-bim-core-ready="true"]) :is(')),
    );
    expect(startupRule).not.toContain("display: none");
  });

  it("does not reveal the menu while any layout component is missing", () => {
    expect(isModelSpaceChromeLayoutComplete({
      modelToolbar: true, projectToolbar: false, instanceTree: false,
    })).toBe(false);
    expect(isModelSpaceChromeLayoutComplete({
      modelToolbar: true, projectToolbar: true, instanceTree: false,
    })).toBe(false);
    expect(isModelSpaceChromeLayoutComplete({
      modelToolbar: false, projectToolbar: true, instanceTree: true,
    })).toBe(false);
    expect(isModelSpaceChromeLayoutComplete({
      modelToolbar: true, projectToolbar: true, instanceTree: true,
    })).toBe(true);
  });
});
