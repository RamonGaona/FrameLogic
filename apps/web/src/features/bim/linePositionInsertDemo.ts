import * as THREE from "three";
import type { PrecisionBimCoreInstance } from "@framelogic/bim-core";
import type { LineFillPlan } from "./linePositionFillPlanner";
import {
  detectPieceLongAxis, pieceTransformOnLine,
  type PieceLongAxis,
} from "./linePieceGeometryOrientation";

export interface LineFillInsertionResult {
  readonly realPieces: number;
  readonly temporaryReferences: number;
  readonly clearTemporaryReferences: () => void;
}

/** Temporary geometry does not represent manufacturing dimensions or actual STEP files. */
function temporaryReference(lengthMm: number, code: string): THREE.Group {
  const segment = new THREE.Group();
  segment.name = "DEMO SIN GEOMETRÍA REAL · " + code;
  const geometry = new THREE.BoxGeometry(lengthMm, 70, 70);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffd37e, transparent: true, opacity: 0.25, depthWrite: false,
  });
  const solid = new THREE.Mesh(geometry, material);
  solid.position.x = lengthMm / 2;
  segment.add(solid);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0xf8b84f, depthTest: false }),
  );
  edges.position.x = lengthMm / 2;
  segment.add(edges);
  return segment;
}

function clearPreview(preview: THREE.Group): void {
  preview.parent?.remove(preview);
  preview.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        for (const material of object.material) material.dispose();
      } else object.material.dispose();
    }
  });
}

/**
 * Place true PieceInstances only when the corresponding CAD asset is already
 * loaded. Unknown geometry is represented by removable, UNSAVED helper meshes.
 * No fake PieceDefinitions or permanent placeholder assets are registered.
 */
export function insertLinePositionDemo(
  core: PrecisionBimCoreInstance,
  plan: LineFillPlan,
  lineEnd: { x: number; y: number; z: number },
  options: { requireRealGeometry?: boolean } = {},
): LineFillInsertionResult {
  const start = new THREE.Vector3(
    plan.segments[0]!.start.x,
    plan.segments[0]!.start.y,
    plan.segments[0]!.start.z,
  );
  const target = new THREE.Vector3(lineEnd.x, lineEnd.y, lineEnd.z)
    .sub(start).normalize();
  if (target.lengthSq() <= 1e-12) throw new Error("La dirección de la línea es inválida.");
  if(options.requireRealGeometry){
    // Check everything before creating anything: never mix real geometry with
    // invented placeholders when the user requests actual FLPIECE placement.
    for(const segment of plan.segments){
      const definition = core.designModel.pieceDefinitions.getAll().find(
        item=>item.code.trim().toLocaleUpperCase()===segment.code.trim().toLocaleUpperCase());
      if(!definition || !core.designScene.getAssetPrototype(definition.geometryAssetId)){
        throw new Error("Falta geometría FLPIECE real para " + segment.code + ".");
      }
    }
  }
  const axisByDefinition = new Map<string,PieceLongAxis>();
  const helperGroup = new THREE.Group();
  helperGroup.name = "Inserción de posiciones: referencias no guardables (DEMO)";
  const created = [];
  let realPieces = 0;
  let temporaryReferences = 0;
  try {
    for (const segment of plan.segments) {
      const anchor = new THREE.Vector3(segment.start.x, segment.start.y, segment.start.z);
      const definition = core.designModel.pieceDefinitions.getAll().find(
        item=>item.code.trim().toLocaleUpperCase()===segment.code.trim().toLocaleUpperCase());
      const prototype = definition
        ? core.designScene.getAssetPrototype(definition.geometryAssetId) : null;
      if (!definition || !prototype) {
        const helper = temporaryReference(segment.lengthMm, segment.code);
        helper.position.copy(anchor);
        helper.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), target);
        helperGroup.add(helper);
        temporaryReferences++;
        continue;
      }
      // CoordinateSystem.xAxis is an editable engineering axis, not necessarily
      // the extrusion direction in native STEP geometry. Use the real geometric
      // long axis (often Y/Z for older pieces) to avoid 90° rotated inserts.
      let axis = axisByDefinition.get(definition.id);
      if (!axis) {
        axis=detectPieceLongAxis(
          prototype,definition.coordinateSystem,definition.referenceGeometry);
        axisByDefinition.set(definition.id,axis);
      }
      const transform=pieceTransformOnLine(
        definition.coordinateSystem,axis,anchor,target,
      );
      const instance = core.designModel.registerPieceInstance({
        definitionId: definition.id,
        name: "Demo " + segment.code,
        transform,
        tags: ["LINE_POSITION_DEMO", "position:" + segment.position],
      });
      created.push(instance);
      realPieces++;
    }
    if (temporaryReferences) core.world.scene.three.add(helperGroup);
    if (created.length) {
      core.designScene.sync();
      const snapshots = created.map(instance => ({
        id: instance.id, name: instance.name, definitionId: instance.definitionId,
        layerId: instance.layerId, transform: instance.transform,
        tags: [...instance.tags],
      }));
      core.cadHistory.recordOperation("Insertar secuencia de posiciones (demo)",
        () => {
          for (const item of snapshots) core.designModel.removePieceInstance(item.id);
          core.designSelection.clearSelection();
          core.designScene.sync();
        },
        () => {
          for (const item of snapshots) core.designModel.registerPieceInstance(item);
          core.designScene.sync();
        },
      );
    }
  } catch (error) {
    for (const instance of created) core.designModel.removePieceInstance(instance.id);
    core.designScene.sync();
    clearPreview(helperGroup);
    throw error;
  }
  return {
    realPieces, temporaryReferences,
    clearTemporaryReferences: () => clearPreview(helperGroup),
  };
}
