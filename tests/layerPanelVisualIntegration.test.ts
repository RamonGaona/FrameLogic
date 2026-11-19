import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  new URL("../apps/web/src/features/bim/components/LayerPanel.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("../apps/web/src/features/bim/components/LayerPanel.css", import.meta.url),
  "utf8",
);
const globalCss = readFileSync(
  new URL("../apps/web/src/index.css", import.meta.url),
  "utf8",
);

describe("project-layer panel visual regression", () => {
  it("allocates seven explicit grid cells, with a flexible name column", () => {
    expect(css).toContain("grid-template-columns: 20px minmax(0, 1fr) 24px repeat(3, 28px) 24px;");
    expect(css).toContain("grid-template-columns: 18px minmax(0, 1fr) 22px repeat(3, 25px) 22px;");
    expect(css).toContain("text-overflow: ellipsis;");
    expect(component).toContain('className="layer-name-button"');
    expect(component).toContain('className="layer-remove-placeholder"');
    expect(globalCss).not.toContain(".layer-row {");
  });

  it("preserves all project layer commands without adding a separate state owner", () => {
    for (const action of [
      "onSetActive(layer.id)",
      "onVisibilityChange(layer.id, !layer.visible)",
      "onLockChange(layer.id, !layer.locked)",
      "onSnapChange(layer.id, !layer.snapEnabled)",
      "onRemove(layer.id)",
      "onCreate",
      "onAssignSelection(activeLayerId)",
      "setLayerColor(layer.id, event.target.value)",
    ]) {
      expect(component).toContain(action);
    }
    expect(component).toContain('layer.name.startsWith("CAD ")');
    expect(component).toContain('layer.name.includes(" · ")');
    expect(component).toContain("!layer.system");
    expect(component).toContain("framelogic:layer-color-change");
  });

  it("has descriptive controls and visible keyboard focus", () => {
    expect(component).toContain('aria-label="Capas del proyecto"');
    expect(component).toContain("aria-pressed={active}");
    expect(component).toContain("aria-pressed={layer.visible}");
    expect(component).toContain("aria-pressed={layer.locked}");
    expect(component).toContain("aria-pressed={layer.snapEnabled}");
    expect(component).toContain('aria-label="Crear capa"');
    expect(css).toContain(":focus-visible");
    expect(css).toContain("scrollbar-width: thin;");
  });
});
