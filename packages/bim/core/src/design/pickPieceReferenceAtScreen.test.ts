import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { pickPieceReferenceAtScreen } from "./pickPieceReferenceAtScreen";

const rect = {left:0,top:0,width:1000,height:1000} as DOMRect;
const camera = new THREE.OrthographicCamera(-100,100,100,-100,0.01,1000);
camera.position.set(0,0,100);camera.lookAt(0,0,0);camera.updateProjectionMatrix();

describe("manual reference picking in the isolated editor", () => {
  it("selects the 3D marker of the prepared instance, not a neighbouring copy", () => {
    const snaps = new THREE.Group(), axes = new THREE.Group();
    const ours = new THREE.Object3D();ours.position.set(20,0,0);
    ours.userData.frameLogic={instanceId:"first",snapId:"s-1"};snaps.add(ours);
    const neighbour= new THREE.Object3D();neighbour.position.set(20,0,0);
    neighbour.userData.frameLogic={instanceId:"second",snapId:"s-2"};snaps.add(neighbour);
    expect(pickPieceReferenceAtScreen(snaps,axes,"first",camera,rect,600,500))
      .toEqual({kind:"SNAP",id:"s-1"});
  });
  it("picks a persistent axis by screen distance", () => {
    const snaps = new THREE.Group(), axes = new THREE.Group();
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-50,0,0),new THREE.Vector3(50,0,0),
    ]), new THREE.LineBasicMaterial());
    line.userData.frameLogic={instanceId:"first",axisId:"axis-1"};axes.add(line);
    expect(pickPieceReferenceAtScreen(snaps,axes,"first",camera,rect,520,505))
      .toEqual({kind:"AXIS",id:"axis-1"});
    expect(pickPieceReferenceAtScreen(snaps,axes,"first",camera,rect,520,570))
      .toBeNull();
  });
});
