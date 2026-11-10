import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DesignModel, FrameLogicEngineeringModel } from "@framelogic/domain";
import type { DesignSceneController } from "../design/DesignSceneController";
import { GeometryQueryEngine } from "./GeometryQueryEngine";
import type { GeometryQueryProvider, GeometryQueryResult } from "./GeometryQueryEngine";
import { StepEngineeringFeatureProvider } from "./StepEngineeringFeatureProvider";

function fixture() {
  const model = new DesignModel();
  const asset = model.registerAsset({ name: "profile.step", format: "STEP" });
  const definition = model.registerPieceDefinition({ name: "Profile", code: "P", geometryAssetId: asset.id });
  const instance = model.registerPieceInstance({ definitionId: definition.id });
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 1000);
  camera.position.set(0, 0, 100);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshBasicMaterial());
  mesh.userData["frameLogic"] = { entityType: "PieceInstance", instanceId: instance.id };
  mesh.updateMatrixWorld(true);
  const scene = {
    getRaycastInstanceObjects: () => [mesh],
    getInstanceObject: (id: string) => id === instance.id ? mesh : null,
  } as unknown as DesignSceneController;
  const element = {
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 200, bottom: 200, width: 200, height: 200 }),
  } as HTMLElement;
  const query = new GeometryQueryEngine(element, () => camera, scene, model);
  return { model, definition, instance, camera, mesh, scene, query };
}

describe("precise STEP snapping independent of the display mesh", () => {
  it("prefers loaded B-rep topology and suppresses mesh vertices and centers for that occurrence", () => {
    const f = fixture();
    const sourceId = f.instance.id;
    const exactPoint = new THREE.Vector3(0, 0, 5);
    const provider: GeometryQueryProvider = {
      hasExactTopologyForSource: (id) => id === sourceId,
      query: () => [{
        kind: "VERTEX", point: exactPoint, sourceId,
        object: f.mesh, screenDistancePx: 0, precision: "MODEL_EXACT",
      }],
    };
    f.query.addProvider(provider);
    const hits = f.query.queryAt(100, 100, { includeSurface: false, maxResults: 100 });
    expect(hits.some((x) => x.precision === "MODEL_EXACT"
      && x.point.distanceTo(exactPoint) < 1e-10)).toBe(true);
    expect(hits.filter((x) => x.precision === "DERIVED_MESH")).toHaveLength(0);
    expect(f.query.hasExactTopologyForSource(sourceId)).toBe(true);
    f.query.dispose();
  });

  it("keeps mesh fallback when no exact STEP document is loaded", () => {
    const f = fixture();
    const hits = f.query.queryAt(100, 100, { includeSurface: false, maxResults: 100 });
    expect(hits.some((x) => x.precision === "DERIVED_MESH")).toBe(true);
    expect(f.query.hasExactTopologyForSource(f.instance.id)).toBe(false);
    f.query.dispose();
  });

  it("retains derived snaps on a different mesh-only piece in a mixed model", () => {
    const f = fixture();
    const sourceId = f.instance.id;
    const other = f.model.registerPieceInstance({ definitionId: f.definition.id });
    const exact: GeometryQueryProvider = {
      hasExactTopologyForSource: (id) => id === sourceId,
      query: () => [
        { kind: "VERTEX", point: new THREE.Vector3(0, 0, 5),
          sourceId, screenDistancePx: 0, precision: "MODEL_EXACT" },
        { kind: "CIRCLE_CENTER", point: new THREE.Vector3(0, 0, 5),
          sourceId, screenDistancePx: 0, precision: "DERIVED_MESH" },
        { kind: "CIRCLE_CENTER", point: new THREE.Vector3(0, 0, 5),
          sourceId: other.id, screenDistancePx: 0, precision: "DERIVED_MESH" },
      ],
    };
    f.query.addProvider(exact);
    const hits = f.query.queryAt(100, 100, { includeSurface: false, maxResults: 100 });
    expect(hits.some((x) => x.sourceId === sourceId && x.precision === "DERIVED_MESH")).toBe(false);
    expect(hits.some((x) => x.sourceId === other.id && x.precision === "DERIVED_MESH")).toBe(true);
    f.query.dispose();
  });

  it("keeps the actual piece ID for engineering feature snaps after world placement", () => {
    const f = fixture();
    const engineering = new FrameLogicEngineeringModel();
    engineering.pieces.upsert({
      pieceDefinitionId: f.definition.id,
      features: [{
        id: "hole-center", name: "Hole center", kind: "POINT", source: "MANUAL",
        position: { x: 3, y: 4, z: 5 },
      }],
    });
    f.mesh.position.set(100, 20, -30);
    f.mesh.updateMatrixWorld(true);
    const provider = new StepEngineeringFeatureProvider(engineering, f.model, f.scene);
    const hits = provider.query({
      clientX: 0, clientY: 0,
      rect: { left: 0, top: 0, width: 200, height: 200 } as DOMRect,
      camera: f.camera,
      ray: new THREE.Ray(),
      pixelTolerance: 1000,
      excludedSourceIds: new Set(),
      projectWorldPoint: () => ({ x: 0, y: 0, visible: true }),
    });
    const feature: GeometryQueryResult | undefined = hits.find((x) => x.kind === "VERTEX");
    expect(feature?.sourceId).toBe(f.instance.id);
    expect(feature?.relatedSourceIds).toContain("hole-center");
    expect(feature?.point.toArray()).toEqual([103, 24, -25]);
    f.query.dispose();
  });
});
