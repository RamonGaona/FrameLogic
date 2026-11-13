import * as THREE from "three";
import type { CadLine, DesignModel } from "@framelogic/domain";

/**
 * Memory-bounded screen-space SNAP index for CAD linework, including huge DWGs.
 *
 * DWG visual geometry and exact CAD lines remain complete in DesignModel.
 * The index is only a cache of visible SNAP candidates. When the viewport has
 * over 120,000 visible segments, it samples candidates uniformly across the
 * entire reference instead of allocating ~1.4m record objects and tens of
 * millions of tile entries on every pan/zoom.
 *
 * Zooming into a part of the DWG automatically indexes ALL segments visible
 * in that local viewport once their count is below the budget. Nothing is
 * removed from the model, snap can be made exact again by zooming in.
 */
const CELL_PX = 96;
const MAX_BUCKET_CELLS_PER_LINE = 96;
const DEFAULT_MAX_CANDIDATES = 80;
export const MAX_VISIBLE_CAD_SNAP_RECORDS = 120_000;
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

  // Unlike ScreenLine[] this uses a compact flat buffer with one array entry
  // per visible, sampled line, rather than millions of per-line JS objects.
  private indexedLines: CadLine[] = [];
  private screenCoords = new Float32Array(MAX_VISIBLE_CAD_SNAP_RECORDS * 4);
  private readonly buckets = new Map<string, number[]>();
  private oversized: number[] = [];
  private rebuilds = 0;
  private visible = 0;

  constructor(model: DesignModel) {
    this.model = model;
  }

  get rebuildCount(): number { return this.rebuilds; }
  get indexedCount(): number { return this.indexedLines.length; }
  get visibleCount(): number { return this.visible; }
  get sampled(): boolean { return this.visible > MAX_VISIBLE_CAD_SNAP_RECORDS; }

  query(
    camera: THREE.Camera, rect: DOMRect,
    clientX: number, clientY: number,
    tolerancePx = 18, maxCandidates = DEFAULT_MAX_CANDIDATES,
  ): CadLine[] {
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)
      || rect.width <= 0 || rect.height <= 0) return [];
    this.ensureFresh(camera, rect);
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
      const line = this.indexedLines[index];
      if (!line) continue;
      const base = index * 4;
      const d = segmentDistanceSq(clientX, clientY,
        this.screenCoords[base]!, this.screenCoords[base + 1]!,
        this.screenCoords[base + 2]!, this.screenCoords[base + 3]!);
      if (d > maxSq) continue;
      scored.push({ line, distanceSq: d });
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
    this.rebuild(rect);
  }

  private rebuild(rect: DOMRect): void {
    this.rebuilds++;
    this.visible = 0;
    this.indexedLines = [];
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
    // The registry iterator avoids constructing an extra million-element
    // array just to perform a SNAP rebuild.
    for (const line of this.model.cadLines.values()) {
      const start = project(line.start.x, line.start.y, line.start.z);
      const end = project(line.end.x, line.end.y, line.end.z);
      if (!start || !end) continue;
      const [ax, ay] = start, [bx, by] = end;
      // Exclude only segments whose projected bounding box is completely
      // off screen. Crossing lines still participate in local SNAP.
      if (Math.max(ax, bx) < rect.left - 24
        || Math.min(ax, bx) > rect.left + rect.width + 24
        || Math.max(ay, by) < rect.top - 24
        || Math.min(ay, by) > rect.top + rect.height + 24) continue;

      this.visible++;
      let slot: number;
      if (this.indexedLines.length < MAX_VISIBLE_CAD_SNAP_RECORDS) {
        slot = this.indexedLines.length;
        this.indexedLines.push(line);
      } else {
        // Deterministic reservoir sampling avoids favoring the first INSERT
        // or first 120k DWG segments. The budget bounds memory, not geometry.
        const hash = (Math.imul(this.visible, 1664525) + 1013904223) >>> 0;
        slot = Math.floor((hash / 0x1_0000_0000) * this.visible);
        if (slot >= MAX_VISIBLE_CAD_SNAP_RECORDS) continue;
        this.indexedLines[slot] = line;
      }
      const base = slot * 4;
      this.screenCoords[base] = ax;
      this.screenCoords[base + 1] = ay;
      this.screenCoords[base + 2] = bx;
      this.screenCoords[base + 3] = by;
    }

    // Build buckets only for the bounded visible reservoir. Never place
    // millions of line references in JS maps on pointer movement.
    for (let index = 0; index < this.indexedLines.length; index++) {
      const base = index * 4;
      const ax = this.screenCoords[base]!, ay = this.screenCoords[base + 1]!;
      const bx = this.screenCoords[base + 2]!, by = this.screenCoords[base + 3]!;
      const minX = Math.floor((Math.min(ax, bx) - 24) / CELL_PX);
      const maxX = Math.floor((Math.max(ax, bx) + 24) / CELL_PX);
      const minY = Math.floor((Math.min(ay, by) - 24) / CELL_PX);
      const maxY = Math.floor((Math.max(ay, by) + 24) / CELL_PX);
      const cellCount = (maxX - minX + 1) * (maxY - minY + 1);
      if (!Number.isFinite(cellCount) || cellCount > MAX_BUCKET_CELLS_PER_LINE) {
        this.oversized.push(index);
        continue;
      }
      for (let cy = minY; cy <= maxY; cy++)
        for (let cx = minX; cx <= maxX; cx++) {
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
