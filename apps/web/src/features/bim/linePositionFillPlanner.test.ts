import { describe, expect, it } from "vitest";
import { planLinePositionFill, recordLengthMm } from "./linePositionFillPlanner";
import type { FrameLogicCatalog } from "./settings/frameLogicCatalog";
import type { FlatPositionsFile } from "./settings/positionsFlatCatalog";

const catalog = ():FrameLogicCatalog=>({
  version:"1.0.0",registros:[
    {codigo:"REC6000",nombre:"Tubo_6000",longitud:6000},
    {codigo:"REC3000",descripcion:{Longitud:3000}},
    {codigo:"REC1500",detalle:{longitud_mm:"1500"}},
  ],
});
const positions=():FlatPositionsFile=>({
  version:"1.0.0",fecha_modificacion:"",usuario_modificacion:"",
  items:[
    {posicion:3,codigo:"REC1500",familias:["MP"],activo_general:true,activo_proyecto:false,activo_puntal:true},
    {posicion:1,codigo:"REC6000",familias:["MP","P4L"],activo_general:true,activo_proyecto:true,activo_puntal:true},
    {posicion:2,codigo:"REC3000",familias:["MP"],activo_general:true,activo_proyecto:true,activo_puntal:false},
  ],
});
const line=(end=21000)=>({start:{x:0,y:0,z:0},end:{x:end,y:0,z:0}});

describe("provisional insertion by line and positions",()=>{
  it("repeats sorted position order, never stretching or cutting pieces",()=>{
    const plan=planLinePositionFill(line(),positions(),catalog());
    expect(plan.segments.map(s=>s.code)).toEqual([
      "REC6000","REC3000","REC1500","REC6000","REC3000","REC1500",
    ]);
    expect(plan.occupiedMm).toBe(21000);
    expect(plan.remainingMm).toBe(0);
    expect(plan.segments.map(s=>s.offsetMm)).toEqual([0,6000,9000,10500,16500,19500]);
  });
  it("stops when next item does not fit and reports the leftover",()=>{
    const plan=planLinePositionFill(line(12000),positions(),catalog());
    expect(plan.segments.map(s=>s.code)).toEqual(["REC6000","REC3000","REC1500"]);
    expect(plan.remainingMm).toBe(1500);
  });
  it("uses selected 3D line direction, including reversed lines",()=>{
    const reversed={start:{x:20000,y:0,z:700},end:{x:0,y:0,z:700}};
    const plan=planLinePositionFill(reversed,positions(),catalog());
    expect(plan.segments[0]?.start).toEqual(reversed.start);
    expect(plan.segments[1]?.start).toEqual({x:14000,y:0,z:700});
    expect(plan.segments[2]?.start).toEqual({x:11000,y:0,z:700});
  });
  it("filters independently using general, project, and puntal flags",()=>{
    const general=planLinePositionFill(line(),positions(),catalog(),"activo_general");
    const project=planLinePositionFill(line(),positions(),catalog(),"activo_proyecto");
    const puntal=planLinePositionFill(line(),positions(),catalog(),"activo_puntal");
    expect(general.segments.map(x=>x.code).slice(0,3)).toEqual(["REC6000","REC3000","REC1500"]);
    expect(project.segments.some(x=>x.code==="REC1500")).toBe(false);
    expect(puntal.segments.some(x=>x.code==="REC3000")).toBe(false);
  });
  it("ignores unrelated catalog numerics, resolves nested lenght and rejects ambiguity",()=>{
    expect(recordLengthMm({codigo:"TEST",peso:10,medidas:{LONGITUD:"6000"}})).toBe(6000);
    expect(()=>recordLengthMm({codigo:"TEST",longitud:6000,otros:{longitud:3000}}))
      .toThrow(/varias longitudes/);
    expect(recordLengthMm({codigo:"TEST",longitud:"6 m"})).toBeNull();
  });
  it("refuses unknown codes and missing/invalid length instead of guessing",()=>{
    const missing=positions();
    missing.items[0]!.codigo="DESCONOCIDO";
    expect(()=>planLinePositionFill(line(),missing,catalog())).toThrow(/No existe el código/);
    const invalid=catalog();
    invalid.registros[0]!.longitud=0;
    expect(()=>planLinePositionFill(line(),positions(),invalid)).toThrow(/longitud válida/);
    expect(()=>planLinePositionFill(line(0),positions(),catalog())).toThrow(/longitud mayor/);
    expect(()=>planLinePositionFill(line(5000),positions(),catalog())).toThrow(/no cabe/);
  });
  it("honors a maximum count and reports capped line",()=>{
    const p=planLinePositionFill(line(100000),positions(),catalog(),"activo_general",4);
    expect(p.segments).toHaveLength(4);
    expect(p.capped).toBe(true);
  });
  it("treats an inclusive position range as one ordered row, not 19 duplicates",()=>{
    const p=positions();
    p.items[1]!.posicion="31-49";
    p.items[2]!.posicion=50;
    p.items[0]!.posicion=60;
    const result=planLinePositionFill(line(12000),p,catalog());
    expect(result.segments.map(x=>x.code)).toEqual(["REC6000","REC3000","REC1500"]);
  });
});
