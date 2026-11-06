import * as THREE from "three";
import type { PieceDefinition } from "@framelogic/domain";

/**
 * Places a STEP asset into the local FrameLogic coordinate system for display
 * in the isolated editor: world(C.origin) = (0,0,0).
 * It never changes a PieceInstance's persisted transformation.
 */
export function pieceDefinitionLocalViewMatrix(
  frame: PieceDefinition["coordinateSystem"],
): THREE.Matrix4 {
  const origin = new THREE.Vector3(frame.origin.x, frame.origin.y, frame.origin.z);
  const x = new THREE.Vector3(frame.xAxis.x, frame.xAxis.y, frame.xAxis.z);
  const y = new THREE.Vector3(frame.yAxis.x, frame.yAxis.y, frame.yAxis.z);
  const z = new THREE.Vector3(frame.zAxis.x, frame.zAxis.y, frame.zAxis.z);
  return new THREE.Matrix4().set(
    x.x, x.y, x.z, -x.dot(origin),
    y.x, y.y, y.z, -y.dot(origin),
    z.x, z.y, z.z, -z.dot(origin),
    0, 0, 0, 1,
  );
}
