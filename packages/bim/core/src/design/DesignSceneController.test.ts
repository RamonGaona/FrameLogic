import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import { DesignSceneController } from "./DesignSceneController";
import { getPieceDetailGeometry } from "./PieceVisualGeometry";

// The scene test does not initialize CAD/WASM. Only identity transforms are
// needed by the domain registry; exact CAD is exercised by its own tests.
vi.mock("@framelogic/geometry", () => ({
  createIdentityTransform3D: () => ({
    position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  }),
}));

describe("piece representations in the model space", () => {
  it("changes only geometry, keeps references and transforms, and filters distant ray targets", () => {
    const model = new DesignModel();
    const scene = new DesignSceneController(new THREE.Scene(), model);
    const asset = model.registerAsset({ name: "source.step", format: "STEP" });
    const definition = model.registerPieceDefinition({ code: "P1", name: "P1", geometryAssetId: asset.id });
    const first = model.registerPieceInstance({ definitionId: definition.id });
    const second = model.registerPieceInstance({ definitionId: definition.id,
      transform: { position: { x: 1000, y: 0, z: 0 }, rotation: { x: 0.2, y: 0, z: 0 } } });
    const geometry = new THREE.SphereGeometry(100, 160, 120);
    geometry.deleteAttribute("uv");
    scene.registerAssetPrototype(asset.id, new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    const metadata = JSON.stringify(definition);
    scene.sync();
    const a = scene.getInstanceObject(first.id) as THREE.Mesh;
    const b = scene.getInstanceObject(second.id) as THREE.Mesh;
    expect(a.geometry).toBe(b.geometry);
    const original = getPieceDetailGeometry(a);
    const before = b.matrixWorld.clone();
    const dispose = vi.spyOn(original, "dispose");
    scene.setVisualLevel("LOW", [first.id]);
    expect(a.geometry).toBe(original);
    expect(b.geometry).not.toBe(original);
    expect(scene.getInstanceObject(second.id)).toBe(b);
    expect(b.matrixWorld.equals(before)).toBe(true);
    expect(JSON.stringify(definition)).toBe(metadata);
    const ray = new THREE.Ray(new THREE.Vector3(0, 0, 300), new THREE.Vector3(0, 0, -1));
    expect(scene.getRaycastInstanceObjects(ray)).toEqual([a]);
    scene.setVisualLevel("DETAIL");
    expect(b.geometry).toBe(original);
    scene.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
  it("uses the same automatic pastel color when the same STEP file gets a new asset id", () => {
    function importAsNewAsset(assetId: string): number {
      const model = new DesignModel();
      const controller = new DesignSceneController(new THREE.Scene(), model);
      model.registerAsset({ id: assetId, name: "Mprop_Configurable.step", format: "STEP" });
      const source = new THREE.Mesh(
        new THREE.BoxGeometry(20, 10, 5),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      controller.registerAssetPrototype(assetId, source);
      const material = source.material as THREE.MeshLambertMaterial;
      const color = material.color.getHex();
      controller.dispose();
      return color;
    }
    expect(importAsNewAsset("uuid-at-first-save")).toBe(
      importAsNewAsset("uuid-after-reopening-project"),
    );
  });
});
