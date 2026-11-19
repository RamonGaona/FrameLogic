import type * as THREE from "three";

/**
 * Small camera-navigation boundary owned by FrameLogic.
 *
 * The first backend delegates to the existing That Open CameraControls to
 * preserve its zoom/orbit/pan behavior. A future native Three.js backend can
 * provide the same operations without exposing That Open to CAD consumers.
 *
 * This controller does not own or dispose of the THREE.Camera or renderer.
 */
export interface FrameLogicCameraOrientation {
  readonly azimuth: number;
  readonly polar: number;
}

export interface FrameLogicCameraDriver {
  readonly getAzimuth: () => number;
  readonly getPolar: () => number;
  readonly getEnabled: () => boolean;
  readonly setEnabled: (enabled: boolean) => void;
  readonly rotateTo: (
    azimuth: number,
    polar: number,
    transition: boolean,
  ) => unknown;
  readonly setLookAt: (
    position: THREE.Vector3,
    target: THREE.Vector3,
    transition: boolean,
  ) => unknown;
  readonly zoomTo: (zoom: number, transition: boolean) => unknown;
  readonly subscribeUpdate: (listener: () => void) => () => void;
  readonly getDistance: () => number;
  readonly getTarget: (target: THREE.Vector3) => THREE.Vector3;
  readonly getOrthographicCamera: () => THREE.OrthographicCamera;
  readonly setMinimumZoom: (value: number) => void;
  readonly getMouseButtons: () => FrameLogicCameraMouseButtons;
}

export interface FrameLogicCameraMouseButtons {
  left: number;
  middle: number;
  right: number;
  wheel: number;
}

export class FrameLogicCameraController {
  private readonly cameraProvider: () => THREE.Camera;
  private readonly driver: FrameLogicCameraDriver;

  constructor(
    cameraProvider: () => THREE.Camera,
    driver: FrameLogicCameraDriver,
  ) {
    this.cameraProvider = cameraProvider;
    this.driver = driver;
  }

  /** Always read the active camera: avoid stale orthographic/perspective refs. */
  get camera(): THREE.Camera {
    return this.cameraProvider();
  }

  get orientation(): FrameLogicCameraOrientation {
    return {
      azimuth: this.driver.getAzimuth(),
      polar: this.driver.getPolar(),
    };
  }

  get enabled(): boolean {
    return this.driver.getEnabled();
  }

  get distance(): number {
    return this.driver.getDistance();
  }

  /** Return the live native orthographic camera used by CAD Model Space. */
  get orthographicCamera(): THREE.OrthographicCamera {
    return this.driver.getOrthographicCamera();
  }

  getTarget(target: THREE.Vector3): THREE.Vector3 {
    return this.driver.getTarget(target);
  }

  setMinimumZoom(value: number): void {
    this.driver.setMinimumZoom(value);
  }

  /** CAD mouse bindings stay plain mutable values, not That Open types. */
  get mouseBindings(): { readonly mouseButtons: FrameLogicCameraMouseButtons } {
    return { mouseButtons: this.driver.getMouseButtons() };
  }

  setEnabled(enabled: boolean): void {
    this.driver.setEnabled(enabled);
  }

  async rotateTo(
    azimuth: number,
    polar: number,
    transition = true,
  ): Promise<void> {
    await this.driver.rotateTo(azimuth, polar, transition);
  }

  async setLookAt(
    position: THREE.Vector3,
    target: THREE.Vector3,
    transition = true,
  ): Promise<void> {
    await this.driver.setLookAt(position, target, transition);
  }

  async zoomTo(zoom: number, transition = true): Promise<void> {
    await this.driver.zoomTo(zoom, transition);
  }

  /**
   * Forward orientation updates without tying the caller to camera-controls
   * event types. Subscribe after attaching renderer/camera; unsubscribe on
   * teardown.
   */
  subscribeOrientation(
    listener: (orientation: FrameLogicCameraOrientation) => void,
  ): () => void {
    const publish = () => listener(this.orientation);
    const unsubscribe = this.driver.subscribeUpdate(publish);
    publish();
    return unsubscribe;
  }
}
