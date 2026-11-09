import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { findTrackingHit } from "./SnapTrackingMath";

const axes = [
  { name: "X" as const, direction: new THREE.Vector3(1, 0, 0) },
  { name: "Y" as const, direction: new THREE.Vector3(0, 1, 0) },
];
const project = (p: THREE.Vector3) => ({ x: p.x * 10, y: p.y * 10, visible: true });
describe("exact object snap tracking", () => {
  it("tracks the world X line from an acquired reference", () => {
    const anchor = new THREE.Vector3(5, 10, 0);
    const ray = new THREE.Ray(new THREE.Vector3(7, 10, 100), new THREE.Vector3(0, 0, -1));
    const hit = findTrackingHit(anchor, ray, axes, project, 70, 100);
    expect(hit?.axis).toBe("X");
    expect(hit?.point.distanceTo(new THREE.Vector3(7, 10, 0))).toBeLessThan(1e-8);
  });
  it("does not invent off-axis snaps or snap to a ray behind the camera", () => {
    const anchor = new THREE.Vector3(0, 0, 0);
    const ray = new THREE.Ray(new THREE.Vector3(10, 10, 100), new THREE.Vector3(0, 0, -1));
    expect(findTrackingHit(anchor, ray, axes, project, 100, 100)).toBeNull();
    const away = new THREE.Ray(new THREE.Vector3(2, 0, 10), new THREE.Vector3(0, 0, 1));
    expect(findTrackingHit(anchor, away, axes, project, 20, 0)).toBeNull();
  });
  it("respects a rotated local work plane axis", () => {
    const rotated = [{ name: "X" as const, direction: new THREE.Vector3(0, 1, 0) }];
    const ray = new THREE.Ray(new THREE.Vector3(1, 3, 10), new THREE.Vector3(0, 0, -1));
    expect(findTrackingHit(new THREE.Vector3(1, 0, 0), ray, rotated, project, 10, 30)?.axis).toBe("X");
  });
});
