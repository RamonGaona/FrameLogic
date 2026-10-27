import * as THREE from "three";

import type {
  DesignSelectionController,
} from "./DesignSelectionController";

import type {
  CadPointSelectionController,
} from "./CadPointSelectionController";

import type {
  CadLineSelectionController,
} from "./CadLineSelectionController";

import type {
  DesignSnapController,
} from "./DesignSnapController";

import type {
  CadWorkPlaneController,
} from "./CadWorkPlaneController";


export type CadWorkPlaneEditMode =
  | "NONE"
  | "ORIGIN"
  | "THREE_POINTS";


export interface CadWorkPlaneEditState {
  readonly mode: CadWorkPlaneEditMode;
  readonly pointCount: number;
  readonly message: string;
}


export type CadWorkPlaneEditListener = (
  state: CadWorkPlaneEditState,
) => void;


interface DesignFaceHit {
  readonly point: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly instanceId: string;
}


interface SelectionSurfaceRuntime {
  readonly cameraProvider?: () => THREE.Camera;
  readonly designScene?: {
    getInstanceEntries?: () => Array<[string, THREE.Object3D]>;
  };
}


type ThreePointSource =
  | "NONE"
  | "FACE"
  | "SNAP";


export class CadWorkPlaneEditController {
  private readonly domElement: HTMLElement;
  private readonly workPlane: CadWorkPlaneController;
  private readonly snap: DesignSnapController;
  private readonly selection: DesignSelectionController;
  private readonly pointSelection: CadPointSelectionController | null;
  private readonly lineSelection: CadLineSelectionController | null;
  private readonly listeners = new Set<CadWorkPlaneEditListener>();
  private readonly points: THREE.Vector3[] = [];

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly referenceFacePlane = new THREE.Plane();
  private readonly referenceFaceNormal = new THREE.Vector3();
  private referenceFaceInstanceId: string | null = null;
  private threePointSource: ThreePointSource = "NONE";

  private readonly originEditor: HTMLDivElement;
  private readonly originXInput: HTMLInputElement;
  private readonly originYInput: HTMLInputElement;
  private readonly originZInput: HTMLInputElement;

  private modeValue: CadWorkPlaneEditMode = "NONE";
  private pointerDownX = 0;
  private pointerDownY = 0;
  private pointerDownActive = false;
  private messageValue = "";
  private disposed = false;

  constructor(
    domElement: HTMLElement,
    workPlane: CadWorkPlaneController,
    snap: DesignSnapController,
    selection: DesignSelectionController,
    pointSelection?: CadPointSelectionController,
    lineSelection?: CadLineSelectionController,
  ) {
    this.domElement = domElement;
    this.workPlane = workPlane;
    this.snap = snap;
    this.selection = selection;
    this.pointSelection = pointSelection ?? null;
    this.lineSelection = lineSelection ?? null;

    this.originEditor = document.createElement("div");
    this.originEditor.style.position = "fixed";
    this.originEditor.style.left = "50%";
    this.originEditor.style.bottom = "72px";
    this.originEditor.style.transform = "translateX(-50%)";
    this.originEditor.style.zIndex = "1100";
    this.originEditor.style.display = "none";
    this.originEditor.style.alignItems = "center";
    this.originEditor.style.gap = "6px";
    this.originEditor.style.padding = "8px 10px";
    this.originEditor.style.border = "1px solid rgba(255,255,255,0.22)";
    this.originEditor.style.borderRadius = "8px";
    this.originEditor.style.background = "rgba(20,24,30,0.96)";
    this.originEditor.style.color = "#fff";
    this.originEditor.style.font = "600 12px system-ui, sans-serif";
    this.originEditor.style.boxShadow = "0 6px 18px rgba(0,0,0,0.28)";

    const label = document.createElement("span");
    label.textContent = "WP · ORIGEN";
    label.style.marginRight = "2px";
    this.originEditor.append(label);

    this.originXInput = this.createCoordinateInput("X");
    this.originYInput = this.createCoordinateInput("Y");
    this.originZInput = this.createCoordinateInput("Z");

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.textContent = "Mover";
    applyButton.style.height = "30px";
    applyButton.style.padding = "0 10px";
    applyButton.style.cursor = "pointer";
    applyButton.addEventListener("click", this.applyOriginCoordinates);
    this.originEditor.append(applyButton);

    this.originEditor.addEventListener("keydown", this.handleOriginEditorKeyDown);
    document.body.append(this.originEditor);

    this.domElement.addEventListener("pointerdown", this.handlePointerDown, true);
    this.domElement.addEventListener("pointerup", this.handlePointerUp, true);
  }

  private createCoordinateInput(axis: "X" | "Y" | "Z"): HTMLInputElement {
    const wrapper = document.createElement("label");
    wrapper.style.display = "inline-flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "3px";
    wrapper.textContent = axis;

    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.dataset["cadNumeric"] = "true";
    input.style.width = "78px";
    input.style.height = "28px";
    input.style.boxSizing = "border-box";
    input.style.font = "12px system-ui, sans-serif";
    wrapper.append(input);
    this.originEditor.append(wrapper);
    return input;
  }

  get isActive(): boolean {
    return this.modeValue !== "NONE";
  }

  getState(): CadWorkPlaneEditState {
    return {
      mode: this.modeValue,
      pointCount: this.points.length,
      message: this.messageValue,
    };
  }

  startOrigin(): void {
    if (this.disposed) {
      return;
    }

    this.cancel();
    this.modeValue = "ORIGIN";
    this.messageValue =
      "Mueve el WorkPlane con XYZ o selecciona un SNAP 3D. La orientación actual se conserva.";

    this.selection.setEnabled(false);
    this.pointSelection?.setEnabled(false);
    this.lineSelection?.setEnabled(false);

    const origin = this.workPlane.getState().origin;
    this.originXInput.value = this.formatCoordinate(origin.x);
    this.originYInput.value = this.formatCoordinate(origin.y);
    this.originZInput.value = this.formatCoordinate(origin.z);
    this.originEditor.style.display = "flex";

    this.notify();

    window.setTimeout(() => {
      if (!this.disposed && this.modeValue === "ORIGIN") {
        this.originXInput.focus();
        this.originXInput.select();
      }
    }, 0);
  }

  startThreePoints(): void {
    if (this.disposed) {
      return;
    }

    this.cancel();
    this.modeValue = "THREE_POINTS";
    this.messageValue =
      "Punto 1/3: haz clic sobre una cara de la pieza para definir el nuevo origen local 0,0,0.";
    this.selection.setEnabled(false);
    this.pointSelection?.setEnabled(false);
    this.lineSelection?.setEnabled(false);
    this.notify();
  }

  cancel(): void {
    this.modeValue = "NONE";
    this.resetThreePointReference();
    this.pointerDownActive = false;
    this.messageValue = "";
    this.originEditor.style.display = "none";
    this.selection.setEnabled(true);
    this.pointSelection?.setEnabled(true);
    this.lineSelection?.setEnabled(true);
    this.notify();
  }

  private resetThreePointReference(): void {
    this.points.length = 0;
    this.threePointSource = "NONE";
    this.referenceFaceInstanceId = null;
    this.referenceFaceNormal.set(0, 0, 0);
    this.referenceFacePlane.set(new THREE.Vector3(0, 0, 1), 0);
  }

  private readonly applyOriginCoordinates = (): void => {
    if (this.modeValue !== "ORIGIN") {
      return;
    }

    const x = Number(this.originXInput.value);
    const y = Number(this.originYInput.value);
    const z = Number(this.originZInput.value);

    if (![x, y, z].every(Number.isFinite)) {
      this.messageValue = "Introduce valores X, Y y Z válidos para mover el WorkPlane.";
      this.notify();
      return;
    }

    this.workPlane.setOrigin(new THREE.Vector3(x, y, z));
    this.finish();
  };

  private readonly handleOriginEditorKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      this.applyOriginCoordinates();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.isActive || event.button !== 0) {
      return;
    }

    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.pointerDownActive = true;
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (!this.isActive || !this.pointerDownActive || event.button !== 0) {
      return;
    }

    this.pointerDownActive = false;

    const movement = Math.hypot(
      event.clientX - this.pointerDownX,
      event.clientY - this.pointerDownY,
    );

    if (movement > 5) {
      return;
    }

    if (this.modeValue === "THREE_POINTS") {
      this.handleThreePointClick(event);
      return;
    }

    const snap = this.snap.findSnap(event.clientX, event.clientY);

    if (!snap) {
      this.messageValue =
        "Selecciona un SNAP 3D o escribe XYZ para mover el WorkPlane libremente.";
      this.notify();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.workPlane.setOrigin(snap.point);
    this.finish();
  };

  private handleThreePointClick(event: PointerEvent): void {
    if (this.threePointSource === "FACE") {
      const faceHit = this.pickDesignFace(event.clientX, event.clientY);

      if (!faceHit) {
        this.messageValue =
          `Punto ${this.points.length + 1}/3: haz clic sobre la misma cara de referencia.`;
        this.notify();
        return;
      }

      if (!this.isHitOnReferenceFace(faceHit)) {
        this.messageValue =
          "El punto debe estar sobre la misma cara plana usada como referencia.";
        this.notify();
        return;
      }

      const point = faceHit.point.clone();
      this.referenceFacePlane.projectPoint(point, point);
      this.acceptThreePoint(event, point);
      return;
    }

    if (this.threePointSource === "SNAP") {
      const snap = this.snap.findSnap(event.clientX, event.clientY);

      if (!snap) {
        this.messageValue =
          `Punto ${this.points.length + 1}/3: selecciona un SNAP válido.`;
        this.notify();
        return;
      }

      this.acceptThreePoint(event, snap.point.clone());
      return;
    }

    const faceHit = this.pickDesignFace(event.clientX, event.clientY);

    if (faceHit) {
      this.threePointSource = "FACE";
      this.referenceFaceInstanceId = faceHit.instanceId;
      this.referenceFaceNormal.copy(faceHit.normal).normalize();
      this.referenceFacePlane.setFromNormalAndCoplanarPoint(
        this.referenceFaceNormal,
        faceHit.point,
      );
      this.acceptThreePoint(event, faceHit.point.clone());
      return;
    }

    const snap = this.snap.findSnap(event.clientX, event.clientY);

    if (snap) {
      this.threePointSource = "SNAP";
      this.acceptThreePoint(event, snap.point.clone());
      return;
    }

    this.messageValue =
      "Punto 1/3: haz clic sobre una cara de una pieza o selecciona un SNAP válido.";
    this.notify();
  }

  private acceptThreePoint(
    event: PointerEvent,
    point: THREE.Vector3,
  ): void {
    if (
      this.points.length === 1
      && point.distanceToSquared(this.points[0]) <= 1e-12
    ) {
      this.messageValue =
        "Punto 2/3: debe ser diferente al origen para definir +X local.";
      this.notify();
      return;
    }

    this.points.push(point);
    event.preventDefault();
    event.stopPropagation();

    if (this.points.length === 1) {
      this.messageValue =
        this.threePointSource === "FACE"
          ? "Punto 2/3: sobre la misma cara, haz clic en la dirección +X local."
          : "Punto 2/3: selecciona el SNAP que define +X local.";
      this.notify();
      return;
    }

    if (this.points.length === 2) {
      this.messageValue =
        this.threePointSource === "FACE"
          ? "Punto 3/3: sobre la misma cara, define +Y local. +Z será perpendicular a la cara."
          : "Punto 3/3: selecciona un SNAP para definir +Y local; +Z será perpendicular.";
      this.notify();
      return;
    }

    const applied = this.workPlane.setFromThreePoints(
      this.points[0],
      this.points[1],
      this.points[2],
    );

    if (!applied) {
      this.points.pop();
      this.messageValue =
        "El tercer punto no puede ser colineal con los dos primeros. Selecciona otro punto para +Y local.";
      this.notify();
      return;
    }

    this.finish();
  }

  private pickDesignFace(
    clientX: number,
    clientY: number,
  ): DesignFaceHit | null {
    const runtime = this.selection as unknown as SelectionSurfaceRuntime;
    const cameraProvider = runtime.cameraProvider;
    const getInstanceEntries = runtime.designScene?.getInstanceEntries;

    if (!cameraProvider || !getInstanceEntries) {
      return null;
    }

    const rect = this.domElement.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, cameraProvider());

    let best: DesignFaceHit | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const normalMatrix = new THREE.Matrix3();

    for (const [instanceId, root] of getInstanceEntries.call(runtime.designScene)) {
      if (!root.visible) {
        continue;
      }

      const intersections = this.raycaster.intersectObject(root, true);

      for (const intersection of intersections) {
        if (!intersection.face || intersection.distance >= bestDistance) {
          continue;
        }

        normalMatrix.getNormalMatrix(intersection.object.matrixWorld);
        const normal = intersection.face.normal
          .clone()
          .applyNormalMatrix(normalMatrix)
          .normalize();

        if (normal.lengthSq() <= 1e-12) {
          continue;
        }

        bestDistance = intersection.distance;
        best = {
          point: intersection.point.clone(),
          normal,
          instanceId,
        };
        break;
      }
    }

    return best;
  }

  private isHitOnReferenceFace(hit: DesignFaceHit): boolean {
    if (!this.referenceFaceInstanceId) {
      return false;
    }

    if (hit.instanceId !== this.referenceFaceInstanceId) {
      return false;
    }

    const normalAlignment = Math.abs(
      hit.normal.dot(this.referenceFaceNormal),
    );

    if (normalAlignment < 0.999) {
      return false;
    }

    return Math.abs(
      this.referenceFacePlane.distanceToPoint(hit.point),
    ) <= 1e-4;
  }

  private formatCoordinate(value: number): string {
    if (Math.abs(value) < 1e-12) {
      return "0";
    }
    return String(Number(value.toFixed(6)));
  }

  private finish(): void {
    this.modeValue = "NONE";
    this.resetThreePointReference();
    this.pointerDownActive = false;
    this.messageValue = "";
    this.originEditor.style.display = "none";
    this.notify();

    window.setTimeout(() => {
      if (this.disposed) {
        return;
      }
      this.selection.setEnabled(true);
      this.pointSelection?.setEnabled(true);
      this.lineSelection?.setEnabled(true);
    }, 0);
  }

  subscribe(listener: CadWorkPlaneEditListener): () => void {
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

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    this.cancel();
    this.domElement.removeEventListener("pointerdown", this.handlePointerDown, true);
    this.domElement.removeEventListener("pointerup", this.handlePointerUp, true);
    this.originEditor.removeEventListener("keydown", this.handleOriginEditorKeyDown);
    this.originEditor.remove();
    this.listeners.clear();
  }
}
