import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";

import type { FrameLogicViewportPort } from "./FrameLogicViewportPort";
import {
  pickNativeProjectPieceInstance,
  type NativeProjectInstanceTarget,
} from "./NativeProjectPiecePicker";

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 200;

/**
 * Creates a separate native orthographic camera from the current Model Space
 * camera. It shares no camera state with That Open and adjusts the horizontal
 * span for the diagnostic preview aspect ratio.
 */
export function copyNativeOrthographicPreviewCamera(
  source: THREE.OrthographicCamera,
  width: number,
  height: number,
  destination = new THREE.OrthographicCamera(),
): THREE.OrthographicCamera {
  if (!(width > 0 && height > 0)) {
    throw new Error("Native preview requires positive viewport dimensions.");
  }
  // Never clone child objects on each frame (Object3D.copy defaults recursive).
  destination.copy(source, false);
  const halfHeight = (source.top - source.bottom) / 2;
  const centerX = (source.left + source.right) / 2;
  const halfWidth = halfHeight * (width / height);
  destination.left = centerX - halfWidth;
  destination.right = centerX + halfWidth;
  destination.updateProjectionMatrix();
  return destination;
}

export interface ExperimentalNativeThreePreviewOptions {
  readonly host: HTMLElement;
  readonly viewport: FrameLogicViewportPort;
  /** Injected only in tests; default is a completely separate WebGLRenderer. */
  readonly createRenderer?: () => THREE.WebGLRenderer;
  /** Larger on-demand project-wide viewport; default remains 320 x 200. */
  readonly width?: number;
  readonly height?: number;
  readonly title?: string;
  readonly onClose?: () => void;
  /** Optional CAD-owned selection. No mesh state is edited by this viewer. */
  readonly getInstanceTargets?: () => readonly NativeProjectInstanceTarget[];
  readonly onSelectInstance?: (instanceId: string) => boolean;
  readonly getSelectedInstanceIds?: () => readonly string[];
  /** Dispatch existing persistent CAD commands in the primary Model Space. */
  readonly onStartMove?: () => boolean;
  readonly onStartRotate?: () => boolean;
  readonly onUndo?: () => boolean;
  readonly onRedo?: () => boolean;
  /**
   * Optional direct gizmo editing contract. The production CAD model is the
   * only source of transforms and Undo/Redo. No visual-only placement.
   */
  readonly nativeEdit?: {
    getTarget(): { readonly id: string; readonly position: THREE.Vector3; readonly quaternion: THREE.Quaternion } | null;
    begin(mode: "translate" | "rotate"): boolean;
    preview(position: THREE.Vector3, quaternion: THREE.Quaternion): boolean;
    finish(commit: boolean): boolean;
    readonly isDragging: boolean;
  };
}

export interface ExperimentalNativeThreePreviewHandle {
  readonly canvas: HTMLCanvasElement;
  dispose(): void;
}

/**
 * Opt-in diagnostic: an independent THREE.WebGLRenderer displays the existing
 * Model Space scene in a small, read-only panel. The source scene is NOT
 * cloned or disposed. This does NOT replace That Open or validate parity with
 * IFC Fragments, selection, snaps or production CAD performance.
 *
 * This preview is intentionally never started without ?threePreview=1.
 * Rendering two viewports simultaneously is NOT a fair FPS benchmark.
 */
export function mountExperimentalNativeThreePreview(
  options: ExperimentalNativeThreePreviewOptions,
): ExperimentalNativeThreePreviewHandle {
  // Clamp DOM- and WebGL-backed dimensions; every preview owns just its
  // extra WebGL context, never the production Three.js scene or CAD tools.
  const width = Math.round(THREE.MathUtils.clamp(options.width ?? PREVIEW_WIDTH, 160, 960));
  const height = Math.round(THREE.MathUtils.clamp(options.height ?? PREVIEW_HEIGHT, 120, 640));
  const renderer = options.createRenderer?.() ?? new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
  });

  let disposed = false;
  let frame: number | null = null;
  let lastSample = 0;
  let sampleFrames = 0;
  const camera = new THREE.OrthographicCamera();
  const canSelect = Boolean(options.getInstanceTargets && options.onSelectInstance);
  const nativeEdit = canSelect ? options.nativeEdit : undefined;
  let nativeMode: "translate" | "rotate" = "translate";
  let nativeDrag = false;
  let trackedNativeId: string | null = null;
  let selectionGesture: { id: number; x: number; y: number } | null = null;

  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = options.viewport.renderer.outputColorSpace;
  renderer.toneMapping = options.viewport.renderer.toneMapping;
  renderer.toneMappingExposure = options.viewport.renderer.toneMappingExposure;

  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "Vista experimental Three.js");
  panel.style.cssText = [
    "position:absolute", "bottom:16px", "right:16px", "z-index:50",
    `width:${width}px`, "max-width:calc(100% - 32px)", "background:#101820",
    "border:1px solid #64748b", "border-radius:8px", "overflow:hidden",
    "box-shadow:0 5px 20px #0008", "color:#f1f5f9",
    "font:12px system-ui,sans-serif",
  ].join(";");

  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:6px 8px;gap:6px";
  const title = document.createElement("span");
  title.textContent = options.title ?? "Three.js nativo · vista experimental";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Cerrar";
  close.style.cssText = "font:inherit;color:inherit;background:#334155;border:0;border-radius:4px;padding:3px 7px;cursor:pointer";
  header.append(title, close);

  const status = document.createElement("div");
  status.textContent = nativeEdit
    ? "Gizmo Three.js interactivo · transformaciones reales en .flproject"
    : canSelect ? "Selección nativa · edición con gizmo en Model Space"
    : "Vista secundaria de diagnóstico · solo lectura";
  status.style.cssText = "padding:4px 8px 7px;color:#cbd5e1";

  // In CAD-connected mode, the second renderer supplies only hit-tested
  // PieceInstance IDs. Selection, edit commands, history and serialization
  // are all performed by the authoritative Model Space on its own canvas.
  const actionStatus = document.createElement("div");
  actionStatus.style.cssText = "padding:5px 8px;color:#d1fae5";
  actionStatus.textContent = nativeEdit
    ? "Selecciona una pieza y arrastra los ejes del gizmo aquí. Mover/Rotar cambian de modo."
    : "Clic en una pieza para seleccionarla · editar en Model Space";
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;gap:5px;flex-wrap:wrap;padding:6px 8px 0";

  const makeAction = (label: string, handler: (() => boolean) | undefined) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = "font:inherit;color:inherit;background:#334155;border:1px solid #64748b;border-radius:4px;padding:5px 8px;cursor:pointer";
    button.addEventListener("click", () => {
      if (disposed || !handler) return;
      const did = handler();
      actionStatus.textContent = did
        ? nativeEdit && (label === "Mover" || label === "Rotar")
          ? `${label}: arrastra un eje en esta vista. Se guardará en el proyecto al soltar.`
          : `${label}: comando aplicado en Model Space. Los cambios usan el historial y .flproject.`
        : `${label}: no se pudo ejecutar; selecciona una pieza editable.`;
    });
    toolbar.append(button);
    return button;
  };

  // The native action changes the drag controls IN THIS CANVAS rather than
  // arming a TransformControls instance bound to the main CAD canvas.
  let setNativeMode: ((mode: "translate" | "rotate") => boolean) | null = null;
  const moveButton = canSelect
    ? makeAction("Mover", nativeEdit
      ? () => setNativeMode?.("translate") ?? false : options.onStartMove) : null;
  const rotateButton = canSelect
    ? makeAction("Rotar", nativeEdit
      ? () => setNativeMode?.("rotate") ?? false : options.onStartRotate) : null;
  if (canSelect) {
    makeAction("Deshacer", options.onUndo);
    makeAction("Rehacer", options.onRedo);
  }

  // Own one TransformControls instance for the INSPECTOR canvas. Its helper
  // lives in an overlay scene, never in the production scene. Only the
  // original FrameLogic model can commit a transform.
  const gizmoScene = nativeEdit ? new THREE.Scene() : null;
  const gizmoPivot = nativeEdit ? new THREE.Object3D() : null;
  const gizmo = nativeEdit ? new TransformControls(camera, renderer.domElement) : null;
  if (gizmoScene && gizmo && gizmoPivot) {
    gizmoScene.add(gizmoPivot);
    gizmoScene.add(gizmo.getHelper());
    gizmo.setMode(nativeMode);
    gizmo.setSpace("world");
    gizmo.setSize(0.9);
    setNativeMode = (mode) => {
      if (disposed || !nativeEdit.getTarget() || nativeDrag) return false;
      nativeMode = mode;
      gizmo.setMode(mode);
      return true;
    };
  }
  const handleGizmoMouseDown = (): void => {
    if (!nativeEdit || !gizmo || nativeDrag) return;
    // Gizmo hit takes priority over ordinary piece-selection clicks.
    selectionGesture = null;
    if (!nativeEdit.begin(nativeMode)) {
      gizmo.reset();
      actionStatus.textContent = "Pieza bloqueada, oculta o no editable; no se puede iniciar el gizmo.";
      return;
    }
    nativeDrag = true;
  };
  const handleGizmoObjectChange = (): void => {
    if (!nativeDrag || !nativeEdit || !gizmoPivot) return;
    if (!nativeEdit.preview(gizmoPivot.position, gizmoPivot.quaternion)) {
      nativeEdit.finish(false);
      nativeDrag = false;
      actionStatus.textContent = "Transformación cancelada: la pieza dejó de ser editable.";
    }
  };
  const handleGizmoMouseUp = (): void => {
    if (!nativeDrag || !nativeEdit) return;
    nativeDrag = false;
    const changed = nativeEdit.finish(true);
    actionStatus.textContent = changed
      ? `${nativeMode === "translate" ? "Movimiento" : "Rotación"} guardado en el modelo del proyecto. Undo/Redo disponible.`
      : "Sin cambios de posición o rotación.";
  };
  gizmo?.addEventListener("mouseDown", handleGizmoMouseDown);
  gizmo?.addEventListener("objectChange", handleGizmoObjectChange);
  gizmo?.addEventListener("mouseUp", handleGizmoMouseUp);

  const cancelNativeDrag = (): void => {
    if (!nativeDrag) return;
    nativeDrag = false;
    nativeEdit?.finish(false);
    gizmo?.reset();
    actionStatus.textContent = "Transformación cancelada; pieza restaurada.";
  };
  const handleNativeEscape = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || !nativeDrag) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancelNativeDrag();
  };
  const handleNativeBlur = (): void => { cancelNativeDrag(); };
  const handleNativePointerCancel = (): void => { cancelNativeDrag(); };
  if (nativeEdit) {
    window.addEventListener("keydown", handleNativeEscape, true);
    window.addEventListener("blur", handleNativeBlur);
    renderer.domElement.addEventListener("pointercancel", handleNativePointerCancel);
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (!canSelect || event.button !== 0) return;
    selectionGesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent): void => {
    const start = selectionGesture;
    selectionGesture = null;
    if (nativeDrag) return;
    if (!start || disposed || start.id !== event.pointerId
      || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const getTargets = options.getInstanceTargets;
    const select = options.onSelectInstance;
    if (!getTargets || !select) return;
    if (!(options.viewport.camera instanceof THREE.OrthographicCamera)) return;
    // Use the same camera/frustum as the most recent native render.
    const id = pickNativeProjectPieceInstance(
      event.clientX, event.clientY,
      renderer.domElement.getBoundingClientRect(), camera, getTargets(),
    );
    if (!id) {
      actionStatus.textContent = "Sin pieza seleccionable en esta posición.";
    } else {
      actionStatus.textContent = select(id)
        ? nativeEdit
          ? `Pieza seleccionada: ${id}. Arrastra un eje del gizmo Three.js.`
          : `Pieza seleccionada: ${id}. Usa Mover o Rotar para editarla en Model Space.`
        : "La pieza está oculta o bloqueada; no se puede seleccionar.";
    }
  };
  const onPointerCancel = (): void => { selectionGesture = null; };
  renderer.domElement.style.cssText = canSelect
    ? "display:block;width:100%;height:auto;pointer-events:auto;cursor:crosshair"
    : "display:block;width:100%;height:auto;pointer-events:none";
  if (canSelect) {
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerCancel);
  }
  panel.append(header, renderer.domElement);
  if (canSelect) panel.append(toolbar, actionStatus);
  panel.append(status);
  options.host.appendChild(panel);

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    close.removeEventListener("click", dispose);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    renderer.domElement.removeEventListener("pointercancel", onPointerCancel);
    selectionGesture = null;
    cancelNativeDrag();
    window.removeEventListener("keydown", handleNativeEscape, true);
    window.removeEventListener("blur", handleNativeBlur);
    renderer.domElement.removeEventListener("pointercancel", handleNativePointerCancel);
    gizmo?.removeEventListener("mouseDown", handleGizmoMouseDown);
    gizmo?.removeEventListener("objectChange", handleGizmoObjectChange);
    gizmo?.removeEventListener("mouseUp", handleGizmoMouseUp);
    gizmo?.detach();
    gizmo?.dispose();
    if (frame !== null) window.cancelAnimationFrame(frame);
    panel.remove();
    // Only own the extra renderer. Geometry, materials, scene and textures
    // belong to the main viewport and must never be disposed here.
    renderer.dispose();
    renderer.forceContextLoss();
    options.onClose?.();
  };
  close.addEventListener("click", dispose);

  const render = (now: number): void => {
    if (disposed) return;
    try {
      const source = options.viewport.camera;
      if (!(source instanceof THREE.OrthographicCamera)) {
        status.textContent = "Vista no disponible: cámara 3D no ortográfica";
      } else {
        copyNativeOrthographicPreviewCamera(source, width, height, camera);
        if (nativeEdit && gizmo && gizmoPivot && !nativeDrag) {
          const target = nativeEdit.getTarget();
          if (target) {
            if (trackedNativeId !== target.id) {
              gizmo.detach();
              trackedNativeId = target.id;
            }
            gizmoPivot.position.copy(target.position);
            gizmoPivot.quaternion.copy(target.quaternion);
            gizmoPivot.updateMatrixWorld(true);
            if (!gizmo.object) gizmo.attach(gizmoPivot);
          } else {
            trackedNativeId = null;
            gizmo.detach();
          }
        }
        renderer.render(options.viewport.scene, camera);
        if (gizmoScene && gizmo?.object) {
          renderer.clearDepth();
          renderer.autoClear = false;
          renderer.render(gizmoScene, camera);
          renderer.autoClear = true;
        }
        if (canSelect) {
          const hasPiece = Boolean(options.getSelectedInstanceIds?.().length);
          if (moveButton) moveButton.disabled = !hasPiece;
          if (rotateButton) rotateButton.disabled = !hasPiece;
        }
        sampleFrames++;
        if (!lastSample) lastSample = now;
        const elapsed = now - lastSample;
        if (elapsed >= 1000) {
          const fps = Math.round(sampleFrames * 1000 / elapsed);
          status.textContent = `Vista secundaria: ${fps} FPS aprox. (no comparables)`;
          sampleFrames = 0;
          lastSample = now;
        }
      }
    } catch (error) {
      status.textContent = "Vista nativa no disponible; visor principal sin cambios";
      console.warn("FrameLogic native Three.js preview error:", error);
      // Do not affect the primary CAD renderer if a material is unsupported.
      dispose();
      return;
    }
    frame = window.requestAnimationFrame(render);
  };
  frame = window.requestAnimationFrame(render);

  return { canvas: renderer.domElement, dispose };
}
