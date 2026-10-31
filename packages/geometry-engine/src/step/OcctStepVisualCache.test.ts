import { describe, expect, it, vi } from "vitest";

const { kernel, visualImporter, snapshot } = vi.hoisted(() => {
  const snapshot = {
    id: "brep", modelScale: 1,
    vertices: [{ point: { x: 0, y: 0, z: 0 } }, { point: { x: 100, y: 100, z: 0 } }],
    edges: [{ id: "hole", circle: { center: { x: 25, y: 50, z: 0 }, normal: { x: 0, y: 0, z: 1 }, radius: 9 } }],
    cylinders: [], planes: [],
  };
  return {
    snapshot,
    visualImporter: vi.fn(),
    kernel: {
      loadStep: vi.fn(async () => snapshot),
      setModelScale: vi.fn((_id: string, scale: number) => { snapshot.modelScale = scale; }),
      getDocument: vi.fn(() => snapshot),
      disposeDocument: vi.fn(),
    },
  };
});
vi.mock("@sunbox/occt-import-js", () => ({ default: visualImporter }));
vi.mock("./OpenCascadeBrepKernel", () => ({ getOpenCascadeBrepKernel: () => kernel }));
import { OcctStepGeometryAdapter } from "./OcctStepGeometryAdapter";

describe("cached STEP visualization", () => {
  it("skips visual triangulation while loading exact geometry from the master", async () => {
    const source = new Uint8Array([83, 84, 69, 80]);
    const meshes = [{ id: "mesh", positions: new Float32Array([0, 0, 0, 100, 0, 0, 100, 100, 0]), indices: new Uint32Array([0, 1, 2]) }];
    const products = [{ id: "root", geometryIds: ["mesh"], childIds: [] }];
    const document = await new OcctStepGeometryAdapter().load(source, {
      sourceFileName: "piece.step", cachedVisuals: { meshes, products }, includeExactFeatures: true,
    });
    expect(visualImporter).not.toHaveBeenCalled();
    expect(kernel.loadStep).toHaveBeenCalledWith(source, "piece.step");
    expect(document.sourceData).toEqual(source);
    expect(document.sourceData).not.toBe(source);
    expect(document.brepDocumentId).toBe(snapshot.id);
    expect(document.meshes).toBe(meshes);
    expect(document.products).toBe(products);
    expect(document.features).toContainEqual(expect.objectContaining({
      kind: "CIRCLE", precision: "BREP_EXACT", center: { x: 25, y: 50, z: 0 }, radius: 9,
    }));
  });
});
