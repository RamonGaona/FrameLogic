import * as THREE from "three";

/**
 * Screen-space pivot control for CAD blocks. Unlike native TransformControls
 * XYZ picking, it is an actual button above the canvas: its clicks cannot be
 * misclassified as clicks on the drawing behind the gizmo.
 */
export class CadReferencePivotHandle {
  private readonly button: HTMLButtonElement;
  private readonly ray = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly plane = new THREE.Plane();
  private readonly hit = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly original = new THREE.Vector3();
  private pointerId: number | null = null;
  private pointerX = 0;
  private pointerY = 0;
  private dragged = false;
  private active = false;
  private mode: "translate" | "rotate" = "translate";
  private frame: number | null = null;
  private readonly canvas: HTMLElement;
  private readonly cameraProvider: () => THREE.Camera;
  private readonly pivot: THREE.Object3D;
  private readonly setCameraEnabled: (enabled: boolean) => void;
  private readonly onArm: () => void;
  private readonly onPlaced: (() => void) | undefined;
  private readonly findDropSnap: ((x: number, y: number) => THREE.Vector3 | null) | undefined;

  constructor(
    canvas: HTMLElement,
    cameraProvider: () => THREE.Camera,
    pivot: THREE.Object3D,
    setCameraEnabled: (enabled: boolean) => void,
    onArm: () => void,
    kind: "cad" | "piece" = "cad",
    onPlaced?: () => void,
    findDropSnap?: (x: number, y: number) => THREE.Vector3 | null,
  ) {
    this.canvas = canvas;
    this.cameraProvider = cameraProvider;
    this.pivot = pivot;
    this.setCameraEnabled = setCameraEnabled;
    this.onArm = onArm;
    this.onPlaced = onPlaced;
    this.findDropSnap = findDropSnap;
    const button = document.createElement("button");
    this.button = button;
    button.type = "button";
    button.dataset[kind === "piece" ? "framelogicPiecePivot" : "framelogicDwgPivot"] = "true";
    button.setAttribute("aria-label", "Cambiar el punto base del gizmo con SNAP");
    Object.assign(button.style, {
      position: "fixed", display: "none", zIndex: "1002",
      width: "24px", height: "24px", padding: "0",
      borderRadius: "50%", transform: "translate(-50%, -50%)",
      boxSizing: "border-box", border: "2px solid #14232c",
      background: "#ffec7c", boxShadow: "0 0 0 2px #ffffff",
      cursor: "crosshair", touchAction: "none", pointerEvents: "auto",
    });
    document.body.append(button);
    button.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove, true);
    window.addEventListener("pointerup", this.onUp, true);
    window.addEventListener("pointercancel", this.onCancel, true);
  }

  activate(mode: "translate" | "rotate"): void {
    this.mode = mode;
    this.active = true;
    this.position();
    if (this.frame === null) this.frame = requestAnimationFrame(this.tick);
  }

  deactivate(): void {
    this.active = false;
    this.finish(false);
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.button.style.display = "none";
  }

  dispose(): void {
    this.deactivate();
    this.button.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove, true);
    window.removeEventListener("pointerup", this.onUp, true);
    window.removeEventListener("pointercancel", this.onCancel, true);
    this.button.remove();
  }

  private readonly tick = (): void => {
    this.frame = null;
    if (!this.active) return;
    this.position();
    this.frame = requestAnimationFrame(this.tick);
  };

  private position(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (!this.active || rect.width <= 0 || rect.height <= 0) {
      this.button.style.display = "none";
      return;
    }
    const camera = this.cameraProvider();
    camera.updateMatrixWorld(true);
    const screen = this.pivot.getWorldPosition(new THREE.Vector3()).project(camera);
    if (![screen.x, screen.y, screen.z].every(Number.isFinite)
      || screen.z < -1 || screen.z > 1 || Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1) {
      this.button.style.display = "none";
      return;
    }
    this.button.style.left = String(rect.left + (screen.x + 1) * rect.width / 2) + "px";
    this.button.style.top = String(rect.top + (1 - screen.y) * rect.height / 2) + "px";
    this.button.style.display = "block";
    this.button.title = this.mode === "rotate"
      ? "Centro ROTATE: clic, después elige un SNAP para el centro de giro"
      : "Punto base MOVE: clic y selecciona un SNAP; o arrastra hasta otra ubicación";
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (!this.active || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pointerId = event.pointerId;
    this.pointerX = event.clientX;
    this.pointerY = event.clientY;
    this.dragged = false;
    this.original.copy(this.pivot.position);
    const direction = this.cameraProvider().getWorldDirection(new THREE.Vector3());
    this.plane.setFromNormalAndCoplanarPoint(direction, this.pivot.position);
    const hit = this.intersectPlane(event.clientX, event.clientY);
    this.offset.copy(this.pivot.position).sub(hit ?? this.pivot.position);
    this.setCameraEnabled(false);
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || !this.active) return;
    if (Math.hypot(event.clientX - this.pointerX, event.clientY - this.pointerY) <= 5) return;
    this.dragged = true;
    const hit = this.intersectPlane(event.clientX, event.clientY);
    if (hit) {
      this.pivot.position.copy(hit).add(this.offset);
      this.pivot.updateMatrixWorld(true);
      this.position();
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const click = !this.dragged
      && Math.hypot(event.clientX - this.pointerX, event.clientY - this.pointerY) <= 5;
    const placed = this.dragged && this.active;
    // A free drag is convenient, but an actual ENDPOINT/MIDPOINT/etc.
    // under the released cursor takes priority for an exact base location.
    if (placed && this.mode === "translate" && this.findDropSnap) {
      const snap = this.findDropSnap(event.clientX, event.clientY);
      if (snap && [snap.x, snap.y, snap.z].every(Number.isFinite)) {
        this.pivot.position.copy(snap);
        this.pivot.updateMatrixWorld(true);
        this.position();
      }
    }
    this.finish(true);
    if (placed) this.onPlaced?.();
    if (click && this.active) this.onArm();
  };

  private readonly onCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId) this.finish(false);
  };

  private finish(commit: boolean): void {
    if (this.pointerId === null) return;
    if (!commit && this.dragged) {
      this.pivot.position.copy(this.original);
      this.pivot.updateMatrixWorld(true);
    }
    this.dragged = false;
    this.pointerId = null;
    this.setCameraEnabled(true);
  }

  private intersectPlane(x: number, y: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) return null;
    this.pointer.set((x - rect.left) / rect.width * 2 - 1,
      -(y - rect.top) / rect.height * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.cameraProvider());
    return this.ray.ray.intersectPlane(this.plane, this.hit) ? this.hit : null;
  }
}
