import * as THREE from "three";


export interface DistanceMeasurement {
  readonly distance: number;
  readonly delta: THREE.Vector3;
  readonly horizontalDistance: number;
  readonly verticalDistance: number;
}


export interface AngleMeasurement {
  readonly radians: number;
  readonly degrees: number;
}


export interface PointToSegmentMeasurement {
  readonly distance: number;
  readonly closestPoint: THREE.Vector3;
  readonly segmentParameter: number;
}


export interface PointToPlaneMeasurement {
  readonly signedDistance: number;
  readonly distance: number;
  readonly projectedPoint: THREE.Vector3;
}


export class MeasurementEngine {
  measureDistance(
    from: THREE.Vector3,
    to: THREE.Vector3,
  ): DistanceMeasurement {
    const delta = to.clone()
      .sub(from);

    return {
      distance: delta.length(),
      delta,
      horizontalDistance: Math.hypot(
        delta.x,
        delta.y,
      ),
      verticalDistance: Math.abs(delta.z),
    };
  }


  measureAngle(
    firstPoint: THREE.Vector3,
    vertex: THREE.Vector3,
    secondPoint: THREE.Vector3,
  ): AngleMeasurement | null {
    const firstDirection = firstPoint.clone()
      .sub(vertex);
    const secondDirection = secondPoint.clone()
      .sub(vertex);

    if (
      firstDirection.lengthSq() <= 1e-20
      || secondDirection.lengthSq() <= 1e-20
    ) {
      return null;
    }

    const radians = firstDirection.angleTo(
      secondDirection,
    );

    return {
      radians,
      degrees: THREE.MathUtils.radToDeg(
        radians,
      ),
    };
  }


  measurePointToSegment(
    point: THREE.Vector3,
    segmentStart: THREE.Vector3,
    segmentEnd: THREE.Vector3,
  ): PointToSegmentMeasurement {
    const direction = segmentEnd.clone()
      .sub(segmentStart);
    const lengthSquared = direction.lengthSq();

    if (
      lengthSquared <= 1e-20
    ) {
      return {
        distance: point.distanceTo(segmentStart),
        closestPoint: segmentStart.clone(),
        segmentParameter: 0,
      };
    }

    const segmentParameter = THREE.MathUtils.clamp(
      point.clone()
        .sub(segmentStart)
        .dot(direction)
        / lengthSquared,
      0,
      1,
    );
    const closestPoint = segmentStart.clone()
      .addScaledVector(
        direction,
        segmentParameter,
      );

    return {
      distance: point.distanceTo(closestPoint),
      closestPoint,
      segmentParameter,
    };
  }


  measurePointToPlane(
    point: THREE.Vector3,
    planePoint: THREE.Vector3,
    planeNormal: THREE.Vector3,
  ): PointToPlaneMeasurement | null {
    if (
      planeNormal.lengthSq() <= 1e-20
    ) {
      return null;
    }

    const normal = planeNormal.clone()
      .normalize();
    const signedDistance = point.clone()
      .sub(planePoint)
      .dot(normal);
    const projectedPoint = point.clone()
      .addScaledVector(
        normal,
        -signedDistance,
      );

    return {
      signedDistance,
      distance: Math.abs(signedDistance),
      projectedPoint,
    };
  }


  measurePolyline(
    points: readonly THREE.Vector3[],
  ): number {
    let length = 0;

    for (
      let index = 1;
      index < points.length;
      index += 1
    ) {
      const previous = points[index - 1];
      const current = points[index];

      if (
        previous
        && current
      ) {
        length += previous.distanceTo(current);
      }
    }

    return length;
  }


  projectPointToAxis(
    point: THREE.Vector3,
    axisOrigin: THREE.Vector3,
    axisDirection: THREE.Vector3,
  ): THREE.Vector3 | null {
    if (
      axisDirection.lengthSq() <= 1e-20
    ) {
      return null;
    }

    const direction = axisDirection.clone()
      .normalize();
    const parameter = point.clone()
      .sub(axisOrigin)
      .dot(direction);

    return axisOrigin.clone()
      .addScaledVector(
        direction,
        parameter,
      );
  }
}
