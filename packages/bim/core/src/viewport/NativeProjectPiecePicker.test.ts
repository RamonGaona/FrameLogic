import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { pickNativeProjectPieceInstance } from "./NativeProjectPiecePicker";

const rect = { left: 100, top: 200, width: 400, height: 400 };
const camera = new THREE.OrthographicCamera(-20, 20, 20, -20, 0.1, 1000);
camera.position.set(0, 0, 100);
camera.lookAt(0, 0, 0);
camera.updateProjectionMatrix();

function makePiece(z: number, visible = true): THREE.Group {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(12, 12, 6),
    new THREE.MeshBasicMaterial());
  root.position.z = z;
  root.visible = visible;
  root.add(mesh);
  return root;
}

describe("native Three.js project picker uses authoritative Model Space identities", () => {
  it("chooses the frontmost visible registered piece by raycast", () => {
    const front = makePiece(20);
    const rear = makePiece(0);
    expect(pickNativeProjectPieceInstance(300, 400, rect, camera, [
      ["rear-piece", rear],
      ["front-piece", front],
    ])).toBe("front-piece");
  });

  it("rejects hidden pieces and hidden submesh geometry", () => {
    const hidden = makePiece(30, false);
    const visible = makePiece(0);
    expect(pickNativeProjectPieceInstance(300, 400, rect, camera, [
      ["hidden", hidden], ["visible", visible],
    ])).toBe("visible");
    visible.children[0].visible = false;
    expect(pickNativeProjectPieceInstance(300, 400, rect, camera, [
      ["hidden", hidden], ["visible", visible],
    ])).toBeNull();
  });

  it("does not select unregistered construction geometry, CAD references or empty space", () => {
    const piece = makePiece(0);
    piece.position.x = 12;
    const stray = makePiece(20);
    expect(pickNativeProjectPieceInstance(300, 400, rect, camera, [
      ["real-piece", piece],
    ])).toBeNull();
    expect(pickNativeProjectPieceInstance(300, 400, rect, camera, [])).toBeNull();
    expect(pickNativeProjectPieceInstance(300, 400, rect, camera, [
      ["real-piece", piece],
    ])).toBeNull();
    expect(stray.children.length).toBe(1);
  });

  it("honors CSS canvas bounds, no hits outside, invalid dimensions", () => {
    const piece = makePiece(0);
    expect(pickNativeProjectPieceInstance(99, 400, rect, camera, [
      ["piece", piece],
    ])).toBeNull();
    expect(pickNativeProjectPieceInstance(300, 400, {
      ...rect, width: 0,
    }, camera, [["piece", piece]])).toBeNull();
    expect(pickNativeProjectPieceInstance(Number.NaN, 400, rect, camera, [
      ["piece", piece],
    ])).toBeNull();
  });

  it("does not modify instance transforms or camera projection during selection", () => {
    const piece = makePiece(10);
    piece.position.x = 1;
    const position = piece.position.clone();
    const quaternion = piece.quaternion.clone();
    const projection = camera.projectionMatrix.clone();
    pickNativeProjectPieceInstance(300, 400, rect, camera, [
      ["piece", piece],
    ]);
    expect(piece.position.equals(position)).toBe(true);
    expect(piece.quaternion.equals(quaternion)).toBe(true);
    expect(camera.projectionMatrix.equals(projection)).toBe(true);
  });
});
