import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { getOpenCascadeBrepKernel } from "./OpenCascadeBrepKernel";
import { OpenCascadeClashKernel } from "./OpenCascadeClashKernel";

interface Shape { delete(): void }
interface BoxMaker { Shape(): Shape; delete(): void }
interface OcctPrimitives {
  BRepPrimAPI_MakeBox_2: new (x: number, y: number, z: number) => BoxMaker;
}
interface KernelRuntime {
  getOpenCascade(): Promise<OcctPrimitives>;
  documents: Map<string, { shape: Shape; modelScale: number }>;
}
function matrix(tx = 0, ty = 0, tz = 0): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, tx, ty, tz, 1];
}

/** Exercises the real WASM boolean, not an injected mock result. */
describe("OpenCascadeClashKernel · boolean Common with real solids", () => {
  const runtime = getOpenCascadeBrepKernel() as unknown as KernelRuntime;
  const owned: Array<{ delete(): void }> = [];
  const ids = ["clash-test-a", "clash-test-b"];
  beforeAll(async () => {
    const oc = await runtime.getOpenCascade();
    for (const id of ids) {
      const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10);
      const shape = box.Shape();
      owned.push(shape, box);
      runtime.documents.set(id, { shape, modelScale: 1 });
    }
  }, 120000);

  afterAll(() => {
    for (const id of ids) runtime.documents.delete(id);
    for (const obj of owned.reverse()) obj.delete();
  });

  it("excludes face contact at exactly 10mm without penetration", async () => {
    const result = await new OpenCascadeClashKernel()
      .intersect(ids[0]!, ids[1]!, matrix(), matrix(10, 0, 0));
    expect(result).toEqual({ kind: "NO_PENETRATION" });
  }, 120000);

  it("excludes edge/point contact and separated solids", async () => {
    const kernel = new OpenCascadeClashKernel();
    expect((await kernel.intersect(ids[0]!, ids[1]!, matrix(), matrix(10, 10, 10))).kind)
      .toBe("NO_PENETRATION");
    expect((await kernel.intersect(ids[0]!, ids[1]!, matrix(), matrix(20, 0, 0))).kind)
      .toBe("NO_PENETRATION");
  }, 120000);

  it("reports 500mm³ for a 5mm cuboid overlap, with precise centre of mass", async () => {
    const result = await new OpenCascadeClashKernel()
      .intersect(ids[0]!, ids[1]!, matrix(), matrix(5, 0, 0));
    expect(result.kind).toBe("PENETRATION");
    if (result.kind !== "PENETRATION") return;
    expect(result.volumeMm3).toBeCloseTo(500, 3);
    expect(result.center.x).toBeCloseTo(7.5, 3);
    expect(result.center.y).toBeCloseTo(5, 3);
    expect(result.center.z).toBeCloseTo(5, 3);
  }, 120000);

  it("reports missing exact geometry as UNAVAILABLE, never as a clash", async () => {
    expect((await new OpenCascadeClashKernel().intersect(
      undefined, ids[1], matrix(), matrix(),
    )).kind).toBe("UNAVAILABLE");
  });
});
