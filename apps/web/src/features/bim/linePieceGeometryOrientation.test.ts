import * as THREE from "three";
import {describe, expect, it} from "vitest";
import type {LocalCoordinateSystem, PieceReferenceGeometry} from "@framelogic/domain";
import {detectPieceLongAxis, pieceTransformOnLine} from "./linePieceGeometryOrientation";

const frame=(origin={x:0,y:0,z:0}):LocalCoordinateSystem=>({
  origin,xAxis:{x:1,y:0,z:0},yAxis:{x:0,y:1,z:0},zAxis:{x:0,y:0,z:1},
});
function beamAlong(axis:"X"|"Y"|"Z", length=6000) {
  const group = new THREE.Group();
  const size = axis==="X"?[length,150,200]:axis==="Y"?[150,length,200]:[150,200,length];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0]!,size[1]!,size[2]!));
  mesh.position.set(axis==="X"?length/2:0,axis==="Y"?length/2:0,axis==="Z"?length/2:0);
  group.add(mesh);
  return group;
}
function transform(point:THREE.Vector3,t:ReturnType<typeof pieceTransformOnLine>){
  return point.clone().applyEuler(new THREE.Euler(t.rotation.x,t.rotation.y,t.rotation.z))
    .add(new THREE.Vector3(t.position.x,t.position.y,t.position.z));
}
const close=(v:THREE.Vector3,expected:THREE.Vector3,tolerance=0.001)=>
  expect(v.distanceTo(expected)).toBeLessThan(tolerance);

describe("actual geometric long-axis alignment of .flpiece instances",()=>{
  it("does not rotate a Y-long beam 90° just because engineering xAxis is X",()=>{
    const prototype=beamAlong("Y");
    const metadata=frame({x:0,y:6000,z:0}); // saved origin at the OTHER end
    const detected=detectPieceLongAxis(prototype,metadata);
    expect(Math.abs(detected.direction.dot(new THREE.Vector3(0,1,0)))).toBeCloseTo(1,6);
    expect(detected.physicalLengthMm).toBeCloseTo(6000,4);
    const lineStart=new THREE.Vector3(150,100,30);
    const direction=new THREE.Vector3(1,0,0);
    const placed=pieceTransformOnLine(metadata,detected,lineStart,direction);
    close(transform(new THREE.Vector3(0,0,0),placed),lineStart);
    close(transform(new THREE.Vector3(0,6000,0),placed),lineStart.clone().addScaledVector(direction,6000));
  });
  it("does not offset an X-long piece before the line when its authored origin was at the end",()=>{
    const detected=detectPieceLongAxis(beamAlong("X"),frame({x:6000,y:0,z:0}));
    const start=new THREE.Vector3(200,300,50);
    const placed=pieceTransformOnLine(frame({x:6000,y:0,z:0}),detected,start,
      new THREE.Vector3(1,0,0));
    close(transform(new THREE.Vector3(),placed),start);
    close(transform(new THREE.Vector3(6000,0,0),placed),new THREE.Vector3(6200,300,50));
  });
  it("maps vertical native Z axis onto a reversed, tilted 3D line",()=>{
    const source=beamAlong("Z",3000);
    const detected=detectPieceLongAxis(source,frame());
    const start=new THREE.Vector3(12000,350,-100);
    const direction=new THREE.Vector3(-4,2,1).normalize();
    const placed=pieceTransformOnLine(frame(),detected,start,direction);
    close(transform(new THREE.Vector3(),placed),start);
    close(transform(new THREE.Vector3(0,0,3000),placed),
      start.clone().addScaledVector(direction,3000));
  });
  it("recovers a principal direction when asset geometry itself is diagonally rotated",()=>{
    const group=beamAlong("X");
    const mesh=group.children[0]!;
    // rotate the whole geometry in the asset-native coordinates.
    mesh.rotation.z=Math.PI/4;
    const axis=detectPieceLongAxis(group,frame());
    expect(Math.abs(axis.direction.dot(new THREE.Vector3(1,1,0).normalize())))
      .toBeGreaterThan(0.999);
    expect(axis.physicalLengthMm).toBeCloseTo(6000,2);
  });
  it("follows an explicit MAIN reference direction to select the physical leading end",()=>{
    const references:PieceReferenceGeometry={
      axisLines:[{id:"main",name:"Eje principal",type:"MAIN",
        origin:{x:0,y:0,z:0},direction:{x:0,y:-1,z:0},length:6000}],
    };
    const axis=detectPieceLongAxis(beamAlong("Y"),frame(),references);
    expect(axis.direction.y).toBeLessThan(-0.999);
    const start=new THREE.Vector3(100,0,0);
    const placed=pieceTransformOnLine(frame(),axis,start,new THREE.Vector3(1,0,0));
    close(transform(new THREE.Vector3(0,6000,0),placed),start);
    close(transform(new THREE.Vector3(0,0,0),placed),new THREE.Vector3(6100,0,0));
  });
  it("rejects empty prototypes instead of silently inserting incorrectly oriented assets",()=>{
    expect(()=>detectPieceLongAxis(new THREE.Group(),frame())).toThrow(/mallas 3D/);
  });
});
