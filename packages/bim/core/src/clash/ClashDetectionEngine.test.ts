import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { DesignModel } from "@framelogic/domain";
import type { DesignSceneController } from "../design/DesignSceneController";
import { ClashDetectionEngine, stableClashPair, clashIdForPair } from "./ClashDetectionEngine";

interface PartInput {
  id: string;
  position: [number, number, number];
  geometry?: THREE.BufferGeometry;
}
function fixture(parts: PartInput[], nested = false) {
  const objects = new Map<string, THREE.Mesh>();
  const instances = parts.map(p => ({
    id: p.id, definitionId: p.id, name: p.id, layerId: "geometry",
    transform: { position: { x: p.position[0], y: p.position[1], z: p.position[2] },
      rotation: { x: 0, y: 0, z: 0 } },
  }));
  for (const p of parts) {
    const mesh = new THREE.Mesh(p.geometry || new THREE.BoxGeometry(10, 10, 10));
    mesh.position.set(...p.position);
    mesh.updateMatrixWorld(true);
    objects.set(p.id, mesh);
  }
  const assemblies = nested ? [
    { id: "outer", name: "Padre", pieceInstanceIds: [], parentAssemblyId: undefined },
    { id: "inner", name: "Hijo", pieceInstanceIds: [parts[0]!.id], parentAssemblyId: "outer" },
  ] : [];
  const model = {
    pieceInstances: { getAll: () => instances },
    pieceDefinitions: { get: (id: string) =>
      ({ id, code: id, name: id, geometryAssetId: id }) },
    assemblies: { getAll: () => assemblies,
      get: (id: string) => assemblies.find(a => a.id === id) },
  } as unknown as DesignModel;
  const scene = {
    getInstanceObject: (id: string) => objects.get(id),
    getInstanceWorldBounds: (id: string) => {
      const object = objects.get(id);
      return object ? new THREE.Box3().setFromObject(object) : null;
    },
  } as unknown as DesignSceneController;
  const engine = new ClashDetectionEngine(model, scene);
  const scan = (toleranceMm = 1, selection?: string[], signal?: AbortSignal) =>
    engine.scan({ toleranceMm, selection, signal, includeContact: true, includeClearance: true });
  return { scan, engine, instances, objects };
}

describe("ClashDetectionEngine", () => {
  it("does not invent clashes for separated solids", async () => {
    const result = await fixture([
      { id: "a", position: [0, 0, 0] },
      { id: "b", position: [30, 0, 0] },
    ]).scan();
    expect(result.records).toHaveLength(0);
    expect(result.candidates).toBe(0);
  });

  it("confirms a real overlap of two watertight cuboids", async () => {
    const result = await fixture([
      { id: "a", position: [0, 0, 0] },
      { id: "b", position: [5, 5, 5] },
    ]).scan();
    expect(result.records.filter(r => r.kind === "HARD" && r.confirmed)).toHaveLength(1);
    expect(Number.isFinite(result.records[0]!.location.x)).toBe(true);
  });

  it("never calls a touching face a volumetric overlap", async () => {
    const result = await fixture([
      { id: "a", position: [0, 0, 0] },
      { id: "b", position: [10, 0, 0] },
    ]).scan();
    expect(result.records.some(r => r.kind === "HARD")).toBe(false);
    expect(result.records.some(r => r.kind === "CONTACT" && !r.confirmed)).toBe(true);
  });

  it("identifies sub-tolerance clearance as an unconfirmed estimate", async () => {
    const result = await fixture([
      { id: "a", position: [0, 0, 0] },
      { id: "b", position: [10.5, 0, 0] },
    ]).scan(1);
    expect(result.records[0]?.kind).toBe("CLEARANCE");
    expect(result.records[0]?.confirmed).toBe(false);
    expect(result.records[0]?.distanceMm).toBeCloseTo(0.5);
  });

  it("does not convert intersecting bounding boxes to hard clashes", async () => {
    const sphere = () => new THREE.SphereGeometry(1, 12, 8);
    const result = await fixture([
      { id: "a", position: [0, 0, 0], geometry: sphere() },
      { id: "b", position: [1.5, 1.5, 0], geometry: sphere() },
    ]).scan(0);
    expect(result.candidates).toBe(1);
    expect(result.records.some(r => r.kind === "HARD")).toBe(false);
  });

  it("detects rotated mesh overlap without moving either instance", async () => {
    const f = fixture([
      { id: "a", position: [0, 0, 0] },
      { id: "b", position: [3, 2, 1] },
    ]);
    f.objects.get("b")!.rotation.set(0, Math.PI / 6, 0);
    f.objects.get("b")!.updateMatrixWorld(true);
    const result = await f.scan();
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.kind).toBe("HARD");
    expect(f.objects.get("a")!.position.x).toBe(0);
  });

  it("retains parent/subassembly path and unique pair IDs", async () => {
    const f = fixture([
      { id: "a", position: [0, 0, 0] },
      { id: "b", position: [5, 5, 5] },
    ], true);
    const result = await f.scan();
    expect(result.records[0]?.aAssembly).toBe("Padre / Hijo");
    expect(stableClashPair("a", "b")).toBe(stableClashPair("b", "a"));
    expect(clashIdForPair(stableClashPair("a", "b"))).toBe(result.records[0]?.id);
  });

  it("filters by the selected instance IDs and invalidates after model edits", async () => {
    const f = fixture([
      { id: "a", position: [0, 0, 0] },
      { id: "b", position: [5, 5, 5] },
      { id: "c", position: [100, 0, 0] },
    ]);
    const result = await f.scan(1, ["a", "c"]);
    expect(result.records).toHaveLength(0);
    const signature = f.engine.signature();
    f.instances[0]!.transform.position.x = 100;
    expect(f.engine.signature()).not.toBe(signature);
  });

  it("cancels before modifying the scene", async () => {
    const f = fixture([
      { id: "a", position: [0, 0, 0] },
      { id: "b", position: [5, 5, 5] },
    ]);
    const controller = new AbortController();
    controller.abort();
    await expect(f.scan(1, undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.objects.get("a")!.material).toBeDefined();
  });
});
