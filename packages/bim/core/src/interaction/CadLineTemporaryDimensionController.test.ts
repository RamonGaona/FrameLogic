import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import { CadLineTemporaryDimensionController } from "./CadLineTemporaryDimensionController";
import { getActiveCadReferenceBlockController } from "../import/CadReferenceTransformController";

vi.mock("../import/CadReferenceTransformController", () => ({
  getActiveCadReferenceBlockController: vi.fn(() => null),
}));

afterEach(() => {
  vi.mocked(getActiveCadReferenceBlockController).mockReturnValue(null);
});

describe("automatic dimensions for read-only DWG line members", () => {
  function setup() {
    const model = new DesignModel();
    const layer = model.layers.create({
      name: "CAD Plano · 0", locked: false, visible: true, snapEnabled: true,
    });
    const line = model.registerCadLine({ layerId: layer.id,
      start: { x: 2, y: 3, z: 4 }, end: { x: 5, y: 7, z: 4 } });
    model.layers.update(layer.id, { locked: true });
    const selection = { isEnabled: true, getSelectedIds: vi.fn((): string[] => []) };
    const dimension = Object.create(CadLineTemporaryDimensionController.prototype) as CadLineTemporaryDimensionController;
    Reflect.set(dimension, "isLinePlacementActive", () => false);
    Reflect.set(dimension, "designModel", model);
    Reflect.set(dimension, "lineSelection", selection);
    const segment = () => (Reflect.get(dimension, "getActiveSegment") as Function)
      .call(dimension) as { start: THREE.Vector3; end: THREE.Vector3; source: string } | null;
    return { model, line, selection, segment };
  }

  it("shows an exact 5-unit dimension after clicking an internal line, even though layer is locked", () => {
    const f = setup();
    vi.mocked(getActiveCadReferenceBlockController).mockReturnValue({
      getInspectedLineId: () => f.line.id,
    } as unknown as ReturnType<typeof getActiveCadReferenceBlockController>);
    const segment = f.segment();
    expect(segment?.start.distanceTo(segment.end)).toBe(5);
    expect(segment?.source).toBe("SELECTION");
    expect(f.selection.getSelectedIds()).toEqual([]);
  });

  it("keeps ordinary standalone CAD line measurements working", () => {
    const f = setup();
    f.selection.getSelectedIds.mockReturnValue([f.line.id]);
    expect(f.segment()?.start.distanceTo(f.segment()!.end)).toBe(5);
  });
});
