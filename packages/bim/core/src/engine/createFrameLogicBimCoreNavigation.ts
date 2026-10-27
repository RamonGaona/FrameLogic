import {
  createBimCore as createDrawingBimCore,
} from "./createFrameLogicBimCoreDrawing";

import type {
  PrecisionBimCoreInstance as DrawingPrecisionBimCoreInstance,
} from "./createFrameLogicBimCoreDrawing";

import {
  getActiveCadReferenceBlockController,
} from "../import/CadReferenceTransformController";

import {
  InstanceTreeController,
} from "../navigation/InstanceTreeController";

import {
  AlignController,
} from "../interaction/AlignController";

import {
  SmartPieceInsertionController,
} from "../interaction/SmartPieceInsertionController";

import {
  MoveRulerExperienceController,
} from "../interaction/MoveRulerExperienceController";

export type PrecisionBimCoreInstance =
  DrawingPrecisionBimCoreInstance
  & {
    readonly instanceTree:
      InstanceTreeController;
    readonly align:
      AlignController;
    readonly smartPieceInsertion:
      SmartPieceInsertionController;
  };

export async function createBimCore(
  container: HTMLElement,
): Promise<PrecisionBimCoreInstance> {
  const core = await createDrawingBimCore(container);
  const cadReferenceBlocks =
    getActiveCadReferenceBlockController();

  if (!cadReferenceBlocks) {
    core.dispose();
    throw new Error(
      "FrameLogic navigation requires the CAD reference block controller.",
    );
  }

  const renderer = core.world.renderer;
  if (!renderer) {
    core.dispose();
    throw new Error(
      "FrameLogic navigation requires an initialized renderer.",
    );
  }

  const canvas = renderer.three.domElement;

  const smartPieceInsertion =
    new SmartPieceInsertionController({
      container,
      canvas,
      scene: core.world.scene.three,
      cameraProvider: () =>
        core.world.camera.three,
      designModel: core.designModel,
      designScene: core.designScene,
      workPlane: core.cadWorkPlane,
      findSnapPoint: (
        clientX,
        clientY,
      ) =>
        core.snapEngine
          .findSnap(clientX, clientY)
          ?.point
          .clone()
        ?? null,
      beforeStart: () => {
        core.cancelActiveCadCommand();
        core.cancelDesignPiecePlacement();
      },
    });

  const moveRuler =
    new MoveRulerExperienceController({
      container,
    });

  const instanceTree = new InstanceTreeController({
    container,
    canvas,
    designModel: core.designModel,
    designScene: core.designScene,
    designSelection: core.designSelection,
    cadReferenceBlocks,
    cancelActiveCommand: () =>
      core.cancelActiveCadCommand(),
  });

  const disposePieceVisibilityUi =
    installPieceVisibilityUi(
      container,
      canvas,
      core,
      instanceTree,
    );

  const align = new AlignController({
    container,
    canvas,
    designModel: core.designModel,
    designScene: core.designScene,
    designSelection: core.designSelection,
    cadReferenceBlocks,
    cancelActiveCommand: () =>
      core.cancelActiveCadCommand(),
    clearGeometryQueryCache: () =>
      core.geometryQuery.clearCache(),
    findSnapPoint: (
      clientX,
      clientY,
    ) =>
      core.snapEngine
        .findSnap(clientX, clientY)
        ?.point
        .clone()
      ?? null,
  });

  /*
   * La UI web importa primero la PieceDefinition y luego crea una instancia
   * inicial en 0,0,0. Marcamos únicamente esa siguiente creación para
   * reemplazarla visualmente por el flujo de inserción inteligente sin tocar
   * restauración de proyectos ni PASTE.
   */
  let pendingInitialPlacementDefinitionId:
    string | null = null;

  const baseImportStepPiece =
    core.importStepPiece.bind(core);
  const importStepPiece:
    DrawingPrecisionBimCoreInstance["importStepPiece"] =
    (document, input) => {
      const imported = baseImportStepPiece(document, input);
      pendingInitialPlacementDefinitionId =
        imported.definition.id;
      return imported;
    };

  const baseImportDesignPieceIfc =
    core.importDesignPieceIfc.bind(core);
  const importDesignPieceIfc:
    DrawingPrecisionBimCoreInstance["importDesignPieceIfc"] =
    async (file, input) => {
      const imported =
        await baseImportDesignPieceIfc(file, input);
      pendingInitialPlacementDefinitionId =
        imported.definition.id;
      return imported;
    };

  const baseCreateDesignPieceInstance =
    core.createDesignPieceInstance.bind(core);
  const createDesignPieceInstance:
    DrawingPrecisionBimCoreInstance["createDesignPieceInstance"] =
    (input) => {
      const instance =
        baseCreateDesignPieceInstance(input);

      if (
        pendingInitialPlacementDefinitionId
        === input.definitionId
      ) {
        pendingInitialPlacementDefinitionId = null;
        const placeholderObject =
          core.designScene.getInstanceObject(instance.id);
        if (placeholderObject) {
          placeholderObject.visible = false;
        }

        window.setTimeout(() => {
          void smartPieceInsertion
            .start(input.definitionId)
            .then((placed) => {
              if (placed) {
                core.removeDesignPieceInstance(instance.id);
              }
              else {
                /* Cancelar conserva la instancia inicial en 0,0,0. */
                core.designScene.sync();
              }
              core.geometryQuery.clearCache();
              instanceTree.refresh();
            })
            .catch((error) => {
              console.error(
                "Smart initial piece insertion failed:",
                error,
              );
              core.designScene.sync();
            });
        }, 0);
      }

      return instance;
    };

  const startDesignPiecePlacement = (
    definitionId: string,
  ) => smartPieceInsertion.start(definitionId);

  const cancelDesignPiecePlacement = (): void => {
    smartPieceInsertion.cancel();
    core.cancelDesignPiecePlacement();
  };

  const baseDispose = core.dispose;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    disposePieceVisibilityUi();
    moveRuler.dispose();
    smartPieceInsertion.dispose();
    align.dispose();
    instanceTree.dispose();
    baseDispose();
  };

  return {
    ...core,
    importStepPiece,
    importDesignPieceIfc,
    createDesignPieceInstance,
    startDesignPiecePlacement,
    cancelDesignPiecePlacement,
    instanceTree,
    align,
    smartPieceInsertion,
    dispose,
  };
}


function installPieceVisibilityUi(
  container: HTMLElement,
  canvas: HTMLElement,
  core: DrawingPrecisionBimCoreInstance,
  instanceTree: InstanceTreeController,
): () => void {
  let contextMenu:
    HTMLDivElement | null = null;

  const page =
    container.parentElement;

  const hideLegacyModelPanel =
    (): void => {
      const panel =
        page?.querySelector<HTMLElement>(
          ".model-panel",
        );

      if (!panel) {
        return;
      }

      panel.hidden = true;
      panel.style.display = "none";
      panel.setAttribute(
        "aria-hidden",
        "true",
      );
    };

  const hideContextMenu =
    (): void => {
      contextMenu?.remove();
      contextMenu = null;
    };

  const setPieceVisible =
    (
      instanceId: string,
      visible: boolean,
    ): void => {
      if (!visible) {
        const remaining =
          core.designSelection
            .getSelectedIds()
            .filter(
              (
                selectedId,
              ) =>
                selectedId !== instanceId,
            );

        core.designSelection
          .setSelection(
            remaining,
          );
      }

      core.designScene
        .setInstanceVisible(
          instanceId,
          visible,
        );

      core.designSelection
        .refreshHelpers();

      core.geometryQuery
        .clearCache();

      instanceTree.refresh();
    };

  const getPieceName =
    (
      instanceId: string,
    ): string => {
      const instance =
        core.designModel
          .pieceInstances
          .get(
            instanceId,
          );

      if (!instance) {
        return "Pieza";
      }

      const definition =
        core.designModel
          .pieceDefinitions
          .get(
            instance.definitionId,
          );

      return instance.name?.trim()
        || definition?.name
        || definition?.code
        || "Pieza";
    };

  const refreshEyes =
    (): void => {
      hideLegacyModelPanel();

      const body =
        container.querySelector<HTMLElement>(
          '[data-framelogic-instance-tree-body="true"]',
        );

      if (!body) {
        return;
      }

      const spans =
        Array.from(
          body.querySelectorAll<HTMLSpanElement>(
            "span",
          ),
        );

      for (
        const instance
        of core.designModel
          .pieceInstances
          .getAll()
      ) {
        const prefix =
          instance.id.slice(
            0,
            8,
          );

        const meta =
          spans.find(
            (
              span,
            ) =>
              span.textContent === prefix,
          );

        const row =
          meta?.parentElement;

        if (!row) {
          continue;
        }

        let button =
          Array.from(
            row.querySelectorAll<HTMLButtonElement>(
              "button[data-framelogic-instance-visibility]",
            ),
          ).find(
            (
              candidate,
            ) =>
              candidate.dataset[
                "framelogicInstanceVisibility"
              ] === instance.id,
          );

        if (!button) {
          button =
            document.createElement(
              "button",
            );

          button.type = "button";
          button.dataset[
            "framelogicInstanceVisibility"
          ] = instance.id;

          Object.assign(
            button.style,
            {
              width: "24px",
              height: "22px",
              padding: "0",
              border: "0",
              borderRadius: "3px",
              background: "transparent",
              color: "#dce8ed",
              cursor: "pointer",
              font: "13px system-ui, sans-serif",
              lineHeight: "22px",
              textAlign: "center",
            },
          );

          button.addEventListener(
            "pointerdown",
            (
              event,
            ) => {
              event.stopPropagation();
            },
          );

          button.addEventListener(
            "contextmenu",
            (
              event,
            ) => {
              event.preventDefault();
              event.stopPropagation();
            },
          );

          button.addEventListener(
            "click",
            (
              event,
            ) => {
              event.preventDefault();
              event.stopPropagation();

              setPieceVisible(
                instance.id,
                !core.designScene
                  .isInstanceVisible(
                    instance.id,
                  ),
              );
            },
          );

          row.style.gridTemplateColumns =
            "auto minmax(0, 1fr) auto";
          row.style.gap =
            "6px";

          row.insertBefore(
            button,
            row.firstElementChild,
          );
        }

        const visible =
          core.designScene
            .isInstanceVisible(
              instance.id,
            );

        button.textContent =
          visible
            ? "👁"
            : "◌";

        button.title =
          visible
            ? "Ocultar instancia"
            : "Mostrar instancia";

        button.setAttribute(
          "aria-label",
          visible
            ? `Ocultar ${getPieceName(instance.id)}`
            : `Mostrar ${getPieceName(instance.id)}`,
        );

        row.style.opacity =
          visible
            ? "1"
            : "0.62";
      }
    };

  const showCanvasVisibilityMenu =
    (
      instanceId: string,
      x: number,
      y: number,
    ): void => {
      hideContextMenu();

      const visible =
        core.designScene
          .isInstanceVisible(
            instanceId,
          );

      const menu =
        document.createElement(
          "div",
        );

      Object.assign(
        menu.style,
        {
          position: "fixed",
          left: `${x}px`,
          top: `${y}px`,
          zIndex: "10020",
          minWidth: "190px",
          padding: "4px",
          border: "1px solid rgba(255,255,255,0.18)",
          borderRadius: "5px",
          background: "rgba(19,27,33,0.98)",
          boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
          font: "12px system-ui, sans-serif",
        },
      );

      const title =
        document.createElement(
          "div",
        );
      title.textContent =
        getPieceName(
          instanceId,
        );
      Object.assign(
        title.style,
        {
          padding: "5px 8px",
          color: "#94a8b3",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        },
      );

      const action =
        document.createElement(
          "button",
        );
      action.type = "button";
      action.textContent =
        visible
          ? "◌  Ocultar pieza"
          : "👁  Mostrar pieza";
      Object.assign(
        action.style,
        {
          display: "block",
          width: "100%",
          padding: "7px 8px",
          border: "0",
          borderRadius: "3px",
          background: "transparent",
          color: "#e7f0f4",
          textAlign: "left",
          cursor: "pointer",
          font: "12px system-ui, sans-serif",
        },
      );

      action.addEventListener(
        "click",
        () => {
          setPieceVisible(
            instanceId,
            !visible,
          );
          hideContextMenu();
        },
      );

      menu.append(
        title,
        action,
      );
      document.body.append(
        menu,
      );
      contextMenu =
        menu;
    };

  const handleCanvasContextMenu =
    (
      event: MouseEvent,
    ): void => {
      const instanceId =
        core.designSelection
          .getInstanceIdAt(
            event.clientX,
            event.clientY,
          );

      if (!instanceId) {
        hideContextMenu();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      showCanvasVisibilityMenu(
        instanceId,
        event.clientX,
        event.clientY,
      );
    };

  const handleGlobalPointerDown =
    (
      event: PointerEvent,
    ): void => {
      if (
        contextMenu
        && event.target instanceof Node
        && !contextMenu.contains(
          event.target,
        )
      ) {
        hideContextMenu();
      }
    };

  const body =
    container.querySelector<HTMLElement>(
      '[data-framelogic-instance-tree-body="true"]',
    );

  const observer =
    new MutationObserver(
      () => {
        queueMicrotask(
          refreshEyes,
        );
      },
    );

  if (body) {
    observer.observe(
      body,
      {
        childList: true,
        subtree: true,
      },
    );
  }

  const unsubscribeVisibility =
    core.designScene
      .subscribeInstanceVisibility(
        () => {
          refreshEyes();
        },
      );

  const timer =
    window.setInterval(
      refreshEyes,
      500,
    );

  canvas.addEventListener(
    "contextmenu",
    handleCanvasContextMenu,
    true,
  );

  window.addEventListener(
    "pointerdown",
    handleGlobalPointerDown,
    true,
  );

  hideLegacyModelPanel();
  refreshEyes();

  return () => {
    observer.disconnect();
    unsubscribeVisibility();
    window.clearInterval(
      timer,
    );
    canvas.removeEventListener(
      "contextmenu",
      handleCanvasContextMenu,
      true,
    );
    window.removeEventListener(
      "pointerdown",
      handleGlobalPointerDown,
      true,
    );
    hideContextMenu();
  };
}
