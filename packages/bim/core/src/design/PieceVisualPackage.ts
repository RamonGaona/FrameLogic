import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { StepMeshData, StepProductNode } from "@framelogic/geometry";
import { getPieceDetailGeometry, setPieceVisualLevel, registerPieceVisualLevels } from "./PieceVisualGeometry";

export interface PieceVisualPackage {
  readonly sourceSha256: string;
  readonly format: "GLB";
  readonly lengthUnit: "mm";
  readonly low: string;
  readonly work: string;
  readonly detail: string;
  readonly products?: readonly StepProductNode[];
}

async function sourceHash(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function encode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 0x8000) {
    chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)));
  }
  return btoa(chunks.join(""));
}

function decode(text: string): ArrayBuffer {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** Three representations, in the same native millimetre coordinate system.
 * The clone shares GPU resources and exporting never moves a model instance.
 */
export async function createPieceVisualPackage(prototype: THREE.Object3D, source: Uint8Array<ArrayBuffer>): Promise<PieceVisualPackage> {
  const root = prototype.clone(true);
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) child.userData["framelogicVisualMeshId"] = child.name;
  });
  const exporter = new GLTFExporter();
  const output: string[] = [];
  for (const level of ["LOW", "WORK", "DETAIL"] as const) {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh) setPieceVisualLevel(child, level);
    });
    const binary = await exporter.parseAsync(root, { binary: true, onlyVisible: false });
    if (!(binary instanceof ArrayBuffer)) throw new Error("No se pudo generar la malla GLB.");
    output.push(encode(binary));
  }
  return { sourceSha256: await sourceHash(source), format: "GLB", lengthUnit: "mm", low: output[0]!, work: output[1]!, detail: output[2]!,
    products: prototype.userData["framelogicStepProducts"] as readonly StepProductNode[] | undefined };
}

export interface LoadedPieceVisualPackage {
  readonly meshes: readonly StepMeshData[];
  readonly products: readonly StepProductNode[];
  install(prototype: THREE.Object3D): void;
  dispose(): void;
}

/** Cache is optional: a failed cache read must fall back to the master file. */
export async function loadPieceVisualPackage(value: PieceVisualPackage, source: Uint8Array<ArrayBuffer>): Promise<LoadedPieceVisualPackage> {
  if (value.format !== "GLB" || value.lengthUnit !== "mm") throw new Error("Cache visual incompatible.");
  if (value.sourceSha256 !== await sourceHash(source)) throw new Error("La cache visual no corresponde al archivo maestro.");
  const loader = new GLTFLoader();
  const roots: THREE.Group[] = [];
  try {
    for (const data of [value.detail, value.work, value.low]) {
      roots.push((await loader.parseAsync(decode(data), "")).scene);
    }
    const levels = roots.map((root) => {
      const meshes: THREE.Mesh[] = [];
      root.updateMatrixWorld(true);
      root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // STEP prototypes are native mm; bake GLB hierarchy transforms.
          child.geometry.applyMatrix4(child.matrixWorld);
          meshes.push(child);
        }
      });
      return meshes;
    });
    const details = levels[0]!;
    if (!details.length || levels.some((meshes) => meshes.length !== details.length)) {
      throw new Error("Cache visual incompleta.");
    }
    const readMesh = (mesh: THREE.Mesh, i: number): StepMeshData => {
      const geometry = getPieceDetailGeometry(mesh);
      const position = geometry.getAttribute("position");
      if (!position || position.count < 3) throw new Error("Cache visual sin vertices.");
      const positions = new Float32Array(position.count * 3);
      for (let j = 0; j < position.count; j++) {
        positions[j * 3] = position.getX(j); positions[j * 3 + 1] = position.getY(j); positions[j * 3 + 2] = position.getZ(j);
      }
      if (!positions.every(Number.isFinite)) throw new Error("Cache visual con coordenadas invalidas.");
      const count = geometry.index?.count ?? position.count;
      const indices = new Uint32Array(count);
      for (let j = 0; j < count; j++) indices[j] = geometry.index?.getX(j) ?? j;
      if (count % 3 || !indices.every((index) => index < position.count)) throw new Error("Cache visual con indices invalidos.");
      return { id: mesh.userData["framelogicVisualMeshId"] || mesh.name || `mesh-${i + 1}`, positions, indices };
    };
    const meshes = details.map(readMesh);
    for (const level of levels.slice(1)) level.forEach(readMesh);
    let transferred = false;
    return {
      meshes,
      products: value.products ?? [{ id: "root", geometryIds: meshes.map((mesh) => mesh.id), childIds: [] }],
      install(prototype) {
        const targets: THREE.Mesh[] = [];
        prototype.traverse((child) => { if (child instanceof THREE.Mesh) targets.push(child); });
        if (targets.length !== details.length) throw new Error("La cache no coincide con las mallas de la pieza.");
        let i = 0;
        prototype.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const work = levels[1]![i], low = levels[2]![i];
          if (work && low) registerPieceVisualLevels(child.geometry, work.geometry, low.geometry);
          i++;
        });
        // Detail was copied to domain buffers; materials are styled by FrameLogic.
        for (const root of roots) root.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          if (details.includes(child)) child.geometry.dispose();
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
        });
        transferred = true;
      },
      dispose() {
        if (transferred) return;
        for (const root of roots) root.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          child.geometry.dispose();
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
        });
        transferred = true;
      },
    };
  }
  catch (error) {
    for (const root of roots) root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
    });
    throw error;
  }
}
