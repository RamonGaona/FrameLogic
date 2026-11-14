/**
 * Four cardinal, equidistant radius grips for circular detail references.
 * Positions are in paper-space coordinates. All handles use the same existing
 * center-to-pointer radius math; none may reshape the circle into an ellipse.
 */
export type CircularDetailGripDirection = "E" | "W" | "N" | "S";

export interface CircularDetailGrip {
  readonly direction: CircularDetailGripDirection;
  readonly x: number;
  readonly y: number;
  readonly cursor: "ew-resize" | "ns-resize";
}

export function circularDetailRadiusGrips(
  cx: number,
  cy: number,
  radius: number,
): readonly CircularDetailGrip[] {
  if (![cx, cy, radius].every(Number.isFinite) || radius <= 0) return [];
  return [
    { direction: "E", x: cx + radius, y: cy, cursor: "ew-resize" },
    { direction: "W", x: cx - radius, y: cy, cursor: "ew-resize" },
    { direction: "N", x: cx, y: cy - radius, cursor: "ns-resize" },
    { direction: "S", x: cx, y: cy + radius, cursor: "ns-resize" },
  ];
}

/** Each cardinal grip applies the same radial resize about the fixed center. */
export function circularDetailRadiusFromPointer(
  centerX: number,
  centerY: number,
  pointerX: number,
  pointerY: number,
): number {
  return Math.hypot(pointerX - centerX, pointerY - centerY);
}
