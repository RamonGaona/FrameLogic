import { describe, expect, it, vi } from "vitest";
import { SectionInstanceTreeBridgeController } from "./SectionInstanceTreeBridgeController";

describe("general section visibility eye", () => {
  it("hides and restores all sections in one render synchronization", () => {
    const renderLayer = vi.fn();
    const syncSectionLayers = vi.fn();
    const rebuildTree = vi.fn();
    const hidden = new Set<string>();
    // Exercise the real batch method without initializing unrelated SVG tools.
    const bridge = Object.assign(
      Object.create(SectionInstanceTreeBridgeController.prototype) as object,
      {
        options: {
          sectionDrawing: {
            getSections: () => [{ id: "section-A" }, { id: "section-B" }],
          },
        },
        hidden,
        setRenderLayerHidden: renderLayer,
        productionRuntime: { syncSectionLayerVisibility: syncSectionLayers },
        lastSignature: "old",
        decorate: rebuildTree,
      },
    ) as unknown as SectionInstanceTreeBridgeController;

    bridge.setHiddenSections(["section-A", "section-B"], true);
    expect(hidden).toEqual(new Set(["section-A", "section-B"]));
    expect(renderLayer).toHaveBeenCalledTimes(2);
    expect(syncSectionLayers).toHaveBeenCalledTimes(1);
    expect(rebuildTree).toHaveBeenCalledTimes(1);

    bridge.setHiddenSections(["section-A", "section-B"], true);
    expect(syncSectionLayers).toHaveBeenCalledTimes(1);

    bridge.setHiddenSections(["section-A", "section-B"], false);
    expect(hidden.size).toBe(0);
    expect(syncSectionLayers).toHaveBeenCalledTimes(2);
    expect(rebuildTree).toHaveBeenCalledTimes(2);
    expect(renderLayer).toHaveBeenLastCalledWith("section-B", false);
  });
});
