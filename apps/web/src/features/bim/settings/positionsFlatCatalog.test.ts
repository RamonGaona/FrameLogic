import { describe,expect,it } from "vitest";
import {
  closeGlobalSlotFlat, combineFlatRanges, duplicateFlatItem,
  freeFamilies, insertFlatItem, insertGlobalSlotFlat,
  markFlatPositionsModified, migrateLegacyPositions, moveGlobalRangeFlat,
  newFlatPositionsFile, overlapIndices, readPositionRange, readPositionsDocument,
  serializeFlatPositionsFile, sharedPositionFlags, splitFlatRange,
  updateFlatItem, validateFlatPositionsFile,
  type FlatPositionsFile,
} from "./positionsFlatCatalog";
import { type PositionsFile } from "./positionsCatalog";

const example=():FlatPositionsFile=>({
  version:"1.0.0",
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
      items:[{posicion:11,codigo:"X",familias:[]}],
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
  it("marks every overlapping row with global interval sweep",()=>{
    const file=insertFlatItem(example(),{posicion:40,codigo:"OTRA",familias:["Cliente"]});
    expect(sharedPositionFlags(file)).toEqual([true,false,false,false,true]);
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
  it("duplicates an item with all its free-text families",()=>{
    const copy=duplicateFlatItem(example(),0);
    expect(copy.items[1]).toEqual({
      posicion:"111-129",codigo:"PEB95400",familias:["MP","P4L"],
    });
  });
  it("splits and combines a range without losing its code and families",()=>{
    const split=splitFlatRange(example(),0,40);
    expect(split.items[0]).toEqual({
      posicion:"31-39",codigo:"PEB95400",familias:["MP","P4L"],
    });
    expect(split.items[1]).toEqual({
      posicion:"40-49",codigo:"PEB95400",familias:["MP","P4L"],
    });
    const combined=combineFlatRanges(split,0);
    expect(combined.items.some(x=>x.codigo==="PEB95400"&&x.posicion==="31-49")).toBe(true);
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
  it("reads the old flat marker but always exports JSON without schemaVersion",()=>{
    const legacyFlat={
      schemaVersion:2,version:"1.0.0",fecha_modificacion:"",
      usuario_modificacion:"",items:example().items,
    };
    const parsed=readPositionsDocument(JSON.stringify(legacyFlat));
    expect(parsed.kind).toBe("flat");
    if(parsed.kind!=="flat")return;
    expect(parsed.file).not.toHaveProperty("schemaVersion");
    expect(JSON.parse(serializeFlatPositionsFile(parsed.file))).not.toHaveProperty("schemaVersion");
    expect(parsed.file.items).toEqual(example().items);
    expect(legacyFlat).toHaveProperty("schemaVersion",2);
  });
  it("accepts flat files with no marker and preserves their items",()=>{
    const bare={items:example().items};
    const normalized=validateFlatPositionsFile(bare);
    expect(normalized.items).toEqual(example().items);
    expect(JSON.parse(serializeFlatPositionsFile(normalized))).toEqual(bare);
  });
  it("updates the audit stamp at save only and keeps schema version independent",()=>{
    const before=example();
    const after=markFlatPositionsModified(before,new Date("2026-11-16T17:00:00.000Z"));
    expect(after.fecha_modificacion).toBe("2026-11-16T17:00:00.000Z");
    expect(before.fecha_modificacion).toBe("");
    expect(newFlatPositionsFile()).not.toHaveProperty("schemaVersion");
  });
  it("adds missing audit fields on successful save without changing items",()=>{
    const old={items:[
      {posicion:90,codigo:"MSB20007",familias:["P4L","P6"]},
    ]};
    const loaded=validateFlatPositionsFile(old);
    expect(loaded.version).toBeUndefined();
    const saved=markFlatPositionsModified(loaded,new Date("2026-11-16T21:32:00Z"));
    expect(saved.version).toBe("1.0.0");
    expect(saved.fecha_modificacion).toBe("2026-11-16T21:32:00.000Z");
    expect(saved.usuario_modificacion).toBe("");
    expect(saved.items).toEqual(old.items);
    expect(old).not.toHaveProperty("version");
  });
  it("keeps a manually edited JSON version while leaving modifier blank",()=>{
    const before={...example(),version:"2.4.1",usuario_modificacion:"old-name"};
    const saved=markFlatPositionsModified(before,new Date("2026-11-16T21:32:00Z"));
    expect(saved.version).toBe("2.4.1");
    expect(saved.usuario_modificacion).toBe("");
    expect(before.usuario_modificacion).toBe("old-name");
  });
  it("rejects obsolete v1 records as v2 without explicit migration",()=>{
    expect(()=>validateFlatPositionsFile({schemaVersion:1,families:[]})).toThrow(/items válida/);
    expect(()=>validateFlatPositionsFile({items:[{
      posicion:100,codigo:"X",familias:["MP"],name:"Duplicado de DB",
    }]})).toThrow(/solo tiene/);
  });
});
