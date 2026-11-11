import type { RotateNumericAxis } from "./CadNumericInputController";

/**
 * Two separate short clicks on the SAME rotation ring are required.
 * A native canvas dblclick alone is insufficient: different rings share
 * the same canvas element and would otherwise trigger an unwanted 90° turn.
 */
export class RotateRingDoubleClick {
  private previous: { axis: RotateNumericAxis; x: number; y: number; at: number } | null = null;
  private pending: { axis: RotateNumericAxis; x: number; y: number; at: number } | null = null;

  record(axis: RotateNumericAxis, x: number, y: number, at: number, dragged: boolean): void {
    if (dragged || !Number.isFinite(x) || !Number.isFinite(y)) {
      this.reset();
      return;
    }
    const previous = this.previous;
    this.pending = null;
    if (previous && previous.axis === axis && at >= previous.at && at - previous.at <= 480
      && Math.hypot(previous.x - x, previous.y - y) <= 9) {
      this.pending = { axis, x, y, at };
      this.previous = null;
    } else {
      this.previous = { axis, x, y, at };
    }
  }

  take(x: number, y: number, at: number): RotateNumericAxis | null {
    const pending = this.pending;
    this.reset();
    if (!pending || at < pending.at || at - pending.at > 480
      || Math.hypot(pending.x - x, pending.y - y) > 9) return null;
    return pending.axis;
  }

  reset(): void {
    this.pending = null;
    this.previous = null;
  }
}
