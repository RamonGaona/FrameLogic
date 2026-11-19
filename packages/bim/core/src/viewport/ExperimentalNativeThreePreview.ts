import * as THREE from "three";

import type { FrameLogicViewportPort } from "./FrameLogicViewportPort";

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
  status.textContent = "Vista secundaria de diagnóstico · solo lectura";
  status.style.cssText = "padding:4px 8px 7px;color:#cbd5e1";
  renderer.domElement.style.cssText = "display:block;width:100%;height:auto;pointer-events:none";
  panel.append(header, renderer.domElement, status);
  options.host.appendChild(panel);

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    close.removeEventListener("click", dispose);
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
        renderer.render(options.viewport.scene, camera);
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
