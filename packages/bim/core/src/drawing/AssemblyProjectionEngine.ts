/**
 * Assembly orthographic projection and exact topology feature extraction.
 * Reuses FrameLogic's OpenCascade STEP documents; no external dependency.
 *
 * IMPORTANT: HLR is evaluated for each STEP part. It removes self-hidden edges
 * but does NOT solve occlusion between different parts. Mixed STEP/mesh views
 * must not be certified as fully exact manufacturing projections.
 */
import * as THREE from "three";
import type { DesignModel } from "@framelogic/domain";
import { getOpenCascadeBrepKernel, OpenCascadeDrawingKernel } from "@framelogic/geometry";
import type { DesignSceneController } from "../design/DesignSceneController";
import { getStepBrepDocumentId } from "../step/StepEngineeringBridge";
import type { CadWorkPlaneState } from "../interaction/CadWorkPlaneController";
import type { AutomaticDimensionPoint } from "./AutoDrawingPlanner";
import { planEngineeringAutomaticDimensions, type EngineeringDimensionInstruction } from "./EngineeringAutoDimensionPlanner";

export interface AssemblyLine {
  readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number;
  readonly hidden?: boolean;
}
export interface AssemblyMarkAnchor {
  readonly instanceId: string; readonly x: number; readonly y: number;
}
export interface AssemblyProjection {
  readonly width: number;
  readonly height: number;
  readonly segments: readonly AssemblyLine[];
  readonly features: readonly AutomaticDimensionPoint[];
  readonly dimensions: readonly EngineeringDimensionInstruction[];
  readonly anchors: readonly AssemblyMarkAnchor[];
  readonly exactInstances: number;
  readonly fallbackInstances: number;
  readonly warnings: readonly string[];
}
export interface AssemblyProjectionSource {
  readonly instanceIds: readonly string[];
  readonly workPlane: CadWorkPlaneState;
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
}
const EPSILON = 1e-10;
const MAX_SEGMENTS = 80000;
const MAX_DIMENSION_FEATURES = 7500;

/** Fingerprints transformations AND mesh revisions; no stale geometry is trusted. */
export function assemblyProjectionSignature(source: Pick<AssemblyProjectionSource, "instanceIds" | "designModel" | "designScene">): string {
  return source.instanceIds.map((instanceId) => {
    const piece = source.designModel.pieceInstances.get(instanceId);
    const object = source.designScene.getInstanceObject(instanceId);
    if (!piece || !object) return instanceId + ":missing";
    object.updateWorldMatrix(true, true);
    const geometries: string[] = [];
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) geometries.push(child.geometry.uuid + ":" + child.geometry.version);
    });
    return [instanceId, piece.definitionId, getStepBrepDocumentId(piece.definitionId) ?? "",
      object.matrixWorld.elements.map((n) => n.toPrecision(12)).join(","), ...geometries].join(":");
  }).join("|");
}

/** Only genuine B-Rep points and coaxial circles may enter the dimension planner. */
export function planExactAssemblyDimensions(
  points: readonly AutomaticDimensionPoint[],
  limit = 18,
): EngineeringDimensionInstruction[] {
  if (!points.some((p) => p.kind === "VERTEX")) return [];
  const planned = planEngineeringAutomaticDimensions(points, {
    scope: "ASSEMBLY", arrangement: "BASELINE", detail: "ALL",
    maxFeaturesPerAxis: 6, maxDiameterGroups: 6,
  });
  return planned.slice(0, Math.max(0, Math.min(32, Math.trunc(limit))));
}

export async function projectAssembly(source: AssemblyProjectionSource,
  ocDrawing = new OpenCascadeDrawingKernel()): Promise<AssemblyProjection | null> {
  const ids = new Set(source.instanceIds);
  const basis = new THREE.Matrix4().makeBasis(
    source.workPlane.xAxis.clone().normalize(),
    source.workPlane.yAxis.clone().normalize(),
    source.workPlane.normal.clone().normalize(),
  );
  basis.setPosition(source.workPlane.origin);
  const worldToPlane = basis.invert();
  const raw: AssemblyLine[] = [];
  const points: AutomaticDimensionPoint[] = [];
  const anchors: AssemblyMarkAnchor[] = [];
  const warnings: string[] = [];
  let exactInstances = 0;
  let fallbackInstances = 0;

  for (const [instanceId, object] of source.designScene.getInstanceEntries()) {
    if (!ids.has(instanceId)) continue;
    const piece = source.designModel.pieceInstances.get(instanceId);
    if (!piece) continue;
    object.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) continue;
    const center = box.getCenter(new THREE.Vector3()).applyMatrix4(worldToPlane);
    anchors.push({ instanceId, x: center.x, y: center.y });
    const docId = getStepBrepDocumentId(piece.definitionId);
    const document = docId ? getOpenCascadeBrepKernel().getDocument(docId) : undefined;
    let projectedExactly = false;

    if (docId && document) {
      const inverse = object.matrixWorld.clone().invert();
      const localDirection = source.workPlane.normal.clone()
        .multiplyScalar(-1).transformDirection(inverse).normalize();
      const localUp = source.workPlane.yAxis.clone().transformDirection(inverse).normalize();
      const result = await ocDrawing.hiddenLines(docId, localDirection, localUp);
      if (result.precision === "BREP_EXACT" && result.visible.length > 0) {
        const append = (segments: readonly typeof result.visible[number][], hidden: boolean): void => {
          for (const segment of segments) {
            const a = new THREE.Vector3(segment.a.x, segment.a.y, segment.a.z)
              .applyMatrix4(object.matrixWorld).applyMatrix4(worldToPlane);
            const b = new THREE.Vector3(segment.b.x, segment.b.y, segment.b.z)
              .applyMatrix4(object.matrixWorld).applyMatrix4(worldToPlane);
            if (a.distanceToSquared(b) < EPSILON) continue;
            raw.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, hidden });
          }
        };
        append(result.visible, false);
        append(result.hidden, true);
        projectedExactly = true;
        exactInstances++;
      } else if (result.reason) {
        warnings.push(instanceId.slice(0, 8) + ": " + result.reason);
      }
    }

    if (!projectedExactly) {
      fallbackInstances++;
      object.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const edges = new THREE.EdgesGeometry(child.geometry, 28);
        const positions = edges.getAttribute("position");
        for (let i = 0; i + 1 < positions.count; i += 2) {
          const a = new THREE.Vector3().fromBufferAttribute(positions, i)
            .applyMatrix4(child.matrixWorld).applyMatrix4(worldToPlane);
          const b = new THREE.Vector3().fromBufferAttribute(positions, i + 1)
            .applyMatrix4(child.matrixWorld).applyMatrix4(worldToPlane);
          if (a.distanceToSquared(b) <= EPSILON) continue;
          raw.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
        }
        edges.dispose();
      });
    }
    if (raw.length > MAX_SEGMENTS) {
      throw new Error("La vista excede el límite de " + MAX_SEGMENTS
        + " segmentos. Divide el ensamble o crea vistas por subensamble.");
    }

    // Source geometry and vertex IDs remain exact even when HLR has a fallback.
    if (!document || points.length >= MAX_DIMENSION_FEATURES) continue;
    const toPlane = (p: { x: number; y: number; z: number }) =>
      new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(document.modelScale)
        .applyMatrix4(object.matrixWorld).applyMatrix4(worldToPlane);
    for (const vertex of document.vertices) {
      if (points.length >= MAX_DIMENSION_FEATURES) break;
      const p = toPlane(vertex.point);
      points.push({ instanceId, topologyId: vertex.id, kind: "VERTEX", x: p.x, y: p.y });
    }
    const scale = new THREE.Vector3();
    object.getWorldScale(scale);
    const isUniform = Math.max(Math.abs(scale.x - scale.y), Math.abs(scale.y - scale.z))
      <= Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z), 1e-9) * 1e-5;
    if (!isUniform) continue; // distorted circles would be ellipses, not Ø annotations
    const normalTransform = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
    const viewNormal = source.workPlane.normal.clone().normalize();
    for (const edge of document.edges) {
      if (!edge.circle || points.length >= MAX_DIMENSION_FEATURES) continue;
      const normal = new THREE.Vector3(edge.circle.normal.x, edge.circle.normal.y, edge.circle.normal.z)
        .applyMatrix3(normalTransform).normalize();
      if (Math.abs(normal.dot(viewNormal)) < 0.995) continue;
      const center = toPlane(edge.circle.center);
      points.push({
        instanceId, topologyId: edge.id + ":center", kind: "CIRCLE",
        x: center.x, y: center.y,
        radius: edge.circle.radius * document.modelScale * Math.abs(scale.x),
      });
    }
  }
  if (!raw.length) return null;
  let minX = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  for (const segment of raw) {
    minX = Math.min(minX, segment.x1, segment.x2);
    maxX = Math.max(maxX, segment.x1, segment.x2);
    minY = Math.min(minY, segment.y1, segment.y2);
    maxY = Math.max(maxY, segment.y1, segment.y2);
  }
  const padding = Math.max(maxX - minX, maxY - minY, 0.001) * 0.04;
  const dx = -minX + padding, dy = -minY + padding;
  const shift = (p: AutomaticDimensionPoint): AutomaticDimensionPoint =>
    ({ ...p, x: p.x + dx, y: p.y + dy });
  const features = points.map(shift);
  // Isometric dimensions are deliberately not generated by the caller.
  return {
    width: Math.max(0.001, maxX - minX) + padding * 2,
    height: Math.max(0.001, maxY - minY) + padding * 2,
    segments: raw.map((s) => ({ ...s,
      x1: s.x1 + dx, x2: s.x2 + dx, y1: s.y1 + dy, y2: s.y2 + dy })),
    features, dimensions: planExactAssemblyDimensions(features),
    anchors: anchors.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })),
    exactInstances, fallbackInstances, warnings,
  };
}
