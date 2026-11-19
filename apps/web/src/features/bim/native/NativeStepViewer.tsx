import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

// Injected by Vite from the root package.json, same source as CAD Model Space.
declare const __FRAMELOGIC_VERSION__: string;
const VERSION = typeof __FRAMELOGIC_VERSION__ === "string"
  ? __FRAMELOGIC_VERSION__ : "dev";

import { OcctStepGeometryAdapter } from "../step/OcctStepGeometryAdapter";
import { getOpenCascadeBrepKernel } from "@framelogic/geometry";
import {
  findNativeExactSnap,
  indexNativeBrepSnapPoints,
  NATIVE_SNAP_LABELS,
  type NativeExactSnapHit,
  type NativeExactSnapPoint,
} from "./NativeStepExactSnapController";
import {
  NativeStepSelectionController,
  pickNativeStepMesh,
  type NativeStepSelectionInfo,
} from "./NativeStepSelectionController";
import {
  createNativeMoveGizmo,
  nativeMoveAxisDistanceFromPixels,
  pickNativeMoveAxis,
  type NativeMoveGizmo,
} from "./NativeStepMoveGizmo";
import {
  getNativeStepBrepWorldTransform,
  NativeStepMoveController,
  resolveNativeIsolatedStepTarget,
  type NativeIsolatedStepTarget,
  type NativeMoveAxis,
} from "./NativeStepMoveController";
import {
  isNativeSnapVisible,
  isSnapWithinNativePartScope,
  prepareNativeStepTransformTarget,
  resolveNativeStepPartScope,
  type NativeStepPartScope,
  type NativeStepTransformTarget,
} from "./NativeStepPartScope";
import {
  buildNativeStepMeshGroup,
  disposeNativeStepMeshGroup,
  fitNativeOrthographicCamera,
  panNativeCamera,
  updateNativeOrthographicCamera,
  wheelNativeCamera,
  type NativeCameraState,
} from "./NativeStepViewportModel";

type NativeView = "ISO" | "TOP" | "FRONT" | "RIGHT";

interface NativeViewerRuntime {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  modelRoot: THREE.Group;
  state: NativeCameraState;
  disposed: boolean;
}

interface NativeViewerStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  jsHeapMb: number | null;
  meshes: number;
  stepTriangles: number;
  loadMs: number | null;
  files: number;
}

const EMPTY_STATS: NativeViewerStats = {
  fps: 0, drawCalls: 0, triangles: 0, geometries: 0,
  jsHeapMb: null, meshes: 0, stepTriangles: 0, loadMs: null, files: 0,
};

const buttonStyle: CSSProperties = {
  border: "1px solid #64748b", borderRadius: 5, padding: "7px 11px",
  background: "#263445", color: "#f8fafc", font: "inherit", cursor: "pointer",
};

function isStepFile(file: File): boolean {
  return /\.(?:stp|step)$/i.test(file.name);
}

function applyStandardView(runtime: NativeViewerRuntime, view: NativeView): void {
  runtime.state.azimuth = view === "FRONT" ? 0
    : view === "RIGHT" ? -Math.PI / 2
    : Math.PI / 4;
  runtime.state.polar = view === "TOP" ? 0.01
    : view === "ISO" ? Math.acos(1 / Math.sqrt(3))
    : Math.PI / 2;
}

/**
 * Fully separate rendering experiment. No createBimCore/That Open world is
 * mounted on this route: only one native THREE.WebGLRenderer runs in this tab.
 * STEP meshes are loaded through the existing OpenCascade-backed adapter.
 * This is a visual-only comparison, NOT a replacement CAD editor yet.
 */
export function NativeStepViewer() {
  const canvasHost = useRef<HTMLDivElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const runtimeRef = useRef<NativeViewerRuntime | null>(null);
  const aliveRef = useRef(false);
  const loadGeneration = useRef(0);
  const brepDocuments = useRef<string[]>([]);
  const adapterRef = useRef(new OcctStepGeometryAdapter());
  const selectionRef = useRef(new NativeStepSelectionController());
  const partScopeRef = useRef<NativeStepPartScope | null>(null);
  const moveRef = useRef(new NativeStepMoveController());
  const moveTargetRef = useRef<NativeIsolatedStepTarget | null>(null);
  const moveGizmoRef = useRef<NativeMoveGizmo | null>(null);
  const moveGizmoKeyRef = useRef<string | null>(null);
  const snapIndexRef = useRef(new Map<string, readonly NativeExactSnapPoint[]>());
  const [snap, setSnap] = useState<NativeExactSnapHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedNames, setLoadedNames] = useState<string[]>([]);
  const [selection, setSelection] = useState<NativeStepSelectionInfo | null>(null);
  const [transformTarget, setTransformTarget] = useState<NativeStepTransformTarget | null>(null);
  const [moveEligible, setMoveEligible] = useState(false);
  const [moveAxis, setMoveAxis] = useState<NativeMoveAxis>("X");
  const [moveAmount, setMoveAmount] = useState("100");
  const [moveStatus, setMoveStatus] = useState("");
  const [moveHistory, setMoveHistory] = useState({ undo: false, redo: false });
  const [stats, setStats] = useState<NativeViewerStats>(EMPTY_STATS);

  function refreshMoveUi(): void {
    const runtime = runtimeRef.current;
    const selected = selectionRef.current.selectedMesh;
    const scope = runtime && selected
      ? resolveNativeStepPartScope(runtime.modelRoot, selected) : null;
    partScopeRef.current = scope;
    setTransformTarget(scope ? prepareNativeStepTransformTarget(scope) : null);
    const target = resolveNativeIsolatedStepTarget(scope);
    moveTargetRef.current = target;
    setMoveEligible(Boolean(target));

    const nextKey = target?.key ?? null;
    if (moveGizmoKeyRef.current !== nextKey || !target) {
      moveGizmoRef.current?.dispose();
      moveGizmoRef.current = null;
      moveGizmoKeyRef.current = null;
    }
    if (target && runtime && scope) {
      if (!moveGizmoRef.current) {
        const diagonal = scope.bounds.getSize(new THREE.Vector3()).length();
        const gizmo = createNativeMoveGizmo(scope.pivot, diagonal);
        runtime.scene.add(gizmo.group);
        moveGizmoRef.current = gizmo;
        moveGizmoKeyRef.current = target.key;
      } else {
        moveGizmoRef.current.group.position.copy(scope.pivot);
        moveGizmoRef.current.group.updateMatrixWorld(true);
      }
    }
    setMoveHistory({ undo: moveRef.current.canUndo, redo: moveRef.current.canRedo });
  }

  useEffect(() => {
    aliveRef.current = true;
    const host = canvasHost.current;
    if (!host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError("No se pudo crear WebGL. Verifica que el navegador permita aceleración gráfica.");
      return () => { aliveRef.current = false; };
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x14202b);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.cssText = "display:block;width:100%;height:100%;touch-action:none";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14202b);
    const ambient = new THREE.HemisphereLight(0xffffff, 0x506070, 2.2);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(1, -2, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xcddff4, 0.8);
    fill.position.set(-2, 1, 0.5);
    scene.add(fill);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);
    const camera = new THREE.OrthographicCamera();
    const state = fitNativeOrthographicCamera(new THREE.Box3(), 1);
    const runtime: NativeViewerRuntime = {
      renderer, scene, camera, modelRoot, state, disposed: false,
    };
    runtimeRef.current = runtime;

    let width = Math.max(host.clientWidth, 1);
    let height = Math.max(host.clientHeight, 1);
    const resize = () => {
      width = Math.max(host.clientWidth, 1);
      height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let pointer: {
      id: number; button: number; x: number; y: number;
      startX: number; startY: number; moved: boolean; pan: boolean;
    } | null = null;
    const canvas = renderer.domElement;
    let lastSnapQuery = -Infinity;
    let moveDrag: {
      id: number;
      axis: NativeMoveAxis;
      startX: number;
      startY: number;
      pivot: THREE.Vector3;
      axisLength: number;
    } | null = null;
    const clearSnap = () => setSnap((previous) => previous ? null : previous);
    const updateSnapFromPointer = (event: PointerEvent) => {
      const selected = selectionRef.current.selectedMesh;
      const id = selected?.userData["brepDocumentId"];
      const partScope = partScopeRef.current;
      if (typeof id !== "string" || id.length === 0
        || !partScope || partScope.documentId !== id) {
        clearSnap();
        return;
      }
      // Avoid O(topology vertices) projection on every high-frequency mouse event.
      const now = performance.now();
      if (now - lastSnapQuery < 70) return;
      lastSnapQuery = now;
      updateNativeOrthographicCamera(camera, state, width / height);
      const result = findNativeExactSnap(
        snapIndexRef.current.get(id) ?? [],
        id, camera, event.clientX, event.clientY,
        canvas.getBoundingClientRect(), 13,
        (candidate) =>
          isSnapWithinNativePartScope(candidate.point, partScope)
          && isNativeSnapVisible(candidate.point, camera, runtime.modelRoot),
        getNativeStepBrepWorldTransform(moveTargetRef.current),
      );
      setSnap((previous) => previous?.id === result?.id
        && previous?.screenX === result?.screenX
        && previous?.screenY === result?.screenY
        ? previous : result);
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      // The handles live outside the STEP model root, so a gizmo click
      // cannot accidentally select or orbit a CAD mesh.
      if (e.button === 0 && !e.shiftKey && moveTargetRef.current
        && moveGizmoRef.current) {
        updateNativeOrthographicCamera(camera, state, width / height);
        const axis = pickNativeMoveAxis(
          moveGizmoRef.current, camera, e.clientX, e.clientY,
          canvas.getBoundingClientRect(),
        );
        if (axis && moveRef.current.beginDrag(moveTargetRef.current, axis)) {
          moveDrag = {
            id: e.pointerId, axis, startX: e.clientX, startY: e.clientY,
            pivot: moveGizmoRef.current.group.position.clone(),
            axisLength: moveGizmoRef.current.axisLengthMm,
          };
          canvas.setPointerCapture(e.pointerId);
          clearSnap();
          e.preventDefault();
          return;
        }
      }
      pointer = {
        id: e.pointerId, button: e.button, x: e.clientX, y: e.clientY,
        startX: e.clientX, startY: e.clientY, moved: false,
        pan: e.button === 2 || (e.button === 0 && e.shiftKey),
      };
      canvas.setPointerCapture(e.pointerId);
      clearSnap();
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (moveDrag) {
        if (moveDrag.id !== e.pointerId) return;
        const distance = nativeMoveAxisDistanceFromPixels(
          camera, moveDrag.pivot, moveDrag.axis, moveDrag.axisLength,
          e.clientX - moveDrag.startX, e.clientY - moveDrag.startY,
          width, height,
        );
        if (distance !== null && moveRef.current.previewDrag(distance)) {
          refreshMoveUi();
          clearSnap();
        }
        e.preventDefault();
        return;
      }
      if (!pointer) {
        updateSnapFromPointer(e);
        return;
      }
      if (pointer.id !== e.pointerId) return;
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
      if (Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) > 5) {
        pointer.moved = true;
      }
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (pointer.pan) {
        panNativeCamera(state, camera, dx, dy, width, height);
      } else {
        state.azimuth -= dx * 0.007;
        state.polar = THREE.MathUtils.clamp(state.polar - dy * 0.007, 0.01, Math.PI - 0.01);
      }
      e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      if (moveDrag?.id === e.pointerId) {
        const committed = moveRef.current.endDrag(e.type === "pointerup");
        moveDrag = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        refreshMoveUi();
        setMoveStatus(committed
          ? "Desplazamiento visual confirmado (deshacer disponible)."
          : "Desplazamiento cancelado.");
        return;
      }
      if (pointer?.id !== e.pointerId) return;
      const wasClick = e.type === "pointerup" && pointer.button === 0
        && !pointer.pan && !pointer.moved;
      pointer = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (wasClick) {
        // A click selects the nearest visible STEP triangle, never an orbit
        // drag or pan. Click empty space or press Escape to clear selection.
        updateNativeOrthographicCamera(camera, state, width / height);
        const mesh = pickNativeStepMesh(
          runtime.modelRoot, camera, e.clientX, e.clientY,
          canvas.getBoundingClientRect(),
        );
        const partScope = mesh
          ? resolveNativeStepPartScope(runtime.modelRoot, mesh) : null;
        setSelection(selectionRef.current.setSelected(
          mesh, partScope?.meshes,
        ));
        partScopeRef.current = partScope;
        setTransformTarget(partScope ? prepareNativeStepTransformTarget(partScope) : null);
        refreshMoveUi();
        setMoveStatus(partScope && !resolveNativeIsolatedStepTarget(partScope)
          ? "Movimiento bloqueado: el STEP contiene varios productos o referencias ambiguas."
          : "");
        clearSnap();
      }
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      clearSnap();
      wheelNativeCamera(state, e.deltaY);
    };
    const contextMenu = (e: Event) => e.preventDefault();
    const escapeSelection = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (moveDrag) {
        moveRef.current.endDrag(false);
        moveDrag = null;
        refreshMoveUi();
        setMoveStatus("Desplazamiento cancelado.");
        return;
      }
      selectionRef.current.clear();
      partScopeRef.current = null;
      setSelection(null);
      setTransformTarget(null);
      refreshMoveUi();
      clearSnap();
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextmenu", contextMenu);
    window.addEventListener("keydown", escapeSelection);

    let frame = 0;
    let frames = 0;
    let lastSample = performance.now();
    const tick = (now: number) => {
      if (runtime.disposed) return;
      updateNativeOrthographicCamera(camera, state, width / height);
      renderer.render(scene, camera);
      frames += 1;
      if (now - lastSample >= 1000) {
        const frameTime = now - lastSample;
        const perf = performance as Performance & {
          memory?: { usedJSHeapSize: number };
        };
        setStats((current) => ({
          ...current,
          fps: Math.round(frames * 1000 / frameTime),
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          jsHeapMb: perf.memory
            ? Math.round(perf.memory.usedJSHeapSize / 1048576)
            : null,
        }));
        frames = 0;
        lastSample = now;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      aliveRef.current = false;
      loadGeneration.current += 1;
      runtime.disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("contextmenu", contextMenu);
      window.removeEventListener("keydown", escapeSelection);
      selectionRef.current.dispose();
      moveRef.current.reset();
      moveGizmoRef.current?.dispose();
      moveGizmoRef.current = null;
      moveGizmoKeyRef.current = null;
      moveTargetRef.current = null;
      partScopeRef.current = null;
      snapIndexRef.current.clear();
      // The root changes after each successful STEP import. Dispose the
      // active model rather than the original empty startup group.
      disposeNativeStepMeshGroup(runtime.modelRoot);
      for (const id of brepDocuments.current) adapterRef.current.disposeDocument(id);
      brepDocuments.current = [];
      runtimeRef.current = null;
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  async function loadStepFiles(files: readonly File[]): Promise<void> {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.disposed || files.length === 0) return;
    if (files.some((file) => !isStepFile(file))) {
      setError("Solo se admiten archivos .step y .stp en el visor experimental.");
      return;
    }

    const generation = ++loadGeneration.current;
    setLoading(true);
    setError("");
    const started = performance.now();
    const staged = new THREE.Group();
    const stagedBrep: string[] = [];
    const stagedSnapIndex = new Map<string, readonly NativeExactSnapPoint[]>();
    let meshes = 0;
    let triangles = 0;
    try {
      for (const file of files) {
        const data = new Uint8Array(await file.arrayBuffer());
        if (!aliveRef.current || generation !== loadGeneration.current) return;

        // Same STEP/OCCT pipeline and millimetre units as the main viewer.
        // We skip exact feature extraction (not used in this read-only view).
        const document = await adapterRef.current.load(data, {
          sourceFileName: file.name,
          targetUnit: "millimeter",
          includeExactFeatures: false,
        });
        if (document.brepDocumentId) {
          stagedBrep.push(document.brepDocumentId);
          // This is the same exact OCCT document used by CAD geometry tools.
          // Index once per STEP, not by tessellated mesh vertices.
          const snapshot = getOpenCascadeBrepKernel()
            .getDocument(document.brepDocumentId);
          if (snapshot) {
            stagedSnapIndex.set(
              document.brepDocumentId,
              indexNativeBrepSnapPoints(snapshot),
            );
          }
        }
        if (!aliveRef.current || generation !== loadGeneration.current) return;
        const group = buildNativeStepMeshGroup(document, file.name);
        staged.add(group);
        meshes += group.children.length;
        triangles += document.meshes.reduce(
          (sum, mesh) => sum + Math.floor(mesh.indices.length / 3), 0,
        );
      }
      if (meshes === 0) throw new Error("El STEP no contiene mallas visualizables.");

      selectionRef.current.clear();
      moveRef.current.reset();
      moveGizmoRef.current?.dispose();
      moveGizmoRef.current = null;
      moveGizmoKeyRef.current = null;
      moveTargetRef.current = null;
      partScopeRef.current = null;
      setSelection(null);
      setTransformTarget(null);
      setMoveEligible(false);
      setMoveHistory({ undo: false, redo: false });
      setMoveStatus("");
      setSnap(null);
      const previous = runtime.modelRoot;
      runtime.scene.remove(previous);
      disposeNativeStepMeshGroup(previous);
      for (const id of brepDocuments.current) adapterRef.current.disposeDocument(id);
      brepDocuments.current = stagedBrep.slice();
      snapIndexRef.current = stagedSnapIndex;

      runtime.scene.add(staged);
      runtime.modelRoot = staged;
      const bounds = new THREE.Box3().setFromObject(staged);
      const aspect = Math.max(runtime.renderer.domElement.clientWidth, 1)
        / Math.max(runtime.renderer.domElement.clientHeight, 1);
      Object.assign(runtime.state, fitNativeOrthographicCamera(bounds, aspect));
      setLoadedNames(files.map((file) => file.name));
      setStats((prev) => ({
        ...prev, meshes, stepTriangles: triangles, files: files.length,
        loadMs: Math.round(performance.now() - started),
      }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      // If the batch wasn't adopted by the live scene, clean up its assets.
      if (runtime.modelRoot !== staged) {
        disposeNativeStepMeshGroup(staged);
        for (const id of stagedBrep) adapterRef.current.disposeDocument(id);
      }
      if (aliveRef.current && generation === loadGeneration.current) {
        setLoading(false);
      }
    }
  }

  function setView(view: NativeView): void {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    setSnap(null);
    applyStandardView(runtime, view);
  }

  function fit(): void {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.modelRoot.children.length === 0) return;
    setSnap(null);
    const canvas = runtime.renderer.domElement;
    const aspect = Math.max(canvas.clientWidth, 1) / Math.max(canvas.clientHeight, 1);
    Object.assign(
      runtime.state,
      fitNativeOrthographicCamera(
        new THREE.Box3().setFromObject(runtime.modelRoot), aspect,
      ),
    );
  }

  function backToCurrentViewer(): void {
    if (!window.confirm(
      "Este visor experimental es solo de lectura. Los archivos STEP cargados no se guardan. ¿Regresar al FrameLogic habitual?",
    )) return;
    window.location.assign(window.location.pathname);
  }

  const fileNames = loadedNames.length > 0 ? loadedNames.join(", ") : "Ningún STEP abierto";

  return (
    <main style={{
      width: "100vw", height: "100vh", overflow: "hidden",
      background: "#14202b", color: "#f8fafc",
      fontFamily: "system-ui, sans-serif", position: "relative",
    }}>
      <div ref={canvasHost} style={{ position: "absolute", inset: 0 }} />
      <section style={{
        position: "absolute", left: 14, top: 14, zIndex: 2,
        background: "#101820ed", border: "1px solid #526477",
        borderRadius: 9, padding: 12, maxWidth: "min(92vw, 580px)",
        display: "flex", flexDirection: "column", gap: 9, fontSize: 13,
      }}>
        <strong style={{ fontSize: 15 }}>FrameLogic v{VERSION} · Visor Three.js nativo experimental</strong>
        <div style={{ color: "#c4d5e7" }}>
          Motor autónomo · cámara ortográfica · unidades en mm · sin That Open
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={buttonStyle} onClick={() => filesInput.current?.click()}
            disabled={loading}>{loading ? "Importando STEP..." : "Abrir STEP / Ensamblaje"}</button>
          <button type="button" style={buttonStyle} onClick={backToCurrentViewer}>
            Volver al visor actual
          </button>
        </div>
        <input ref={filesInput} type="file" multiple accept=".step,.stp"
          style={{ display: "none" }} onChange={(event) => {
            const files = Array.from(event.currentTarget.files ?? []);
            event.currentTarget.value = "";
            void loadStepFiles(files);
          }} />
        <div style={{ color: "#dce7f0", overflowWrap: "anywhere" }}>{fileNames}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["ISO", "TOP", "FRONT", "RIGHT"] as const).map((view) => (
            <button key={view} type="button" style={buttonStyle} onClick={() => setView(view)}>
              {view}
            </button>
          ))}
          <button type="button" style={buttonStyle} onClick={fit}>Encuadrar</button>
        </div>
        <div style={{ color: "#cbd5e1" }}>
          Arrastrar con izquierdo o rueda: orbitar · Derecho o Shift+izquierdo: desplazar · Rueda: zoom
        </div>
        <div style={{ color: "#9dd9f6" }}>
          Clic izquierdo sobre una malla: seleccionar · Clic en vacío o Esc: deseleccionar
        </div>
        {selection ? (
          <div data-native-step-selection="true" style={{
            background: "#173448", border: "1px solid #38a6d5",
            padding: 9, borderRadius: 6, display: "flex", flexDirection: "column", gap: 4,
          }}>
            <strong>Malla seleccionada: {selection.meshId}</strong>
            <div>Archivo: {selection.sourceFileName}</div>
            <div>Producto STEP: {selection.stepProductName ?? "sin identificar en el árbol"}</div>
            <div>Identificador de producto: {selection.stepProductId ?? "no disponible"}</div>
            <div>Identidad: {transformTarget?.productId
              ? "Producto STEP identificado"
              : "Solo malla visual; producto no inequívoco"}</div>
            <div>Mallas en selección: {transformTarget?.affectedMeshCount ?? 1}</div>
            <div>Triángulos: {selection.triangleCount.toLocaleString("es-CO")}</div>
            <div>Dimensiones aproximadas (mm): {selection.boundsMm.map(
              (value) => value.toFixed(1),
            ).join(" × ")}</div>
            {transformTarget && (
              <div data-native-transform-target="true">
                Pivote futuro gizmo (mm): {transformTarget.pivot.toArray()
                  .map((value) => value.toFixed(2)).join(", ")}
                {" · Solo preparación; movimiento y rotación desactivados"}
              </div>
            )}
            <button type="button" style={buttonStyle} onClick={() => {
              selectionRef.current.clear();
              partScopeRef.current = null;
              setSelection(null);
              setTransformTarget(null);
              refreshMoveUi();
              setMoveStatus("");
              setSnap(null);
            }}>Deseleccionar</button>
          </div>
        ) : (
          <div style={{ color: "#8ca3b9" }}>Selección: ninguna</div>
        )}
        <div style={{ color: "#a5cde0" }}>
          SNAP B-Rep: los puntos provienen de OpenCascade, filtrados por los
          límites del producto o malla seleccionada y por su visibilidad.
          La atribución por pieza es espacial, no topológica definitiva;
          en ensamblajes con piezas superpuestas puede ser aproximada.
        </div>
        <div data-native-brep-snap-status="true" style={{ color: "#99e6c9" }}>
          {snap ? `${NATIVE_SNAP_LABELS[snap.kind]} · ${snap.point.x.toFixed(2)}, ${snap.point.y.toFixed(2)}, ${snap.point.z.toFixed(2)} mm`
            : "SNAP: sin punto detectado"}
        </div>
        {error ? <div role="alert" style={{ color: "#fca5a5" }}>{error}</div> : null}
      </section>
      {snap && (
        <div data-native-brep-snap-marker="true" aria-label={NATIVE_SNAP_LABELS[snap.kind]}
          style={{
            position: "absolute", zIndex: 4, pointerEvents: "none",
            left: snap.screenX, top: snap.screenY,
            transform: "translate(-50%, -50%)", width: 15, height: 15,
            border: "2px solid #43f2be", borderRadius: snap.kind === "CIRCLE_CENTER" ? "50%" : "2px",
            background: "#073c2c88", boxShadow: "0 0 8px #43f2be",
          }}>
          <span style={{
            position: "absolute", left: "50%", top: "50%",
            transform: "translate(-50%, -50%)", color: "#e6fff4",
            fontSize: 11, lineHeight: 1,
          }}>+</span>
        </div>
      )}
      <aside style={{
        position: "absolute", right: 14, bottom: 14, zIndex: 2,
        background: "#101820e8", border: "1px solid #526477", borderRadius: 9,
        padding: 11, fontSize: 12, lineHeight: 1.6, minWidth: 206,
      }}>
        <strong>Diagnóstico independiente</strong>
        <div>FPS aproximados: {stats.fps || "—"}</div>
        <div>Llamadas de dibujo: {stats.drawCalls}</div>
        <div>Triángulos GPU: {stats.triangles.toLocaleString("es-CO")}</div>
        <div>Mallas STEP: {stats.meshes.toLocaleString("es-CO")}</div>
        <div>Triángulos STEP: {stats.stepTriangles.toLocaleString("es-CO")}</div>
        <div>Geometrías GPU: {stats.geometries}</div>
        <div>Carga STEP: {stats.loadMs === null ? "—" : `${stats.loadMs} ms`}</div>
        <div>Heap JS: {stats.jsHeapMb === null ? "no disponible" : `~${stats.jsHeapMb} MB`}</div>
        <div style={{ color: "#aabed1", maxWidth: 235 }}>
          RAM del sistema y VRAM no están disponibles mediante el navegador.
          Comparar cada visor por separado, con el mismo STEP y las mismas condiciones.
        </div>
      </aside>
    </main>
  );
}
