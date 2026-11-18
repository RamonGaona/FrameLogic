import * as OBC from "@thatopen/components";

import { FrameLogicCameraController } from "./FrameLogicCameraController";

import {
  createLiveFrameLogicViewport,
  type FrameLogicViewportPort,
} from "./FrameLogicViewportPort";

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
) {
  const renderer = new OBC.SimpleRenderer(components, container);
  // The optional logo can be hidden; preserve MIT notices in distributed code.
  renderer.showLogo = false;
  world.renderer = renderer;
  return renderer;
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
  const renderer = world.renderer;
  if (!renderer) {
    throw new Error("FrameLogic viewport renderer is not initialized.");
  }
  return createLiveFrameLogicViewport({
    getScene: () => world.scene.three,
    getCamera: () => world.camera.three,
    getRenderer: () => {
      if (!world.renderer) {
        throw new Error("FrameLogic viewport renderer is not initialized.");
      }
      return world.renderer.three;
    },
  });
}

/**
 * That Open adapter for FrameLogic camera navigation.
 *
 * Keep all vendor-specific CameraControls and update events here. The CAD
 * feature layer only sees FrameLogicCameraController. This is intentionally
 * an adapter, not yet a new native camera backend.
 */
export function createThatOpenCameraController(
  world: FrameLogicViewportWorld,
): FrameLogicCameraController {
  const controls = world.camera.controls;
  return new FrameLogicCameraController(
    () => world.camera.three,
    {
      getAzimuth: () => controls.azimuthAngle,
      getPolar: () => controls.polarAngle,
      getEnabled: () => controls.enabled,
      setEnabled: (enabled) => { controls.enabled = enabled; },
      rotateTo: (azimuth, polar, transition) =>
        controls.rotateTo(azimuth, polar, transition),
      setLookAt: (position, target, transition) =>
        controls.setLookAt(
          position.x, position.y, position.z,
          target.x, target.y, target.z,
          transition,
        ),
      zoomTo: (zoom, transition) => controls.zoomTo(zoom, transition),
      subscribeUpdate: (listener) => {
        controls.addEventListener("update", listener);
        return () => controls.removeEventListener("update", listener);
      },
    },
  );
}
