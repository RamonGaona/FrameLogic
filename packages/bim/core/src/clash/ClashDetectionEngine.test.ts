import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { DesignModel } from "@framelogic/domain";
import type { DesignSceneController } from "../design/DesignSceneController";
import type { BooleanClashResult } from "@framelogic/geometry";

vi.mock("../step/StepEngineeringBridge", () => ({
  getStepBrepDocumentId: (definitionId: string) =>
    definitionId.startsWith("no-brep") ? undefined : "document:" + definitionId,
}));

import { ClashDetectionEngine, stableClashPair, clashIdForPair, type ClashVolumeIntersector } from "./ClashDetectionEngine";

interface PartInput {
  id: string;
  position: [number, number, number];
  geometry?: THREE.BufferGeometry;
}

const PENETRATION: BooleanClashResult = {
  kind: "PENETRATION", volumeMm3: 125, center: { x: 1, y: 2, z: 3 },
};
function fixture(parts: PartInput[], answer: BooleanClashResult = PENETRATION, nested = false) {
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
  const intersector: ClashVolumeIntersector = {
    intersect: vi.fn(async () => answer),
  };
  const engine = new ClashDetectionEngine(model, scene, intersector);
  const scan = (minVolumeMm3 = 0.01, selection?: string[], signal?: AbortSignal) =>
    engine.scan({ minVolumeMm3, selection, signal });
  return { scan, engine, instances, objects, intersector };
}

describe("ClashDetectionEngine (only certified positive solid volume)", () => {
  it("ignores pieces separated by space", async () => {
    const f = fixture([{ id: "a", position: [0, 0, 0] }, { id: "b", position: [30, 0, 0] }]);
    expect((await f.scan()).records).toHaveLength(0);
    expect(f.intersector.intersect).not.toHaveBeenCalled();
  });

  it("does NOT report a face-to-face contact, even if Common would return a face", async () => {
    const f = fixture([{ id: "a", position: [0, 0, 0] }, { id: "b", position: [10, 0, 0] }]);
    const result = await f.scan();
    expect(result.records).toHaveLength(0);
    expect(result.candidates).toBe(0);
    expect(f.intersector.intersect).not.toHaveBeenCalled();
  });

  it("ignores edge and point contact", async () => {
    const f = fixture([{ id: "a", position: [0, 0, 0] }, { id: "b", position: [10, 10, 10] }]);
    expect((await f.scan()).records).toHaveLength(0);
  });

  it("ignores clearance even when it is below a former millimetre tolerance", async () => {
    const f = fixture([{ id: "a", position: [0, 0, 0] }, { id: "b", position: [10.001, 0, 0] }]);
    expect((await f.scan()).records).toHaveLength(0);
  });

  it("rejects AABB-positive candidates if the exact booleana says no volume", async () => {
    const f = fixture([
      { id: "a", position: [0, 0, 0] }, { id: "b", position: [5, 5, 5] },
    ], { kind: "NO_PENETRATION" });
    const result = await f.scan();
    expect(result.candidates).toBe(1);
    expect(result.records).toHaveLength(0);
    expect(f.intersector.intersect).toHaveBeenCalledOnce();
  });

  it("reports an exact confirmed volume and centre of mass", async () => {
    const f = fixture([{ id: "a", position: [0, 0, 0] }, { id: "b", position: [5, 5, 5] }]);
    const result = await f.scan();
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      kind: "HARD", confirmed: true, volumeMm3: 125, approximateLocation: false,
    });
    expect(result.records[0]!.location.toArray()).toEqual([1, 2, 3]);
    expect(f.intersector.intersect).toHaveBeenCalledWith(
      "document:a", "document:b", expect.any(Array), expect.any(Array),
    );
  });

  it("ignores positive volumes equal to or below the user-selected minimum", async () => {
    const f = fixture([{ id: "a", position: [0, 0, 0] }, { id: "b", position: [5, 5, 5] }]);
    expect((await f.scan(125)).records).toHaveLength(0);
    expect((await f.scan(126)).records).toHaveLength(0);
    expect((await f.scan(124.999)).records).toHaveLength(1);
  });

  it("never lists failed or missing B-rep as clashes", async () => {
    const missing = fixture([
      { id: "no-brep-a", position: [0, 0, 0] }, { id: "b", position: [5, 5, 5] },
    ]);
    expect((await missing.scan()).uncheckedPairs).toBe(1);
    expect((await missing.scan()).records).toHaveLength(0);
    expect(missing.intersector.intersect).not.toHaveBeenCalled();
    const failed = fixture([
      { id: "a", position: [0, 0, 0] }, { id: "b", position: [5, 5, 5] },
    ], { kind: "UNAVAILABLE", reason: "Invalid STEP" });
    expect((await failed.scan()).records).toHaveLength(0);
    expect((await failed.scan()).uncheckedPairs).toBe(1);
  });

  it("passes rotated world transforms without modifying original pieces", async () => {
    const f = fixture([{ id: "a", position: [0, 0, 0] }, { id: "b", position: [3, 2, 1] }]);
    f.objects.get("b")!.rotation.set(0, Math.PI / 6, 0);
    f.objects.get("b")!.updateMatrixWorld(true);
    expect((await f.scan()).records).toHaveLength(1);
    expect(f.objects.get("a")!.position.x).toBe(0);
    expect(f.intersector.intersect).toHaveBeenCalledOnce();
  });

  it("retains nested assembly paths and stable pair IDs", async () => {
    const f = fixture([{ id: "a", position: [0, 0, 0] }, { id: "b", position: [5, 5, 5] }],
      PENETRATION, true);
    const clash = (await f.scan()).records[0]!;
    expect(clash.aAssembly).toBe("Padre / Hijo");
    expect(stableClashPair("a", "b")).toBe(stableClashPair("b", "a"));
    expect(clashIdForPair(stableClashPair("a", "b"))).toBe(clash.id);
  });

  it("filters selected piece IDs and invalidates after a document change", async () => {
    const f = fixture([
      { id: "a", position: [0, 0, 0] }, { id: "b", position: [5, 5, 5] },
      { id: "c", position: [100, 0, 0] },
    ]);
    expect((await f.scan(0.01, ["a", "c"])).records).toHaveLength(0);
    const signature = f.engine.signature();
    f.instances[0]!.transform.position.x = 100;
    expect(f.engine.signature()).not.toBe(signature);
  });

  it("cancels safely without any material mutation", async () => {
    const f = fixture([{ id: "a", position: [0, 0, 0] }, { id: "b", position: [5, 5, 5] }]);
    const controller = new AbortController();
    controller.abort();
    await expect(f.scan(0.01, undefined, controller.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(f.objects.get("a")!.material).toBeDefined();
  });
});
