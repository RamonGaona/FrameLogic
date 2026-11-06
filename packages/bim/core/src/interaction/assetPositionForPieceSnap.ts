import * as THREE from "three";
import type { PieceDefinition, PieceVector3Data } from "@framelogic/domain";

/** Transforms a PieceDefinition-local SNAP to its original STEP asset coordinates. */
export function assetPositionForPieceSnap(
  coordinateSystem: PieceDefinition["coordinateSystem"],
  snapPosition: PieceVector3Data,
): THREE.Vector3 {
  const { origin, xAxis, yAxis, zAxis } = coordinateSystem;
  return new THREE.Vector3(origin.x, origin.y, origin.z)
    .addScaledVector(new THREE.Vector3(xAxis.x, xAxis.y, xAxis.z), snapPosition.x)
    .addScaledVector(new THREE.Vector3(yAxis.x, yAxis.y, yAxis.z), snapPosition.y)
    .addScaledVector(new THREE.Vector3(zAxis.x, zAxis.y, zAxis.z), snapPosition.z);
}
