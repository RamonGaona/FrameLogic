import { describe, expect, it } from "vitest";
import {
  indexChosenFLPieceFiles, indexFLPieceDirectory,
  type FLPieceDirectoryHandle, type FLPieceFileHandle,
} from "./flpieceDirectoryHandleStore";

const flFile=(name:string)=>({name,size:1000}) as File;

describe("FLPIECE folder lookups",()=>{
  it("indexes folder files by code regardless of filename case and ignores other files",async()=>{
    const file=(name:string):FLPieceFileHandle=>({
      kind:"file",name,getFile:async()=>flFile(name),
    });
    const directory={
      kind:"directory",name:"FLPIECE",
      entries:async function*() {
        yield ["Rec6000.FLPiEce",file("Rec6000.FLPiEce")] as [string,FLPieceFileHandle];
        yield ["REC3000.flpiece",file("REC3000.flpiece")] as [string,FLPieceFileHandle];
        yield ["readme.json",file("readme.json")] as [string,FLPieceFileHandle];
      },
    } as FLPieceDirectoryHandle;
    const indexed=await indexFLPieceDirectory(directory);
    expect([...indexed.keys()]).toEqual(["REC6000","REC3000"]);
    expect((await indexed.get("REC6000")!.getFile()).name).toBe("Rec6000.FLPiEce");
  });
  it("rejects ambiguous file names that share the same code",()=>{
    expect(()=>indexChosenFLPieceFiles([
      flFile("Rec1500.flpiece"),flFile("REC1500.FLPiEce"),
    ])).toThrow(/duplicado/);
  });
  it("can use individual .flpiece files when directory picking is unavailable",()=>{
    const selected=indexChosenFLPieceFiles([
      flFile("REC1500.flpiece"),flFile("REC3000.flpiece"),
      flFile("REC6000.flpiece"),flFile("ignore.json"),
    ]);
    expect([...selected.keys()]).toEqual(["REC1500","REC3000","REC6000"]);
  });
});
