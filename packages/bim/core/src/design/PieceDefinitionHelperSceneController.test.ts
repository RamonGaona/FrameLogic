import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
vi.mock("@framelogic/domain", () => ({
  DEFAULT_DESIGN_LAYER_IDS: { SNAP_MANUAL: "snaps", REFERENCE_AXES: "axes" },
}));
import { PieceDefinitionHelperSceneController } from "./PieceDefinitionHelperSceneController";

function fixture() {
  const scene = new THREE.Scene();
  const object = new THREE.Object3D();
  const definition = {
    id: "def",
    coordinateSystem: {
      origin: { x: 0, y: 0, z: 0 },
      xAxis: { x: 1, y: 0, z: 0 },
      yAxis: { x: 0, y: 1, z: 0 },
      zAxis: { x: 0, y: 0, z: 1 },
    },
    snapPoints: [{ id: "snap-1", position: { x: 20, y: 5, z: 0 }, type: "CUSTOM" }],
    referenceGeometry: { axisLines: [{ id: "axis-1",
      origin: { x: 0, y: 0, z: 0 }, direction: { x: 1, y: 0, z: 0 }, length: 200 }] },
  };
  const model = {
    layers: { get: () => ({ visible: true }) },
    pieceInstances: { getAll: () => [{ id: "piece" }],
      get: () => ({ id: "piece", definitionId: "def" }) },
    pieceDefinitions: { get: () => definition },
  };
  type Args = ConstructorParameters<typeof PieceDefinitionHelperSceneController>;
  const controller = new PieceDefinitionHelperSceneController(
    scene, model as unknown as Args[1],
    { getInstanceObject: () => object } as unknown as Args[2],
  );
  controller.setActiveInstanceId("piece");
  return { controller, overlay: scene.getObjectByName("FrameLogicPieceReferenceFocusOverlay") as THREE.Group };
}

describe("visible persistent-reference focus overlay", () => {
  it("places a prominent marker at an exact snap coordinate", () => {
    const { controller, overlay } = fixture();
    controller.setHighlightedReference({ kind: "SNAP", id: "snap-1" });
    expect(overlay.children).toHaveLength(2);
    expect(overlay.children[0]).toBeInstanceOf(THREE.Points);
    expect(overlay.children[0]?.position.toArray()).toEqual([20, 5, 0]);
    controller.dispose();
  });
  it("highlights an axis and clears the overlay when focus is removed", () => {
    const { controller, overlay } = fixture();
    controller.setHighlightedReference({ kind: "AXIS", id: "axis-1" });
    expect(overlay.children.some(child => child instanceof THREE.Mesh)).toBe(true);
    expect(overlay.children.filter(child => child instanceof THREE.Points)).toHaveLength(2);
    controller.setHighlightedReference(null);
    expect(overlay.children).toHaveLength(0);
    controller.dispose();
  });
  it("ignores a missing reference without generating geometry", () => {
    const { controller, overlay } = fixture();
    controller.setHighlightedReference({ kind: "SNAP", id: "missing" });
    expect(overlay.children).toHaveLength(0);
    controller.dispose();
  });
});
