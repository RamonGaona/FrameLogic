import * as THREE from "three";
import type { PieceVisualLevel } from "../design/PieceVisualGeometry";

/**
 * Camera-driven visual LOD. Inspired by Cota's on-screen-size LOD
 * (Copyright 2026 Christian Orengia, Apache-2.0).
 *
 * No geometry or engineering data is changed here; the result chooses among
 * existing FrameLogic LOW / WORK / DETAIL visual meshes.
 */
export function adaptiveVisualLevel(
  projectedSizePx: number | null,
  previous: PieceVisualLevel = "WORK",
): PieceVisualLevel {
  if (projectedSizePx === null || !Number.isFinite(projectedSizePx) || projectedSizePx < 0)
    return "WORK";
  // Hysteresis prevents oscillation at zoom thresholds. All levels still
  // use the original detailed mesh for raycasting and precise geometry.
  switch (previous) {
    case "LOW":
      if (projectedSizePx < 90) return "LOW";
      return projectedSizePx >= 340 ? "DETAIL" : "WORK";
    case "DETAIL":
      if (projectedSizePx > 260) return "DETAIL";
      return projectedSizePx < 60 ? "LOW" : "WORK";
    default:
      if (projectedSizePx < 60) return "LOW";
      if (projectedSizePx >= 340) return "DETAIL";
      return "WORK";
  }
}

/** Project a world-space bounding box to pixels without touching the geometry. */
export function projectedBoundsSizePx(
  worldBounds: THREE.Box3,
  camera: THREE.Camera,
  widthPx: number,
  heightPx: number,
): number | null {
  if (worldBounds.isEmpty() || widthPx <= 0 || heightPx <= 0) return null;
  if (camera instanceof THREE.PerspectiveCamera) {
    const center = worldBounds.getCenter(new THREE.Vector3());
    const forward = camera.getWorldDirection(new THREE.Vector3());
    const distance = center.sub(camera.getWorldPosition(new THREE.Vector3())).dot(forward);
    if (distance <= camera.near) return null;
  }
  const ndc: THREE.Vector3[] = [];
  const a = worldBounds.min, b = worldBounds.max;
  for (const x of [a.x, b.x]) for (const y of [a.y, b.y])
    for (const z of [a.z, b.z]) {
      const p = new THREE.Vector3(x, y, z).project(camera);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
      ndc.push(p);
    }
  const xRange = Math.max(...ndc.map(p => p.x)) - Math.min(...ndc.map(p => p.x));
  const yRange = Math.max(...ndc.map(p => p.y)) - Math.min(...ndc.map(p => p.y));
  return Math.hypot(xRange * widthPx / 2, yRange * heightPx / 2);
}
