/**
 * Node-only OCCT smoke test. Run outside Vitest's Vite loader:
 * npm run test:clash:occt
 */
import assert from "node:assert/strict";
import { getOpenCascadeBrepKernel } from "../packages/geometry-engine/src/step/OpenCascadeBrepKernel";
import { OpenCascadeClashKernel } from "../packages/geometry-engine/src/step/OpenCascadeClashKernel";

type Owned = { delete(): void };
type Box = Owned & { Shape(): Owned };
type Runtime = {
  getOpenCascade(): Promise<{
    BRepPrimAPI_MakeBox_2: new (x: number, y: number, z: number) => Box;
  }>;
  documents: Map<string, { shape: Owned; modelScale: number }>;
};
const identity = (dx = 0, dy = 0, dz = 0) =>
  [1,0,0,0,0,1,0,0,0,0,1,0,dx,dy,dz,1];
async function main(): Promise<void> {
const runtime = getOpenCascadeBrepKernel() as unknown as Runtime;
const names = ["occt-boolean-test-a", "occt-boolean-test-b"];
const resources: Owned[] = [];
try {
  const oc = await runtime.getOpenCascade();
  for (const name of names) {
    const box = new oc.BRepPrimAPI_MakeBox_2(10, 10, 10);
    resources.push(box);
    const shape = box.Shape();
    resources.push(shape);
    runtime.documents.set(name, { shape, modelScale: 1 });
  }
  const kernel = new OpenCascadeClashKernel();
  for (const delta of [[10,0,0], [10,10,10], [20,0,0]]) {
    const result = await kernel.intersect(names[0], names[1],
      identity(), identity(delta[0], delta[1], delta[2]));
    assert.equal(result.kind, "NO_PENETRATION",
      `A face/edge contact or clearance was misclassified: ${JSON.stringify(result)}`);
  }
  const overlap = await kernel.intersect(names[0], names[1], identity(), identity(5, 0, 0));
  assert.equal(overlap.kind, "PENETRATION", JSON.stringify(overlap));
  if (overlap.kind === "PENETRATION") {
    assert.ok(Math.abs(overlap.volumeMm3 - 500) < 0.001, JSON.stringify(overlap));
    assert.ok(Math.abs(overlap.center.x - 7.5) < 0.001);
  }
  console.log("OK: OCCT Common excludes contacts, confirms 500 mm3 penetration.");
} finally {
  for (const name of names) runtime.documents.delete(name);
  for (const resource of resources.reverse()) resource.delete();
}

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
