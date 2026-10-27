import * as THREE from "three";

export type CadWorkPlaneMode =
  | "XY"
  | "XZ"
  | "YZ"
  | "CUSTOM"
  | "OFF";

export interface CadWorkPlaneState {
  readonly mode: CadWorkPlaneMode;
  readonly enabled: boolean;
  readonly origin: THREE.Vector3;
  readonly xAxis: THREE.Vector3;
  readonly yAxis: THREE.Vector3;
  readonly normal: THREE.Vector3;
}

export type CadWorkPlaneListener = (
  state: CadWorkPlaneState,
) => void;

type EnabledCadWorkPlaneMode = Exclude<
  CadWorkPlaneMode,
  "OFF"
>;

function isCadNumericKeyboardTarget(
  target: EventTarget | null,
): boolean {
  return target instanceof HTMLInputElement
    && target.dataset["cadNumeric"] === "true";
}

function isEditableKeyboardTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

export class CadWorkPlaneController {
  private readonly scene: THREE.Scene;
  private readonly grid: THREE.GridHelper;
  private readonly listeners = new Set<CadWorkPlaneListener>();

  private readonly origin = new THREE.Vector3();
  private readonly xAxis = new THREE.Vector3(1, 0, 0);
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly normal = new THREE.Vector3(0, 0, 1);
  private readonly plane = new THREE.Plane();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();

  private modeValue: CadWorkPlaneMode = "XY";
  private lastEnabledMode: EnabledCadWorkPlaneMode = "XY";
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.grid = new THREE.GridHelper(20, 20);
    this.grid.name = "FrameLogicCadWorkPlane";

    const materials = Array.isArray(this.grid.material)
      ? this.grid.material
      : [this.grid.material];

    for (const material of materials) {
      material.transparent = true;
      material.opacity = 0.32;
      material.depthWrite = false;
    }

    this.scene.add(this.grid);
    this.applyMode();

    window.addEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );
  }

  get mode(): CadWorkPlaneMode {
    return this.modeValue;
  }

  get enabled(): boolean {
    return this.modeValue !== "OFF";
  }

  getState(): CadWorkPlaneState {
    return {
      mode: this.modeValue,
      enabled: this.enabled,
      origin: this.origin.clone(),
      xAxis: this.xAxis.clone(),
      yAxis: this.yAxis.clone(),
      normal: this.normal.clone(),
    };
  }

  setMode(mode: CadWorkPlaneMode): void {
    if (this.disposed) {
      return;
    }

    this.modeValue = mode;

    if (mode !== "OFF") {
      this.lastEnabledMode = mode;
    }

    this.applyMode();
    this.notify();
  }

  toggleEnabled(): boolean {
    if (this.enabled) {
      this.setMode("OFF");
    }
    else {
      this.setMode(this.lastEnabledMode);
    }

    return this.enabled;
  }

  cycleMode(): CadWorkPlaneMode {
    switch (this.modeValue) {
      case "XY":
        this.setMode("XZ");
        break;
      case "XZ":
        this.setMode("YZ");
        break;
      case "YZ":
      case "CUSTOM":
        this.setMode("OFF");
        break;
      case "OFF":
        this.setMode("XY");
        break;
    }

    return this.modeValue;
  }

  setOrigin(origin: THREE.Vector3): void {
    if (this.disposed) {
      return;
    }

    this.origin.copy(origin);
    this.updateVisual();
    this.notify();
  }

  setFromThreePoints(
    first: THREE.Vector3,
    second: THREE.Vector3,
    third: THREE.Vector3,
  ): boolean {
    if (this.disposed) {
      return false;
    }

    const xAxis = second.clone().sub(first);
    if (xAxis.lengthSq() <= 1e-12) {
      return false;
    }
    xAxis.normalize();

    const thirdDirection = third.clone().sub(first);
    if (thirdDirection.lengthSq() <= 1e-12) {
      return false;
    }

    const normal = new THREE.Vector3().crossVectors(
      xAxis,
      thirdDirection,
    );

    if (normal.lengthSq() <= 1e-12) {
      return false;
    }
    normal.normalize();

    const yAxis = new THREE.Vector3()
      .crossVectors(normal, xAxis)
      .normalize();

    this.origin.copy(first);
    this.xAxis.copy(xAxis);
    this.yAxis.copy(yAxis);
    this.normal.copy(normal);
    this.modeValue = "CUSTOM";
    this.lastEnabledMode = "CUSTOM";

    this.updateVisual();
    this.notify();
    return true;
  }

  intersectPointer(
    clientX: number,
    clientY: number,
    camera: THREE.Camera,
    domElement: HTMLElement,
  ): THREE.Vector3 | null {
    if (!this.enabled) {
      return null;
    }

    const rect = domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.pointer.x = (
      (clientX - rect.left) / rect.width
    ) * 2 - 1;

    this.pointer.y = -(
      (clientY - rect.top) / rect.height
    ) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, camera);
    this.plane.setFromNormalAndCoplanarPoint(
      this.normal,
      this.origin,
    );

    return this.raycaster.ray.intersectPlane(
      this.plane,
      new THREE.Vector3(),
    );
  }

  subscribe(listener: CadWorkPlaneListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());

    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private applyMode(): void {
    switch (this.modeValue) {
      case "XY":
        this.xAxis.set(1, 0, 0);
        this.yAxis.set(0, 1, 0);
        this.normal.set(0, 0, 1);
        break;
      case "XZ":
        this.xAxis.set(1, 0, 0);
        this.yAxis.set(0, 0, 1);
        this.normal.set(0, -1, 0);
        break;
      case "YZ":
        this.xAxis.set(0, 1, 0);
        this.yAxis.set(0, 0, 1);
        this.normal.set(1, 0, 0);
        break;
      case "CUSTOM":
      case "OFF":
        break;
    }

    this.updateVisual();
  }

  private updateVisual(): void {
    this.grid.visible = this.enabled;
    this.grid.position.copy(this.origin);

    if (!this.enabled) {
      this.grid.updateMatrixWorld(true);
      return;
    }

    const basis = new THREE.Matrix4().makeBasis(
      this.xAxis,
      this.normal.clone().negate(),
      this.yAxis,
    );

    this.grid.quaternion.setFromRotationMatrix(basis);
    this.grid.updateMatrixWorld(true);
  }

  private readonly handleKeyDown = (
    event: KeyboardEvent,
  ): void => {
    const cadNumericTarget = isCadNumericKeyboardTarget(
      event.target,
    );

    if (
      this.disposed
      || event.key !== "F9"
      || event.ctrlKey
      || event.metaKey
      || event.altKey
      || (
        isEditableKeyboardTarget(event.target)
        && !cadNumericTarget
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.toggleEnabled();
  };

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.listeners.clear();

    window.removeEventListener(
      "keydown",
      this.handleKeyDown,
      true,
    );

    this.scene.remove(this.grid);
    this.grid.geometry.dispose();

    if (Array.isArray(this.grid.material)) {
      for (const material of this.grid.material) {
        material.dispose();
      }
    }
    else {
      this.grid.material.dispose();
    }
  }
}
