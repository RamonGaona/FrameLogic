import * as THREE from "three";
import type { CadLine, DesignModel } from "@framelogic/domain";
import { getNearbyCadLines } from "../precision/CadScreenSpatialIndex";

export interface CadTrajectoryIntersection {
  readonly type: "INTERSECTION";
  readonly point: THREE.Vector3;
  readonly lineId: string;
}

/**
 * Finite, real-3D intersection of two non-collinear line segments.
 * The result includes the parameter along the drawing segment so a LINE
 * command can stop at the FIRST crossing rather than an arbitrary one.
 * A 2D screen overlap at different elevations is never an intersection.
 */
export function intersectCadTrajectorySegments(
  start: THREE.Vector3, end: THREE.Vector3,
  otherStart: THREE.Vector3, otherEnd: THREE.Vector3,
): { point: THREE.Vector3; fraction: number } | null {
  const u = end.clone().sub(start);
  const v = otherEnd.clone().sub(otherStart);
  const w = start.clone().sub(otherStart);
  const uu = u.lengthSq();
  const vv = v.lengthSq();
  if (uu <= 1e-18 || vv <= 1e-18) return null;
  const uv = u.dot(v);
  const uw = u.dot(w);
  const vw = v.dot(w);
  const denominator = uu * vv - uv * uv;
  if (Math.abs(denominator) <= 1e-14 * uu * vv) return null;

  const t = (uv * vw - vv * uw) / denominator;
  const s = (uu * vw - uv * uw) / denominator;
  if (t < -1e-9 || t > 1 + 1e-9 || s < -1e-9 || s > 1 + 1e-9)
    return null;

  // Ignore the start itself (for example the preceding LINE segment).
  const first = start.clone().addScaledVector(u, THREE.MathUtils.clamp(t, 0, 1));
  if (first.distanceToSquared(start) <= 1e-14) return null;
  const second = otherStart.clone().addScaledVector(v, THREE.MathUtils.clamp(s, 0, 1));
  const tolerance = Math.max(1e-7, Math.sqrt(Math.max(uu, vv)) * 1e-8);
  if (first.distanceToSquared(second) > tolerance * tolerance) return null;
  return { point: first.add(second).multiplyScalar(0.5), fraction: t };
}

/**
 * Traverse the screen-space corridor between the LINE start and cursor.
 *
 * Reuses the bounded CadScreenSpatialIndex already built for large DWGs.
 * Samples every ~24 px (max 80 stations) instead of examining all 1.4M
 * source segments on every pointermove. The index returns real world-space
 * endpoints, including current DWG/DXF reference matrices.
 *
 * When a zoomed-out DWG exceeds the spatial index's 120k visible-record
 * budget, its existing deterministic sampling applies here too. Zooming
 * in restores complete local candidates.
 */
export function findFirstCadTrajectoryIntersection(
  model: DesignModel,
  camera: THREE.Camera,
  rect: DOMRect,
  start: THREE.Vector3,
  cursor: THREE.Vector3,
): CadTrajectoryIntersection | null {
  if (!(rect.width > 0 && rect.height > 0) ||
      ![start.x, start.y, start.z, cursor.x, cursor.y, cursor.z].every(Number.isFinite) ||
      start.distanceToSquared(cursor) <= 1e-14) return null;

  camera.updateMatrixWorld(true);
  const a = start.clone().project(camera);
  const b = cursor.clone().project(camera);
  if (![a.x, a.y, a.z, b.x, b.y, b.z].every(Number.isFinite)) return null;
  const sx = rect.left + (a.x + 1) * rect.width * 0.5;
  const sy = rect.top + (1 - a.y) * rect.height * 0.5;
  const ex = rect.left + (b.x + 1) * rect.width * 0.5;
  const ey = rect.top + (1 - b.y) * rect.height * 0.5;
  const distance = Math.hypot(ex - sx, ey - sy);
  // Zero on-screen length is ambiguous: we should not search all DWG lines
  // or pick an unrelated overlap when viewing edge-on.
  if (distance < 1e-3) return null;
  const count = Math.min(80, Math.max(1, Math.ceil(distance / 24)));
  const tolerance = Math.max(18, distance / count * 0.75);
  const seen = new Set<string>();
  let best: { fraction: number; point: THREE.Vector3; line: CadLine } | null = null;

  for (let i = 0; i <= count; i++) {
    const fraction = i / count;
    const x = sx + (ex - sx) * fraction;
    const y = sy + (ey - sy) * fraction;
    const near = getNearbyCadLines(model, camera, rect, x, y, tolerance, 80);
    for (const line of near) {
      if (seen.has(line.id)) continue;
      seen.add(line.id);
      const layer = model.layers.get(line.layerId);
      if (!layer?.visible || layer.snapEnabled === false) continue;
      const crossing = intersectCadTrajectorySegments(
        start, cursor,
        new THREE.Vector3(line.start.x, line.start.y, line.start.z),
        new THREE.Vector3(line.end.x, line.end.y, line.end.z),
      );
      if (!crossing || (best && crossing.fraction >= best.fraction)) continue;
      best = { ...crossing, line };
    }
  }
  return best ? { type: "INTERSECTION", point: best.point, lineId: best.line.id } : null;
}
