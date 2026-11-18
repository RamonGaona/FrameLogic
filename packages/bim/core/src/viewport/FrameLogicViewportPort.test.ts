import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { exposeFrameLogicViewport } from "./FrameLogicViewportPort";

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
});
