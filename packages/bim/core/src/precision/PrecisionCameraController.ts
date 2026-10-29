import * as THREE from "three";


const DEFAULT_MIN_ORTHO_ZOOM =
  0.0001;


export interface PrecisionCameraControls {
  readonly distance: number;
  readonly minDistance: number;
  readonly minZoom?: number;
  truckSpeed?: number;
  dollyToCursor?: boolean;
  infinityDolly?: boolean;
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
  zoomTo?: (
    zoom: number,
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

    /*
     * Navegación CAD: el zoom debe seguir el punto inspeccionado y no quedar
     * bloqueado al acercarse mucho a una pieza pequeña.
     */
    if (
      "dollyToCursor"
      in this.controls
    ) {
      this.controls.dollyToCursor =
        true;
    }

    if (
      "infinityDolly"
      in this.controls
    ) {
      this.controls.infinityDolly =
        true;
    }

    this.controls.addEventListener(
      "update",
      this.handleControlsUpdate,
    );

    this.syncCameraState();
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

    this.syncCameraState();
  }


  focusObject(
    object: THREE.Object3D,
    padding = 1.35,
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
    padding = 1.35,
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
    else {
      direction.normalize();
    }

    const safePadding = Math.max(
      1,
      padding,
    );
    const distance = Math.max(
      sphere.radius * 2.5,
      this.controls.minDistance * 2,
      50,
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

    /*
     * En ortográfica el encuadre correcto se obtiene cambiando escala/zoom,
     * no acercando físicamente la cámara como en perspectiva.
     */
    if (
      camera
      instanceof THREE.OrthographicCamera
      && this.controls.zoomTo
    ) {
      const availableWidth =
        Math.abs(
          camera.right
          - camera.left,
        );
      const availableHeight =
        Math.abs(
          camera.top
          - camera.bottom,
        );
      const diameter =
        Math.max(
          sphere.radius
          * 2
          * safePadding,
          0.001,
        );
      const minZoom =
        this.controls.minZoom
        ?? DEFAULT_MIN_ORTHO_ZOOM;
      const desiredZoom =
        Math.max(
          minZoom,
          Math.min(
            availableWidth
            / diameter,
            availableHeight
            / diameter,
          ),
        );

      void this.controls.zoomTo(
        desiredZoom,
        true,
      );
    }

    this.syncCameraState();

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
      camera
      instanceof THREE.PerspectiveCamera
    ) {
      const distance = Math.max(
        this.controls.distance,
        this.controls.minDistance,
        1,
      );
      const nextNear = THREE.MathUtils.clamp(
        distance * 1e-5,
        0.001,
        10,
      );
      const nextFar = Math.max(
        camera.far,
        distance * 1000,
        1_000_000,
      );

      if (
        Math.abs(camera.near - nextNear) > 1e-9
        || Math.abs(camera.far - nextFar) > 0.001
      ) {
        camera.near = nextNear;
        camera.far = nextFar;
        camera.updateProjectionMatrix();
      }

      return;
    }

    if (
      camera
      instanceof THREE.OrthographicCamera
    ) {
      const nextFar = Math.max(
        camera.far,
        this.controls.distance * 1000,
        1_000_000,
      );

      if (
        Math.abs(
          camera.far
          - nextFar,
        ) > 0.001
      ) {
        camera.far =
          nextFar;
        camera.updateProjectionMatrix();
      }
    }
  }


  private syncNavigation(): void {
    const camera =
      this.cameraProvider();

    if (
      camera
      instanceof THREE.OrthographicCamera
      && typeof this.controls.truckSpeed
        === "number"
    ) {
      /*
       * En ORTHO evitamos que el pan dependa agresivamente de la distancia
       * cámara-target. La propia escala ortográfica ya gobierna cuánto se ve.
       */
      this.controls.truckSpeed =
        2;
    }
  }


  private syncCameraState(): void {
    this.syncClipping();
    this.syncNavigation();
  }


  private readonly handleControlsUpdate = (): void => {
    this.syncCameraState();
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
