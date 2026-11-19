import * as THREE from "three";
import { getPieceDetailGeometry } from "../design/PieceVisualGeometry";

/**
 * The isolated FLPIECE editor needs real detailed contours even when the
 * displayed solid uses WORK/LOW LOD. The mesh and exact CAD/SNAP geometry
 * never change as a result of selecting a render style.
 */
export function createVisualEdgeGeometry(
  mesh: THREE.Mesh,
  detailedEditorEdges: boolean,
): THREE.EdgesGeometry {
  const source = detailedEditorEdges ? getPieceDetailGeometry(mesh) : mesh.geometry;
  return new THREE.EdgesGeometry(source, 30);
}

/**
 * Offset only temporary solid materials away from coincident outlines.
 * We intentionally keep line depthTest on, hiding rear/occluded geometry.
 */
export function createOffsetSolidMaterials(
  original: THREE.Material | THREE.Material[],
): THREE.Material[] {
  const sources = Array.isArray(original) ? original : [original];
  return sources.map((source) => {
    const copy = source.clone();
    copy.polygonOffset = true;
    copy.polygonOffsetFactor = Math.max(1, source.polygonOffsetFactor);
    copy.polygonOffsetUnits = Math.max(1, source.polygonOffsetUnits);
    copy.needsUpdate = true;
    return copy;
  });
}
