import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadReferenceBlockController } from "./CadReferenceBlockController";

function createFixture() {
  const model = new DesignModel();
  const firstA = model.layers.create({ name: "CAD CUNAS_MEDIR 1 · A", visible: true });
  const firstB = model.layers.create({ name: "CAD CUNAS_MEDIR 1 · B", visible: false });
  const second = model.layers.create({ name: "CAD OTRO · A", visible: true });
  const syncLine = vi.fn(), syncPoint = vi.fn(), syncText = vi.fn();
  const clearCache = vi.fn();
  const controller = Object.assign(
    Object.create(CadReferenceBlockController.prototype) as object, {
      options: {
        designModel: model,
        cadLineScene: { sync: syncLine },
        cadPointScene: { sync: syncPoint },
        cadTextScene: { sync: syncText },
        clearGeometryQueryCache: clearCache,
      },
      hiddenReferenceLayerStates: new Map<string, Map<string, boolean>>(),
      selectedReferenceNames: new Set<string>(),
    },
  ) as CadReferenceBlockController;
  return { model, firstA, firstB, second, controller, syncLine, syncPoint, syncText, clearCache };
}

describe("visibility of a single CAD reference in the instance tree", () => {
  it("hides only that DWG, restores its per-layer visibility and updates graphics/text", () => {
    const f = createFixture();
    expect(f.controller.isReferenceVisible("CUNAS_MEDIR 1")).toBe(true);
    expect(f.controller.setReferenceVisible("CUNAS_MEDIR 1", false)).toBe(true);
    expect(f.model.layers.get(f.firstA.id)?.visible).toBe(false);
    expect(f.model.layers.get(f.firstB.id)?.visible).toBe(false);
    expect(f.model.layers.get(f.second.id)?.visible).toBe(true);
    expect(f.controller.isReferenceVisible("CUNAS_MEDIR 1")).toBe(false);
    expect(f.controller.setReferenceVisible("CUNAS_MEDIR 1", true)).toBe(true);
    expect(f.model.layers.get(f.firstA.id)?.visible).toBe(true);
    expect(f.model.layers.get(f.firstB.id)?.visible).toBe(false);
    expect(f.model.layers.get(f.second.id)?.visible).toBe(true);
    expect(f.syncLine).toHaveBeenCalledTimes(2);
    expect(f.syncPoint).toHaveBeenCalledTimes(2);
    expect(f.syncText).toHaveBeenCalledTimes(2);
    expect(f.clearCache).toHaveBeenCalledTimes(2);
  });

  it("does not alter other CAD references or create new layers for unknown names", () => {
    const f = createFixture();
    expect(f.controller.setReferenceVisible("NO_EXISTE", false)).toBe(false);
    expect(f.controller.setReferenceVisible("OTRO", false)).toBe(true);
    expect(f.model.layers.get(f.firstA.id)?.visible).toBe(true);
    expect(f.model.layers.get(f.second.id)?.visible).toBe(false);
    expect(f.controller.setReferenceVisible("OTRO", true)).toBe(true);
    expect(f.model.layers.get(f.second.id)?.visible).toBe(true);
  });
});
