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

/**
 * Wrap native Three.js handles without cloning or owning their lifecycle.
 * The caller is responsible for attaching and disposing of the renderer.
 */
export function exposeFrameLogicViewport(
  scene: THREE.Scene,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
): FrameLogicViewportPort {
  return {
    scene,
    camera,
    renderer,
    canvas: renderer.domElement,
  };
}

/**
 * Scene/camera/renderer can be replaced independently (for example during
 * orthographic/perspective switches). Consumers must always read the active
 * Three.js objects, not a snapshot captured at viewport creation.
 *
 * Ownership and disposal remain with the backend.
 */
export interface FrameLogicViewportProviders {
  readonly getScene: () => THREE.Scene;
  readonly getCamera: () => THREE.Camera;
  readonly getRenderer: () => THREE.WebGLRenderer;
}

export function createLiveFrameLogicViewport(
  providers: FrameLogicViewportProviders,
): FrameLogicViewportPort {
  return {
    get scene() { return providers.getScene(); },
    get camera() { return providers.getCamera(); },
    get renderer() { return providers.getRenderer(); },
    get canvas() { return providers.getRenderer().domElement; },
  };
}
