import type { NativeMoveAxis } from "./NativeStepMoveController";

/**
 * Double-click recognition on the same Three.js rotation ring. Native DOM
 * dblclick is not enough because all three rings share the same canvas.
 * Model Space has the same 650 ms / 14 px contract.
 */
export class NativeStepRotateRingClick {
  private previous: {
    axis: NativeMoveAxis; targetKey: string;
    x: number; y: number; at: number;
  } | null = null;

  shortClick(
    axis: NativeMoveAxis,
    targetKey: string,
    x: number,
    y: number,
    at: number,
  ): boolean {
    if (![x, y, at].every(Number.isFinite)) {
      this.reset();
      return false;
    }
    const previous = this.previous;
    this.previous = null;
    if (previous && previous.axis === axis && previous.targetKey === targetKey
      && at >= previous.at && at - previous.at <= 650
      && Math.hypot(x - previous.x, y - previous.y) <= 14) return true;
    this.previous = { axis, targetKey, x, y, at };
    return false;
  }

  reset(): void {
    this.previous = null;
  }
}
