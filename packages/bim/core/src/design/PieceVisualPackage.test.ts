import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createPieceVisualPackage, loadPieceVisualPackage } from "./PieceVisualPackage";
import { getPieceDetailGeometry, setPieceVisualLevel } from "./PieceVisualGeometry";

// GLTFExporter uses the browser FileReader API to assemble its binary output.
class TestFileReader {
  result: string | ArrayBuffer | null = null;
  onloadend?: () => void;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); });
  }
  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${btoa(Array.from(new Uint8Array(buffer), (byte) => String.fromCharCode(byte)).join(""))}`;
      this.onloadend?.();
    });
  }
}

beforeAll(() => vi.stubGlobal("FileReader", TestFileReader));
afterAll(() => vi.unstubAllGlobals());

describe("piece GLB cache", () => {
  it("round trips three visual levels in mm and binds them to the STEP master", async () => {
    const master = new Uint8Array([83, 84, 69, 80]);
    const geometry = new THREE.SphereGeometry(100, 320, 240);
    geometry.deleteAttribute("uv");
    const prototype = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
    mesh.name = "part:with.original[id]";
    prototype.add(mesh);
    const cached = await createPieceVisualPackage(prototype, master);
    expect(mesh.geometry).toBe(geometry);
    expect(cached.work.length).toBeLessThan(cached.detail.length);
    expect(cached.low.length).toBeLessThan(cached.work.length);
    await expect(loadPieceVisualPackage(cached, new Uint8Array([0]))).rejects.toThrow("maestro");
    const loaded = await loadPieceVisualPackage(cached, master);
    expect(loaded.meshes[0]!.id).toBe(mesh.name);
    const position = loaded.meshes[0]!.positions;
    expect(position.reduce((maximum, value) => Math.max(maximum, value), -Infinity)).toBeCloseTo(100);
    const reconstructed = new THREE.Mesh(geometry.clone());
    loaded.install(reconstructed);
    setPieceVisualLevel(reconstructed, "LOW");
    expect(reconstructed.geometry.index!.count).toBeLessThan(geometry.index!.count);
    expect(getPieceDetailGeometry(reconstructed).getAttribute("position").count).toBe(geometry.getAttribute("position").count);
    loaded.dispose(); // ownership moved to the prototype; this is safe.
  });

  it("rejects corrupt GLB data so callers can fall back to the master", async () => {
    const master = new Uint8Array([1]);
    const cached = await createPieceVisualPackage(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()), master);
    await expect(loadPieceVisualPackage({ ...cached, work: "broken" }, master)).rejects.toThrow();
  });
});
