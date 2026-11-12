import * as THREE from "three";
import type { DesignModel } from "@framelogic/domain";

/** Three normal CAD points provide an affine frame (origin, X, Y) for each
 * label; MOVE, ROTATE, COPYBASE and undo already transform these points. */
export const CAD_TEXT_ANCHOR_PREFIX = "fl-cad-text-anchor:";
export function isCadTextAnchorId(id: string): boolean {
  return id.startsWith(CAD_TEXT_ANCHOR_PREFIX);
}

export interface CadReferenceTextAnnotation {
  readonly id: string;
  readonly text: string;
  readonly layerId: string;
  readonly originPointId: string;
  readonly axisXPointId: string;
  readonly axisYPointId: string;
  readonly horizontalAlign: "left" | "center" | "right";
  readonly verticalAlign: "baseline" | "middle" | "top";
  readonly kind: "TEXT" | "MTEXT" | "ATTRIB" | "ATTDEF";
}

type CachedTexture = {
  readonly texture: THREE.CanvasTexture;
  readonly ratio: number;
  readonly lines: number;
};

type TextBatch = {
  readonly object: THREE.InstancedMesh;
  readonly entries: readonly CadReferenceTextAnnotation[];
};

const MAX_CANVAS_WIDTH = 3072;
const FONT_PX = 70;
const LINE_PX = 90;

function makeTexture(value: string): CachedTexture {
  const lines = value.split("\n").slice(0, 32);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("El navegador no soporta canvas para textos DWG.");
  ctx.font = `${FONT_PX}px Arial, sans-serif`;
  const width = Math.min(MAX_CANVAS_WIDTH, Math.max(24,
    Math.ceil(Math.max(...lines.map(t => ctx.measureText(t).width))) + 8));
  canvas.width = width;
  canvas.height = Math.max(LINE_PX, lines.length * LINE_PX);
  const paint = canvas.getContext("2d");
  if (!paint) throw new Error("El navegador no soporta canvas para textos DWG.");
  paint.clearRect(0, 0, canvas.width, canvas.height);
  paint.font = `${FONT_PX}px Arial, sans-serif`;
  paint.fillStyle = "#ffffff";
  paint.textBaseline = "alphabetic";
  for (let i = 0; i < lines.length; i++) {
    paint.fillText(lines[i]!, 2, (i + 1) * LINE_PX - 13, width - 4);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return { texture, ratio: width / FONT_PX, lines: lines.length };
}

export class CadReferenceTextSceneController {
  private readonly scene: THREE.Scene;
  private readonly model: DesignModel;
  private readonly annotations = new Map<string, CadReferenceTextAnnotation>();
  private readonly textures = new Map<string, CachedTexture>();
  private readonly batches = new Map<string, TextBatch>();
  private readonly geometry = new THREE.PlaneGeometry(1, 1)
    .translate(0.5, 0.5, 0);
  private readonly matrix = new THREE.Matrix4();

  constructor(scene: THREE.Scene, model: DesignModel) {
    this.scene = scene;
    this.model = model;
  }

  getAnnotations(): CadReferenceTextAnnotation[] {
    return [...this.annotations.values()].map(x => ({ ...x }));
  }

  /** A new import only ADDS labels, it never removes another DWG reference. */
  addAnnotations(entries: readonly CadReferenceTextAnnotation[]): void {
    for (const entry of entries) this.annotations.set(entry.id, { ...entry });
  }

  setAnnotations(entries: readonly CadReferenceTextAnnotation[]): void {
    this.annotations.clear();
    this.addAnnotations(entries);
    this.sync();
  }

  clear(): void {
    this.annotations.clear();
    this.clearBatches();
  }

  /**
   * Rebuild only a few instanced batches for repeated labels. Every instance
   * uses the current CAD anchor positions (including block translations and
   * rotations), so no label becomes detached from its tube.
   */
  sync(): void {
    const grouped = new Map<string, CadReferenceTextAnnotation[]>();
    for (const entry of this.annotations.values()) {
      const point = this.model.cadPoints.get(entry.originPointId);
      const x = this.model.cadPoints.get(entry.axisXPointId);
      const y = this.model.cadPoints.get(entry.axisYPointId);
      const layer = this.model.layers.get(entry.layerId);
      if (!point || !x || !y || !layer || !layer.visible) continue;
      const key = JSON.stringify([entry.text, entry.layerId]);
      let list = grouped.get(key);
      if (!list) { list = []; grouped.set(key, list); }
      list.push(entry);
    }
    // Reuse texture atlases by the exact string (e.g. "4S 3000" hundreds
    // of times); InstancedMesh makes each repeated label a single draw call.
    this.clearBatches();
    for (const [key, entries] of grouped) {
      const first = entries[0]!;
      let tex = this.textures.get(first.text);
      if (!tex) {
        tex = makeTexture(first.text);
        this.textures.set(first.text, tex);
      }
      const layer = this.model.layers.get(first.layerId);
      const material = new THREE.MeshBasicMaterial({
        map: tex.texture,
        color: layer?.color ?? "#ffffff",
        transparent: true, alphaTest: 0.05,
        depthWrite: false, depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      const batch = new THREE.InstancedMesh(this.geometry, material, entries.length);
      batch.name = `CadReferenceText:${first.layerId}`;
      batch.userData = {
        frameLogic: { entityType: "CadReferenceTextBatch", layerId: first.layerId },
      };
      batch.renderOrder = 15;
      batch.frustumCulled = false; // per-label positions may span entire DWG
      const origin = new THREE.Vector3();
      const xAxis = new THREE.Vector3();
      const yAxis = new THREE.Vector3();
      const normal = new THREE.Vector3();
      const translation = new THREE.Vector3();
      for (let index = 0; index < entries.length; index++) {
        const entry = entries[index]!;
        const p = this.model.cadPoints.get(entry.originPointId)!.position;
        const x = this.model.cadPoints.get(entry.axisXPointId)!.position;
        const y = this.model.cadPoints.get(entry.axisYPointId)!.position;
        origin.set(p.x, p.y, p.z);
        xAxis.set(x.x - p.x, x.y - p.y, x.z - p.z);
        yAxis.set(y.x - p.x, y.y - p.y, y.z - p.z);
        normal.crossVectors(xAxis, yAxis).normalize();
        if (normal.lengthSq() < 1e-12) normal.set(0, 0, 1);
        const w = tex.ratio;
        const h = tex.lines;
        const hOff = entry.horizontalAlign === "center" ? -0.5
          : entry.horizontalAlign === "right" ? -1 : 0;
        const vOff = entry.verticalAlign === "top" ? -1
          : entry.verticalAlign === "middle" ? -0.5 : 0;
        translation.copy(origin)
          .addScaledVector(xAxis, w * hOff)
          .addScaledVector(yAxis, h * vOff);
        const matrixElements = this.matrix.elements;
        matrixElements[0] = xAxis.x * w;
        matrixElements[1] = xAxis.y * w;
        matrixElements[2] = xAxis.z * w;
        matrixElements[3] = 0;
        matrixElements[4] = yAxis.x * h;
        matrixElements[5] = yAxis.y * h;
        matrixElements[6] = yAxis.z * h;
        matrixElements[7] = 0;
        matrixElements[8] = normal.x;
        matrixElements[9] = normal.y;
        matrixElements[10] = normal.z;
        matrixElements[11] = 0;
        matrixElements[12] = translation.x;
        matrixElements[13] = translation.y;
        matrixElements[14] = translation.z;
        matrixElements[15] = 1;
        batch.setMatrixAt(index, this.matrix);
      }
      batch.instanceMatrix.needsUpdate = true;
      this.scene.add(batch);
      this.batches.set(key, { object: batch, entries });
    }
  }

  getBatchCount(): number { return this.batches.size; }
  getRenderedLabelCount(): number {
    return [...this.batches.values()].reduce((sum, batch) => sum + batch.entries.length, 0);
  }

  private clearBatches(): void {
    for (const batch of this.batches.values()) {
      this.scene.remove(batch.object);
      (batch.object.material as THREE.Material).dispose();
    }
    this.batches.clear();
  }

  dispose(): void {
    this.clear();
    for (const tex of this.textures.values()) tex.texture.dispose();
    this.textures.clear();
    this.geometry.dispose();
  }
}
