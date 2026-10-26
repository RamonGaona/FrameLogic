import * as THREE from "three";

import type {
  AssemblyConstraint,
  AssemblyDefinition,
  FrameLogicEngineeringModel,
  PieceEngineeringFeature,
} from "@framelogic/domain";

import type {
  Transform3D,
} from "@framelogic/geometry";

export interface AssemblyConstraintResidual {
  readonly constraintId: string;
  readonly error: number;
}

export interface AssemblyConstraintSolution {
  readonly converged: boolean;
  readonly iterations: number;
  readonly componentTransforms: Readonly<Record<string, Transform3D>>;
  readonly residuals: readonly AssemblyConstraintResidual[];
}

interface MutableTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

interface ResolvedFeature {
  readonly point: THREE.Vector3;
  readonly direction?: THREE.Vector3;
}

/**
 * Solver incremental de constraints persistentes. El primer endpoint de cada
 * constraint actúa como referencia y se corrige el segundo componente.
 */
export class AssemblyConstraintSolver {
  private readonly engineeringModel:
    FrameLogicEngineeringModel;

  constructor(
    engineeringModel: FrameLogicEngineeringModel,
  ) {
    this.engineeringModel =
      engineeringModel;
  }

  solve(
    assembly: AssemblyDefinition,
    options?: {
      readonly maxIterations?: number;
      readonly tolerance?: number;
    },
  ): AssemblyConstraintSolution {
    const maxIterations =
      Math.max(
        1,
        Math.floor(
          options?.maxIterations
          ?? 24,
        ),
      );
    const tolerance =
      Math.max(
        1e-10,
        options?.tolerance
        ?? 1e-6,
      );
    const transforms =
      new Map<string, MutableTransform>();

    for (const component of assembly.components) {
      transforms.set(
        component.id,
        toMutableTransform(
          component.transform,
        ),
      );
    }

    let iterations = 0;
    let converged = false;

    for (
      let iteration = 0;
      iteration < maxIterations;
      iteration += 1
    ) {
      iterations =
        iteration + 1;
      let maxError = 0;

      for (const constraint of assembly.constraints) {
        if (!constraint.enabled) {
          continue;
        }

        maxError =
          Math.max(
            maxError,
            this.applyConstraint(
              assembly,
              constraint,
              transforms,
            ),
          );
      }

      if (maxError <= tolerance) {
        converged = true;
        break;
      }
    }

    const residuals =
      assembly.constraints
        .filter(
          (constraint) =>
            constraint.enabled,
        )
        .map(
          (constraint) => ({
            constraintId:
              constraint.id,
            error:
              this.constraintResidual(
                assembly,
                constraint,
                transforms,
              ),
          }),
        );
    const componentTransforms:
      Record<string, Transform3D> = {};

    for (const [componentId, transform] of transforms) {
      componentTransforms[componentId] =
        fromMutableTransform(
          transform,
        );
    }

    return {
      converged:
        converged
        || residuals.every(
          (residual) =>
            residual.error
            <= tolerance,
        ),
      iterations,
      componentTransforms,
      residuals,
    };
  }

  private applyConstraint(
    assembly: AssemblyDefinition,
    constraint: AssemblyConstraint,
    transforms: Map<string, MutableTransform>,
  ): number {
    const first =
      this.resolveEndpoint(
        assembly,
        constraint.first.componentId,
        constraint.first.featureId,
        transforms,
      );
    const second =
      this.resolveEndpoint(
        assembly,
        constraint.second.componentId,
        constraint.second.featureId,
        transforms,
      );
    const moving =
      transforms.get(
        constraint.second.componentId,
      );

    if (!first || !second || !moving) {
      return Number.POSITIVE_INFINITY;
    }

    switch (constraint.type) {
      case "COINCIDENT": {
        const delta =
          first.point.clone()
            .sub(
              second.point,
            );
        moving.position.add(delta);
        return delta.length();
      }

      case "DISTANCE": {
        const desired =
          constraint.offset
          ?? 0;
        const vector =
          second.point.clone()
            .sub(
              first.point,
            );
        const distance =
          vector.length();
        const direction =
          distance > 1e-12
            ? vector.multiplyScalar(
                1 / distance,
              )
            : new THREE.Vector3(
                1,
                0,
                0,
              );
        const correction =
          desired - distance;
        moving.position.addScaledVector(
          direction,
          correction,
        );
        return Math.abs(correction);
      }

      case "CONCENTRIC":
      case "COAXIAL": {
        const translation =
          first.point.clone()
            .sub(
              second.point,
            );
        moving.position.add(
          translation,
        );

        if (first.direction && second.direction) {
          rotateDirectionToward(
            moving,
            second.direction,
            first.direction,
            false,
          );
        }

        return Math.max(
          translation.length(),
          directionError(
            first.direction,
            second.direction,
            false,
          ),
        );
      }

      case "PARALLEL": {
        if (!first.direction || !second.direction) {
          return Number.POSITIVE_INFINITY;
        }
        const error =
          directionError(
            first.direction,
            second.direction,
            false,
          );
        rotateDirectionToward(
          moving,
          second.direction,
          first.direction,
          false,
        );
        return error;
      }

      case "PERPENDICULAR": {
        if (!first.direction || !second.direction) {
          return Number.POSITIVE_INFINITY;
        }
        const error =
          Math.abs(
            first.direction.clone()
              .normalize()
              .dot(
                second.direction.clone()
                  .normalize(),
              ),
          );
        rotateDirectionToward(
          moving,
          second.direction,
          perpendicularTarget(
            first.direction,
            second.direction,
          ),
          true,
        );
        return error;
      }

      case "FACE_TO_FACE": {
        const normal =
          first.direction
            ?.clone()
            .normalize();
        if (!normal) {
          return Number.POSITIVE_INFINITY;
        }

        if (second.direction) {
          rotateDirectionToward(
            moving,
            second.direction,
            normal.clone()
              .multiplyScalar(
                -1,
              ),
            true,
          );
        }

        const signedDistance =
          second.point.clone()
            .sub(
              first.point,
            )
            .dot(normal);
        const correction =
          (constraint.offset ?? 0)
          - signedDistance;
        moving.position.addScaledVector(
          normal,
          correction,
        );

        return Math.max(
          Math.abs(correction),
          directionError(
            first.direction,
            second.direction,
            true,
          ),
        );
      }
    }
  }

  private constraintResidual(
    assembly: AssemblyDefinition,
    constraint: AssemblyConstraint,
    transforms: Map<string, MutableTransform>,
  ): number {
    const first =
      this.resolveEndpoint(
        assembly,
        constraint.first.componentId,
        constraint.first.featureId,
        transforms,
      );
    const second =
      this.resolveEndpoint(
        assembly,
        constraint.second.componentId,
        constraint.second.featureId,
        transforms,
      );

    if (!first || !second) {
      return Number.POSITIVE_INFINITY;
    }

    switch (constraint.type) {
      case "COINCIDENT":
        return first.point.distanceTo(
          second.point,
        );

      case "DISTANCE":
        return Math.abs(
          first.point.distanceTo(
            second.point,
          )
          - (constraint.offset ?? 0),
        );

      case "CONCENTRIC":
      case "COAXIAL":
        return Math.max(
          first.point.distanceTo(
            second.point,
          ),
          directionError(
            first.direction,
            second.direction,
            false,
          ),
        );

      case "PARALLEL":
        return directionError(
          first.direction,
          second.direction,
          false,
        );

      case "PERPENDICULAR":
        return first.direction
          && second.direction
            ? Math.abs(
                first.direction.clone()
                  .normalize()
                  .dot(
                    second.direction.clone()
                      .normalize(),
                  ),
              )
            : Number.POSITIVE_INFINITY;

      case "FACE_TO_FACE": {
        if (!first.direction) {
          return Number.POSITIVE_INFINITY;
        }
        const normal =
          first.direction.clone()
            .normalize();
        const distanceError =
          Math.abs(
            second.point.clone()
              .sub(
                first.point,
              )
              .dot(normal)
            - (constraint.offset ?? 0),
          );
        return Math.max(
          distanceError,
          directionError(
            first.direction,
            second.direction,
            true,
          ),
        );
      }
    }
  }

  private resolveEndpoint(
    assembly: AssemblyDefinition,
    componentId: string,
    featureId: string,
    transforms: Map<string, MutableTransform>,
  ): ResolvedFeature | null {
    const component =
      assembly.components.find(
        (entry) =>
          entry.id
          === componentId,
      );
    const transform =
      transforms.get(
        componentId,
      );

    if (!component || !transform) {
      return null;
    }

    const engineering =
      this.engineeringModel
        .pieces
        .get(
          component.pieceDefinitionId,
        );
    const feature =
      engineering?.features.find(
        (entry) =>
          entry.id
          === featureId,
      );

    if (!feature) {
      return null;
    }

    return resolveFeature(
      feature,
      transform,
    );
  }
}

function resolveFeature(
  feature: PieceEngineeringFeature,
  transform: MutableTransform,
): ResolvedFeature {
  const point =
    featurePoint(feature)
      .applyQuaternion(
        transform.quaternion,
      )
      .add(
        transform.position,
      );
  const direction =
    featureDirection(feature);

  return {
    point,
    direction:
      direction
        ? direction
            .applyQuaternion(
              transform.quaternion,
            )
            .normalize()
        : undefined,
  };
}

function featurePoint(
  feature: PieceEngineeringFeature,
): THREE.Vector3 {
  switch (feature.kind) {
    case "HOLE":
      return vector(feature.center);
    case "AXIS":
      return vector(feature.origin);
    case "PLANE":
      return vector(feature.origin);
    case "POINT":
      return vector(feature.position);
    case "CIRCLE":
      return vector(feature.center);
    case "CYLINDER":
      return vector(feature.axisOrigin);
  }
}

function featureDirection(
  feature: PieceEngineeringFeature,
): THREE.Vector3 | undefined {
  switch (feature.kind) {
    case "HOLE":
      return vector(feature.axisDirection);
    case "AXIS":
      return vector(feature.direction);
    case "PLANE":
      return vector(feature.normal);
    case "POINT":
      return undefined;
    case "CIRCLE":
      return vector(feature.normal);
    case "CYLINDER":
      return vector(feature.axisDirection);
  }
}

function vector(
  value: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  },
): THREE.Vector3 {
  return new THREE.Vector3(
    value.x,
    value.y,
    value.z,
  );
}

function rotateDirectionToward(
  transform: MutableTransform,
  currentWorld: THREE.Vector3,
  targetWorld: THREE.Vector3,
  preserveSign: boolean,
): void {
  const current =
    currentWorld.clone()
      .normalize();
  let target =
    targetWorld.clone()
      .normalize();

  if (!preserveSign && current.dot(target) < 0) {
    target =
      target.multiplyScalar(
        -1,
      );
  }

  const correction =
    new THREE.Quaternion()
      .setFromUnitVectors(
        current,
        target,
      );
  transform.quaternion
    .premultiply(
      correction,
    )
    .normalize();
}

function perpendicularTarget(
  fixedDirection: THREE.Vector3,
  currentDirection: THREE.Vector3,
): THREE.Vector3 {
  const fixed =
    fixedDirection.clone()
      .normalize();
  const current =
    currentDirection.clone()
      .normalize();
  const projected =
    current.clone()
      .addScaledVector(
        fixed,
        -current.dot(fixed),
      );

  if (projected.lengthSq() > 1e-18) {
    return projected.normalize();
  }

  const fallback =
    Math.abs(fixed.x) < 0.8
      ? new THREE.Vector3(
          1,
          0,
          0,
        )
      : new THREE.Vector3(
          0,
          1,
          0,
        );
  return fallback
    .addScaledVector(
      fixed,
      -fallback.dot(fixed),
    )
    .normalize();
}

function directionError(
  first: THREE.Vector3 | undefined,
  second: THREE.Vector3 | undefined,
  opposite: boolean,
): number {
  if (!first || !second) {
    return 0;
  }

  const dot =
    first.clone()
      .normalize()
      .dot(
        second.clone()
          .normalize(),
      );
  return opposite
    ? Math.abs(dot + 1)
    : 1 - Math.abs(dot);
}

function toMutableTransform(
  transform: Transform3D,
): MutableTransform {
  const euler =
    new THREE.Euler(
      transform.rotation.x,
      transform.rotation.y,
      transform.rotation.z,
      "XYZ",
    );
  return {
    position:
      new THREE.Vector3(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      ),
    quaternion:
      new THREE.Quaternion()
        .setFromEuler(euler),
  };
}

function fromMutableTransform(
  transform: MutableTransform,
): Transform3D {
  const euler =
    new THREE.Euler()
      .setFromQuaternion(
        transform.quaternion,
        "XYZ",
      );
  return {
    position: {
      x: transform.position.x,
      y: transform.position.y,
      z: transform.position.z,
    },
    rotation: {
      x: euler.x,
      y: euler.y,
      z: euler.z,
    },
  };
}
