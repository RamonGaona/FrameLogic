import type { AssemblyViewOrientationMode } from "./AssemblyViewOrientationControls";

/**
 * A heavyweight STEP/HLR projection must not discard a second View orientation
 * chosen while the first projection is still running. Only the latest queued
 * choice is relevant, and the active View is never silently changed.
 */
export interface DrawingViewOrientationRequest {
  readonly sheetId: string;
  readonly viewId: string;
  readonly mode: AssemblyViewOrientationMode;
}

export class DrawingViewOrientationQueue {
  private active: DrawingViewOrientationRequest | null = null;
  private pending: DrawingViewOrientationRequest | null = null;

  startOrQueue(request: DrawingViewOrientationRequest): boolean {
    if (this.active) {
      this.pending = request;
      return false;
    }
    this.active = request;
    return true;
  }

  displayedMode(
    sheetId: string,
    viewId: string,
    persisted: AssemblyViewOrientationMode,
  ): AssemblyViewOrientationMode {
    for (const request of [this.pending, this.active]) {
      if (request?.sheetId === sheetId && request.viewId === viewId) return request.mode;
    }
    return persisted;
  }

  complete(): DrawingViewOrientationRequest | null {
    this.active = null;
    const next = this.pending;
    this.pending = null;
    return next;
  }
}
