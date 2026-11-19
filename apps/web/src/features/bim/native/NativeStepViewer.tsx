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
  nativeAxisUntilOffset,
  pickNativeAxisUntilReference,
  type NativeAxisUntilReference,
} from "./NativeStepAxisUntil";
import {
  findNativeCopySnapDestination,
  nativeCopySnapOffset,
  type NativeCopySnapBase,
} from "./NativeStepSnapPlacement";
import {
  NativeStepSelectionController,
  pickNativeStepMesh,
  type NativeStepSelectionInfo,
} from "./NativeStepSelectionController";
import {
  createNativeMoveGizmo,
  nativeMoveAxisDistanceFromPixels,
  pickNativeMoveAxis,
  pickNativeMoveCenter,
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
  getNativeStepGizmoPivot,
  resetNativeStepGizmoPivot,
  setNativeStepGizmoPivot,
} from "./NativeStepGizmoPivot";
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
  const snapPlacementRef = useRef<NativeCopySnapBase | null>(null);
  const armedPivotRef = useRef<{ readonly sourceKey: string } | null>(null);
  const [pivotArmed, setPivotArmed] = useState(false);
  const armedUntilRef = useRef<{
    readonly sourceKey: string;
    readonly axis: NativeMoveAxis;
    readonly pivot: THREE.Vector3;
    readonly copy: boolean;
  } | null>(null);
  const [armedUntil, setArmedUntil] = useState<{
    readonly axis: NativeMoveAxis;
    readonly copy: boolean;
  } | null>(null);
  const [untilSurface, setUntilSurface] = useState<{
    readonly point: THREE.Vector3;
    readonly screenX: number;
    readonly screenY: number;
  } | null>(null);
  const [snapBase, setSnapBase] = useState<THREE.Vector3 | null>(null);
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
    const pivot = scope ? getNativeStepGizmoPivot(scope) : null;
    setTransformTarget(scope ? {
      ...prepareNativeStepTransformTarget(scope),
      pivot: pivot!,
    } : null);
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
        const gizmo = createNativeMoveGizmo(pivot!, diagonal);
        runtime.scene.add(gizmo.group);
        moveGizmoRef.current = gizmo;
        moveGizmoKeyRef.current = target.key;
      } else {
        moveGizmoRef.current.group.position.copy(pivot!);
        moveGizmoRef.current.group.updateMatrixWorld(true);
      }
    }
    setMoveHistory({ undo: moveRef.current.canUndo, redo: moveRef.current.canRedo });
  }

  function clearArmedUntil(): void {
    armedUntilRef.current = null;
    setArmedUntil(null);
    setUntilSurface(null);
  }

  function clearArmedPivot(): void {
    armedPivotRef.current = null;
    setPivotArmed(false);
  }

  function armNativePivot(): boolean {
    const target = moveTargetRef.current;
    const scope = partScopeRef.current;
    if (!target || !scope || scope.key !== target.key) {
      setMoveStatus("Centro del gizmo: selecciona un STEP de producto único.");
      return false;
    }
    clearArmedUntil();
    snapPlacementRef.current = null;
    setSnapBase(null);
    armedPivotRef.current = { sourceKey: target.key };
    setPivotArmed(true);
    setSnap(null);
    setUntilSurface(null);
    setMoveStatus("CENTRO XYZ: selecciona un SNAP B-Rep exacto para reubicar solo el gizmo. Esc cancela.");
    return true;
  }

  function placeNativePivot(point: THREE.Vector3): boolean {
    const target = moveTargetRef.current;
    const scope = partScopeRef.current;
    if (!target || !scope || armedPivotRef.current?.sourceKey !== target.key
      || !setNativeStepGizmoPivot(scope, point)) return false;
    clearArmedPivot();
    refreshMoveUi();
    setSnap(null);
    setMoveStatus("Centro XYZ reubicado con SNAP exacto. La pieza no se movió; sin entrada Undo.");
    return true;
  }

  function resetNativePivot(): void {
    const scope = partScopeRef.current;
    if (!scope || !resetNativeStepGizmoPivot(scope)) return;
    clearArmedPivot();
    refreshMoveUi();
    setSnap(null);
    setMoveStatus("Centro XYZ restablecido. Geometría y posición de la pieza sin cambios.");
  }

  function armNativeUntil(axis: NativeMoveAxis, copy = false): boolean {
    const target = moveTargetRef.current;
    const scope = partScopeRef.current;
    if (!target || !scope || scope.key !== target.key) {
      setMoveStatus("HASTA requiere una pieza STEP independiente seleccionada.");
      return false;
    }
    clearArmedPivot();
    snapPlacementRef.current = null;
    setSnapBase(null);
    const pivot = getNativeStepGizmoPivot(scope);
    armedUntilRef.current = {
      sourceKey: target.key, axis, pivot, copy,
    };
    setArmedUntil({ axis, copy });
    setMoveAxis(axis);
    setUntilSurface(null);
    setSnap(null);
    setMoveStatus(copy
      ? `COPIAR HASTA · eje ${axis}: siguiente clic en SNAP o cara visible. Esc cancela.`
      : `MOVER HASTA · eje ${axis}: siguiente clic en SNAP o cara visible. Ctrl copia.`);
    return true;
  }

  function focusNativeTarget(target: NativeIsolatedStepTarget | null): void {
    clearArmedPivot();
    clearArmedUntil();
    snapPlacementRef.current = null;
    setSnapBase(null);
    const runtime = runtimeRef.current;
    const mesh = target?.meshes[0] as THREE.Mesh<
      THREE.BufferGeometry, THREE.MeshStandardMaterial
    > | undefined;
    // Undo(COPY) detaches the copy. Never leave a selection referring to it.
    const valid = runtime && mesh && mesh.parent
      ? mesh : null;
    const scope = valid && runtime
      ? resolveNativeStepPartScope(runtime.modelRoot, valid) : null;
    setSelection(selectionRef.current.setSelected(valid, scope?.meshes));
    partScopeRef.current = scope;
    refreshMoveUi();
    setSnap(null);
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
    let pivotDrag: {
      id: number; startX: number; startY: number;
    } | null = null;
    let moveDrag: {
      id: number;
      axis: NativeMoveAxis;
      startX: number;
      startY: number;
      pivot: THREE.Vector3;
      axisLength: number;
    } | null = null;
    const clearSnap = () => {
      setSnap((previous) => previous ? null : previous);
      setUntilSurface((previous) => previous ? null : previous);
    };
    const findPivotSnapAt = (x: number, y: number) => {
      const target = moveTargetRef.current;
      if (!target || armedPivotRef.current?.sourceKey !== target.key) return null;
      updateNativeOrthographicCamera(camera, state, width / height);
      return findNativeCopySnapDestination(
        runtime.modelRoot, snapIndexRef.current, target, camera,
        x, y, canvas.getBoundingClientRect(), 13,
      );
    };
    const findUntilReferenceAt = (x: number, y: number): NativeAxisUntilReference | null => {
      const armed = armedUntilRef.current;
      const target = moveTargetRef.current;
      if (!armed || !target || armed.sourceKey !== target.key) return null;
      updateNativeOrthographicCamera(camera, state, width / height);
      return pickNativeAxisUntilReference(
        runtime.modelRoot, snapIndexRef.current, target, camera,
        x, y, canvas.getBoundingClientRect(), 13,
      );
    };
    const findDestinationAt = (x: number, y: number) => {
      const target = moveTargetRef.current;
      if (!target || snapPlacementRef.current?.sourceKey !== target.key) return null;
      updateNativeOrthographicCamera(camera, state, width / height);
      return findNativeCopySnapDestination(
        runtime.modelRoot, snapIndexRef.current, target, camera,
        x, y, canvas.getBoundingClientRect(), 13,
      );
    };
    const updateSnapFromPointer = (event: PointerEvent) => {
      if (armedPivotRef.current) {
        const now = performance.now();
        if (now - lastSnapQuery < 70) return;
        lastSnapQuery = now;
        setSnap(findPivotSnapAt(event.clientX, event.clientY));
        setUntilSurface(null);
        return;
      }
      if (armedUntilRef.current) {
        const now = performance.now();
        if (now - lastSnapQuery < 70) return;
        lastSnapQuery = now;
        const reference = findUntilReferenceAt(event.clientX, event.clientY);
        if (reference?.kind === "BREP_SNAP") {
          setSnap(reference.snap);
          setUntilSurface(null);
        } else {
          clearSnap();
          setUntilSurface(reference?.kind === "SURFACE_POINT"
            ? {
              point: reference.point,
              screenX: event.clientX - canvas.getBoundingClientRect().left,
              screenY: event.clientY - canvas.getBoundingClientRect().top,
            } : null);
        }
        return;
      }
      if (snapPlacementRef.current) {
        const now = performance.now();
        if (now - lastSnapQuery < 70) return;
        lastSnapQuery = now;
        const destination = findDestinationAt(event.clientX, event.clientY);
        setSnap(destination);
        return;
      }
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
        if (pickNativeMoveCenter(
          moveGizmoRef.current, camera, e.clientX, e.clientY,
          canvas.getBoundingClientRect(),
        )) {
          // The centre never initiates a geometry transform. It owns the
          // pointer gesture and accepts only a subsequent exact SNAP.
          if (armNativePivot()) {
            pivotDrag = { id: e.pointerId, startX: e.clientX, startY: e.clientY };
            canvas.setPointerCapture(e.pointerId);
            e.preventDefault();
            return;
          }
        }
        const axis = pickNativeMoveAxis(
          moveGizmoRef.current, camera, e.clientX, e.clientY,
          canvas.getBoundingClientRect(),
        );
        if (axis && (armedUntilRef.current || armedPivotRef.current)) {
          armNativeUntil(axis, armedUntilRef.current?.copy || e.ctrlKey);
          e.preventDefault();
          return;
        }
        if (axis && moveRef.current.beginDrag(moveTargetRef.current, axis, e.ctrlKey)) {
          // Drag and two-point COPYBASE are exclusive interaction modes.
          clearArmedUntil();
          snapPlacementRef.current = null;
          setSnapBase(null);
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
      if (pivotDrag) {
        if (pivotDrag.id !== e.pointerId) return;
        // Never drag the underlying piece or move the gizmo to an
        // unverified screen-space position. Indicate exact SNAPs only.
        updateSnapFromPointer(e);
        e.preventDefault();
        return;
      }
      if (moveDrag) {
        if (moveDrag.id !== e.pointerId) return;
        const distance = nativeMoveAxisDistanceFromPixels(
          camera, moveDrag.pivot, moveDrag.axis, moveDrag.axisLength,
          e.clientX - moveDrag.startX, e.clientY - moveDrag.startY,
          width, height,
        );
        if (distance !== null && moveRef.current.previewDrag(distance, e.ctrlKey)) {
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
      if (pivotDrag?.id === e.pointerId) {
        const shortClick = Math.hypot(
          e.clientX - pivotDrag.startX, e.clientY - pivotDrag.startY,
        ) <= 5;
        pivotDrag = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (e.type !== "pointerup") {
          clearArmedPivot();
          clearSnap();
          setMoveStatus("Reubicación de centro cancelada.");
        } else if (!shortClick) {
          const hit = findPivotSnapAt(e.clientX, e.clientY);
          if (!hit || !placeNativePivot(hit.point)) {
            setMoveStatus("Centro XYZ armado: arrastra o haz clic sobre un SNAP exacto; Esc cancela.");
          }
        } else {
          setMoveStatus("Centro XYZ armado: siguiente clic en un SNAP B-Rep exacto. Esc cancela.");
        }
        return;
      }
      if (moveDrag?.id === e.pointerId) {
        if (e.type === "pointerup" && e.ctrlKey) {
          moveRef.current.enableCopyDuringDrag();
        }
        const shortClick = e.type === "pointerup"
          && Math.hypot(e.clientX - moveDrag.startX, e.clientY - moveDrag.startY) <= 5;
        const axis = moveDrag.axis;
        const copy = moveRef.current.isCopying || e.ctrlKey;
        // Like the established Model Space gizmo: a short axis click arms
        // HASTA and the NEXT pointer click supplies the destination.
        const committed = moveRef.current.endDrag(e.type === "pointerup" && !shortClick);
        const outcome = moveRef.current.lastResult;
        moveDrag = null;
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
        if (shortClick) {
          refreshMoveUi();
          armNativeUntil(axis, copy);
          return;
        }
        if (committed && outcome?.kind === "COPY") {
          focusNativeTarget(outcome.target);
        } else {
          refreshMoveUi();
        }
        clearSnap();
        setMoveStatus(committed
          ? outcome?.kind === "COPY"
            ? "Copia visual confirmada: original inmóvil. Deshacer disponible."
            : "Desplazamiento visual confirmado (deshacer disponible)."
          : "Desplazamiento o copia cancelada.");
        return;
      }
      if (pointer?.id !== e.pointerId) return;
      const wasClick = e.type === "pointerup" && pointer.button === 0
        && !pointer.pan && !pointer.moved;
      pointer = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      if (wasClick && armedPivotRef.current) {
        const hit = findPivotSnapAt(e.clientX, e.clientY);
        if (!hit || !placeNativePivot(hit.point)) {
          setMoveStatus("No hay SNAP B-Rep exacto en ese punto; el centro sigue armado. Esc cancela.");
        }
        return;
      }
      if (wasClick && armedUntilRef.current) {
        const armed = armedUntilRef.current;
        const source = moveTargetRef.current;
        const reference = findUntilReferenceAt(e.clientX, e.clientY);
        const offset = reference
          ? nativeAxisUntilOffset(armed.pivot, armed.axis, reference.point)
          : null;
        if (!source || source.key !== armed.sourceKey || !offset) {
          setMoveStatus(reference
            ? "Referencia alineada o distancia inválida; elige otro destino o pulsa Esc."
            : "No hay SNAP ni cara STEP visible en ese punto; elige otra referencia o Esc.");
          return;
        }
        const copy = armed.copy || e.ctrlKey;
        const committed = copy
          ? moveRef.current.copyTo(source, offset)
          : moveRef.current.moveBy(source, armed.axis, offset.dot(
            // Global orthogonal axis, as in the native XYZ gizmo.
            new THREE.Vector3(
              armed.axis === "X" ? 1 : 0,
              armed.axis === "Y" ? 1 : 0,
              armed.axis === "Z" ? 1 : 0,
            ),
          ));
        if (committed) {
          const exact = reference?.kind === "BREP_SNAP";
          clearSnap();
          setUntilSurface(null);
          // Only a deliberately armed COPY mode repeats. Ctrl pressed
          // solely on the destination creates ONE copy and finishes, so
          // the next ordinary click cannot accidentally move the source.
          if (!armed.copy) clearArmedUntil();
          refreshMoveUi();
          setMoveStatus(copy
            ? `COPIAR HASTA ${armed.axis} aplicado (${exact ? "SNAP B-Rep exacto" : "cara STEP aproximada"}). Original inmóvil.${armed.copy ? " Clic para otra copia o Esc." : ""}`
            : `MOVER HASTA ${armed.axis} aplicado (${exact ? "SNAP B-Rep exacto" : "cara STEP aproximada"}).`);
        } else {
          setMoveStatus("No fue posible completar HASTA; selecciona otra referencia.");
        }
        return;
      }
      if (wasClick && snapPlacementRef.current) {
        const base = snapPlacementRef.current;
        const source = moveTargetRef.current;
        const destination = findDestinationAt(e.clientX, e.clientY);
        const offset = source && destination
          ? nativeCopySnapOffset(base, source, destination) : null;
        if (source && offset && moveRef.current.copyTo(source, offset)) {
          const copy = moveRef.current.lastResult?.target ?? null;
          focusNativeTarget(copy);
          setMoveStatus("Copia por SNAP B-Rep colocada en destino exacto; original inmóvil.");
        } else {
          setMoveStatus("Selecciona otro SNAP de destino válido; Esc cancela COPYBASE.");
        }
        clearSnap();
        return;
      }
      if (wasClick) {
        clearArmedPivot();
        clearArmedUntil();
        snapPlacementRef.current = null;
        setSnapBase(null);
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
      if (e.key === "Control" && moveDrag) {
        // Ctrl pressed midway through a move switches to COPY; any movement
        // already applied to the original is restored immediately.
        if (moveRef.current.enableCopyDuringDrag()) {
          refreshMoveUi();
          setMoveStatus("Ctrl + arrastrar: se mueve la copia; original inmóvil.");
        }
        return;
      }
      const focused = e.target;
      const editable = focused instanceof HTMLElement
        && Boolean(focused.closest('input, textarea, [contenteditable="true"]'));
      if (!editable && (e.ctrlKey || e.metaKey) && !moveDrag) {
        const key = e.key.toLowerCase();
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          undoMove();
          return;
        }
        if (key === "y" || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          redoMove();
          return;
        }
      }
      if (e.key !== "Escape") return;
      if (pivotDrag) {
        const pointerId = pivotDrag.id;
        pivotDrag = null;
        if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
        clearArmedPivot();
        clearSnap();
        setMoveStatus("Reubicación del centro XYZ cancelada; pieza inmóvil.");
        return;
      }
      if (armedPivotRef.current) {
        clearArmedPivot();
        clearSnap();
        setMoveStatus("Reubicación del centro XYZ cancelada; pieza inmóvil.");
        return;
      }
      if (armedUntilRef.current) {
        clearArmedUntil();
        clearSnap();
        setMoveStatus("HASTA cancelado; no se movió ni copió ninguna pieza.");
        return;
      }
      if (snapPlacementRef.current) {
        snapPlacementRef.current = null;
        setSnapBase(null);
        clearSnap();
        setMoveStatus("Copia por SNAP cancelada; original inmóvil.");
        return;
      }
      if (moveDrag) {
        const pointerId = moveDrag.id;
        moveRef.current.endDrag(false);
        moveDrag = null;
        if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
        refreshMoveUi();
        clearSnap();
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
      armedPivotRef.current = null;
      armedUntilRef.current = null;
      snapPlacementRef.current = null;
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
      clearArmedPivot();
      clearArmedUntil();
      snapPlacementRef.current = null;
      setSnapBase(null);
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
    setUntilSurface(null);
    applyStandardView(runtime, view);
  }

  function fit(): void {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.modelRoot.children.length === 0) return;
    setSnap(null);
    setUntilSurface(null);
    const canvas = runtime.renderer.domElement;
    const aspect = Math.max(canvas.clientWidth, 1) / Math.max(canvas.clientHeight, 1);
    Object.assign(
      runtime.state,
      fitNativeOrthographicCamera(
        new THREE.Box3().setFromObject(runtime.modelRoot), aspect,
      ),
    );
  }

  function captureSnapBase(): void {
    clearArmedPivot();
    clearArmedUntil();
    const target = moveTargetRef.current;
    if (!target || !snap || snap.brepDocumentId !== target.documentId) {
      setMoveStatus("Selecciona una pieza aislada y acerca el cursor a un SNAP B-Rep exacto.");
      return;
    }
    snapPlacementRef.current = {
      sourceKey: target.key,
      sourcePointMm: snap.point.clone(),
    };
    setSnapBase(snap.point.clone());
    setSnap(null);
    setMoveStatus("COPYBASE: haz clic en el SNAP de destino. Esc cancela; el original no se mueve.");
  }

  function moveNumeric(copy = false): void {
    clearArmedPivot();
    clearArmedUntil();
    const target = moveTargetRef.current;
    const amount = Number(moveAmount.trim().replace(",", "."));
    if (!target) {
      setMoveStatus("Movimiento bloqueado: se necesita un STEP con un único producto inequívoco.");
      return;
    }
    if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000 || amount === 0) {
      setMoveStatus("Distancia inválida. Introduce un número no nulo de hasta 1.000.000 mm.");
      return;
    }
    const committed = copy
      ? moveRef.current.copyBy(target, moveAxis, amount)
      : moveRef.current.moveBy(target, moveAxis, amount);
    if (committed) {
      const outcome = moveRef.current.lastResult;
      if (outcome?.kind === "COPY") focusNativeTarget(outcome.target);
      else refreshMoveUi();
      setSnap(null);
      setMoveStatus(copy
        ? `Copia visual: ${moveAxis} ${amount} mm. Original inmóvil; deshacer disponible.`
        : `Desplazamiento visual: ${moveAxis} ${amount} mm. Deshacer disponible.`);
    }
  }

  function undoMove(): void {
    if (!moveRef.current.undo()) return;
    const outcome = moveRef.current.lastResult;
    if (outcome) focusNativeTarget(outcome.target);
    else refreshMoveUi();
    setSnap(null);
    setMoveStatus(outcome?.kind === "COPY_UNDONE"
      ? "Copia deshecha: original restaurado e inmóvil."
      : "Desplazamiento visual deshecho.");
  }

  function redoMove(): void {
    if (!moveRef.current.redo()) return;
    const outcome = moveRef.current.lastResult;
    if (outcome) focusNativeTarget(outcome.target);
    else refreshMoveUi();
    setSnap(null);
    setMoveStatus(outcome?.kind === "COPY"
      ? "Copia visual restaurada; original inmóvil."
      : "Desplazamiento visual rehecho.");
  }

  function backToCurrentViewer(): void {
    if (!window.confirm(
      "Este visor permite movimientos y copias visuales temporales: no se modifican ni guardan los STEP originales. ¿Regresar al FrameLogic habitual?",
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
                {" · Rotación no implementada"}
              </div>
            )}
            <div data-native-move-status="true" style={{ color: moveEligible ? "#86efac" : "#fcd34d" }}>
              {moveEligible
                ? "Gizmo XYZ: arrastra para mover · Ctrl + arrastrar para copiar · clic corto en un eje = HASTA (siguiente clic en referencia)."
                : "Movimiento y copia bloqueados: STEP con varios productos o identidad ambigua."}
              {armedUntil && (
                <div data-native-axis-until-active="true" style={{
                  marginTop: 5, color: "#fcd34d",
                }}>
                  {armedUntil.copy ? "COPIAR HASTA" : "MOVER HASTA"} · eje {armedUntil.axis}
                  {" · "}clic sobre SNAP B-Rep o cara visible
                  {armedUntil.copy
                    ? " · puedes seguir colocando copias; Esc termina."
                    : " · Ctrl en el clic de destino copia; Esc cancela."}
                </div>
              )}
              {snapBase && (
                <div data-native-copybase-active="true" style={{ color: "#67e8f9" }}>
                  COPYBASE · base {snapBase.toArray().map(v => v.toFixed(2)).join(", ")} mm
                  · clic sobre SNAP destino (Esc cancela)
                </div>
              )}
            </div>
            {moveEligible && (
              <button type="button" style={buttonStyle}
                disabled={!snap || Boolean(snapBase)}
                onClick={captureSnapBase}>Fijar base SNAP para copiar</button>
            )}
            {moveEligible && (
              <div data-native-move-controls="true" style={{
                display: "flex", flexDirection: "column", gap: 6,
                borderTop: "1px solid #356273", paddingTop: 8,
              }}>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  {(["X", "Y", "Z"] as const).map((axis) => (
                    <button key={axis} type="button" style={{
                      ...buttonStyle,
                      borderColor: moveAxis === axis ? "#43f2be" : "#64748b",
                    }} onClick={() => setMoveAxis(axis)}>{axis}</button>
                  ))}
                  <input aria-label="Distancia en milímetros" type="text"
                    inputMode="decimal" value={moveAmount}
                    onChange={(event) => setMoveAmount(event.currentTarget.value)}
                    style={{
                      width: 85, padding: 7, borderRadius: 5,
                      border: "1px solid #64748b", background: "#0b1520",
                      color: "#f8fafc",
                    }} />
                  <span>mm</span>
                  <button type="button" style={buttonStyle}
                    onClick={(event) => moveNumeric(event.ctrlKey)}>Mover</button>
                  <button type="button" style={buttonStyle}
                    onClick={() => moveNumeric(true)}>Copiar</button>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" style={buttonStyle}
                    onClick={(event) => armNativeUntil(moveAxis, event.ctrlKey)}>
                    Hasta
                  </button>
                  <button type="button" style={buttonStyle}
                    onClick={() => armNativeUntil(moveAxis, true)}>
                    Copiar hasta
                  </button>
                  <span style={{ color: "#b9d4e7" }}>
                    Eje {moveAxis} · siguiente clic elige referencia
                  </span>
                </div>
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={buttonStyle}
                disabled={!moveHistory.undo} onClick={undoMove}>Deshacer</button>
              <button type="button" style={buttonStyle}
                disabled={!moveHistory.redo} onClick={redoMove}>Rehacer</button>
            </div>
            <button type="button" style={buttonStyle} onClick={() => {
              selectionRef.current.clear();
              clearArmedUntil();
              snapPlacementRef.current = null;
              setSnapBase(null);
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
        {moveStatus && <div role="status" style={{ color: "#fcd34d" }}>{moveStatus}</div>}
        <div style={{ color: "#ffdb8d" }}>
          Movimiento y Ctrl-copia temporales en Three.js: no se guardan cambios
          en STEP, .flproject ni en la topología OCCT. No admite mover ni copiar
          subpiezas de un STEP que contenga varios productos.
        </div>
        <div data-native-brep-snap-status="true" style={{ color: untilSurface ? "#fcd34d" : "#99e6c9" }}>
          {snap ? `${NATIVE_SNAP_LABELS[snap.kind]} · ${snap.point.x.toFixed(2)}, ${snap.point.y.toFixed(2)}, ${snap.point.z.toFixed(2)} mm`
            : untilSurface
              ? `Cara STEP (aprox.) · ${untilSurface.point.x.toFixed(2)}, ${untilSurface.point.y.toFixed(2)}, ${untilSurface.point.z.toFixed(2)} mm`
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
      {armedUntil && untilSurface && (
        <div data-native-axis-until-surface-marker="true"
          aria-label="Punto de superficie STEP aproximado"
          style={{
            position: "absolute", zIndex: 4, pointerEvents: "none",
            left: untilSurface.screenX, top: untilSurface.screenY,
            transform: "translate(-50%, -50%)", width: 13, height: 13,
            border: "2px solid #fcd34d", borderRadius: "50%",
            background: "#6d3a0e99", boxShadow: "0 0 7px #fcd34d",
          }}>
          <span style={{
            position: "absolute", left: "50%", top: "50%",
            transform: "translate(-50%, -50%)",
            color: "#fff7ed", fontSize: 10, lineHeight: 1,
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
