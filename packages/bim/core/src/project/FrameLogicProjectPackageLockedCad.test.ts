import { describe, expect, it, vi } from "vitest";
import { DesignModel } from "@framelogic/domain";
import { FrameLogicProjectPackageController, type FrameLogicProjectPackage } from "./FrameLogicProjectPackageController";

function fixture() {
  const saved = new DesignModel();
  const a = saved.layers.create({
    name: "CAD cad1 · 0", locked: false, visible: true, snapEnabled: true,
  });
  const b = saved.layers.create({
    name: "CAD cad2 · 0", locked: false, visible: true, snapEnabled: true,
  });
  const lineA = saved.registerCadLine({
    layerId: a.id, start: { x: 1, y: 2, z: 3 }, end: { x: 10, y: 2, z: 3 },
  });
  const lineB = saved.registerCadLine({
    layerId: b.id, start: { x: 0, y: 0, z: 0 }, end: { x: 0, y: 20000, z: 0 },
  });
  saved.layers.update(a.id, { locked: true });
  saved.layers.update(b.id, { locked: true });
  const serialized = {
    schema: "FRAMELOGIC_PROJECT",
    version: 1,
    createdAt: "2026-11-12T01:55:06.488Z",
    name: "FrameLogic_ProjectCAD",
    activeLayerId: saved.layers.activeLayerId,
    layers: saved.layers.getAll(),
    pieceDefinitions: [], pieceInstances: [], assemblies: [],
    cadPoints: [], cadLines: [lineA, lineB],
    geometrySources: [], referenceSources: [],
    engineering: { schema: "FrameLogic", version: 1, pieces: [], assemblies: [] },
    documentation: { version: 1, sections: [], documents: [], sheets: [] },
    professionalDrawing: { version: 1 },
  } as unknown as FrameLogicProjectPackage;
  const loaded = new DesignModel();
  type Options = ConstructorParameters<typeof FrameLogicProjectPackageController>[0];
  const options = {
    designModel: loaded,
    cancelActiveCadCommand: vi.fn(),
    clearReferenceModels: vi.fn(),
    designScene: { clearInstances: vi.fn(), clearAssetPrototypes: vi.fn() },
    cadPointScene: { sync: vi.fn() },
    cadLineScene: { sync: vi.fn() },
    restoreEngineeringSnapshot: vi.fn(),
    restoreDocumentationSnapshot: vi.fn(),
    restoreProfessionalSnapshot: vi.fn(),
    clearGeometryQueryCache: vi.fn(),
    onProjectRestored: vi.fn(),
  } as unknown as Options;
  const controller = Object.create(FrameLogicProjectPackageController.prototype) as FrameLogicProjectPackageController;
  Reflect.set(controller, "options", options);
  Reflect.set(controller, "references", []);
  Reflect.set(controller, "pieceRuntime", { sources: new Map() });
  return { serialized, loaded, lineA, lineB, a, b, controller };
}

describe("restoring .flproject files with locked DWG/DXF internal geometry", () => {
  it("loads all saved CAD lines while preserving locked source layers and exact coordinates", async () => {
    const f = fixture();
    await f.controller.restoreProjectPackage(f.serialized);
    expect(f.loaded.cadLines.getAll()).toHaveLength(2);
    expect(f.loaded.cadLines.get(f.lineA.id)?.start).toEqual(f.lineA.start);
    expect(f.loaded.cadLines.get(f.lineB.id)?.end).toEqual(f.lineB.end);
    expect(f.loaded.layers.get(f.a.id)?.locked).toBe(true);
    expect(f.loaded.layers.get(f.b.id)?.locked).toBe(true);
    expect(() => f.loaded.registerCadLine({
      layerId: f.a.id, start: { x: 0, y: 0, z: 0 },
      end: { x: 1, y: 1, z: 1 },
    })).toThrow(/locked/);
  });
});
