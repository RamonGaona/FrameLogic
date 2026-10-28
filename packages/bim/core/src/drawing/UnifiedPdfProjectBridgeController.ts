import type {
  FrameLogicProjectPackage,
  FrameLogicProjectPackageController,
} from "../project/FrameLogicProjectPackageController";

import type {
  UnifiedPdfNavigationController,
  UnifiedPdfNavigationSnapshot,
} from "./UnifiedPdfNavigationController";

interface UnifiedPdfProjectBridgeControllerOptions {
  readonly projectPackage: FrameLogicProjectPackageController;
  readonly navigation: UnifiedPdfNavigationController;
}

type ProjectWithUnifiedPdf =
  FrameLogicProjectPackage
  & {
    readonly unifiedPdfNavigation?: UnifiedPdfNavigationSnapshot;
  };

/**
 * Persiste únicamente el orden global de navegación PDF.
 * El contenido real de secciones y ensambles continúa guardándose en sus
 * snapshots propios; por tanto este índice agrega solo unas pocas cadenas al
 * proyecto y no duplica geometría ni hojas.
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
      options.navigation.restoreSnapshot(
        (project as ProjectWithUnifiedPdf).unifiedPdfNavigation,
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
