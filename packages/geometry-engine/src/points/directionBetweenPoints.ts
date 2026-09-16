import type { Point3 } from "../types/Point3";
import type { Vector3 } from "../types/Vector3";

export function directionBetweenPoints(
  pointA: Point3,
  pointB: Point3,
): Vector3 {
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  const dz = pointB.z - pointA.z;

  const length = Math.hypot(
    dx,
    dy,
    dz,
  );

  if (length <= Number.EPSILON) {
    throw new Error(
      "Cannot calculate direction between coincident points.",
    );
  }

  return {
    x: dx / length,
    y: dy / length,
    z: dz / length,
  };
}