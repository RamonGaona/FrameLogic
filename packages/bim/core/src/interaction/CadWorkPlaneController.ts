import * as THREE from "three";


export type CadWorkPlaneMode =
  | "XY"
  | "XZ"
  | "YZ"
  | "OFF";


export interface CadWorkPlaneState {

  readonly mode:
    CadWorkPlaneMode;

  readonly enabled:
    boolean;

  readonly origin:
    THREE.Vector3;

  readonly xAxis:
    THREE.Vector3;

  readonly yAxis:
    THREE.Vector3;

  readonly normal:
    THREE.Vector3;

}


export type CadWorkPlaneListener =
  (
    state:
      CadWorkPlaneState,
  ) => void;


export class CadWorkPlaneController {

  private readonly scene:
    THREE.Scene;


  private readonly grid:
    THREE.GridHelper;


  private readonly listeners =
    new Set<
      CadWorkPlaneListener
    >();


  private readonly origin =
    new THREE.Vector3();


  private readonly xAxis =
    new THREE.Vector3(
      1,
      0,
      0,
    );


  private readonly yAxis =
    new THREE.Vector3(
      0,
      1,
      0,
    );


  private readonly normal =
    new THREE.Vector3(
      0,
      0,
      1,
    );


  private readonly plane =
    new THREE.Plane();


  private readonly raycaster =
    new THREE.Raycaster();


  private readonly pointer =
    new THREE.Vector2();


  private modeValue:
    CadWorkPlaneMode =
      "XY";


  private disposed =
    false;


  constructor(
    scene:
      THREE.Scene,
  ) {

    this.scene =
      scene;


    this.grid =
      new THREE.GridHelper(
        20,
        20,
      );


    this.grid.name =
      "FrameLogicCadWorkPlane";


    const materials =
      Array.isArray(
        this.grid.material,
      )
        ? this.grid.material
        : [
            this.grid.material,
          ];


    for (
      const material
      of materials
    ) {

      material.transparent =
        true;

      material.opacity =
        0.32;

      material.depthWrite =
        false;

    }


    this.scene.add(
      this.grid,
    );


    this.applyMode();

  }


  // ==========================================================
  // STATE
  // ==========================================================

  get mode():
    CadWorkPlaneMode {

    return this.modeValue;

  }


  get enabled():
    boolean {

    return this.modeValue
      !== "OFF";

  }


  getState():
    CadWorkPlaneState {

    return {

      mode:
        this.modeValue,

      enabled:
        this.enabled,

      origin:
        this.origin.clone(),

      xAxis:
        this.xAxis.clone(),

      yAxis:
        this.yAxis.clone(),

      normal:
        this.normal.clone(),

    };

  }


  // ==========================================================
  // MODE
  // ==========================================================

  setMode(
    mode:
      CadWorkPlaneMode,
  ): void {

    if (
      this.disposed
      || mode
        === this.modeValue
    ) {

      return;

    }


    this.modeValue =
      mode;


    this.applyMode();


    this.notify();

  }


  cycleMode():
    CadWorkPlaneMode {

    switch (
      this.modeValue
    ) {

      case "XY":

        this.setMode(
          "XZ",
        );

        break;


      case "XZ":

        this.setMode(
          "YZ",
        );

        break;


      case "YZ":

        this.setMode(
          "OFF",
        );

        break;


      case "OFF":

        this.setMode(
          "XY",
        );

        break;

    }


    return this.modeValue;

  }


  // ==========================================================
  // ORIGIN
  // ==========================================================

  setOrigin(
    origin:
      THREE.Vector3,
  ): void {

    if (
      this.disposed
    ) {

      return;

    }


    this.origin.copy(
      origin,
    );


    this.applyMode();


    this.notify();

  }


  // ==========================================================
  // POINTER -> ACTIVE PLANE
  // ==========================================================

  intersectPointer(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    domElement: HTMLElement,
  ):
    THREE.Vector3
    | null {

    if (
      !this.enabled
    ) {

      return null;

    }


    const rect =
      domElement
        .getBoundingClientRect();


    if (
      rect.width <= 0
      || rect.height <= 0
    ) {

      return null;

    }


    this.pointer.x =
      (
        (
          clientX
          - rect.left
        )
        / rect.width
      )
      * 2
      - 1;


    this.pointer.y =
      -(
        (
          clientY
          - rect.top
        )
        / rect.height
      )
      * 2
      + 1;


    this.raycaster.setFromCamera(
      this.pointer,
      camera,
    );


    this.plane.setFromNormalAndCoplanarPoint(
      this.normal,
      this.origin,
    );


    return this.raycaster.ray
      .intersectPlane(
        this.plane,
        new THREE.Vector3(),
      );

  }


  // ==========================================================
  // SUBSCRIBE
  // ==========================================================

  subscribe(
    listener:
      CadWorkPlaneListener,
  ): () => void {

    this.listeners.add(
      listener,
    );


    listener(
      this.getState(),
    );


    return () => {

      this.listeners.delete(
        listener,
      );

    };

  }


  private notify(): void {

    const state =
      this.getState();


    for (
      const listener
      of this.listeners
    ) {

      listener(
        state,
      );

    }

  }


  // ==========================================================
  // VISUAL / BASIS
  // ==========================================================

  private applyMode(): void {

    this.grid.visible =
      this.enabled;


    this.grid.position.copy(
      this.origin,
    );


    this.grid.rotation.set(
      0,
      0,
      0,
    );


    switch (
      this.modeValue
    ) {

      case "XY":

        this.xAxis.set(
          1,
          0,
          0,
        );

        this.yAxis.set(
          0,
          1,
          0,
        );

        this.normal.set(
          0,
          0,
          1,
        );

        this.grid.rotation.x =
          Math.PI / 2;

        break;


      case "XZ":

        this.xAxis.set(
          1,
          0,
          0,
        );

        this.yAxis.set(
          0,
          0,
          1,
        );

        this.normal.set(
          0,
          1,
          0,
        );

        break;


      case "YZ":

        this.xAxis.set(
          0,
          1,
          0,
        );

        this.yAxis.set(
          0,
          0,
          1,
        );

        this.normal.set(
          1,
          0,
          0,
        );

        this.grid.rotation.z =
          -Math.PI / 2;

        break;


      case "OFF":

        break;

    }


    this.grid.updateMatrixWorld(
      true,
    );

  }


  // ==========================================================
  // DISPOSE
  // ==========================================================

  dispose(): void {

    if (
      this.disposed
    ) {

      return;

    }


    this.disposed =
      true;


    this.listeners.clear();


    this.scene.remove(
      this.grid,
    );


    this.grid.geometry.dispose();


    if (
      Array.isArray(
        this.grid.material,
      )
    ) {

      for (
        const material
        of this.grid.material
      ) {

        material.dispose();

      }

    }
    else {

      this.grid.material.dispose();

    }

  }

}
