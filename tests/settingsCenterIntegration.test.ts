import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("shared settings entry in both workspaces", () => {
  it("keeps a single settings window mounted by the existing React viewport", () => {
    const viewport = source("../apps/web/src/features/bim/BimViewport.tsx");
    expect(viewport).toContain('import { FrameLogicSettingsWindow }');
    expect(viewport.match(/<FrameLogicSettingsWindow \/>/g)).toHaveLength(1);
    const windowSource = source("../apps/web/src/features/bim/settings/FrameLogicSettingsWindow.tsx");
    expect(windowSource).toContain("createPortal(");
    expect(windowSource).toContain('aria-modal="true"');
    expect(windowSource).toContain('window.addEventListener(FRAMELOGIC_OPEN_SETTINGS_EVENT');
  });

  it("exposes a settings button without replacing native Model/Paper commands", () => {
    const model = source("../packages/bim/core/src/navigation/ModelSpaceToolbarOrganizerController.ts");
    const paper = source("../packages/bim/core/src/drawing/DrawingToolbarRibbonController.ts");
    for (const sourceText of [model, paper]) {
      expect(sourceText).toContain('settings.dataset["framelogicSettingsTrigger"] = "true"');
      expect(sourceText).toContain('window.dispatchEvent(new Event("framelogic:open-settings"))');
      expect(sourceText).toContain('tabs.append(settings)');
    }
  });

  it("only changes interface chrome and keeps four detail-circle grips available by default", () => {
    const css = source("../apps/web/src/features/bim/settings/frameLogicSettings.css");
    expect(css).toContain('html[data-framelogic-show-detail-grips="false"]');
    const prefs = source("../apps/web/src/features/bim/settings/frameLogicPreferences.ts");
    expect(prefs).toContain('showCircularDetailGrips: true');
    expect(css).toContain('.view-cube-container');
  });
});
