import * as THREE from "three";
import type { DesignSceneController } from "../design/DesignSceneController";

/** A persisted assembly View's coordinate system. No world-axis snapping is permitted. */
export interface DrawingPlaneSnapshot {
  readonly origin: { readonly x: number; readonly y: number; readonly z: number };
  readonly xAxis: { readonly x: number; readonly y: number; readonly z: number };
  readonly yAxis: { readonly x: number; readonly y: number; readonly z: number };
  readonly normal: { readonly x: number; readonly y: number; readonly z: number };
}

export interface ShadedAssemblyRequest {
  readonly viewId: string;
  readonly instanceIds: readonly string[];
  readonly plane: DrawingPlaneSnapshot;
  readonly modelWidth: number;
  readonly modelHeight: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
  readonly geometrySignature?: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly monochrome: boolean;
}

export interface ShadedAssemblyImage {
  readonly jpegDataUrl: string;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

/**
 * Isolated WebGL depth-buffer rendering for Paper Space.
 * Uses the same placed instance meshes as Model Space, but does not mutate them
 * and does not confuse a 2D HLR silhouette with a filled face.
 * The JPEG is reused by the SVG preview and the PDF image XObject.
 */
export class AssemblyViewShadingRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly designScene: DesignSceneController;
  private readonly cache = new Map<string, ShadedAssemblyImage>();

  constructor(designScene: DesignSceneController) {
    this.designScene = designScene;
  }

  dispose(): void {
    this.cache.clear();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer?.domElement.remove();
    this.renderer = null;
  }

  render(request: ShadedAssemblyRequest): ShadedAssemblyImage | null {
    if (!(request.modelWidth > 0 && request.modelHeight > 0)) return null;
    const pixelWidth = Math.max(128, Math.min(1800, Math.round(request.pixelWidth)));
    const pixelHeight = Math.max(128, Math.min(1800, Math.round(request.pixelHeight)));
    const origin = vector(request.plane.origin);
    const xAxis = vector(request.plane.xAxis).normalize();
    const yAxis = vector(request.plane.yAxis).normalize();
    const normal = vector(request.plane.normal).normalize();
    if (!xAxis.lengthSq() || !yAxis.lengthSq() || !normal.lengthSq()) return null;

    // The projection signature changes with geometry and instance transforms.
    const key = [
      request.viewId, request.geometrySignature ?? "uncached",
      request.instanceIds.join(","), request.monochrome ? "mono" : "color",
      pixelWidth, pixelHeight, request.modelWidth, request.modelHeight,
      request.offsetX, request.offsetY,
      ...Object.values(request.plane.origin), ...Object.values(request.plane.xAxis),
      ...Object.values(request.plane.yAxis), ...Object.values(request.plane.normal),
    ].join("|");
    const cached = request.geometrySignature ? this.cache.get(key) : undefined;
    if (cached) return cached;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#ffffff");
    scene.add(new THREE.AmbientLight(0xffffff, 1.65));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2);
    keyLight.position.copy(normal).multiplyScalar(3).add(xAxis).add(yAxis.clone().multiplyScalar(2));
    scene.add(keyLight);

    const disposableMaterials: THREE.Material[] = [];
    let meshCount = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (const instanceId of request.instanceIds) {
      const object = this.designScene.getInstanceObject(instanceId);
      if (!object || !object.visible) continue;
      object.updateWorldMatrix(true, true);
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh) || !child.visible) return;
        if (!child.geometry.getAttribute("position")) return;
        const originalMaterial = Array.isArray(child.material)
          ? child.material[0] : child.material;
        const sourceColor = originalMaterial && "color" in originalMaterial
          && originalMaterial.color instanceof THREE.Color
          ? originalMaterial.color : new THREE.Color("#9db7c7");
        const material = new THREE.MeshStandardMaterial({
          color: request.monochrome
            ? new THREE.Color().setRGB(
              sourceColor.r * 0.2126 + sourceColor.g * 0.7152 + sourceColor.b * 0.0722,
              sourceColor.r * 0.2126 + sourceColor.g * 0.7152 + sourceColor.b * 0.0722,
              sourceColor.r * 0.2126 + sourceColor.g * 0.7152 + sourceColor.b * 0.0722,
            ) : sourceColor,
          side: THREE.DoubleSide,
          roughness: 0.82,
          metalness: 0.08,
        });
        disposableMaterials.push(material);
        const mesh = new THREE.Mesh(child.geometry, material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(child.matrixWorld);
        mesh.frustumCulled = false;
        scene.add(mesh);
        meshCount++;

        // Bounding-box corners are conservative and sufficient to choose near/far.
        const box = new THREE.Box3().setFromObject(child);
        for (const x of [box.min.x, box.max.x]) {
          for (const y of [box.min.y, box.max.y]) {
            for (const z of [box.min.z, box.max.z]) {
              const p = new THREE.Vector3(x, y, z).sub(origin);
              const px = p.dot(xAxis), py = p.dot(yAxis), pz = p.dot(normal);
              minX = Math.min(minX, px); maxX = Math.max(maxX, px);
              minY = Math.min(minY, py); maxY = Math.max(maxY, py);
              minZ = Math.min(minZ, pz); maxZ = Math.max(maxZ, pz);
            }
          }
        }
      });
    }

    try {
      if (!meshCount || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;
      const estimatedOffsetX = minX - (request.modelWidth - (maxX - minX)) / 2;
      const estimatedOffsetY = minY - (request.modelHeight - (maxY - minY)) / 2;
      const offsetX = request.offsetX ?? estimatedOffsetX;
      const offsetY = request.offsetY ?? estimatedOffsetY;
      const centerX = offsetX + request.modelWidth / 2;
      const centerY = offsetY + request.modelHeight / 2;
      const span = Math.max(maxZ - minZ, request.modelWidth, request.modelHeight, 1);
      const cameraCenter = origin.clone()
        .addScaledVector(xAxis, centerX).addScaledVector(yAxis, centerY)
        .addScaledVector(normal, (minZ + maxZ) / 2);
      const camera = new THREE.OrthographicCamera(
        -request.modelWidth / 2, request.modelWidth / 2,
        request.modelHeight / 2, -request.modelHeight / 2,
        0.1, span * 5 + 10,
      );
      camera.position.copy(cameraCenter).addScaledVector(normal, span + 1);
      camera.up.copy(yAxis);
      camera.lookAt(cameraCenter);
      camera.updateProjectionMatrix();

      if (!this.renderer) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(1);
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.setClearColor("#ffffff", 1);
      }
      this.renderer.setSize(pixelWidth, pixelHeight, false);
      this.renderer.render(scene, camera);
      const image: ShadedAssemblyImage = {
        jpegDataUrl: this.renderer.domElement.toDataURL("image/jpeg", 0.93),
        pixelWidth,
        pixelHeight,
      };
      if (request.geometrySignature) {
        if (this.cache.size >= 24) this.cache.delete(this.cache.keys().next().value ?? "");
        this.cache.set(key, image);
      }
      return image;
    } catch {
      // Context creation/loss must not prevent vector-only Paper Space editing.
      return null;
    } finally {
      for (const material of disposableMaterials) material.dispose();
      scene.clear();
    }
  }
}

function vector(value: { readonly x: number; readonly y: number; readonly z: number }): THREE.Vector3 {
  return new THREE.Vector3(value.x, value.y, value.z);
}
