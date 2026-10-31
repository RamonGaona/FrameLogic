import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getPieceDetailGeometry, getPieceVisualGeometries, setPieceVisualLevel } from "./PieceVisualGeometry";

describe("piece visual geometry", () => {
  it("reduces dense meshes, shares representations and restores original detail", () => {
    const detail = new THREE.SphereGeometry(100, 160, 120);
    detail.deleteAttribute("uv");
    const first = new THREE.Mesh(detail);
    const second = new THREE.Mesh(detail);
    setPieceVisualLevel(first, "LOW");
    expect(first.geometry.index!.count).toBeLessThan(detail.index!.count);
    expect(getPieceDetailGeometry(first)).toBe(detail);
    setPieceVisualLevel(second, "LOW");
    expect(second.geometry).toBe(first.geometry);
    setPieceVisualLevel(first, "DETAIL");
    expect(first.geometry).toBe(detail);
    expect(getPieceVisualGeometries(detail)).toHaveLength(3);
  });

  it("preserves transformed ray hits, identity and metadata at every level", () => {
    const detail = new THREE.SphereGeometry(100, 160, 120);
    detail.deleteAttribute("uv");
    const mesh = new THREE.Mesh(detail, new THREE.MeshBasicMaterial());
    mesh.position.set(17, 23, 31);
    mesh.rotation.set(0.2, 0.4, 0.1);
    mesh.userData["references"] = { center: [0, 0, 0], axis: [0, 0, 1] };
    mesh.updateMatrixWorld(true);
    const before = JSON.stringify(mesh.userData);
    const ray = new THREE.Raycaster(new THREE.Vector3(17, 23, 400), new THREE.Vector3(0, 0, -1));
    const expected = ray.intersectObject(mesh)[0]!.point;
    for (const level of ["WORK", "LOW", "DETAIL"] as const) {
      setPieceVisualLevel(mesh, level);
      const displayed = mesh.geometry;
      expect(ray.intersectObject(mesh)[0]!.point.distanceTo(expected)).toBeLessThan(1e-10);
      expect(mesh.geometry).toBe(displayed);
      expect(JSON.stringify(mesh.userData)).toBe(before);
      expect(mesh.position.toArray()).toEqual([17, 23, 31]);
    }
  });

  it("keeps small or unsupported geometry intact", () => {
    const box = new THREE.BoxGeometry();
    const mesh = new THREE.Mesh(box);
    setPieceVisualLevel(mesh, "LOW");
    expect(mesh.geometry).toBe(box);
    const textured = new THREE.SphereGeometry(100, 160, 120);
    const textureMesh = new THREE.Mesh(textured);
    setPieceVisualLevel(textureMesh, "LOW");
    expect(textureMesh.geometry).toBe(textured);
  });
});
