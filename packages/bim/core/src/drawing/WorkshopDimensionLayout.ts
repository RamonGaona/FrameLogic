/**
 * Collision-aware paper placement for automatic STEP workshop dimensions.
 *
 * Millimetres are display units only. Anchors always come from exact 3D
 * topology projected to a view (never mesh extents), and manual text offsets
 * are stored separately so regeneration can retain user adjustments.
 */
import type { EngineeringDimensionInstruction } from "./EngineeringAutoDimensionPlanner";

export interface WorkshopDimensionOverride {
  readonly dx?: number;
  readonly dy?: number;
  readonly hidden?: boolean;
}
export interface WorkshopDimensionFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly originX: number;
  readonly originY: number;
  readonly drawnWidth: number;
  readonly drawnHeight: number;
  readonly scale: number;
}
export interface WorkshopLine {
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
}
export interface WorkshopPlacedDimension {
  readonly key: string;
  readonly label: string;
  readonly labelX: number;
  readonly labelY: number;
  readonly lines: readonly WorkshopLine[];
  readonly mode: EngineeringDimensionInstruction["mode"];
}
export interface WorkshopDimensionLayoutResult {
  readonly placed: readonly WorkshopPlacedDimension[];
  readonly omitted: number;
}
interface Box { x1: number; y1: number; x2: number; y2: number }
const EPS = 1e-9;
const TEXT_SIZE = 8;
const LINE_HEIGHT = 12;

export function workshopMillimetres(metres: number): string {
  if (!Number.isFinite(metres)) return "—";
  const value = Math.abs(metres) * 1000;
  return Number(value.toFixed(value < 10 ? 2 : 1)).toString();
}

/** IDs remain stable when the STEP topology IDs survive a model refresh. */
export function workshopDimensionKey(d: EngineeringDimensionInstruction): string {
  const a = `${d.a.instanceId}:${d.a.topologyId}`;
  const b = `${d.b.instanceId}:${d.b.topologyId}`;
  return `STEP|${d.mode}|${a}|${b}`;
}

function labelBox(label: string, x: number, y: number): Box {
  const width = Math.max(10, label.length * TEXT_SIZE * 0.59 + 6);
  return { x1: x - width / 2 - 3, x2: x + width / 2 + 3, y1: y - 10, y2: y + 3 };
}
function collides(a: Box, b: Box): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}
function within(frame: WorkshopDimensionFrame, box: Box): boolean {
  return box.x1 >= frame.x + 3 && box.x2 <= frame.x + frame.width - 3
    && box.y1 >= frame.y + 20 && box.y2 <= frame.y + frame.height - 17;
}
function segment(x1: number, y1: number, x2: number, y2: number): WorkshopLine {
  return { x1, y1, x2, y2 };
}
function getLabel(d: EngineeringDimensionInstruction): string {
  const mode = d.mode;
  const span = mode === "HORIZONTAL" ? Math.abs(d.b.x - d.a.x)
    : mode === "VERTICAL" ? Math.abs(d.b.y - d.a.y)
      : (d.a.radius ?? 0) * 2;
  return mode === "DIAMETER"
    ? `${(d.quantity ?? 1) > 1 ? d.quantity + "× " : ""}Ø${workshopMillimetres(span)}`
    : workshopMillimetres(span);
}

/**
 * Uses upper (horizontal), right (vertical), and lower (diameter) gutters.
 * The algorithm drops overcrowded annotations instead of printing overlapping
 * numbers. The caller can report the omitted count for engineering review.
 * User overrides apply only to text placement and are never overwritten here.
 */
export function layoutWorkshopDimensions(
  instructions: readonly EngineeringDimensionInstruction[],
  frame: WorkshopDimensionFrame,
  overrides: Readonly<Record<string, WorkshopDimensionOverride>> = {},
): WorkshopDimensionLayoutResult {
  if (![frame.x, frame.y, frame.width, frame.height, frame.originX,
    frame.originY, frame.drawnWidth, frame.drawnHeight, frame.scale].every(Number.isFinite)
    || frame.width <= 0 || frame.height <= 0 || frame.scale <= 0) {
    return { placed: [], omitted: instructions.length };
  }
  const occupied: Box[] = [];
  const placed: WorkshopPlacedDimension[] = [];
  let omitted = 0;
  const pending = new Set<string>();
  for (const d of instructions) {
    const key = workshopDimensionKey(d);
    if (pending.has(key)) { omitted++; continue; }
    pending.add(key);
    if (overrides[key]?.hidden) continue;
    const ax = frame.originX + d.a.x * frame.scale;
    const bx = frame.originX + d.b.x * frame.scale;
    const ay = frame.originY + frame.drawnHeight - d.a.y * frame.scale;
    const by = frame.originY + frame.drawnHeight - d.b.y * frame.scale;
    const label = getLabel(d);
    if (![ax, bx, ay, by].every(Number.isFinite)) { omitted++; continue; }
    const moveX = Number.isFinite(overrides[key]?.dx) ? overrides[key]!.dx! : 0;
    const moveY = Number.isFinite(overrides[key]?.dy) ? overrides[key]!.dy! : 0;
    let found: WorkshopPlacedDimension | null = null;
    const proposed = (x: number, y: number, lines: WorkshopLine[]): boolean => {
      if (!Number.isFinite(x + moveX) || !Number.isFinite(y + moveY)) return false;
      const box = labelBox(label, x + moveX, y + moveY);
      if (!within(frame, box) || occupied.some((other) => collides(box, other))) return false;
      if (Math.abs(moveX) > 0.5 || Math.abs(moveY) > 0.5)
        lines.push(segment(x, y, x + moveX, y + moveY));
      found = { key, mode: d.mode, label,
        labelX: x + moveX, labelY: y + moveY, lines };
      occupied.push(box);
      return true;
    };
    if (d.mode === "HORIZONTAL") {
      if (Math.abs(ax - bx) >= 20 && Math.abs(d.a.x - d.b.x) > EPS) {
        for (let lane = 0; lane < 5 && !found; lane++) {
          const y = frame.originY - 15 - lane * LINE_HEIGHT;
          if (y < frame.y + 31) break;
          proposed((ax + bx) / 2, y - 3,
            [segment(ax, ay, ax, y), segment(bx, by, bx, y), segment(ax, y, bx, y)]);
        }
      }
    } else if (d.mode === "VERTICAL") {
      if (Math.abs(ay - by) >= 20 && Math.abs(d.a.y - d.b.y) > EPS) {
        for (let lane = 0; lane < 5 && !found; lane++) {
          const x = frame.originX + frame.drawnWidth + 12 + lane * 13;
          if (x > frame.x + frame.width - 23) break;
          // Text is centered above the leader's midpoint on the right.
          proposed(x + 18, (ay + by) / 2,
            [segment(ax, ay, x, ay), segment(bx, by, x, by), segment(x, ay, x, by)]);
        }
      }
    } else if (d.mode === "DIAMETER" && (d.a.radius ?? 0) > EPS) {
      const bottom = frame.originY + frame.drawnHeight;
      for (let lane = 0; lane < 3 && !found; lane++) {
        const y = frame.y + frame.height - 26 - lane * LINE_HEIGHT;
        if (y <= bottom + 8) break;
        for (let column = 0; column < 3 && !found; column++) {
          const center = frame.x + 38 + column * Math.max(1, (frame.width - 76) / 2);
          const x = Math.min(frame.x + frame.width - 38, center);
          proposed(x, y, [segment(ax, ay, x, y - 3)]);
        }
      }
    }
    if (found) placed.push(found);
    else omitted++;
  }
  return { placed, omitted };
}
