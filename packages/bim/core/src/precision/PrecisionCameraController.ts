import * as THREE from "three";


export interface PrecisionCameraControls {
  readonly distance: number;
  readonly minDistance: number;
  addEventListener(
    type: string,
    listener: () => void,
  ): void;
  removeEventListener(
    type: string,
    listener: () => void,
  ): void;
  setTarget(
    x: number,
    y: number,
    z: number,
    enableTransition: boolean,
  ): Promise<void> | void;
  setOrbitPoint?: (
    x: number,
    y: number,
    z: number,
  ) => void;
  setLookAt?: (
    positionX: number,
    positionY: number,
    positionZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    enableTransition: boolean,
  ) => Promise<void> | void;
}


export class PrecisionCameraController {
  private readonly cameraProvider: () => THREE.Camera;
  private readonly controls: PrecisionCameraControls;
  private disposed = false;


  constructor(
    cameraProvider: () => THREE.Camera,
    controls: PrecisionCameraControls,
  ) {
    this.cameraProvider = cameraProvider;
    this.controls = controls;

    this.controls.addEventListener(
      "update",
      this.handleControlsUpdate,
    );

    this.syncClipping();
  }


  setInspectionPoint(
    point: THREE.Vector3,
  ): void {
    if (
      this.controls.setOrbitPoint
    ) {
      this.controls.setOrbitPoint(
        point.x,
        point.y,
        point.z,
      );
    }
    else {
      void this.controls.setTarget(
        point.x,
        point.y,
        point.z,
        false,
      );
    }

    this.syncClipping();
  }


  focusObject(
    object: THREE.Object3D,
    padding = 1.6,
  ): boolean {
    object.updateMatrixWorld(true);

    const bounds = new THREE.Box3()
      .setFromObject(object);

    if (
      bounds.isEmpty()
    ) {
      return false;
    }

    return this.focusBounds(
      bounds,
      padding,
    );
  }


  focusBounds(
    bounds: THREE.Box3,
    padding = 1.6,
  ): boolean {
    if (
      bounds.isEmpty()
    ) {
      return false;
    }

    const sphere = bounds.getBoundingSphere(
      new THREE.Sphere(),
    );
    const camera = this.cameraProvider();
    const direction = new THREE.Vector3();

    camera.getWorldDirection(
      direction,
    );

    if (
      direction.lengthSq() <= 1e-20
    ) {
      direction.set(
        -1,
        -1,
        -1,
      ).normalize();
    }

    const safePadding = Math.max(
      1,
      padding,
    );
    const distance = Math.max(
      sphere.radius * 2.5 * safePadding,
      this.controls.minDistance * 2,
      0.05,
    );
    const position = sphere.center.clone()
      .addScaledVector(
        direction,
        -distance,
      );

    if (
      this.controls.setLookAt
    ) {
      void this.controls.setLookAt(
        position.x,
        position.y,
        position.z,
        sphere.center.x,
        sphere.center.y,
        sphere.center.z,
        true,
      );
    }
    else {
      camera.position.copy(position);
      camera.lookAt(sphere.center);
      camera.updateMatrixWorld(true);
      this.setInspectionPoint(
        sphere.center,
      );
    }

    this.syncClipping();

    return true;
  }


  syncClipping(): void {
    if (
      this.disposed
    ) {
      return;
    }

    const camera = this.cameraProvider();

    if (
      !(camera instanceof THREE.PerspectiveCamera)
    ) {
      return;
    }

    const distance = Math.max(
      this.controls.distance,
      this.controls.minDistance,
      0.001,
    );
    const nextNear = THREE.MathUtils.clamp(
      distance * 1e-5,
      1e-6,
      0.01,
    );
    const nextFar = Math.max(
      camera.far,
      distance * 1000,
      1000,
    );

    if (
      Math.abs(camera.near - nextNear) > 1e-12
      || Math.abs(camera.far - nextFar) > 1e-6
    ) {
      camera.near = nextNear;
      camera.far = nextFar;
      camera.updateProjectionMatrix();
    }
  }


  private readonly handleControlsUpdate = (): void => {
    this.syncClipping();
  };


  dispose(): void {
    if (
      this.disposed
    ) {
      return;
    }

    this.disposed = true;

    this.controls.removeEventListener(
      "update",
      this.handleControlsUpdate,
    );
  }
}
