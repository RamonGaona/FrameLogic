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
  it("moves or copies selected SNAP metadata without changing the saved origin", () => {
    const controller = Object.create(
      PieceDefinitionPreparationController.prototype,
    ) as PieceDefinitionPreparationController;
    const definition = {
      id: "d",
      coordinateSystem: {origin: {x:100,y:0,z:0},
        xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},zAxis:{x:0,y:0,z:1}},
      snapPoints: [
        {id:"origin",name:"Origen",type:"ORIGIN",position:{x:0,y:0,z:0}},
        {id:"snap1",name:"Snap 1",type:"CENTER",position:{x:20,y:0,z:0}},
      ],
      referenceGeometry:{axisLines:[]},
    };
    const replaceDefinition = vi.fn((value: typeof definition) => value);
    Reflect.set(controller,"pinnedReference",{kind:"SNAP",id:"snap1"});
    Reflect.set(controller,"requireContext",()=>({definition,object:new THREE.Object3D()}));
    Reflect.set(controller,"worldToDefinitionLocal",(p: THREE.Vector3)=>p.clone().sub(new THREE.Vector3(100,0,0)));
    Reflect.set(controller,"toData",(p: THREE.Vector3)=>({x:p.x,y:p.y,z:p.z}));
    Reflect.set(controller,"replaceDefinition",replaceDefinition);
    Reflect.set(controller,"notify",vi.fn());
    const moved=controller.relocatePinnedReference(new THREE.Vector3(150,0,0),false);
    expect(moved.snapPoints.find(x=>x.id==="snap1")?.position).toEqual({x:50,y:0,z:0});
    expect(moved.coordinateSystem.origin).toEqual({x:100,y:0,z:0});
    const copied=controller.relocatePinnedReference(new THREE.Vector3(180,0,0),true);
    expect(copied.snapPoints).toHaveLength(3);
    expect(copied.snapPoints[2]?.id).not.toEqual("snap1");
    expect(copied.snapPoints[2]?.position).toEqual({x:80,y:0,z:0});
    expect(copied.snapPoints.find(x=>x.id==="origin")?.type).toBe("ORIGIN");
  });

  it("moves or duplicates an axis preserving direction and length", () => {
    const controller = Object.create(PieceDefinitionPreparationController.prototype) as PieceDefinitionPreparationController;
    const definition = {
      id:"d",snapPoints:[],referenceGeometry:{axisLines:[
        {id:"axis1",name:"Eje",type:"REFERENCE",origin:{x:0,y:0,z:0},
          direction:{x:1,y:0,z:0},length:200},
      ]},
    };
    Reflect.set(controller,"pinnedReference",{kind:"AXIS",id:"axis1"});
    Reflect.set(controller,"requireContext",()=>({definition,object:new THREE.Object3D()}));
    Reflect.set(controller,"worldToDefinitionLocal",(p: THREE.Vector3)=>p);
    Reflect.set(controller,"toData",(p: THREE.Vector3)=>({x:p.x,y:p.y,z:p.z}));
    Reflect.set(controller,"replaceDefinition",(d: typeof definition)=>d);
    Reflect.set(controller,"notify",vi.fn());
    const updated=controller.relocatePinnedReference(new THREE.Vector3(20,50,0),true);
    expect(updated.referenceGeometry.axisLines).toHaveLength(2);
    expect(updated.referenceGeometry.axisLines[1]).toMatchObject({
      origin:{x:20,y:50,z:0},direction:{x:1,y:0,z:0},length:200,
    });
  });

  it("uses a chosen existing SNAP as ORIGIN without moving the original geometry", () => {
    const controller = Object.create(
      PieceDefinitionPreparationController.prototype,
    ) as PieceDefinitionPreparationController;
    const frame = {
      origin: {x:10,y:0,z:0}, xAxis:{x:1,y:0,z:0},
      yAxis:{x:0,y:1,z:0}, zAxis:{x:0,y:0,z:1},
    };
    const definition = {
      id:"def", coordinateSystem:frame,
      snapPoints:[
        {id:"snap-1",name:"Snap 1",type:"CENTER",position:{x:100,y:0,z:0}},
        {id:"previous-origin",name:"Origin",type:"ORIGIN",position:{x:0,y:0,z:0}},
      ],
      referenceGeometry:{axisLines:[]},
    };
    const object = new THREE.Object3D();
    object.position.set(500,0,0);
    const context = {definition, object};
    const setOrigin = vi.fn((world: THREE.Vector3) =>
      expect(world.toArray()).toEqual([610,0,0]));
    const rebased = {
      ...definition,
      coordinateSystem:{...frame,origin:{x:110,y:0,z:0}},
      snapPoints:[
        {...definition.snapPoints[0]!,position:{x:0,y:0,z:0}},
        {...definition.snapPoints[1]!,position:{x:-100,y:0,z:0}},
        {id:"generated-origin",name:"Origin",type:"ORIGIN",position:{x:0,y:0,z:0}},
      ],
    };
    const replaceDefinition = vi.fn((value: typeof rebased) => value);
    const notify = vi.fn();
    Reflect.set(controller,"requireContext",()=>context);
    Reflect.set(controller,"setOriginFromWorldPoint",setOrigin);
    Reflect.set(controller,"requireDefinition",()=>rebased);
    Reflect.set(controller,"replaceDefinition",replaceDefinition);
    Reflect.set(controller,"notify",notify);
    const updated = controller.setOriginFromSnapId("snap-1");
    expect(setOrigin).toHaveBeenCalledOnce();
    expect(updated.snapPoints).toHaveLength(1);
    expect(updated.snapPoints[0]).toMatchObject({
      id:"snap-1", type:"ORIGIN", position:{x:0,y:0,z:0},
    });
    expect(notify).toHaveBeenCalledOnce();
    expect(controller.getPinnedSnapId()).toBe("snap-1");
  });

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
