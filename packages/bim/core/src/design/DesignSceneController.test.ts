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
  it("renders the saved FrameLogic origin at editor XYZ zero and restores placement on exit", () => {
    const model = new DesignModel();
    const scene = new DesignSceneController(new THREE.Scene(), model);
    const asset = model.registerAsset({name:"component.step",format:"STEP"});
    const definition = model.registerPieceDefinition({
      code:"P-LOCAL",name:"Local",geometryAssetId:asset.id,
      coordinateSystem:{
        origin:{x:1500,y:0,z:0},
        xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},zAxis:{x:0,y:0,z:1},
      },
    });
    const instance=model.registerPieceInstance({definitionId:definition.id,transform:{
      position:{x:900,y:300,z:0},rotation:{x:0,y:0,z:0},
    }});
    scene.registerAssetPrototype(asset.id,new THREE.Mesh(
      new THREE.BoxGeometry(200,100,100),new THREE.MeshBasicMaterial(),
    ));
    scene.sync();
    const object=scene.getInstanceObject(instance.id)!;
    const before=object.matrixWorld.clone();
    scene.setIsolatedPieceWorkspaceInstanceId(instance.id);
    expect(new THREE.Vector3(1500,0,0).applyMatrix4(object.matrixWorld).length()).toBeLessThan(1e-8);
    scene.setVisualLevel("LOW"); // sync must not reset the isolated frame
    expect(new THREE.Vector3(1500,0,0).applyMatrix4(object.matrixWorld).length()).toBeLessThan(1e-8);
    scene.setIsolatedPieceWorkspaceInstanceId(null);
    expect(object.matrixWorld.equals(before)).toBe(true);
    expect(model.pieceInstances.get(instance.id)?.transform.position).toEqual({x:900,y:300,z:0});
    scene.dispose();
  });

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
    const boundsBefore = scene.getInstanceWorldBounds(second.id)!;
    scene.setVisualLevel("WORK", [], new Map([
      [first.id, "LOW"], [second.id, "DETAIL"],
    ]));
    expect(a.geometry).not.toBe(original);
    expect(b.geometry).toBe(original);
    expect(scene.getInstanceWorldBounds(second.id)!.equals(boundsBefore)).toBe(true);
    // Adaptation controls visual geometry only, not picking precision.
    expect(getPieceDetailGeometry(a)).toBe(original);
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
      const material = source.material as unknown as THREE.MeshLambertMaterial;
      const color = material.color.getHex();
      controller.dispose();
      return color;
    }
    expect(importAsNewAsset("uuid-at-first-save")).toBe(
      importAsNewAsset("uuid-after-reopening-project"),
    );
  });
});
