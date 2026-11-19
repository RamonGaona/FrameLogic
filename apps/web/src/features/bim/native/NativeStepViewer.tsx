import * as THREE from "three";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

// Injected by Vite from the root package.json, same source as CAD Model Space.
declare const __FRAMELOGIC_VERSION__: string;
const VERSION = typeof __FRAMELOGIC_VERSION__ === "string"
  ? __FRAMELOGIC_VERSION__ : "dev";

import { OcctStepGeometryAdapter } from "../step/OcctStepGeometryAdapter";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedNames, setLoadedNames] = useState<string[]>([]);
  const [stats, setStats] = useState<NativeViewerStats>(EMPTY_STATS);

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

    let pointer: { id: number; x: number; y: number; pan: boolean } | null = null;
    const canvas = renderer.domElement;
    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      pointer = {
        id: e.pointerId, x: e.clientX, y: e.clientY,
        pan: e.button === 2 || (e.button === 0 && e.shiftKey),
      };
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!pointer || pointer.id !== e.pointerId) return;
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
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
      if (pointer?.id !== e.pointerId) return;
      pointer = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      wheelNativeCamera(state, e.deltaY);
    };
    const contextMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("wheel", wheel, { passive: false });
    canvas.addEventListener("contextmenu", contextMenu);

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
      disposeNativeStepMeshGroup(modelRoot);
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
        if (document.brepDocumentId) stagedBrep.push(document.brepDocumentId);
        if (!aliveRef.current || generation !== loadGeneration.current) return;
        const group = buildNativeStepMeshGroup(document);
        staged.add(group);
        meshes += group.children.length;
        triangles += document.meshes.reduce(
          (sum, mesh) => sum + Math.floor(mesh.indices.length / 3), 0,
        );
      }
      if (meshes === 0) throw new Error("El STEP no contiene mallas visualizables.");

      const previous = runtime.modelRoot;
      runtime.scene.remove(previous);
      disposeNativeStepMeshGroup(previous);
      for (const id of brepDocuments.current) adapterRef.current.disposeDocument(id);
      brepDocuments.current = stagedBrep.slice();

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
    applyStandardView(runtime, view);
  }

  function fit(): void {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.modelRoot.children.length === 0) return;
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
        {error ? <div role="alert" style={{ color: "#fca5a5" }}>{error}</div> : null}
      </section>
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
