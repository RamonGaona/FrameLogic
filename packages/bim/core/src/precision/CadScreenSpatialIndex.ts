import * as THREE from "three";
import type { CadLine, DesignModel } from "@framelogic/domain";

/**
 * Screen-space spatial index for CAD topology. A full DWG can contain 80,000
 * imported lines but a mouse click needs ONLY the segments near the pointer.
 * The cache invalidates on model changes (CadLineRegistry.revision), camera
 * projection/pose changes or viewport resize. Layer visibility and snap
 * exclusion remain filtered by each caller at query time.
 */
interface ScreenLine {
  readonly line: CadLine;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
}

const CELL_PX = 96;
const MAX_BUCKET_CELLS_PER_LINE = 96;
const DEFAULT_MAX_CANDIDATES = 80;
const cached = new WeakMap<DesignModel, CadScreenSpatialIndex>();

function segmentDistanceSq(
  x: number, y: number,
  ax: number, ay: number, bx: number, by: number,
): number {
  const dx = bx - ax, dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq > 1e-12
    ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq))
    : 0;
  const px = ax + dx * t - x;
  const py = ay + dy * t - y;
  return px * px + py * py;
}

export class CadScreenSpatialIndex {
  private readonly model: DesignModel;
  private projection = new THREE.Matrix4();
  private readonly scratch = new THREE.Vector3();
  private lastMatrix: number[] = [];
  private lastViewport: number[] = [];
  private lastCamera: THREE.Camera | null = null;
  private lastRevision = -1;
  private records: ScreenLine[] = [];
  private readonly buckets = new Map<string, number[]>();
  private oversized: number[] = [];
  private rebuilds = 0;

  constructor(model: DesignModel) {
    this.model = model;
  }

  get rebuildCount(): number { return this.rebuilds; }

  query(
    camera: THREE.Camera, rect: DOMRect,
    clientX: number, clientY: number,
    tolerancePx = 18, maxCandidates = DEFAULT_MAX_CANDIDATES,
  ): CadLine[] {
    this.ensureFresh(camera, rect);
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)
      || rect.width <= 0 || rect.height <= 0) return [];
    const pad = Math.max(1, tolerancePx);
    const left = Math.floor((clientX - pad) / CELL_PX);
    const right = Math.floor((clientX + pad) / CELL_PX);
    const top = Math.floor((clientY - pad) / CELL_PX);
    const bottom = Math.floor((clientY + pad) / CELL_PX);
    const candidates = new Set<number>(this.oversized);
    for (let cy = top; cy <= bottom; cy++)
      for (let cx = left; cx <= right; cx++)
        for (const index of this.buckets.get(`${cx},${cy}`) ?? [])
          candidates.add(index);

    const scored: Array<{ line: CadLine; distanceSq: number }> = [];
    const maxSq = pad * pad;
    for (const index of candidates) {
      const candidate = this.records[index];
      if (!candidate) continue;
      const d = segmentDistanceSq(clientX, clientY,
        candidate.ax, candidate.ay, candidate.bx, candidate.by);
      if (d > maxSq) continue;
      scored.push({ line: candidate.line, distanceSq: d });
    }
    scored.sort((a, b) => a.distanceSq - b.distanceSq);
    return scored.slice(0, Math.max(1, maxCandidates)).map((v) => v.line);
  }

  private ensureFresh(camera: THREE.Camera, rect: DOMRect): void {
    camera.updateMatrixWorld(true);
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const matrix = this.projection.elements;
    const viewport = [rect.left, rect.top, rect.width, rect.height];
    const revision = this.model.cadLines.revision;
    if (camera === this.lastCamera && revision === this.lastRevision
      && viewport.every((v, i) => v === this.lastViewport[i])
      && matrix.every((v, i) => Math.abs(v - (this.lastMatrix[i] ?? NaN)) < 1e-12)) {
      return;
    }
    this.lastCamera = camera;
    this.lastRevision = revision;
    this.lastMatrix = Array.from(matrix);
    this.lastViewport = viewport;
    this.rebuild(camera, rect);
  }

  private rebuild(_camera: THREE.Camera, rect: DOMRect): void {
    this.rebuilds++;
    this.records = [];
    this.buckets.clear();
    this.oversized = [];
    const project = (x: number, y: number, z: number): [number, number] | null => {
      const point = this.scratch.set(x, y, z).applyMatrix4(this.projection);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      return [
        rect.left + (point.x + 1) * rect.width * 0.5,
        rect.top + (1 - point.y) * rect.height * 0.5,
      ];
    };
    for (const line of this.model.cadLines.getAll()) {
      const start = project(line.start.x, line.start.y, line.start.z);
      const end = project(line.end.x, line.end.y, line.end.z);
      if (!start || !end) continue;
      const [ax, ay] = start, [bx, by] = end;
      const minX = Math.floor((Math.min(ax, bx) - 24) / CELL_PX);
      const maxX = Math.floor((Math.max(ax, bx) + 24) / CELL_PX);
      const minY = Math.floor((Math.min(ay, by) - 24) / CELL_PX);
      const maxY = Math.floor((Math.max(ay, by) + 24) / CELL_PX);
      const index = this.records.push({ line, ax, ay, bx, by }) - 1;
      const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
      if (!Number.isFinite(cellCount) || cellCount > MAX_BUCKET_CELLS_PER_LINE) {
        this.oversized.push(index);
        continue;
      }
      for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
        const key = `${cx},${cy}`;
        let bucket = this.buckets.get(key);
        if (!bucket) {
          bucket = [];
          this.buckets.set(key, bucket);
        }
        bucket.push(index);
      }
    }
  }
}

export function getNearbyCadLines(
  model: DesignModel, camera: THREE.Camera, rect: DOMRect,
  clientX: number, clientY: number,
  tolerancePx = 18, maxCandidates = DEFAULT_MAX_CANDIDATES,
): CadLine[] {
  let index = cached.get(model);
  if (!index) {
    index = new CadScreenSpatialIndex(model);
    cached.set(model, index);
  }
  return index.query(camera, rect, clientX, clientY, tolerancePx, maxCandidates);
}
