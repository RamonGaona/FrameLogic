import * as THREE from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  createNativeProjectRotationRings,
  pickNativeProjectRotationRing,
  sizeNativeProjectRotationRings,
  nativeProjectRotationDragAngle,
  nativeProjectRotationFromStart,
  pickNativeProjectPieceInstance,
  type NativeProjectInstanceTarget,
  type NativeProjectRotateAxis,
} from "@framelogic/bim-core";
import type { NativeProjectCadEditBridge } from "./NativeProjectCadEditBridge";

export interface NativePrimaryProjectEditorOptions {
  host: HTMLElement;
  scene: THREE.Scene;
  getCamera(): THREE.Camera;
  canvas: HTMLCanvasElement;
  editor: NativeProjectCadEditBridge;
  getInstanceTargets(): readonly NativeProjectInstanceTarget[];
  selectInstance(id: string): boolean;
  undo(): boolean;
  redo(): boolean;
  setNavigationEnabled(value: boolean): void;
  navigationWasEnabled: boolean;
  onClose(): void;
}

export interface NativePrimaryProjectEditorHandle {
  dispose(): void;
}

/**
 * Native Three.js editing on the SAME production CAD WebGLRenderer/canvas.
 * The transparent input overlay isolates pointer events from the historical
 * CAD handlers only while this explicit mode is active. This is not a second
 * scene, project, drawing or WebGL context: DWG/DXF, assemblies, .flproject
 * and Paper Space continue to use the existing authoritative controllers.
 *
 * Closing this tool returns pointer/navigation ownership to Model Space.
 */
export function mountNativePrimaryProjectEditor(
  options: NativePrimaryProjectEditorOptions,
): NativePrimaryProjectEditorHandle {
  const { host, scene, canvas, editor } = options;
  let disposed = false;
  let mode: "select" | "translate" | "rotate" = "select";
  let activeMove = false;
  let selectedId: string | null = null;
  let down: { id: number; x: number; y: number } | null = null;
  let ringDrag: {
    id: number;
    axis: NativeProjectRotateAxis;
    start: readonly [number, number];
    worldPosition: THREE.Vector3;
    worldQuaternion: THREE.Quaternion;
  } | null = null;
  let frame = 0;

  const input = document.createElement("div");
  input.dataset.nativePrimaryInput = "true";
  input.style.cssText = [
    "position:absolute", "z-index:31", "pointer-events:auto",
    "touch-action:none", "background:transparent", "cursor:crosshair",
  ].join(";");

  const toolbar = document.createElement("section");
  toolbar.dataset.nativePrimaryToolbar = "true";
  toolbar.setAttribute("aria-label", "Edición Three.js del Model Space principal");
  toolbar.style.cssText = [
    "position:absolute", "right:16px", "bottom:16px", "z-index:52",
    "max-width:min(520px,calc(100% - 32px))", "background:#162434",
    "border:1px solid #64748b", "border-radius:8px", "padding:8px",
    "color:#f1f5f9", "font:12px system-ui,sans-serif",
    "box-shadow:0 5px 22px #0008",
  ].join(";");
  const title = document.createElement("div");
  title.textContent = "Three.js · Model Space principal";
  title.style.cssText = "font-weight:bold;margin-bottom:5px";
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:5px;flex-wrap:wrap";
  const info = document.createElement("div");
  info.style.cssText = "padding-top:6px;color:#cbd5e1";
  info.textContent = "Selecciona una pieza aquí y pulsa Mover o Rotar. El proyecto y los planos siguen siendo los originales.";
  toolbar.append(title, actions, info);
  host.append(input, toolbar);

  const currentCamera = options.getCamera();
  const transform = new TransformControls(currentCamera, input);
  const pivot = new THREE.Object3D();
  // TransformControls needs an object with a parent to calculate the
  // correct world-space transform during pointerDown and pointerMove.
  // It has no mesh and is never serialized as a CAD instance.
  scene.add(pivot);
  // Only add the helper to the authoritative scene: the renderer is already
  // Three.WebGLRenderer. Neither helper nor pivot is a saved PieceInstance.
  scene.add(transform.getHelper());
  transform.setMode("translate");
  transform.setSpace("world");
  transform.setSize(0.95);
  const rings = createNativeProjectRotationRings();
  rings.group.visible = false;
  scene.add(rings.group);

  const setMessage = (message: string): void => { info.textContent = message; };
  const buttons: HTMLButtonElement[] = [];
  function addButton(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = "border:1px solid #64748b;background:#334155;color:white;border-radius:4px;padding:6px;cursor:pointer;font:inherit";
    button.addEventListener("click", action);
    actions.append(button);
    buttons.push(button);
    return button;
  }

  const selectButton = addButton("Seleccionar", () => setMode("select"));
  const moveButton = addButton("Mover", () => setMode("translate"));
  const rotateButton = addButton("Rotar", () => setMode("rotate"));
  const closeButton = addButton("Volver a CAD", () => dispose());
  const undoButton = addButton("Deshacer", () => {
    if (activeMove || ringDrag) return;
    setMessage(options.undo() ? "Última operación CAD deshecha." : "No hay cambios para deshacer.");
  });
  const redoButton = addButton("Rehacer", () => {
    if (activeMove || ringDrag) return;
    setMessage(options.redo() ? "Última operación CAD rehecha." : "No hay cambios para rehacer.");
  });
  // Reliable exact-distance alternative when a thin gizmo handle is
  // difficult to pick (touchpads, small screens or a nearly edge-on axis).
  // Uses exactly the same authoritative PieceInstance + CadHistory transaction
  // as mouse dragging. No separate visual-only mesh manipulation.
  const distanceLabel = document.createElement("label");
  distanceLabel.textContent = "Distancia (mm): ";
  distanceLabel.style.cssText = "display:flex;gap:4px;align-items:center;color:#e2e8f0";
  const distanceInput = document.createElement("input");
  distanceInput.type = "number";
  distanceInput.min = "0.001";
  distanceInput.step = "any";
  distanceInput.value = "100";
  distanceInput.style.cssText = "width:76px;padding:4px;background:#0f172a;color:#f1f5f9;border:1px solid #64748b";
  distanceLabel.append(distanceInput);
  actions.append(distanceLabel);
  for (const axis of ["X", "Y", "Z"] as const) {
    for (const sign of [-1, 1] as const) {
      addButton(`${axis} ${sign === 1 ? "+" : "−"}mm`, () => {
        if (disposed || activeMove || ringDrag) return;
        const amount = Number(distanceInput.value);
        if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
          setMessage("Introduce una distancia válida en mm, mayor que cero.");
          return;
        }
        const target = editor.getTarget();
        if (!target || !editor.begin("translate")) {
          setMessage("Selecciona una pieza editable antes de mover.");
          return;
        }
        const delta = new THREE.Vector3(
          axis === "X" ? amount * sign : 0,
          axis === "Y" ? amount * sign : 0,
          axis === "Z" ? amount * sign : 0,
        );
        const applied = editor.preview(target.position.clone().add(delta), target.quaternion);
        if (!applied) {
          editor.finish(false);
          setMessage("No se pudo aplicar el movimiento; restaurado.");
          return;
        }
        const saved = editor.finish(true);
        setMessage(saved ? `Movimiento ${axis} ${sign === 1 ? "+" : "−"}${amount} mm registrado en proyecto.`
          : "No hubo cambios.");
      });
    }
  }
  for (const axis of ["X", "Y", "Z"] as const) {
    addButton(`${axis} +90°`, () => {
      if (disposed || activeMove || ringDrag) return;
      const target = editor.getTarget();
      if (!target || !editor.begin("rotate")) {
        setMessage("Selecciona una única pieza editable para rotarla.");
        return;
      }
      const next = nativeProjectRotationFromStart(target.quaternion, axis, Math.PI / 2);
      if (!next || !editor.preview(target.position, next)) {
        editor.finish(false);
        setMessage("No se pudo girar la pieza; se ha restaurado su posición.");
        return;
      }
      const recorded = editor.finish(true);
      setMessage(recorded ? `Rotación ${axis} +90° aplicada en .flproject e historial CAD.`
        : "El giro no modificó la pieza.");
    });
  }

  function setMode(next: "select" | "translate" | "rotate"): void {
    if (disposed || activeMove || ringDrag) return;
    if (next !== "select" && !editor.getTarget()) {
      setMessage("Selecciona primero una pieza editable. Las referencias DWG/DXF siguen disponibles en CAD.");
      return;
    }
    mode = next;
    if (mode !== "translate") transform.detach();
    rings.group.visible = mode === "rotate";
    selectButton.setAttribute("aria-pressed", String(mode === "select"));
    moveButton.setAttribute("aria-pressed", String(mode === "translate"));
    rotateButton.setAttribute("aria-pressed", String(mode === "rotate"));
    setMessage(mode === "select" ? "Seleccionar: clic en una pieza."
      : mode === "translate" ? "Mover: arrastra un eje del gizmo del canvas principal."
      : "Rotar: arrastra un anillo de eje visible; X/Y/Z +90° para giros exactos.");
  }
  setMode("select");

  function canvasRect(): DOMRect { return input.getBoundingClientRect(); }
  function onMoveStart(): void {
    if (disposed || mode !== "translate" || activeMove) return;
    down = null;
    if (!editor.begin("translate")) {
      transform.reset();
      setMessage("Pieza bloqueada o no editable.");
      return;
    }
    activeMove = true;
  }
  function onObjectChange(): void {
    if (!activeMove) return;
    if (!editor.preview(pivot.position, pivot.quaternion)) {
      editor.finish(false);
      activeMove = false;
      transform.reset();
      setMessage("Movimiento cancelado: la pieza no se pudo modificar.");
    }
  }
  function onMoveEnd(): void {
    if (!activeMove) return;
    activeMove = false;
    const committed = editor.finish(true);
    setMessage(committed ? "Movimiento guardado en el proyecto. Deshacer disponible."
      : "No hubo movimiento.");
  }
  transform.addEventListener("mouseDown", onMoveStart);
  transform.addEventListener("objectChange", onObjectChange);
  transform.addEventListener("mouseUp", onMoveEnd);

  function finishRotation(commit: boolean): void {
    const drag = ringDrag;
    if (!drag) return;
    ringDrag = null;
    if (input.hasPointerCapture?.(drag.id)) input.releasePointerCapture(drag.id);
    const changed = editor.finish(commit);
    setMessage(!commit ? "Rotación cancelada, transform original restaurado."
      : changed ? `Rotación ${drag.axis} aplicada al proyecto CAD.`
      : "No se registró un cambio de rotación.");
  }
  function cancelGesture(): void {
    if (ringDrag) finishRotation(false);
    if (activeMove) {
      activeMove = false;
      editor.finish(false);
      transform.reset();
      setMessage("Movimiento cancelado.");
    }
    down = null;
  }
  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || disposed) return;
    if (mode === "rotate" && !ringDrag) {
      const target = editor.getTarget();
      if (!target) return;
      const axis = pickNativeProjectRotationRing(
        rings.group, options.getCamera() as THREE.OrthographicCamera,
        event.clientX, event.clientY, canvasRect(),
      );
      if (axis && editor.begin("rotate")) {
        event.stopImmediatePropagation();
        event.preventDefault();
        down = null;
        ringDrag = {
          id: event.pointerId,
          axis,
          start: [event.clientX, event.clientY],
          worldPosition: target.position.clone(),
          worldQuaternion: target.quaternion.clone(),
        };
        input.setPointerCapture?.(event.pointerId);
        setMessage(`Rotando ${axis}. Arrastra para girar; suelta para guardar o Escape para cancelar.`);
      }
      return;
    }
    if (mode === "select") {
      down = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  }
  function onPointerMove(event: PointerEvent): void {
    const drag = ringDrag;
    if (!drag || drag.id !== event.pointerId) return;
    const camera = options.getCamera();
    if (!(camera instanceof THREE.OrthographicCamera)) return;
    const radians = nativeProjectRotationDragAngle(
      camera, drag.worldPosition, drag.axis,
      drag.start, [event.clientX, event.clientY], canvasRect(),
    );
    if (radians === null) return;
    const quaternion = nativeProjectRotationFromStart(drag.worldQuaternion, drag.axis, radians);
    if (!quaternion || !editor.preview(drag.worldPosition, quaternion)) {
      finishRotation(false);
      setMessage("Rotación cancelada por estado inválido.");
      return;
    }
    event.preventDefault();
  }
  function onPointerUp(event: PointerEvent): void {
    if (ringDrag?.id === event.pointerId) {
      finishRotation(true);
      return;
    }
    if (mode !== "select" || !down || down.id !== event.pointerId) return;
    const start = down;
    down = null;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const camera = options.getCamera();
    if (!(camera instanceof THREE.OrthographicCamera)) {
      setMessage("La selección requiere la cámara ortográfica de Model Space.");
      return;
    }
    const id = pickNativeProjectPieceInstance(
      event.clientX, event.clientY, canvasRect(), camera, options.getInstanceTargets(),
    );
    if (id && options.selectInstance(id)) {
      setMessage(`Pieza ${id} seleccionada. Elige Mover o Rotar.`);
    } else {
      setMessage("No se encontró una pieza editable. Las referencias DWG/DXF siguen en CAD.");
    }
  }
  const onPointerCancel = (): void => { cancelGesture(); };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    if (ringDrag || activeMove) {
      event.preventDefault();
      event.stopImmediatePropagation();
      cancelGesture();
    } else if (mode !== "select") {
      event.preventDefault();
      setMode("select");
    } else {
      dispose();
    }
  };
  const onBlur = (): void => { cancelGesture(); };
  input.addEventListener("pointerdown", onPointerDown, true);
  input.addEventListener("pointermove", onPointerMove);
  input.addEventListener("pointerup", onPointerUp);
  input.addEventListener("pointercancel", onPointerCancel);
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("blur", onBlur);

  // All changes are drawn by the *existing* production Three.js renderer.
  // The frame only aligns helpers and the transparent hit layer to it.
  function tick(): void {
    if (disposed) return;
    const rect = canvas.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    input.style.left = `${rect.left - hostRect.left}px`;
    input.style.top = `${rect.top - hostRect.top}px`;
    input.style.width = `${rect.width}px`;
    input.style.height = `${rect.height}px`;
    const camera = options.getCamera();
    if (camera instanceof THREE.OrthographicCamera) {
      transform.camera = camera;
      const target = editor.getTarget();
      if (target && !activeMove && !ringDrag) {
        if (selectedId !== target.id) {
          selectedId = target.id;
          setMode("select");
        }
        pivot.position.copy(target.position);
        pivot.quaternion.copy(target.quaternion);
        pivot.updateMatrixWorld(true);
        rings.group.position.copy(target.position);
        rings.group.quaternion.identity();
        sizeNativeProjectRotationRings(rings.group, camera, rect.height);
        rings.group.visible = mode === "rotate";
        if (mode === "translate" && !transform.object) transform.attach(pivot);
      } else if (!target && !activeMove && !ringDrag) {
        selectedId = null;
        transform.detach();
        rings.group.visible = false;
      }
    } else {
      transform.detach();
      rings.group.visible = false;
    }
    frame = window.requestAnimationFrame(tick);
  }
  // Restore active camera navigation on exit, including if project is unloaded.
  options.setNavigationEnabled(false);
  tick();

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    window.cancelAnimationFrame(frame);
    cancelGesture();
    input.removeEventListener("pointerdown", onPointerDown, true);
    input.removeEventListener("pointermove", onPointerMove);
    input.removeEventListener("pointerup", onPointerUp);
    input.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("blur", onBlur);
    transform.removeEventListener("mouseDown", onMoveStart);
    transform.removeEventListener("objectChange", onObjectChange);
    transform.removeEventListener("mouseUp", onMoveEnd);
    transform.detach();
    transform.getHelper().removeFromParent();
    pivot.removeFromParent();
    transform.dispose();
    rings.dispose();
    input.remove();
    toolbar.remove();
    options.setNavigationEnabled(options.navigationWasEnabled);
    options.onClose();
  }
  return { dispose };
}
