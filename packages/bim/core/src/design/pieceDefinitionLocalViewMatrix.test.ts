import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { pieceDefinitionLocalViewMatrix } from "./pieceDefinitionLocalViewMatrix";
import type { PieceDefinition } from "@framelogic/domain";

const frame: PieceDefinition["coordinateSystem"] = {
  origin: { x: 1500, y: 200, z: 100 },
  xAxis: { x: 1, y: 0, z: 0 },
  yAxis: { x: 0, y: 1, z: 0 },
  zAxis: { x: 0, y: 0, z: 1 },
};

describe("FrameLogic editor local frame", () => {
  it("maps the selected saved origin to (0,0,0) while keeping the STEP asset coordinates", () => {
    const matrix = pieceDefinitionLocalViewMatrix(frame);
    const atOrigin = new THREE.Vector3(1500, 200, 100).applyMatrix4(matrix);
    expect(atOrigin.length()).toBeLessThan(1e-8);
    expect(new THREE.Vector3(1550, 200, 100).applyMatrix4(matrix).toArray()).toEqual([50, 0, 0]);
  });
  it("respects rotated axes of a definition", () => {
    const rotated: PieceDefinition["coordinateSystem"] = {
      origin: {x:100,y:200,z:0},
      xAxis: {x:0,y:1,z:0}, yAxis:{x:-1,y:0,z:0}, zAxis:{x:0,y:0,z:1},
    };
    expect(new THREE.Vector3(100,210,0).applyMatrix4(pieceDefinitionLocalViewMatrix(rotated)).toArray()).toEqual([10,0,0]);
  });
});
