import { describe, expect, it, vi } from "vitest";
import type { PrecisionBimCoreInstance } from "@framelogic/bim-core";
import type { LineFillPlan } from "./linePositionFillPlanner";
import { ensureLineFLPieceDefinitions } from "./lineFLPieceAutoLoader";

vi.mock("@framelogic/bim-core",()=>({
  loadPieceVisualPackage:vi.fn(),
}));
vi.mock("./step/OcctStepGeometryAdapter",()=>({
  OcctStepGeometryAdapter:class {
    load=vi.fn(async()=>({dummy:"STEP geometry loaded"}));
  },
}));
vi.mock("./pieces/FrameLogicPiecePackage",()=>({
  parseFrameLogicPiecePackage:(text:string)=>JSON.parse(text),
  decodeFrameLogicPieceGeometry:()=>new Uint8Array([1,2,3]),
}));

const plan:LineFillPlan={
  segments:[
    {code:"REC6000",position:1,lengthMm:6000,offsetMm:0,start:{x:0,y:0,z:0}},
    {code:"REC3000",position:2,lengthMm:3000,offsetMm:6000,start:{x:6000,y:0,z:0}},
    {code:"REC1500",position:3,lengthMm:1500,offsetMm:9000,start:{x:9000,y:0,z:0}},
    {code:"REC6000",position:1,lengthMm:6000,offsetMm:10500,start:{x:10500,y:0,z:0}},
  ],
  lineLengthMm:20000,occupiedMm:16500,remainingMm:3500,capped:false,
};
function file(code:string,actualCode=code):File {
  return {
    name:code+".flpiece",size:1024,
    text:async()=>JSON.stringify({
      definition:{
        code:actualCode,name:actualCode,classification:"Large",tags:[],
        coordinateSystem:{
          origin:{x:133,y:0,z:81},
          xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},zAxis:{x:0,y:0,z:1},
        },
        snapPoints:[{id:"origin-"+actualCode,name:"Origin",type:"ORIGIN",
          position:{x:0,y:0,z:0}}],
        referenceGeometry:{axisLines:[]},
      },
      geometry:{format:"STEP",fileName:actualCode+".stp",dataBase64:"aGVsbG8="},
      engineering:{features:[]},
    }),
  } as File;
}
function mockCore() {
  const definitions:Array<{id:string;code:string;geometryAssetId:string}>=[];
  const metadata=vi.fn();
  const snap=vi.fn();
  const axis=vi.fn();
  const engineering=vi.fn();
  const importStepPiece=vi.fn((_document:unknown,identity:{code:string})=>{
    const def={id:"def-"+identity.code,code:identity.code,
      geometryAssetId:"asset-"+identity.code};
    definitions.push(def);
    return {definition:def};
  });
  const createInstance=vi.fn();
  const core={
    designModel:{
      pieceDefinitions:{
        getAll:()=>definitions,
        updateCoordinateSystem:metadata,
        addSnapPoint:snap,
        addReferenceAxisLine:axis,
      },
    },
    designScene:{getAssetPrototype:()=>({id:"loaded"})},
    engineeringModel:{pieces:{upsert:engineering}},
    geometryQuery:{clearCache:vi.fn()},
    importStepPiece,
    importDesignPieceIfc:vi.fn(),
    createDesignPieceInstance:createInstance,
  } as unknown as PrecisionBimCoreInstance;
  return {core,definitions,metadata,snap,axis,engineering,importStepPiece,createInstance};
}
describe("auto-loading READY .flpiece for line demo",()=>{
  it("loads each distinct code once, restores prepared origin and SNAP, creates no initial instances",async()=>{
    const f=mockCore();
    const result=await ensureLineFLPieceDefinitions(f.core,plan,{
      directory:null,selectedFiles:[file("REC1500"),file("REC6000"),file("REC3000")],
    });
    expect(result).toEqual({imported:["REC6000","REC3000","REC1500"],reused:0});
    expect(f.importStepPiece).toHaveBeenCalledTimes(3);
    expect(f.metadata).toHaveBeenCalledTimes(3);
    expect(f.metadata).toHaveBeenCalledWith("def-REC6000",expect.objectContaining({
      origin:{x:133,y:0,z:81},
    }),false);
    expect(f.snap).toHaveBeenCalledTimes(3);
    expect(f.engineering).toHaveBeenCalledTimes(3);
    expect(f.createInstance).not.toHaveBeenCalled();
  });
  it("reuses all available definitions without opening file picker or importing geometry",async()=>{
    const f=mockCore();
    for(const code of ["REC6000","REC3000","REC1500"]){
      f.definitions.push({id:"def-"+code,code,geometryAssetId:"asset-"+code});
    }
    const result=await ensureLineFLPieceDefinitions(f.core,plan,{
      directory:null,selectedFiles:[],
    });
    expect(result).toEqual({imported:[],reused:3});
    expect(f.importStepPiece).not.toHaveBeenCalled();
  });
  it("fails before importing anything if an expected file is missing",async()=>{
    const f=mockCore();
    await expect(ensureLineFLPieceDefinitions(f.core,plan,{
      directory:null,selectedFiles:[file("REC6000")],
    })).rejects.toThrow(/Falta REC3000.flpiece/);
    expect(f.importStepPiece).not.toHaveBeenCalled();
  });
  it("rejects filename versus embedded code mismatch before modifying the model",async()=>{
    const f=mockCore();
    await expect(ensureLineFLPieceDefinitions(f.core,plan,{
      directory:null,selectedFiles:[
        file("REC6000","OTRO"),file("REC3000"),file("REC1500"),
      ],
    })).rejects.toThrow(/se esperaba REC6000/);
    expect(f.importStepPiece).not.toHaveBeenCalled();
  });
});
