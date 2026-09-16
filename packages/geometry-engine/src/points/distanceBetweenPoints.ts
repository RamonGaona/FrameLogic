import type { Point3 } from "../types/Point3";

export function distanceBetweenPoints(
  pointA: Point3,
  pointB: Point3,
): number {
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  const dz = pointB.z - pointA.z;

  return Math.hypot(
    dx,
    dy,
    dz,
  );
}