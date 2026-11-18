import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { PrecisionBimCoreInstance } from "@framelogic/bim-core";
import { insertLinePositionDemo } from "./linePositionInsertDemo";
import type { LineFillPlan } from "./linePositionFillPlanner";

function fixture(withRealDefinition: boolean) {
  const scene=new THREE.Scene();
  const registered: Array<{id:string;definitionId:string;transform:{
    position:{x:number;y:number;z:number};rotation:{x:number;y:number;z:number}
  };layerId:string;tags:string[];name?:string}> = [];
  let counter=0;
  const definition={
    id:"def-1", code:"REC6000", geometryAssetId:"asset-1",
    coordinateSystem:{
      origin:{x:100,y:0,z:0},
      xAxis:{x:1,y:0,z:0},
    },
  };
  const recordOperation=vi.fn();
  const sync=vi.fn();
  const core={
    world:{scene:{three:scene}},
    designModel:{
      pieceDefinitions:{
        findByCode:(code:string)=>withRealDefinition&&code==="REC6000"?definition:undefined,
        getAll:()=>withRealDefinition?[definition]:[],
      },
      registerPieceInstance:(input: {
        id?:string;definitionId:string;name?:string;
        transform:typeof registered[number]["transform"];tags:string[];
      })=>{
        const instance={...input,id:input.id??"insert-"+ ++counter,layerId:"geometry",tags:input.tags};
        registered.push(instance);
        return instance;
      },
      removePieceInstance:(id:string)=>{
        const index=registered.findIndex(x=>x.id===id);
        if(index<0)return false;
        registered.splice(index,1);
        return true;
      },
    },
    designScene:{
      getAssetPrototype:()=>withRealDefinition?new THREE.Group():null,
      sync,
    },
    cadHistory:{recordOperation},
    designSelection:{clearSelection:vi.fn()},
  } as unknown as PrecisionBimCoreInstance;
  return {core,scene,registered,recordOperation,sync};
}
const plan:LineFillPlan={
  segments:[
    {code:"REC6000",position:1,lengthMm:6000,offsetMm:0,start:{x:0,y:500,z:0}},
    {code:"REC3000",position:2,lengthMm:3000,offsetMm:6000,start:{x:6000,y:500,z:0}},
  ],
  lineLengthMm:9000,occupiedMm:9000,remainingMm:0,capped:false,
};

describe("sequential demo placement",()=>{
  it("places real available definitions by the line with local origin offset and group undo/redo",()=>{
    const {core,registered,recordOperation}=fixture(true);
    const placed=insertLinePositionDemo(core,plan,{x:9000,y:500,z:0});
    expect(placed.realPieces).toBe(1);
    expect(placed.temporaryReferences).toBe(1);
    expect(registered[0]?.transform.position).toEqual({x:-100,y:500,z:0});
    expect(registered[0]?.tags).toContain("LINE_POSITION_DEMO");
    expect(recordOperation).toHaveBeenCalledOnce();
    const [,undo,redo]=recordOperation.mock.calls[0] as [string,()=>void,()=>void];
    undo();expect(registered).toHaveLength(0);
    redo();expect(registered).toHaveLength(1);
    placed.clearTemporaryReferences();
    expect(registered).toHaveLength(1);
  });
  it("in strict mode rejects incomplete real geometry before inserting any piece",()=>{
    const {core,registered,recordOperation,scene}=fixture(true);
    expect(()=>insertLinePositionDemo(core,plan,{x:9000,y:500,z:0},{
      requireRealGeometry:true,
    })).toThrow(/REC3000/);
    expect(registered).toHaveLength(0);
    expect(recordOperation).not.toHaveBeenCalled();
    expect(scene.children).toHaveLength(0);
  });
  it("creates no temporary references when all codes have real loaded geometry",()=>{
    const {core,registered}=fixture(true);
    const pieces=core.designModel.pieceDefinitions as unknown as {
      getAll:()=>Array<{id:string;code:string;geometryAssetId:string;coordinateSystem:{
        origin:{x:number;y:number;z:number};xAxis:{x:number;y:number;z:number};
      }}>;
    };
    const originals=pieces.getAll();
    pieces.getAll=()=>[...originals,{
      id:"def-2",code:"REC3000",geometryAssetId:"asset-2",
      coordinateSystem:{origin:{x:0,y:0,z:0},xAxis:{x:1,y:0,z:0}},
    }];
    const result=insertLinePositionDemo(core,plan,{x:9000,y:500,z:0},{
      requireRealGeometry:true,
    });
    expect(result.realPieces).toBe(2);
    expect(result.temporaryReferences).toBe(0);
    expect(registered).toHaveLength(2);
  });
  it("uses visible temporary 3D references for unavailable assets without adding fake definitions",()=>{
    const {core,scene,registered,recordOperation}=fixture(false);
    const placed=insertLinePositionDemo(core,plan,{x:9000,y:500,z:0});
    expect(placed.realPieces).toBe(0);
    expect(placed.temporaryReferences).toBe(2);
    expect(registered).toHaveLength(0);
    expect(recordOperation).not.toHaveBeenCalled();
    const preview=scene.children.find(x=>x.name.includes("referencias no guardables"));
    expect(preview?.children).toHaveLength(2);
    expect(preview?.children[1]?.position.x).toBe(6000);
    placed.clearTemporaryReferences();
    expect(preview?.parent).toBeNull();
  });
});
