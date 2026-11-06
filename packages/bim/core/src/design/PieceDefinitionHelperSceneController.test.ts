import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
vi.mock("@framelogic/domain", () => ({
  DEFAULT_DESIGN_LAYER_IDS: { SNAP_MANUAL: "snaps", REFERENCE_AXES: "axes" },
}));
import { PieceDefinitionHelperSceneController } from "./PieceDefinitionHelperSceneController";

function fixture(editing = true) {
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
  if (editing) controller.setActiveInstanceId("piece");
  return { controller, scene, overlay: scene.getObjectByName("FrameLogicPieceReferenceFocusOverlay") as THREE.Group };
}

describe("general reference visibility", () => {
  it("starts hidden in Model Space, permits temporary hover and restores hidden state", () => {
    const { controller, scene } = fixture(false);
    const snaps = scene.getObjectByName("FrameLogicPieceDefinitionSnapHelpers") as THREE.Group;
    const axes = scene.getObjectByName("FrameLogicPieceDefinitionAxisHelpers") as THREE.Group;
    expect(snaps.visible).toBe(false);
    expect(axes.visible).toBe(false);
    controller.setTemporaryReferenceHover("piece");
    expect(snaps.visible).toBe(true);
    expect(axes.visible).toBe(true);
    controller.setTemporaryReferenceHover(null);
    expect(snaps.visible).toBe(false);
    expect(axes.visible).toBe(false);
    controller.setGeneralReferenceVisibility(true, false);
    expect(snaps.visible).toBe(true);
    expect(axes.visible).toBe(false);
    controller.dispose();
  });

  it("always shows references while editing a piece", () => {
    const { controller, scene } = fixture(true);
    controller.setGeneralReferenceVisibility(false, false);
    expect((scene.getObjectByName("FrameLogicPieceDefinitionSnapHelpers") as THREE.Group).visible).toBe(true);
    expect((scene.getObjectByName("FrameLogicPieceDefinitionAxisHelpers") as THREE.Group).visible).toBe(true);
    controller.dispose();
  });
});

describe("visible persistent-reference focus overlay", () => {
  it("hides general SNAP/axis helpers independently of precision, previews on hover and restores in editor", () => {
    const { controller, overlay } = fixture();
    const scene = overlay.parent as THREE.Scene;
    const snaps = scene.getObjectByName("FrameLogicPieceDefinitionSnapHelpers")!;
    const axes = scene.getObjectByName("FrameLogicPieceDefinitionAxisHelpers")!;
    // Preparation mode always has reference visibility even if general is hidden.
    controller.setGeneralReferenceVisibility(false, false);
    expect(snaps.visible).toBe(true);
    expect(axes.visible).toBe(true);
    controller.setActiveInstanceId(null);
    expect(snaps.visible).toBe(false);
    expect(axes.visible).toBe(false);
    controller.setTemporaryReferenceHover("piece");
    expect(snaps.visible).toBe(true);
    expect(axes.visible).toBe(true);
    controller.setTemporaryReferenceHover(null);
    expect(snaps.visible).toBe(false);
    expect(axes.visible).toBe(false);
    controller.setGeneralReferenceVisibility(true, false);
    expect(snaps.visible).toBe(true);
    expect(axes.visible).toBe(false);
    controller.dispose();
  });


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
