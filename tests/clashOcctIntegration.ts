/**
 * Node-only OCCT smoke test. Run outside Vitest's Vite loader:
 * npm run test:clash:occt
 */
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { getOpenCascadeBrepKernel } from "../packages/geometry-engine/src/step/OpenCascadeBrepKernel";
import { OpenCascadeClashKernel } from "../packages/geometry-engine/src/step/OpenCascadeClashKernel";
import { OpenCascadeDrawingKernel } from "../packages/geometry-engine/src/step/OpenCascadeDrawingKernel";

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
  // The package's index imports .wasm as an ESM module (Vite-only). In Node,
  // load the Emscripten entry directly, as the web app's Vite alias already does.
  // The distributed Emscripten ESM uses CommonJS Node globals internally.
  const nativeFile = resolve(process.cwd(), "node_modules/opencascade.js/dist/opencascade.full.js");
  Object.assign(globalThis, {
    __dirname: dirname(nativeFile), __filename: nativeFile,
    require: createRequire(nativeFile),
  });
  const entry = await import("opencascade.js/dist/opencascade.full.js");
  const initOc = entry.default;
  const wasmPath = resolve(process.cwd(), "node_modules/opencascade.js/dist/opencascade.full.wasm");
  const oc = await initOc({ locateFile: (path: string) => path.endsWith(".wasm") ? wasmPath : path });
  runtime.getOpenCascade = async () => oc;
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
  // Two independent boxes with identical XY silhouettes at different depths.
  // Both must be submitted to a single HLRBRep_Algo; individual HLRs cannot
  // hide the back box behind the front one.
  const drawing = new OpenCascadeDrawingKernel();
  const direction = { x: 0, y: 0, z: -1 };
  const up = { x: 0, y: 1, z: 0 };
  const single = await drawing.hiddenLines(names[0]!, direction, up);
  assert.equal(single.precision, "BREP_EXACT", single.reason);
  assert.ok(single.visible.length > 0, "Single STEP box must have visible lines.");
  const assembly = await drawing.hiddenLinesAssembly([
    { instanceId: "back", documentId: names[0]!, worldMatrix: identity() },
    { instanceId: "front", documentId: names[1]!, worldMatrix: identity(0, 0, 20) },
  ], direction, up);
  assert.equal(assembly.precision, "BREP_EXACT", assembly.reason);
  assert.ok(assembly.visible.length > 0, "Assembly HLR must have visible lines.");
  assert.ok(assembly.hidden.length > 0, "Rear STEP box must have hidden lines.");
  assert.ok(assembly.visible.length < single.visible.length * 1.5,
    "The back box must not duplicate all visible edges of the front box.");

  const distorted = identity();
  distorted[0] = 2;
  const rejected = await drawing.hiddenLinesAssembly([
    { instanceId: "back", documentId: names[0]!, worldMatrix: identity() },
    { instanceId: "front", documentId: names[1]!, worldMatrix: distorted },
  ], direction, up);
  assert.equal(rejected.precision, "FALLBACK");
  assert.match(rejected.reason ?? "", /Escala no uniforme|deformación/);
  console.log("OK: OCCT assembly HLR hides the rear part and rejects distorted placements.");
} finally {
  for (const name of names) runtime.documents.delete(name);
  for (const resource of resources.reverse()) resource.delete();
}

}
void main().catch(error => { console.error(error); process.exitCode = 1; });
