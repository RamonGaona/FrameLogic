import type * as THREE from "three";

/**
 * Renderer-agnostic access to the underlying Three.js viewport.
 *
 * CAD tools should depend on this contract rather than That Open world
 * wrappers. The initial implementation remains backed by That Open so the
 * migration does not change navigation, selection or rendering behaviour.
 *
 * The separate IFC/Fragments integration is intentionally out of scope.
 */
export interface FrameLogicViewportPort {
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
}
