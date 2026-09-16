import type { Point3 } from "../types/Point3";

export function midpoint(
  pointA: Point3,
  pointB: Point3,
): Point3 {
  return {
    x: (pointA.x + pointB.x) / 2,
    y: (pointA.y + pointB.y) / 2,
    z: (pointA.z + pointB.z) / 2,
  };
}