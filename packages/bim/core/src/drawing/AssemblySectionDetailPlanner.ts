/**
 * Pure drawing-space planning for a preliminary A-A / B-B section package.
 * A station is a geometric longitudinal sampling position, not a claim that
 * there is a verified welded/bolted connection at that location.
 */
import type { AssemblyLine } from "./AssemblyProjectionEngine";

export interface SectionStation {
  readonly label: "A-A" | "B-B";
  /** Coordinates in the already normalized main orthographic view. */
  readonly x: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly fraction: number;
}
export interface CroppedAssemblyDetail {
  readonly width: number;
  readonly height: number;
  readonly segments: readonly AssemblyLine[];
  readonly window: {
    readonly x: number; readonly y: number;
    readonly width: number; readonly height: number;
  };
}

/** Bound all stations by actual drawing geometry, not the padded paper extent. */
export function planSectionStations(
  segments: readonly AssemblyLine[],
): SectionStation[] {
  if (!segments.length) return [];
  const x = segments.flatMap((s) => [s.x1, s.x2]);
  const y = segments.flatMap((s) => [s.y1, s.y2]);
  const minX = Math.min(...x), maxX = Math.max(...x);
  const minY = Math.min(...y), maxY = Math.max(...y);
  if (![minX, maxX, minY, maxY].every(Number.isFinite)
    || maxX - minX < 0.001 || maxY - minY < 0.001) return [];
  return ([["A-A", 0.2], ["B-B", 0.8]] as const).map(([label, fraction]) => ({
    label, fraction, x: minX + (maxX - minX) * fraction,
    yMin: minY, yMax: maxY,
  }));
}

/** Clip exact projected HLR linework to a local window without inventing edges. */
export function cropAssemblyDetail(
  segments: readonly AssemblyLine[],
  centerX: number,
  centerY: number,
  width: number,
  height: number,
): CroppedAssemblyDetail | null {
  if (![centerX, centerY, width, height].every(Number.isFinite)
    || width <= 1e-9 || height <= 1e-9) return null;
  const x0 = centerX - width / 2, y0 = centerY - height / 2;
  const xmin = x0, xmax = x0 + width, ymin = y0, ymax = y0 + height;
  const clipped: AssemblyLine[] = [];
  // Liang–Barsky clipping also preserves the hidden/visible line semantics.
  for (const segment of segments) {
    const dx = segment.x2 - segment.x1, dy = segment.y2 - segment.y1;
    const p = [-dx, dx, -dy, dy];
    const q = [segment.x1 - xmin, xmax - segment.x1, segment.y1 - ymin, ymax - segment.y1];
    let t0 = 0, t1 = 1, reject = false;
    for (let i = 0; i < 4; i++) {
      if (Math.abs(p[i]!) < 1e-12) {
        if (q[i]! < 0) { reject = true; break; }
      } else {
        const t = q[i]! / p[i]!;
        if (p[i]! < 0) t0 = Math.max(t0, t);
        else t1 = Math.min(t1, t);
        if (t0 > t1) { reject = true; break; }
      }
    }
    if (reject || t1 - t0 <= 1e-10) continue;
    clipped.push({
      x1: segment.x1 + dx * t0 - x0, y1: segment.y1 + dy * t0 - y0,
      x2: segment.x1 + dx * t1 - x0, y2: segment.y1 + dy * t1 - y0,
      ...(segment.hidden ? { hidden: true } : {}),
    });
  }
  if (!clipped.length) return null;
  return { width, height, segments: clipped,
    window: { x: x0, y: y0, width, height } };
}

/** Physical section view layout: independent A3 sheet, one scale per viewport. */
export function planSectionDetailSheetSlots(count: number): Array<{
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
}> {
  if (!Number.isInteger(count) || count < 1 || count > 4) return [];
  const startX = 52, startY = 46, gap = 18;
  const cellW = (1016 - gap) / 2, cellH = (568 - gap) / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: startX + (i % 2) * (cellW + gap),
    y: startY + Math.floor(i / 2) * (cellH + gap),
    width: cellW, height: cellH,
  }));
}
