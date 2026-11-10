import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { CadCopyController } from "./CadCopyController";

describe("COPY command: source selection -> base -> destination", () => {
  it("copies a selected assembly by 3D delta without moving its original", async () => {
    const model = new DesignModel();
    const asset = model.registerAsset({name:"viga.step",format:"STEP"});
    const definition = model.registerPieceDefinition({
      name:"Viga",code:"V",geometryAssetId:asset.id,
    });
    const a = model.registerPieceInstance({
      definitionId: definition.id,
      transform:{position:{x:100,y:200,z:300},rotation:{x:0,y:0,z:0}},
    });
    const b = model.registerPieceInstance({definitionId:definition.id});
    const assembly = model.registerAssembly({
      name:"Vigas",pieceInstanceIds:[a.id,b.id],
    });
    const objects = new Map<string, THREE.Object3D>();
    const scene = {
      sync: vi.fn(() => {
        for (const piece of model.pieceInstances.getAll()) {
          if (!objects.has(piece.id)) objects.set(piece.id, new THREE.Object3D());
        }
        for (const id of [...objects.keys()]) {
          if (!model.pieceInstances.get(id)) objects.delete(id);
        }
      }),
      getInstanceObject: (id: string) => objects.get(id),
    };
    scene.sync();
    const setSelection = vi.fn();
    const onCopiedAssemblySelection = vi.fn();
    const recordOperation = vi.fn();
    const cancel = vi.fn();
    const setStatus = vi.fn();
    const clearGeometryQueryCache = vi.fn();
    const copy = Object.assign(
      Object.create(CadCopyController.prototype) as object,
      {
        options: {
          designModel:model, designScene:scene,
          designSelection:{setSelection}, history:{recordOperation},
          onCopiedAssemblySelection, clearGeometryQueryCache,
        },
        sourcePieceIds:[a.id,b.id],
        sourceAssemblyIds:[assembly.id],
        cancel, setStatus,
      },
    ) as unknown as {commitPieceCopy:(delta:THREE.Vector3)=>void};

    copy.commitPieceCopy(new THREE.Vector3(250,-100,500));
    await Promise.resolve();
    expect(model.pieceInstances.count).toBe(4);
    expect(model.assemblies.count).toBe(2);
    expect(model.pieceInstances.get(a.id)?.transform.position).toEqual({x:100,y:200,z:300});
    const duplicated = model.assemblies.getAll().find((x)=>x.id !== assembly.id)!;
    const newA = duplicated.pieceInstanceIds.map((id)=>model.pieceInstances.get(id)!)
      .find((p)=>p.transform.position.x===350)!;
    expect(newA.transform.position).toEqual({x:350,y:100,z:800});
    expect(recordOperation).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(onCopiedAssemblySelection).toHaveBeenCalledWith([duplicated.id]);
    expect(clearGeometryQueryCache).toHaveBeenCalledOnce();
  });
});
