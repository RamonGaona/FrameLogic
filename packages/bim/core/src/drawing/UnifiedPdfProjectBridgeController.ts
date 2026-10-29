import type {
  FrameLogicProjectPackage,
  FrameLogicProjectPackageController,
} from "../project/FrameLogicProjectPackageController";

import type {
  GeneralPdfController,
} from "./GeneralPdfController";

import type {
  UnifiedPdfNavigationController,
  UnifiedPdfNavigationSnapshot,
} from "./UnifiedPdfNavigationController";

interface UnifiedPdfProjectBridgeControllerOptions {
  readonly projectPackage: FrameLogicProjectPackageController;
  readonly navigation: UnifiedPdfNavigationController;
  readonly generalPdf: GeneralPdfController;
}

type ProjectWithUnifiedPdf =
  FrameLogicProjectPackage
  & {
    readonly unifiedPdfNavigation?: UnifiedPdfNavigationSnapshot;
    readonly assemblyPdf?: unknown;
  };

/**
 * Persiste el orden global de navegación. El contenido de todas las hojas y
 * Views vive en el snapshot de DrawingProduction, que ahora es el único almacén
 * PDF. Al abrir proyectos antiguos se migra `assemblyPdf` una sola vez al
 * almacén general para no perder hojas creadas antes de la unificación.
 */
export class UnifiedPdfProjectBridgeController {
  private readonly projectPackage: FrameLogicProjectPackageController;
  private readonly baseCreateProjectPackage:
    FrameLogicProjectPackageController["createProjectPackage"];
  private readonly baseRestoreProjectPackage:
    FrameLogicProjectPackageController["restoreProjectPackage"];
  private disposed = false;

  constructor(
    options: UnifiedPdfProjectBridgeControllerOptions,
  ) {
    this.projectPackage = options.projectPackage;
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
      const base = this.baseCreateProjectPackage(name);
      return {
        ...base,
        unifiedPdfNavigation:
          options.navigation.createSnapshot(),
      } as ProjectWithUnifiedPdf;
    };

    options.projectPackage.restoreProjectPackage = async (
      project: FrameLogicProjectPackage,
    ): Promise<void> => {
      await this.baseRestoreProjectPackage(project);
      const extended = project as ProjectWithUnifiedPdf;
      options.generalPdf.importLegacyAssemblyPdf(
        extended.assemblyPdf,
      );
      options.navigation.restoreSnapshot(
        extended.unifiedPdfNavigation,
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
  }
}
