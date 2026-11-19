import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { registerPieceVisualLevels } from "../design/PieceVisualGeometry";
import { createOffsetSolidMaterials, createVisualEdgeGeometry } from "./ModelRenderEdgeStyle";

describe("FLPIECE solid plus edges", () => {
  it("derives editing outlines from detailed geometry without replacing WORK", () => {
    const detail = new THREE.BoxGeometry(25, 15, 10);
    const work = new THREE.BufferGeometry();
    work.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    registerPieceVisualLevels(detail, work, work);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(work, material);
    const simpleEdges = createVisualEdgeGeometry(mesh, false);
    const detailedEdges = createVisualEdgeGeometry(mesh, true);
    expect(simpleEdges.getAttribute("position").count).toBe(0);
    expect(detailedEdges.getAttribute("position").count).toBeGreaterThan(0);
    expect(mesh.geometry).toBe(work);
    simpleEdges.dispose();
    detailedEdges.dispose();
    material.dispose();
    detail.dispose();
    work.dispose();
  });

  it("clones filled materials with depth bias and leaves original untouched", () => {
    const original = new THREE.MeshLambertMaterial({ color: 0xd6a6ad, depthTest: true });
    const copies = createOffsetSolidMaterials(original);
    expect(copies).toHaveLength(1);
    expect(copies[0]).not.toBe(original);
    expect(copies[0]?.polygonOffset).toBe(true);
    expect(copies[0]?.polygonOffsetFactor).toBeGreaterThan(0);
    expect(copies[0]?.depthTest).toBe(true);
    expect(original.polygonOffset).toBe(false);
    copies.forEach(material => material.dispose());
    original.dispose();
  });


});
