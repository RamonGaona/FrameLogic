import type {
  FrameLogicProjectPackage,
  FrameLogicProjectPackageController,
} from "../project/FrameLogicProjectPackageController";

import type {
  AssemblyPdfController,
  AssemblyPdfSnapshot,
} from "./AssemblyPdfController";

import {
  AssemblyPdfProfessionalController,
} from "./AssemblyPdfProfessionalController";

interface AssemblyPdfProjectBridgeControllerOptions {
  readonly projectPackage: FrameLogicProjectPackageController;
  readonly assemblyPdf: AssemblyPdfController;
}

type ProjectWithAssemblyPdf =
  FrameLogicProjectPackage
  & {
    readonly assemblyPdf?: AssemblyPdfSnapshot;
  };

/**
 * Extiende el paquete de proyecto sin cambiar la versión del formato base.
 *
 * `assemblyPdf` es opcional para que proyectos existentes sigan siendo
 * compatibles. El snapshot es liviano: no contiene PDF/SVG/segmentos 2D,
 * únicamente hojas, vistas, IDs, WorkPlane y estado profesional de plano.
 */
export class AssemblyPdfProjectBridgeController {
  private readonly projectPackage: FrameLogicProjectPackageController;
  private readonly professional: AssemblyPdfProfessionalController;
  private readonly baseCreateProjectPackage:
    FrameLogicProjectPackageController["createProjectPackage"];
  private readonly baseRestoreProjectPackage:
    FrameLogicProjectPackageController["restoreProjectPackage"];
  private disposed = false;

  constructor(
    options: AssemblyPdfProjectBridgeControllerOptions,
  ) {
    this.projectPackage = options.projectPackage;

    /*
     * Se instala antes del bridge de persistencia para que el snapshot de PDF
     * ya incluya formato, cajetín, revisiones y bloqueos profesionales.
     */
    this.professional =
      new AssemblyPdfProfessionalController(
        options.assemblyPdf,
      );

    this.baseCreateProjectPackage =
      options.projectPackage.createProjectPackage.bind(
        options.projectPackage,
      );
    this.baseRestoreProjectPackage =
      options.projectPackage.restoreProjectPackage.bind(
        options.projectPackage,
      );

    options.projectPackage.createProjectPackage = (
      name?: string,
    ): FrameLogicProjectPackage => {
      const base =
        this.baseCreateProjectPackage(name);

      return {
        ...base,
        assemblyPdf:
          options.assemblyPdf.createSnapshot(),
      } as ProjectWithAssemblyPdf;
    };

    options.projectPackage.restoreProjectPackage = async (
      project: FrameLogicProjectPackage,
    ): Promise<void> => {
      await this.baseRestoreProjectPackage(project);
      options.assemblyPdf.restoreSnapshot(
        (project as ProjectWithAssemblyPdf).assemblyPdf,
      );
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.projectPackage.createProjectPackage =
      this.baseCreateProjectPackage;
    this.projectPackage.restoreProjectPackage =
      this.baseRestoreProjectPackage;
    this.professional.dispose();
  }
}
