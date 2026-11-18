import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createLiveFrameLogicViewport, exposeFrameLogicViewport } from "./FrameLogicViewportPort";

describe("FrameLogic viewport port", () => {
  it("exposes the original Three.js objects without copying them", () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const canvas = {} as HTMLCanvasElement;
    const renderer = { domElement: canvas } as THREE.WebGLRenderer;

    const viewport = exposeFrameLogicViewport(scene, camera, renderer);

    expect(viewport.scene).toBe(scene);
    expect(viewport.camera).toBe(camera);
    expect(viewport.renderer).toBe(renderer);
    expect(viewport.canvas).toBe(canvas);
  });

  it("always returns the current camera after switching orthographic/perspective", () => {
    const scene = new THREE.Scene();
    let camera: THREE.Camera = new THREE.PerspectiveCamera();
    const firstCamera = camera;
    const firstCanvas = {} as HTMLCanvasElement;
    let renderer = { domElement: firstCanvas } as THREE.WebGLRenderer;

    const viewport = createLiveFrameLogicViewport({
      getScene: () => scene,
      getCamera: () => camera,
      getRenderer: () => renderer,
    });

    expect(viewport.camera).toBe(firstCamera);
    expect(viewport.scene).toBe(scene);
    expect(viewport.canvas).toBe(firstCanvas);

    camera = new THREE.OrthographicCamera();
    const secondCanvas = {} as HTMLCanvasElement;
    renderer = { domElement: secondCanvas } as THREE.WebGLRenderer;

    expect(viewport.camera).toBe(camera);
    expect(viewport.camera).not.toBe(firstCamera);
    expect(viewport.canvas).toBe(secondCanvas);
    expect(viewport.renderer).toBe(renderer);
  });

});
