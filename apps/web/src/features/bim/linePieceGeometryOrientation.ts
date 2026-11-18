import * as THREE from "three";
import type { LocalCoordinateSystem, PieceReferenceGeometry } from "@framelogic/domain";

/**
 * .flpiece coordinateSystem.xAxis is an authored engineering direction; it is
 * not necessarily the extrusion direction in the STEP mesh. Selecting xAxis
 * directly rotated some REC pieces 90° away from their insertion line.
 *
 * Derive the physical long axis from actual mesh geometry in the asset's native
 * frame, then use the engineering MAIN direction only to choose its sign.
 */
export interface PieceLongAxis {
  readonly direction: THREE.Vector3;
  readonly startProjection: number;
  readonly physicalLengthMm: number;
}
type MeshPointSource = { geometry: THREE.BufferGeometry; transform: THREE.Matrix4 };

function meshSources(prototype: THREE.Object3D): MeshPointSource[] {
  prototype.updateMatrixWorld(true);
  const inverse = prototype.matrixWorld.clone().invert();
  const sources: MeshPointSource[] = [];
  prototype.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    const geometry = child.geometry;
    if (!(geometry instanceof THREE.BufferGeometry)) return;
    const positions = geometry.getAttribute("position");
    if (!positions || positions.count < 3) return;
    sources.push({
      geometry,
      transform: inverse.clone().multiply(child.matrixWorld),
    });
  });
  return sources;
}
function mainAxisInAssetFrame(
  frame: LocalCoordinateSystem,
  references?: PieceReferenceGeometry,
): THREE.Vector3 | null {
  const main = references?.axisLines.find(axis => axis.type === "MAIN");
  if (!main) return null;
  const dir = main.direction;
  const local = new THREE.Vector3(
    frame.xAxis.x * dir.x + frame.yAxis.x * dir.y + frame.zAxis.x * dir.z,
    frame.xAxis.y * dir.x + frame.yAxis.y * dir.y + frame.zAxis.y * dir.z,
    frame.xAxis.z * dir.x + frame.yAxis.z * dir.y + frame.zAxis.z * dir.z,
  );
  return local.lengthSq() > 1e-12 ? local.normalize() : null;
}

export function detectPieceLongAxis(
  prototype: THREE.Object3D,
  frame: LocalCoordinateSystem,
  references?: PieceReferenceGeometry,
): PieceLongAxis {
  const sources=meshSources(prototype);
  if (!sources.length) {
    throw new Error("La pieza no contiene mallas 3D para determinar su eje longitudinal.");
  }
  // Covariance of a bounded vertex sample gives the longest geometry direction
  // even if the imported STEP asset is not aligned to native X/Y/Z.
  const total = sources.reduce((sum,mesh) =>
    sum + mesh.geometry.getAttribute("position").count,0);
  const stride = Math.max(1,Math.ceil(total / 12000));
  let count=0;
  const mean = new THREE.Vector3();
  const second = new Array<number>(6).fill(0);
  const point = new THREE.Vector3();
  const addPoint = (p:THREE.Vector3):void => {
    count++;
    mean.add(p);
    second[0]! += p.x*p.x;
    second[1]! += p.y*p.y;
    second[2]! += p.z*p.z;
    second[3]! += p.x*p.y;
    second[4]! += p.x*p.z;
    second[5]! += p.y*p.z;
  };
  for (const mesh of sources){
    const pos=mesh.geometry.getAttribute("position");
    for(let i=0;i<pos.count;i+=stride){
      point.fromBufferAttribute(pos,i).applyMatrix4(mesh.transform);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)
        || !Number.isFinite(point.z)) {
        throw new Error("La geometría tiene vértices inválidos.");
      }
      addPoint(point);
    }
  }
  if(count<3)throw new Error("No hay geometría suficiente para orientar la pieza.");
  mean.multiplyScalar(1/count);
  const cov = [
    second[0]!/count-mean.x*mean.x,
    second[1]!/count-mean.y*mean.y,
    second[2]!/count-mean.z*mean.z,
    second[3]!/count-mean.x*mean.y,
    second[4]!/count-mean.x*mean.z,
    second[5]!/count-mean.y*mean.z,
  ];
  const diag=cov.slice(0,3);
  const principal=diag.indexOf(Math.max(...diag));
  const direction=new THREE.Vector3(
    principal===0?1:0,principal===1?1:0,principal===2?1:0,
  );
  for(let n=0;n<32;n++){
    const x=cov[0]!*direction.x+cov[3]!*direction.y+cov[4]!*direction.z;
    const y=cov[3]!*direction.x+cov[1]!*direction.y+cov[5]!*direction.z;
    const z=cov[4]!*direction.x+cov[5]!*direction.y+cov[2]!*direction.z;
    direction.set(x,y,z);
    if(direction.lengthSq()<1e-15)throw new Error("Eje longitudinal indeterminado.");
    direction.normalize();
  }
  // Eigenvectors are unsigned. Prefer a stored MAIN axis when aligned, or
  // otherwise the positive predominant native direction for deterministic use.
  const explicit=mainAxisInAssetFrame(frame,references);
  if(explicit && Math.abs(explicit.dot(direction))>=0.8){
    if(explicit.dot(direction)<0)direction.negate();
  }else{
    const components=[direction.x,direction.y,direction.z];
    const major=components.findIndex(value=>Math.abs(value)===Math.max(...components.map(Math.abs)));
    if(components[major]!<0)direction.negate();
  }

  // Exact extrema (not the covariance sample) are critical: inserting each
  // beam at its REAL leading end prevents geometry protruding before the CAD
  // line start when the .flpiece origin was saved near the other end.
  let min=Infinity,max=-Infinity;
  for(const mesh of sources){
    const positions=mesh.geometry.getAttribute("position");
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(mesh.transform);
      const dot=point.dot(direction);
      if(dot<min)min=dot;
      if(dot>max)max=dot;
    }
  }
  if(!Number.isFinite(min) || !Number.isFinite(max) || max-min<=1e-6){
    throw new Error("La geometría no tiene longitud longitudinal válida.");
  }
  return {direction,startProjection:min,physicalLengthMm:max-min};
}

export interface LinePieceTransform {
  readonly position: {x:number;y:number;z:number};
  readonly rotation: {x:number;y:number;z:number};
}
/** Keep the saved transverse origin, but align the first physical section. */
export function pieceTransformOnLine(
  frame: LocalCoordinateSystem,
  axis: PieceLongAxis,
  lineStart: THREE.Vector3,
  lineDirection: THREE.Vector3,
): LinePieceTransform {
  const target=lineDirection.clone();
  if(target.lengthSq()<1e-12)throw new Error("Línea CAD sin dirección.");
  target.normalize();
  const rotation=new THREE.Quaternion().setFromUnitVectors(axis.direction,target);
  const nativeOrigin=new THREE.Vector3(frame.origin.x,frame.origin.y,frame.origin.z);
  // Move only the longitudinal component to the first physical section.
  const leadingPoint=nativeOrigin.addScaledVector(
    axis.direction,axis.startProjection-nativeOrigin.dot(axis.direction));
  const rotatedLeadingPoint=leadingPoint.applyQuaternion(rotation);
  const translation=lineStart.clone().sub(rotatedLeadingPoint);
  const euler=new THREE.Euler().setFromQuaternion(rotation,"XYZ");
  return {
    position:{x:translation.x,y:translation.y,z:translation.z},
    rotation:{x:euler.x,y:euler.y,z:euler.z},
  };
}
