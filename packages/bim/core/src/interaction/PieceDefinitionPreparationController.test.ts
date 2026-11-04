import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
// The domain barrel pulls the STEP engine into the Node test runtime;
// preparation only needs the layer identifiers, so mock that boundary.
vi.mock("@framelogic/domain", () => ({
  DEFAULT_DESIGN_LAYER_IDS: {
    SNAP_MANUAL: "SNAP_MANUAL",
    REFERENCE_AXES: "REFERENCE_AXES",
  },
}));

import { PieceDefinitionPreparationController } from "./PieceDefinitionPreparationController";

describe("FrameLogic piece preparation actions", () => {
  it("reuses active preparation without clearing CAD lines, points or selections", () => {
    const controller = Object.create(
      PieceDefinitionPreparationController.prototype,
    ) as PieceDefinitionPreparationController;
    const removeCadPoint = vi.fn();
    const removeCadLine = vi.fn();
    const clearPointSelection = vi.fn();
    const clearLineSelection = vi.fn();
    const existingState = {
      active: true,
      instanceId: "piece-1",
      definitionId: "definition-1",
      code: "PIEZA",
      name: "Pieza preparada",
      snapCount: 1,
      axisCount: 0,
    };
    Reflect.set(controller, "activeInstanceId", "piece-1");
    Reflect.set(controller, "designModel", { removeCadPoint, removeCadLine });
    Reflect.set(controller, "pointSelection", { clearSelection: clearPointSelection });
    Reflect.set(controller, "lineSelection", { clearSelection: clearLineSelection });
    const getState = vi.spyOn(controller, "getState").mockReturnValue(existingState);

    expect(controller.start("piece-1")).toEqual(existingState);
    expect(getState).toHaveBeenCalledOnce();
    expect(removeCadPoint).not.toHaveBeenCalled();
    expect(removeCadLine).not.toHaveBeenCalled();
    expect(clearPointSelection).not.toHaveBeenCalled();
    expect(clearLineSelection).not.toHaveBeenCalled();
  });

  it("converts selected CAD line into a persistent axis without deleting source geometry", () => {
    const controller = Object.create(
      PieceDefinitionPreparationController.prototype,
    ) as PieceDefinitionPreparationController;
    const addReferenceAxisLine = vi.fn();
    const removeCadLine = vi.fn();
    const selectedIds = ["line-a"];
    const getSelectedIds = vi.fn(() => selectedIds);
    const get = vi.fn((id: string) =>
      id === "line-a"
        ? { id, start: { x: 10, y: 20, z: 30 }, end: { x: 110, y: 20, z: 30 } }
        : undefined,
    );
    const notify = vi.fn();

    Reflect.set(controller, "lineSelection", { getSelectedIds });
    Reflect.set(controller, "designModel", {
      cadLines: { get },
      pieceDefinitions: { addReferenceAxisLine },
      removeCadLine,
    });
    Reflect.set(controller, "requireContext", () => ({
      definition: { id: "definition-1" },
      object: new THREE.Object3D(),
    }));
    Reflect.set(controller, "worldToDefinitionLocal", (point: THREE.Vector3) => point.clone());
    Reflect.set(controller, "requireDefinition", () => ({
      referenceGeometry: { axisLines: [] },
    }));
    Reflect.set(controller, "toData", (point: THREE.Vector3) => ({
      x: point.x, y: point.y, z: point.z,
    }));
    Reflect.set(controller, "notify", notify);

    expect(controller.addSelectedCadLinesAsAxes("REFERENCE")).toBe(1);
    expect(addReferenceAxisLine).toHaveBeenCalledWith("definition-1", {
      name: "Axis 1",
      type: "REFERENCE",
      origin: { x: 10, y: 20, z: 30 },
      direction: { x: 1, y: 0, z: 0 },
      length: 100,
    });
    expect(getSelectedIds()).toEqual(["line-a"]);
    expect(removeCadLine).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledOnce();
  });
});
