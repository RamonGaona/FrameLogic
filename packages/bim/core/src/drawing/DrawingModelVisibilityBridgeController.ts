import type {
  DesignModel,
} from "@framelogic/domain";

import type {
  DesignSceneController,
} from "../design/DesignSceneController";

import type {
  DrawingWorkspaceController,
} from "./DrawingWorkspaceController";

import type {
  SectionViewDefinition,
} from "./SectionDrawingController";

interface DrawingWorkspaceRuntime {
  buildSnapshot(section: SectionViewDefinition): unknown;
  pickReference(x: number, y: number): unknown;
}

interface Options {
  readonly designModel: DesignModel;
  readonly designScene: DesignSceneController;
  readonly drawingWorkspace: DrawingWorkspaceController;
}

/**
 * Separa la visibilidad temporal del Model Space de la documentación.
 *
 * Los ojos de INSTANCIAS pueden poner una PieceInstance en invisible para el
 * visor, pero una hoja/PDF debe seguir documentando esa pieza. Para no romper
 * la semántica de capas, solo reactivamos temporalmente las instancias cuya
 * capa del proyecto está visible; una capa apagada continúa fuera del plano.
 *
 * La restauración ocurre en el mismo stack síncrono, por lo que el usuario no
 * ve ningún destello en Model Space.
 */
export class DrawingModelVisibilityBridgeController {
  private readonly options: Options;
  private readonly runtime: DrawingWorkspaceRuntime;
  private readonly baseBuildSnapshot: DrawingWorkspaceRuntime["buildSnapshot"];
  private readonly basePickReference: DrawingWorkspaceRuntime["pickReference"];
  private disposed = false;

  constructor(options: Options) {
    this.options = options;
    this.runtime =
      options.drawingWorkspace as unknown as DrawingWorkspaceRuntime;

    this.baseBuildSnapshot =
      this.runtime.buildSnapshot.bind(this.runtime);
    this.basePickReference =
      this.runtime.pickReference.bind(this.runtime);

    this.runtime.buildSnapshot = (
      section: SectionViewDefinition,
    ): unknown =>
      this.withDocumentationVisibility(
        () => this.baseBuildSnapshot(section),
      );

    this.runtime.pickReference = (
      x: number,
      y: number,
    ): unknown =>
      this.withDocumentationVisibility(
        () => this.basePickReference(x, y),
      );
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.runtime.buildSnapshot = this.baseBuildSnapshot;
    this.runtime.pickReference = this.basePickReference;
  }

  private withDocumentationVisibility<T>(action: () => T): T {
    const states: Array<{
      readonly object: THREE.Object3D;
      readonly visible: boolean;
    }> = [];

    for (const [instanceId, object] of this.options.designScene.getInstanceEntries()) {
      states.push({ object, visible: object.visible });

      const instance = this.options.designModel.pieceInstances.get(instanceId);
      const layer = instance
        ? this.options.designModel.layers.get(instance.layerId)
        : undefined;

      if (instance && layer?.visible !== false) {
        object.visible = true;
      }
    }

    try {
      return action();
    }
    finally {
      for (const state of states) {
        state.object.visible = state.visible;
      }
    }
  }
}
