import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DesignModel } from "@framelogic/domain";
import {
  CAD_TEXT_ANCHOR_PREFIX,
  CadReferenceTextSceneController,
  type CadReferenceTextAnnotation,
} from "./CadReferenceTextSceneController";

afterEach(() => vi.unstubAllGlobals());

function withCanvas(): void {
  vi.stubGlobal("document", {
    createElement: () => {
      const context = {
        font: "",
        fillStyle: "",
        textBaseline: "",
        measureText: (value: string) => ({ width: value.length * 42 }),
        clearRect: vi.fn(), fillText: vi.fn(),
      };
      return { width: 0, height: 0, getContext: () => context };
    },
  });
}

function label(
  model: DesignModel, layerId: string,
  text: string, x: number,
): CadReferenceTextAnnotation {
  const id = crypto.randomUUID();
  const originPointId = `${CAD_TEXT_ANCHOR_PREFIX}${id}:origin`;
  const axisXPointId = `${CAD_TEXT_ANCHOR_PREFIX}${id}:x`;
  const axisYPointId = `${CAD_TEXT_ANCHOR_PREFIX}${id}:y`;
  model.cadPoints.register({
    id: originPointId, layerId, position: { x, y: 20, z: 0 },
  });
  model.cadPoints.register({
    id: axisXPointId, layerId, position: { x: x + 120, y: 20, z: 0 },
  });
  model.cadPoints.register({
    id: axisYPointId, layerId, position: { x, y: 140, z: 0 },
  });
  return { id, text, layerId, originPointId, axisXPointId, axisYPointId,
    horizontalAlign: "center", verticalAlign: "baseline", kind: "ATTRIB" };
}

describe("Instanced DWG text labels", () => {
  it("renders identical tube labels in ONE draw call with original model anchors", () => {
    withCanvas();
    const model = new DesignModel();
    const layer = model.layers.create({
      name: "CAD TRUSS · Label", color: "#ff0000",
      visible: true, locked: false, snapEnabled: true,
    });
    const texts = [
      label(model, layer.id, "4S 3000", 1000),
      label(model, layer.id, "4S 3000", 5000),
      label(model, layer.id, "4S 3000", 9000),
    ];
    const scene = new THREE.Scene();
    const labels = new CadReferenceTextSceneController(scene, model);
    labels.addAnnotations(texts);
    labels.sync();
    expect(labels.getBatchCount()).toBe(1);
    expect(labels.getRenderedLabelCount()).toBe(3);
    const batch = scene.children[0] as THREE.InstancedMesh;
    expect(batch.count).toBe(3);
    expect((batch.material as THREE.MeshBasicMaterial).color.getHexString())
      .toBe("ff0000");
    const matrix = new THREE.Matrix4();
    batch.getMatrixAt(1, matrix);
    expect(matrix.elements[12]).toBeLessThan(5000); // centre-anchored text
    expect(matrix.elements[13]).toBe(20);
    // Moving its CAD anchors (existing DWG transform) moves the label too.
    const moved = texts[1]!;
    for (const id of [moved.originPointId, moved.axisXPointId, moved.axisYPointId]) {
      const point = model.cadPoints.get(id)!.position;
      model.cadPoints.updatePosition(id, { x: point.x + 3000, y: point.y, z: point.z });
    }
    labels.sync();
    (scene.children[0] as THREE.InstancedMesh).getMatrixAt(1, matrix);
    expect(matrix.elements[12]).toBeGreaterThan(7000);
    const saved = labels.getAnnotations();
    labels.clear();
    expect(labels.getRenderedLabelCount()).toBe(0);
    labels.setAnnotations(saved);
    expect(labels.getRenderedLabelCount()).toBe(3);
    labels.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("suppresses hidden DWG layers and missing text anchors safely", () => {
    withCanvas();
    const model = new DesignModel();
    const layer = model.layers.create({
      name: "CAD PIPE · TEXT", visible: true, locked: false, color: "#00ff00",
    });
    const entry = label(model, layer.id, "P6 3000", 0);
    const scene = new THREE.Scene();
    const labels = new CadReferenceTextSceneController(scene, model);
    labels.addAnnotations([entry]);
    labels.sync();
    expect(labels.getRenderedLabelCount()).toBe(1);
    model.layers.update(layer.id, { visible: false });
    labels.sync();
    expect(labels.getRenderedLabelCount()).toBe(0);
    model.layers.update(layer.id, { visible: true });
    model.cadPoints.remove(entry.originPointId);
    labels.sync();
    expect(labels.getRenderedLabelCount()).toBe(0);
    labels.dispose();
  });
});
