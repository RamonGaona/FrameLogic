import * as THREE from "three";

import type {
  FrameLogicProjectPackage,
  FrameLogicProjectPackageController,
} from "./FrameLogicProjectPackageController";

export type ProjectCameraProjection =
  | "ORTHOGRAPHIC"
  | "PERSPECTIVE";

export interface ProjectModelSpaceCameraSnapshot {
  readonly schema: "FRAMELOGIC_MODELSPACE_CAMERA";
  readonly version: 1;
  readonly projection: ProjectCameraProjection;
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly target: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly azimuth: number;
  readonly polar: number;
  readonly orthographicZoom: number;
}

interface ProjectPackageWithCamera
  extends FrameLogicProjectPackage {
  readonly modelSpaceCamera?:
    ProjectModelSpaceCameraSnapshot;
}

interface CameraControlsRuntime {
  readonly azimuthAngle: number;
  readonly polarAngle: number;
  readonly distance: number;
  getTarget?: (
    target: THREE.Vector3,
  ) => THREE.Vector3;
  setLookAt: (
    positionX: number,
    positionY: number,
    positionZ: number,
    targetX: number,
    targetY: number,
    targetZ: number,
    enableTransition?: boolean,
  ) => Promise<void>;
  rotateTo: (
    azimuth: number,
    polar: number,
    enableTransition?: boolean,
  ) => Promise<void>;
  zoomTo: (
    zoom: number,
    enableTransition?: boolean,
  ) => Promise<void>;
}

export interface ProjectCameraStateControllerOptions {
  readonly projectPackage:
    FrameLogicProjectPackageController;
  readonly cameraProvider:
    () => THREE.Camera;
  readonly orthoCameraProvider:
    () => THREE.OrthographicCamera;
  readonly controls:
    CameraControlsRuntime;
  readonly getProjectionMode:
    () => ProjectCameraProjection;
  readonly toggleProjection:
    () => Promise<ProjectCameraProjection>;
  /** Temporary Model Space workaround: restore old perspective snapshots in orthographic. */
  readonly allowPerspective?: boolean;
}

/**
 * Añade la vista del Model Space al paquete .flproject sin romper el schema v1.
 *
 * `modelSpaceCamera` es opcional para mantener compatibilidad con proyectos
 * históricos. Los paquetes nuevos guardan posición, target, orientación,
 * proyección y zoom ortográfico. Al restaurar, primero dejamos que el flujo
 * normal reconstruya modelo/dibujos y después reponemos exactamente la cámara.
 */
export class ProjectCameraStateController {
  private readonly options:
    ProjectCameraStateControllerOptions;

  private readonly baseCreateProjectPackage:
    FrameLogicProjectPackageController["createProjectPackage"];

  private readonly baseRestoreProjectPackage:
    FrameLogicProjectPackageController["restoreProjectPackage"];

  private disposed = false;

  constructor(
    options: ProjectCameraStateControllerOptions,
  ) {
    this.options = options;

    this.baseCreateProjectPackage =
      options.projectPackage
        .createProjectPackage
        .bind(options.projectPackage);

    this.baseRestoreProjectPackage =
      options.projectPackage
        .restoreProjectPackage
        .bind(options.projectPackage);

    Object.defineProperty(
      options.projectPackage,
      "createProjectPackage",
      {
        configurable: true,
        writable: true,
        value: this.createProjectPackage,
      },
    );

    Object.defineProperty(
      options.projectPackage,
      "restoreProjectPackage",
      {
        configurable: true,
        writable: true,
        value: this.restoreProjectPackage,
      },
    );
  }

  private readonly createProjectPackage = (
    name?: string,
  ): FrameLogicProjectPackage => {
    const packageValue =
      this.baseCreateProjectPackage(
        name,
      );

    return {
      ...packageValue,
      modelSpaceCamera:
        this.captureCamera(),
    } as ProjectPackageWithCamera;
  };

  private readonly restoreProjectPackage = async (
    project: FrameLogicProjectPackage,
  ): Promise<void> => {
    await this.baseRestoreProjectPackage(
      project,
    );

    const camera =
      (
        project as ProjectPackageWithCamera
      ).modelSpaceCamera;

    if (
      !camera
      || !this.isValidSnapshot(camera)
    ) {
      return;
    }

    await this.restoreCamera(
      camera,
    );
  };

  private captureCamera():
    ProjectModelSpaceCameraSnapshot {
    const camera =
      this.options.cameraProvider();
    const controls =
      this.options.controls;

    const target =
      new THREE.Vector3();

    if (
      typeof controls.getTarget
      === "function"
    ) {
      controls.getTarget(
        target,
      );
    }
    else {
      const direction =
        new THREE.Vector3();
      camera.getWorldDirection(
        direction,
      );

      target.copy(
        camera.position,
      ).addScaledVector(
        direction,
        Number.isFinite(controls.distance)
          ? controls.distance
          : 1,
      );
    }

    return {
      schema:
        "FRAMELOGIC_MODELSPACE_CAMERA",
      version: 1,
      projection:
        this.options.getProjectionMode(),
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      target: {
        x: target.x,
        y: target.y,
        z: target.z,
      },
      azimuth:
        controls.azimuthAngle,
      polar:
        controls.polarAngle,
      orthographicZoom:
        this.options
          .orthoCameraProvider()
          .zoom,
    };
  }

  private async restoreCamera(
    snapshot:
      ProjectModelSpaceCameraSnapshot,
  ): Promise<void> {
    // A saved .flproject may contain an older perspective view. Restore
    // position/orientation but never re-activate the broken perspective
    // renderer when Model Space is configured as orthographic-only.
    const targetProjection = this.options.allowPerspective === false
      ? "ORTHOGRAPHIC"
      : snapshot.projection;

    if (
      this.options.getProjectionMode()
      !== targetProjection
    ) {
      await this.options
        .toggleProjection();
    }

    const controls =
      this.options.controls;

    await controls.setLookAt(
      snapshot.position.x,
      snapshot.position.y,
      snapshot.position.z,
      snapshot.target.x,
      snapshot.target.y,
      snapshot.target.z,
      false,
    );

    /*
     * En TOP/BOTTOM la posición y el target por sí solos no conservan el giro
     * alrededor de la normal. azimuth/polar completan la orientación exacta.
     */
    await controls.rotateTo(
      snapshot.azimuth,
      snapshot.polar,
      false,
    );

    // Do not apply the orthographicZoom saved alongside a PERSPECTIVE
    // snapshot: it may be stale and produce a wildly incorrect framing.
    if (
      targetProjection === "ORTHOGRAPHIC"
      && snapshot.projection === "ORTHOGRAPHIC"
    ) {
      const ortho =
        this.options
          .orthoCameraProvider();

      ortho.zoom =
        snapshot.orthographicZoom;
      ortho.updateProjectionMatrix();

      await controls.zoomTo(
        snapshot.orthographicZoom,
        false,
      );
    }
  }

  private isValidSnapshot(
    snapshot:
      ProjectModelSpaceCameraSnapshot,
  ): boolean {
    const values = [
      snapshot.position.x,
      snapshot.position.y,
      snapshot.position.z,
      snapshot.target.x,
      snapshot.target.y,
      snapshot.target.z,
      snapshot.azimuth,
      snapshot.polar,
      snapshot.orthographicZoom,
    ];

    return snapshot.schema
      === "FRAMELOGIC_MODELSPACE_CAMERA"
      && snapshot.version === 1
      && (
        snapshot.projection
          === "ORTHOGRAPHIC"
        || snapshot.projection
          === "PERSPECTIVE"
      )
      && values.every(
        Number.isFinite,
      )
      && snapshot.orthographicZoom
        > 0;
  }

  dispose(): void {
    if (
      this.disposed
    ) {
      return;
    }

    this.disposed = true;

    Object.defineProperty(
      this.options.projectPackage,
      "createProjectPackage",
      {
        configurable: true,
        writable: true,
        value:
          this.baseCreateProjectPackage,
      },
    );

    Object.defineProperty(
      this.options.projectPackage,
      "restoreProjectPackage",
      {
        configurable: true,
        writable: true,
        value:
          this.baseRestoreProjectPackage,
      },
    );
  }
}
