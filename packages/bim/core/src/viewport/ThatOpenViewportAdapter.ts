import * as OBC from "@thatopen/components";

import type { FrameLogicViewportPort } from "./FrameLogicViewportPort";

/**
 * Transitional viewport backend.
 *
 * Keep the existing That Open world lifecycle intact while isolating the
 * scene / renderer / camera creation behind FrameLogic-owned functions.
 * A future native Three.js backend can satisfy FrameLogicViewportPort,
 * without changing the STEP and engineering-model pipelines.
 */
export function createFrameLogicViewportWorld(components: OBC.Components) {
  const worlds = components.get(OBC.Worlds);
  const world = worlds.create<
    OBC.SimpleScene,
    OBC.OrthoPerspectiveCamera,
    OBC.SimpleRenderer
  >();

  world.scene = new OBC.SimpleScene(components);
  world.scene.setup();
  return world;
}

export type FrameLogicViewportWorld =
  ReturnType<typeof createFrameLogicViewportWorld>;

export function attachFrameLogicViewportRenderer(
  components: OBC.Components,
  world: FrameLogicViewportWorld,
  container: HTMLElement,
): void {
  world.renderer = new OBC.SimpleRenderer(components, container);
  // The optional logo can be hidden; preserve MIT notices in distributed code.
  world.renderer.showLogo = false;
}

export function attachFrameLogicViewportCamera(
  components: OBC.Components,
  world: FrameLogicViewportWorld,
): void {
  world.camera = new OBC.OrthoPerspectiveCamera(components);
}

/**
 * Expose only native Three.js handles to progressively decouple CAD callers.
 * Call after the renderer and camera have been attached.
 */
export function getFrameLogicViewportPort(
  world: FrameLogicViewportWorld,
): FrameLogicViewportPort {
  return {
    scene: world.scene.three,
    camera: world.camera.three,
    renderer: world.renderer.three,
    canvas: world.renderer.three.domElement,
  };
}
