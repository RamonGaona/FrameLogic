import { describe,expect,it } from "vitest";
import {
  closeGlobalSlotFlat, freeFamilies, insertFlatItem, insertGlobalSlotFlat,
  markFlatPositionsModified, migrateLegacyPositions, moveGlobalRangeFlat,
  newFlatPositionsFile, overlapIndices, readPositionRange, readPositionsDocument,
  serializeFlatPositionsFile, updateFlatItem, validateFlatPositionsFile,
  type FlatPositionsFile,
} from "./positionsFlatCatalog";
import { type PositionsFile } from "./positionsCatalog";

const example=():FlatPositionsFile=>({
  schemaVersion:2,version:"1.0.0",
  fecha_modificacion:"",usuario_modificacion:"",
  items:[
    {posicion:"31-49",codigo:"PEB95400",familias:["MP","P4L"]},
    {posicion:70,codigo:"MSX10011",familias:["MP"]},
    {posicion:90,codigo:"MSB20007",familias:["P4L","P6"]},
    {posicion:"100-110",codigo:"PEB93000",familias:["Cliente X"]},
  ],
});
describe("universal POSITIONS v2, position/code/free-text families",()=>{
  it("contains exactly three keys on each record and four sample items",()=>{
    const file=example();
    expect(file.items).toHaveLength(4);
    expect(file.items[0]?.familias).toEqual(["MP","P4L"]);
    expect(readPositionsDocument(serializeFlatPositionsFile(file))).toEqual({
      kind:"flat",file,originalText:serializeFlatPositionsFile(file),
    });
    expect(Object.keys(file.items[0]!)).toEqual(["posicion","codigo","familias"]);
  });
  it("accepts arbitrary client names and deduplicates pasted comma-separated families",()=>{
    expect(freeFamilies("INCYE, Cliente Norte, incye; Grupo A\nGrupo B"))
      .toEqual(["INCYE","Cliente Norte","Grupo A","Grupo B"]);
    expect(updateFlatItem(example(),1,{familias:["Cliente 2027","Personalizada"]})
      .items[1]?.familias).toEqual(["Cliente 2027","Personalizada"]);
    expect(validateFlatPositionsFile({
      schemaVersion:2,items:[{posicion:11,codigo:"X",familias:[]}],
    }).items[0]?.familias).toEqual([]);
  });
  it("reads whole numbers and inclusive intervals",()=>{
    expect(readPositionRange("31 - 49")).toEqual({from:31,to:49});
    expect(readPositionRange(90)).toEqual({from:90,to:90});
    expect(()=>readPositionRange("49-31")).toThrow(/rango/i);
    expect(()=>readPositionRange("a-b")).toThrow(/inválida/i);
  });
  it("does not require codes to exist in DB (link planned for later)",()=>{
    const file=insertFlatItem(example(),{posicion:175,codigo:"CODIGO_CLIENTE",familias:["Local"]});
    expect(file.items.at(-1)?.codigo).toBe("CODIGO_CLIENTE");
  });
  it("identifies overlapping positions without treating them as invalid",()=>{
    const file=insertFlatItem(example(),{posicion:40,codigo:"OTRA",familias:["Otra familia"]});
    expect(overlapIndices(file,0)).toEqual([4]);
    expect(overlapIndices(file,4)).toEqual([0]);
  });
  it("inserts a new slot 40 and splits 31-49 without losing code or families",()=>{
    const next=insertGlobalSlotFlat(example(),40,{codigo:"NUEVO",familias:["Cualquier cliente"]});
    expect(next.items.map(x=>x.posicion)).toContain("31-39");
    expect(next.items.map(x=>x.posicion)).toContain("41-50");
    expect(next.items.at(-1)).toEqual({posicion:40,codigo:"NUEVO",familias:["Cualquier cliente"]});
    expect(next.items.filter(x=>x.codigo==="PEB95400")).toHaveLength(2);
    expect(next.items.filter(x=>x.codigo==="PEB95400")[1]?.familias).toEqual(["MP","P4L"]);
  });
  it("moves complete ranges globally preserving families of all affected items",()=>{
    const file=example();
    const moved=moveGlobalRangeFlat(file,31,49,60);
    const original=moved.items.find(x=>x.codigo==="PEB95400");
    expect(original?.posicion).toBe("60-78");
    expect(original?.familias).toEqual(["MP","P4L"]);
    expect(file.items[0]?.posicion).toBe("31-49");
  });
  it("deleting a shared slot does not close it globally until unshared",()=>{
    const file=insertFlatItem(example(),{posicion:70,codigo:"ALTERNATIVO",familias:["A"]});
    expect(()=>closeGlobalSlotFlat(file,1)).toThrow(/compartida/);
    const next=closeGlobalSlotFlat(example(),1);
    expect(next.items.find(x=>x.codigo==="MSB20007")?.posicion).toBe(89);
  });
  it("migrates original family-centric v1 only through explicit user action",()=>{
    const legacy:PositionsFile={schemaVersion:1,families:[
      {family:"MP",positions:[{from:31,to:49,components:[{
        code:"PEB95400",name:"Marco",priority:1,
        lengthMm:5400,openingMinMm:null,openingMaxMm:null,
        angleMinDeg:null,angleMaxDeg:null,notes:null,
      }]}]},
      {family:"Empresa B",positions:[{from:31,to:49,components:[{
        code:"PEB95400",name:"Marco",priority:1,
        lengthMm:5400,openingMinMm:null,openingMaxMm:null,
        angleMinDeg:null,angleMaxDeg:null,notes:null,
      }]}]},
    ]};
    const text=JSON.stringify(legacy);
    expect(readPositionsDocument(text).kind).toBe("legacy");
    const next=migrateLegacyPositions(legacy);
    expect(next.items).toEqual([{
      posicion:"31-49",codigo:"PEB95400",familias:["MP","Empresa B"],
    }]);
    expect(JSON.parse(text)).toEqual(legacy);
  });
  it("updates the audit stamp at save only and keeps schema version independent",()=>{
    const before=example();
    const after=markFlatPositionsModified(before,new Date("2026-11-16T17:00:00.000Z"));
    expect(after.fecha_modificacion).toBe("2026-11-16T17:00:00.000Z");
    expect(before.fecha_modificacion).toBe("");
    expect(newFlatPositionsFile().schemaVersion).toBe(2);
  });
  it("rejects obsolete v1 records as v2 without explicit migration",()=>{
    expect(()=>validateFlatPositionsFile({schemaVersion:1,families:[]})).toThrow(/schemaVersion: 2/);
    expect(()=>validateFlatPositionsFile({schemaVersion:2,items:[{
      posicion:100,codigo:"X",familias:["MP"],name:"Duplicado de DB",
    }]})).toThrow(/solo tiene/);
  });
});
