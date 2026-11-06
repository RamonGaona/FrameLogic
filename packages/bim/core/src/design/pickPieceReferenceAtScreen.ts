import * as THREE from "three";
import type { PieceReferenceFocus } from "./PieceReferenceFocus";

function project(point: THREE.Vector3, camera: THREE.Camera, rect: DOMRect) {
  const ndc = point.clone().project(camera);
  if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y)
    || ndc.z < -1 || ndc.z > 1) return null;
  return {
    x: rect.left + (ndc.x + 1) * rect.width / 2,
    y: rect.top + (1 - ndc.y) * rect.height / 2,
  };
}

function distanceToSegment(
  x: number, y: number, a: {x:number;y:number}, b:{x:number;y:number},
): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = dx * dx + dy * dy <= 1e-8
    ? 0 : Math.max(0, Math.min(1, ((x-a.x)*dx + (y-a.y)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

/** Pixel-precise pick of FrameLogic metadata helpers, not STEP mesh faces. */
export function pickPieceReferenceAtScreen(
  snaps: THREE.Group,
  axes: THREE.Group,
  instanceId: string,
  camera: THREE.Camera,
  rect: DOMRect,
  clientX: number,
  clientY: number,
): PieceReferenceFocus {
  camera.updateMatrixWorld(true);
  let best: PieceReferenceFocus = null;
  let minDistance = Number.POSITIVE_INFINITY;

  for (const marker of snaps.children) {
    const metadata = marker.userData["frameLogic"] as
      {instanceId?:string;snapId?:string}|undefined;
    if (metadata?.instanceId !== instanceId || !metadata.snapId) continue;
    marker.updateMatrixWorld(true);
    const projected = project(marker.getWorldPosition(new THREE.Vector3()), camera, rect);
    if (!projected) continue;
    const distance = Math.hypot(projected.x-clientX, projected.y-clientY);
    if (distance <= 16 && distance < minDistance) {
      minDistance = distance;
      best = { kind:"SNAP", id:metadata.snapId };
    }
  }

  for (const segment of axes.children) {
    const metadata = segment.userData["frameLogic"] as
      {instanceId?:string;axisId?:string}|undefined;
    if (metadata?.instanceId !== instanceId || !metadata.axisId
      || !(segment instanceof THREE.Line)) continue;
    segment.updateMatrixWorld(true);
    const positions = segment.geometry.getAttribute("position");
    if (!positions || positions.count < 2) continue;
    const a = new THREE.Vector3().fromBufferAttribute(positions, 0).applyMatrix4(segment.matrixWorld);
    const b = new THREE.Vector3().fromBufferAttribute(positions, 1).applyMatrix4(segment.matrixWorld);
    const pa = project(a,camera,rect), pb=project(b,camera,rect);
    if (!pa || !pb) continue;
    const distance = distanceToSegment(clientX,clientY,pa,pb);
    if (distance <= 9 && distance < minDistance) {
      minDistance = distance;
      best = {kind:"AXIS",id:metadata.axisId};
    }
  }
  return best;
}
