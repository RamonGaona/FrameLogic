import { mountAutomationPanel } from "./mountAutomationPanel";
import { connectAutomationBridge } from "@framelogic/bim-core";
import { loadPieceVisualPackage, type LoadedPieceVisualPackage } from "@framelogic/bim-core";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
} from "react";

import {
  createBimCore,
} from "@framelogic/bim-core";

import type {
  CadWorkPlaneEditState,
  CadWorkPlaneMode,
  CameraOrientation,
  CardinalDirection,
  DesignLayer,
  LoadedModelInfo,
  PieceDefinitionOriginEditState,
  PieceDefinitionPreparationState,
  PrecisionBimCoreInstance,
  StandardView,
} from "@framelogic/bim-core";

import {
  ModelPanel,
} from "./components/ModelPanel";

import type {
  PiecePanelItem,
} from "./components/ModelPanel";

import {
  LayerPanel,
} from "./components/LayerPanel";

import {
  ViewCube,
} from "./components/ViewCube";

import {
  OcctStepGeometryAdapter,
} from "./step/OcctStepGeometryAdapter";

import {
  decodeFrameLogicPieceGeometry,
  parseFrameLogicPiecePackage,
} from "./pieces/FrameLogicPiecePackage";

import type {
  FrameLogicPiecePackage,
} from "./pieces/FrameLogicPiecePackage";


interface ActivePieceInfo {
  definitionId: string;
  code: string;
  name: string;
  instanceCount: number;
}


interface PieceIdentity {
  code: string;
  name: string;
  classification?: string;
  tags: string[];
}


interface PieceDefinitionSummary {
  id: string;
  code: string;
  name: string;
}


interface PieceContextMenuState {
  id: string;
  name: string;
  visible: boolean;
  x: number;
  y: number;
}


function defaultPieceCode(
  fileName: string,
): string {
  return fileName
    .replace(
      /\.(?:step|stp|ifc)$/i,
      "",
    )
    .trim()
    .replace(
      /\s+/g,
      "_",
    )
    .toUpperCase();
}


function isStepFile(
  fileName: string,
): boolean {
  return /\.(?:step|stp)$/i.test(
    fileName,
  );
}


function isIfcFile(
  fileName: string,
): boolean {
  return /\.ifc$/i.test(
    fileName,
  );
}


function requestPieceIdentity(
  fileName: string,
): PieceIdentity | null {
  const defaultCode =
    defaultPieceCode(
      fileName,
    );

  const codeInput =
    window.prompt(
      "Código de la pieza:",
      defaultCode,
    );
  const code =
    codeInput?.trim();

  if (!code) {
    return null;
  }

  const nameInput =
    window.prompt(
      "Nombre de la pieza:",
      code,
    );

  if (nameInput === null) {
    return null;
  }

  const classificationInput =
    window.prompt(
      "Clasificación opcional:",
      "",
    );

  if (classificationInput === null) {
    return null;
  }

  return {
    code,
    name:
      nameInput.trim()
      || code,
    classification:
      classificationInput.trim()
      || undefined,
    tags: [],
  };
}


export function BimViewport() {
  const containerRef =
    useRef<HTMLDivElement>(
      null,
    );

  const referenceFileInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const importPieceFileInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const openFrameLogicPieceInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const bimCoreRef =
    useRef<PrecisionBimCoreInstance | null>(
      null,
    );

  const hiddenPieceIdsRef =
    useRef<Set<string>>(
      new Set(),
    );

  const [cameraOrientation, setCameraOrientation] =
    useState<CameraOrientation>({
      azimuth:
        Math.PI / 4,
      polar:
        Math.PI / 3,
    });

  const [projectionMode, setProjectionMode] =
    useState<
      "PERSPECTIVE"
      | "ORTHOGRAPHIC"
    >(
      "ORTHOGRAPHIC",
    );

  const [loadingReference, setLoadingReference] =
    useState(false);

  const [importingPiece, setImportingPiece] =
    useState(false);

  const [openingFrameLogicPiece, setOpeningFrameLogicPiece] =
    useState(false);

  const [models, setModels] =
    useState<LoadedModelInfo[]>(
      [],
    );

  const [pieces, setPieces] =
    useState<PiecePanelItem[]>(
      [],
    );

  const [pieceContextMenu, setPieceContextMenu] =
    useState<PieceContextMenuState | null>(
      null,
    );

  const [layers, setLayers] =
    useState<DesignLayer[]>(
      [],
    );

  const [activeLayerId, setActiveLayerId] =
    useState(
      "reference-cad",
    );

  const [workPlaneMode, setWorkPlaneMode] =
    useState<CadWorkPlaneMode>(
      "XY",
    );

  const [workPlaneEdit, setWorkPlaneEdit] =
    useState<CadWorkPlaneEditState>({
      mode:
        "NONE",
      pointCount:
        0,
      message:
        "",
    });

  const [activePiece, setActivePiece] =
    useState<ActivePieceInfo | null>(
      null,
    );

  const [piecePreparation, setPiecePreparation] =
    useState<PieceDefinitionPreparationState>({
      active:
        false,
      instanceId:
        null,
      definitionId:
        null,
      code:
        null,
      name:
        null,
      snapCount:
        0,
      axisCount:
        0,
    });

  const [pieceOriginEdit, setPieceOriginEdit] =
    useState<PieceDefinitionOriginEditState>({
      active:
        false,
      message:
        "",
    });

  const [placingPiece, setPlacingPiece] =
    useState(false);


  useEffect(
    () => {

      if (
        !pieceContextMenu
      ) {
        return;
      }


      const close =
        (): void => {
          setPieceContextMenu(
            null,
          );
        };


      const handleKeyDown =
        (
          event:
            KeyboardEvent,
        ): void => {

          if (
            event.key === "Escape"
          ) {
            close();
          }

        };


      window.addEventListener(
        "pointerdown",
        close,
      );
      window.addEventListener(
        "resize",
        close,
      );
      window.addEventListener(
        "blur",
        close,
      );
      window.addEventListener(
        "keydown",
        handleKeyDown,
      );


      return () => {
        window.removeEventListener(
          "pointerdown",
          close,
        );
        window.removeEventListener(
          "resize",
          close,
        );
        window.removeEventListener(
          "blur",
          close,
        );
        window.removeEventListener(
          "keydown",
          handleKeyDown,
        );
      };

    },
    [pieceContextMenu],
  );


  function handleCardinalDirection(
    direction: CardinalDirection,
  ): void {
    void bimCoreRef.current
      ?.setCardinalDirection(
        direction,
      );
  }


  function handleStandardView(
    view: StandardView,
  ): void {
    void bimCoreRef.current
      ?.setStandardView(
        view,
      );
  }


  async function handleToggleProjection():
    Promise<void> {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    try {
      const mode =
        await bimCore.toggleCameraProjection();

      setProjectionMode(
        mode,
      );
    }
    catch (
      error
    ) {
      console.error(
        "Error changing camera projection:",
        error,
      );
    }
  }


  function refreshModels(): void {
    const bimCore =
      bimCoreRef.current;

    setModels(
      bimCore
        ? bimCore.getLoadedModels()
        : [],
    );
  }


  function refreshPieces(): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      setPieces([]);
      return;
    }


    const instances =
      bimCore.designModel
        .pieceInstances
        .getAll();

    const activeIds =
      new Set(
        instances.map(
          (
            instance,
          ) =>
            instance.id,
        ),
      );


    for (
      const hiddenId
      of Array.from(
        hiddenPieceIdsRef.current,
      )
    ) {
      if (
        !activeIds.has(
          hiddenId,
        )
      ) {
        hiddenPieceIdsRef.current
          .delete(
            hiddenId,
          );
      }
    }


    setPieces(
      instances.map(
        (
          instance,
          index,
        ) => {
          const definition =
            bimCore.designModel
              .pieceDefinitions
              .get(
                instance.definitionId,
              );

          return {
            id:
              instance.id,
            name:
              instance.name?.trim()
              || definition?.name
              || definition?.code
              || `Pieza ${index + 1}`,
            code:
              definition?.code
              || "PIEZA",
            layerId:
              instance.layerId,
            visible:
              !hiddenPieceIdsRef.current
                .has(
                  instance.id,
                ),
          };
        },
      ),
    );
  }


  function refreshLayers(): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      setLayers([]);
      return;
    }

    setLayers(
      bimCore.getDesignLayers(),
    );
    setActiveLayerId(
      bimCore.getActiveDesignLayerId(),
    );
  }


  function handlePieceVisibilityChange(
    instanceId: string,
    visible: boolean,
  ): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }


    if (visible) {
      hiddenPieceIdsRef.current
        .delete(
          instanceId,
        );
    }
    else {
      hiddenPieceIdsRef.current
        .add(
          instanceId,
        );

      const remainingSelection =
        bimCore.designSelection
          .getSelectedIds()
          .filter(
            (
              selectedId,
            ) =>
              selectedId
              !== instanceId,
          );

      bimCore.designSelection
        .setSelection(
          remainingSelection,
        );
    }


    bimCore.designScene
      .sync();

    bimCore.pieceDefinitionHelpers
      .sync();

    bimCore.designSelection
      .refreshHelpers();

    refreshPieces();

    setPieceContextMenu(
      null,
    );
  }


  function handleViewportContextMenu(
    event:
      ReactMouseEvent<HTMLDivElement>,
  ): void {
    event.preventDefault();


    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      setPieceContextMenu(
        null,
      );
      return;
    }


    const instanceId =
      bimCore.designSelection
        .getInstanceIdAt(
          event.clientX,
          event.clientY,
        );

    if (!instanceId) {
      setPieceContextMenu(
        null,
      );
      return;
    }


    const piece =
      pieces.find(
        (
          item,
        ) =>
          item.id
          === instanceId,
      );

    if (!piece) {
      setPieceContextMenu(
        null,
      );
      return;
    }


    event.stopPropagation();

    setPieceContextMenu({
      id:
        piece.id,
      name:
        piece.name,
      visible:
        piece.visible,
      x:
        event.clientX,
      y:
        event.clientY,
    });
  }


  function handleCreateLayer(): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    const name =
      window.prompt(
        "Nombre del layer:",
        "",
      )?.trim();

    if (!name) {
      return;
    }

    try {
      const layer =
        bimCore.createDesignLayer({
          name,
        });

      bimCore.setActiveDesignLayer(
        layer.id,
      );
    }
    catch (
      error
    ) {
      window.alert(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }


  function handleSetActiveLayer(
    layerId: string,
  ): void {
    bimCoreRef.current
      ?.setActiveDesignLayer(
        layerId,
      );
  }


  function handleLayerVisibilityChange(
    layerId: string,
    visible: boolean,
  ): void {
    bimCoreRef.current
      ?.updateDesignLayer(
        layerId,
        {
          visible,
        },
      );
  }


  function handleLayerLockChange(
    layerId: string,
    locked: boolean,
  ): void {
    bimCoreRef.current
      ?.updateDesignLayer(
        layerId,
        {
          locked,
        },
      );
  }


  function handleLayerSnapChange(
    layerId: string,
    snapEnabled: boolean,
  ): void {
    bimCoreRef.current
      ?.updateDesignLayer(
        layerId,
        {
          snapEnabled,
        },
      );
  }


  function handleRemoveLayer(
    layerId: string,
  ): void {
    try {
      bimCoreRef.current
        ?.removeDesignLayer(
          layerId,
        );
    }
    catch (
      error
    ) {
      window.alert(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }


  function handleAssignSelectionToLayer(
    layerId: string,
  ): void {
    try {
      bimCoreRef.current
        ?.assignCadSelectionToLayer(
          layerId,
        );
    }
    catch (
      error
    ) {
      window.alert(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }


  function handleStartPiecePreparation(): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    try {
      setPiecePreparation(
        bimCore.startPieceDefinitionPreparation(),
      );
    }
    catch (
      error
    ) {
      window.alert(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }


  function handleStopPiecePreparation(): void {
    bimCoreRef.current
      ?.stopPieceDefinitionPreparation();
  }


  function handleSetPreparedPieceOrigin(): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    try {
      setPiecePreparation(
        bimCore.setPreparedPieceOriginFromSelectedPoint(),
      );
    }
    catch (
      error
    ) {
      window.alert(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }


  function handleStartPreparedPieceOriginSnap(): void {
    try {
      bimCoreRef.current
        ?.startPreparedPieceOriginSnapEdit();
    }
    catch (
      error
    ) {
      window.alert(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }


  function handleAddPreparedPieceSnaps(): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    try {
      const added =
        bimCore.addPreparedPieceSnapsFromSelection();

      if (added < 1) {
        window.alert(
          "No se agregó ningún SNAP nuevo. Puede que el punto ya exista en la definición.",
        );
      }
    }
    catch (
      error
    ) {
      window.alert(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }


  function handleAddPreparedPieceAxes(): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    try {
      const added =
        bimCore.addPreparedPieceAxesFromSelection();

      if (added < 1) {
        window.alert(
          "No se agregó ningún eje de referencia.",
        );
      }
    }
    catch (
      error
    ) {
      window.alert(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }


  function handleCycleWorkPlane(): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    bimCore.cancelCadWorkPlaneEdit();
    setWorkPlaneMode(
      bimCore.cycleCadWorkPlane(),
    );
  }


  function handleSetWorkPlaneOrigin(): void {
    bimCoreRef.current
      ?.startCadWorkPlaneOriginEdit();
  }


  function handleSetWorkPlaneThreePoints(): void {
    bimCoreRef.current
      ?.startCadWorkPlaneThreePointEdit();
  }


  function handleStartPoint(): void {
    const started =
      bimCoreRef.current
        ?.startPointCommand()
      ?? false;

    if (!started) {
      window.alert(
        "No se pudo iniciar POINT. Revisa que el layer activo no esté bloqueado.",
      );
    }
  }


  function handleStartLine(): void {
    const started =
      bimCoreRef.current
        ?.startLineCommand()
      ?? false;

    if (!started) {
      window.alert(
        "No se pudo iniciar LINE. Revisa que el layer activo no esté bloqueado.",
      );
    }
  }


  useEffect(
    () => {
      const container =
        containerRef.current;

      if (!container) {
        return;
      }

      let disposed =
        false;

      let unsubscribeCamera:
        (() => void)
        | null = null;
      let unsubscribeLayers:
        (() => void)
        | null = null;
      let unsubscribeDesignSelection:
        (() => void)
        | null = null;
      let unsubscribeWorkPlane:
        (() => void)
        | null = null;
      let unsubscribeWorkPlaneEdit:
        (() => void)
        | null = null;
      let unsubscribePiecePreparation:
        (() => void)
        | null = null;
      let unsubscribePieceOriginEdit:
        (() => void)
        | null = null;

      void createBimCore(
        container,
      )
        .then(
          (
            instance,
          ) => {
            if (disposed) {
              instance.dispose();
              return;
            }

            bimCoreRef.current =
              instance;
            const disposeAutomationPanel = mountAutomationPanel(instance);
            const disposeWithPanel = instance.dispose;
            instance.dispose = () => { disposeAutomationPanel(); disposeWithPanel(); };
            if (import.meta.env.DEV) {
              let disconnect: (() => void) | undefined;
              const devWindow = window as typeof window & { frameLogicConnectAutomation?: (token: string) => void };
              devWindow.frameLogicConnectAutomation = token => {
                disconnect?.();
                disconnect = connectAutomationBridge(instance.automation, token,
                  summary => window.confirm("FrameLogic: aprobar modificación del modelo?\n" + JSON.stringify(summary, null, 2)));
              };
              const baseDispose = instance.dispose;
              instance.dispose = () => {
                disconnect?.(); delete devWindow.frameLogicConnectAutomation; baseDispose();
              };
            }

            instance.designScene
              .setVisibilityFilter(
                (
                  instanceId,
                ) =>
                  !hiddenPieceIdsRef.current
                    .has(
                      instanceId,
                    ),
              );

            setModels(
              instance.getLoadedModels(),
            );
            refreshPieces();
            setLayers(
              instance.getDesignLayers(),
            );
            setActiveLayerId(
              instance.getActiveDesignLayerId(),
            );
            setWorkPlaneMode(
              instance.getCadWorkPlaneState().mode,
            );
            setWorkPlaneEdit(
              instance.getCadWorkPlaneEditState(),
            );
            setPiecePreparation(
              instance.getPieceDefinitionPreparationState(),
            );
            setPieceOriginEdit(
              instance.getPieceDefinitionOriginEditState(),
            );
            setProjectionMode(
              instance.getCameraProjectionMode(),
            );

            unsubscribeLayers =
              instance.subscribeDesignLayers(
                () => {
                  if (!disposed) {
                    refreshLayers();
                    refreshModels();
                    refreshPieces();
                  }
                },
              );

            unsubscribeDesignSelection =
              instance.designSelection
                .subscribe(
                  () => {
                    if (!disposed) {
                      refreshPieces();
                    }
                  },
                );

            unsubscribeWorkPlane =
              instance.subscribeCadWorkPlane(
                (
                  state,
                ) => {
                  if (!disposed) {
                    setWorkPlaneMode(
                      state.mode,
                    );
                  }
                },
              );

            unsubscribeWorkPlaneEdit =
              instance.subscribeCadWorkPlaneEdit(
                (
                  state,
                ) => {
                  if (!disposed) {
                    setWorkPlaneEdit(
                      state,
                    );
                  }
                },
              );

            unsubscribePiecePreparation =
              instance.subscribePieceDefinitionPreparation(
                (
                  state,
                ) => {
                  if (!disposed) {
                    setPiecePreparation(
                      state,
                    );
                  }
                },
              );

            unsubscribePieceOriginEdit =
              instance.subscribePieceDefinitionOriginEdit(
                (
                  state,
                ) => {
                  if (!disposed) {
                    setPieceOriginEdit(
                      state,
                    );
                  }
                },
              );

            unsubscribeCamera =
              instance.subscribeCameraOrientation(
                (
                  orientation,
                ) => {
                  if (!disposed) {
                    setCameraOrientation(
                      orientation,
                    );
                  }
                },
              );

            // React paints the initial legacy toolbar before the async 3D
            // engine finishes. Reveal the chrome only after the core exists.
            // The layout adapter supplies the second readiness condition.
            document.documentElement.setAttribute(
              "data-framelogic-bim-core-ready",
              "true",
            );
          },
        )
        .catch(
          (
            error: unknown,
          ) => {
            console.error(
              "Error initializing FrameLogic BIM Core:",
              error,
            );
          },
        );

      return () => {
        disposed =
          true;
        document.documentElement.removeAttribute(
          "data-framelogic-bim-core-ready",
        );

        unsubscribeCamera?.();
        unsubscribeLayers?.();
        unsubscribeDesignSelection?.();
        unsubscribeWorkPlane?.();
        unsubscribeWorkPlaneEdit?.();
        unsubscribePiecePreparation?.();
        unsubscribePieceOriginEdit?.();

        bimCoreRef.current
          ?.dispose();
        bimCoreRef.current =
          null;
      };
    },
    [],
  );


  function handleOpenReferenceIfc(): void {
    referenceFileInputRef.current
      ?.click();
  }


  async function handleReferenceIfcSelected(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      event.target.value =
        "";
      return;
    }

    try {
      setLoadingReference(
        true,
      );

      await bimCore.loadIfcFile(
        file,
      );
      refreshModels();
    }
    catch (
      error
    ) {
      console.error(
        "Error loading reference IFC:",
        error,
      );
      window.alert(
        "No se pudo cargar el IFC de referencia. Revisa la consola.",
      );
    }
    finally {
      setLoadingReference(
        false,
      );
      event.target.value =
        "";
    }
  }


  function handleImportPiece(): void {
    importPieceFileInputRef.current
      ?.click();
  }


  function handleOpenFrameLogicPiece(): void {
    openFrameLogicPieceInputRef.current
      ?.click();
  }


  async function importStepDefinition(
    bimCore: PrecisionBimCoreInstance,
    data: Uint8Array,
    sourceFileName: string,
    identity: PieceIdentity,
    cachedVisuals?: LoadedPieceVisualPackage,
  ): Promise<PieceDefinitionSummary> {
    try {
      const adapter =
        new OcctStepGeometryAdapter();
      const document =
        await adapter.load(
          data,
          {
            sourceFileName,
            cachedVisuals,
            targetUnit:
              "meter",
            includeExactFeatures:
              true,
          },
        );

      const {
        definition,
      } =
        bimCore.importStepPiece(
          document,
          identity,
        );

      if (cachedVisuals) {
        const prototype = bimCore.designScene.getAssetPrototype(definition.geometryAssetId);
        if (prototype) cachedVisuals.install(prototype);
      }
      return definition;
    }
    catch (error) { cachedVisuals?.dispose(); throw error; }
  }


  async function importIfcDefinition(
    bimCore: PrecisionBimCoreInstance,
    file: File,
    identity: PieceIdentity,
  ): Promise<PieceDefinitionSummary> {
    const {
      definition,
    } =
      await bimCore.importDesignPieceIfc(
        file,
        identity,
      );

    return definition;
  }


  async function createInitialPieceInstance(
    bimCore: PrecisionBimCoreInstance,
    definition: PieceDefinitionSummary,
  ): Promise<void> {
    bimCore.createDesignPieceInstance({
      definitionId:
        definition.id,
      transform: {
        position: {
          x: 0,
          y: 0,
          z: 0,
        },
        rotation: {
          x: 0,
          y: 0,
          z: 0,
        },
      },
      tags: [],
    });

    setActivePiece({
      definitionId:
        definition.id,
      code:
        definition.code,
      name:
        definition.name,
      instanceCount:
        1,
    });

    bimCore.geometryQuery
      .clearCache();

    refreshPieces();

    await bimCore.setStandardView(
      "ISO",
    );
  }


  async function handleImportPieceSelected(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      event.target.value =
        "";
      return;
    }

    if (
      !isStepFile(
        file.name,
      )
      && !isIfcFile(
        file.name,
      )
    ) {
      window.alert(
        "Importar pieza solo acepta STEP, STP o IFC.",
      );
      event.target.value =
        "";
      return;
    }

    const identity =
      requestPieceIdentity(
        file.name,
      );

    if (!identity) {
      event.target.value =
        "";
      return;
    }

    try {
      setImportingPiece(
        true,
      );

      const definition =
        isStepFile(
          file.name,
        )
          ? await importStepDefinition(
              bimCore,
              new Uint8Array(
                await file.arrayBuffer(),
              ),
              file.name,
              identity,
            )
          : await importIfcDefinition(
              bimCore,
              file,
              identity,
            );

      await createInitialPieceInstance(
        bimCore,
        definition,
      );
    }
    catch (
      error
    ) {
      console.error(
        "Error importing external piece:",
        error,
      );

      window.alert(
        `No se pudo importar la pieza.\n\n${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
    finally {
      setImportingPiece(
        false,
      );
      event.target.value =
        "";
    }
  }


  function restoreFrameLogicMetadata(
    bimCore: PrecisionBimCoreInstance,
    definitionId: string,
    piece: FrameLogicPiecePackage,
  ): void {
    const registry =
      bimCore.designModel
        .pieceDefinitions;

    registry.updateCoordinateSystem(
      definitionId,
      piece.definition.coordinateSystem,
      false,
    );

    for (
      const snap
      of piece.definition.snapPoints
    ) {
      registry.addSnapPoint(
        definitionId,
        {
          id:
            snap.id,
          name:
            snap.name,
          type:
            snap.type,
          position: {
            ...snap.position,
          },
          relatedAxisId:
            snap.relatedAxisId,
        },
      );
    }

    for (
      const axis
      of piece.definition
        .referenceGeometry
        .axisLines
    ) {
      registry.addReferenceAxisLine(
        definitionId,
        {
          id:
            axis.id,
          name:
            axis.name,
          type:
            axis.type,
          origin: {
            ...axis.origin,
          },
          direction: {
            ...axis.direction,
          },
          length:
            axis.length,
        },
      );
    }

    bimCore.engineeringModel
      .pieces
      .upsert({
        pieceDefinitionId:
          definitionId,
        revision:
          piece.engineering.revision,
        material:
          piece.engineering.material,
        commercial:
          piece.engineering.commercial,
        physical:
          piece.engineering.physical,
        structuralAxis:
          piece.engineering.structuralAxis,
        features:
          piece.engineering.features,
      });

    bimCore.geometryQuery
      .clearCache();
  }


  async function handleFrameLogicPieceSelected(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      event.target.value =
        "";
      return;
    }

    try {
      setOpeningFrameLogicPiece(
        true,
      );

      /*
       * Esta llamada es el filtro de entrada de "Abrir pieza".
       * Un STEP/IFC suelto, JSON cualquiera, paquete no READY o paquete
       * sin metadata real se rechaza antes de crear geometría en escena.
       */
      const piece =
        parseFrameLogicPiecePackage(
          await file.text(),
        );
      const bytes =
        decodeFrameLogicPieceGeometry(
          piece,
        );
      const identity:
        PieceIdentity = {
          code:
            piece.definition.code,
          name:
            piece.definition.name,
          classification:
            piece.definition.classification,
          tags: [
            ...piece.definition.tags,
          ],
        };

      let cachedVisuals: LoadedPieceVisualPackage | undefined;
      if (piece.geometry.format === "STEP" && piece.visualRepresentations) {
        try { cachedVisuals = await loadPieceVisualPackage(piece.visualRepresentations, bytes); }
        catch (error) { console.warn("FrameLogic: cache visual descartada; se usara el STEP maestro.", error); }
      }
      const definition =
        piece.geometry.format
          === "STEP"
          ? await importStepDefinition(
              bimCore,
              bytes,
              piece.geometry.fileName,
              identity,
              cachedVisuals,
            )
          : await importIfcDefinition(
              bimCore,
              new File(
                [bytes],
                piece.geometry.fileName,
                {
                  type:
                    "application/octet-stream",
                },
              ),
              identity,
            );

      restoreFrameLogicMetadata(
        bimCore,
        definition.id,
        piece,
      );

      await createInitialPieceInstance(
        bimCore,
        definition,
      );
    }
    catch (
      error
    ) {
      console.error(
        "Error opening FrameLogic piece:",
        error,
      );

      window.alert(
        `No se puede abrir como pieza FrameLogic.\n\n${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
    finally {
      setOpeningFrameLogicPiece(
        false,
      );
      event.target.value =
        "";
    }
  }


  function handleCancelPlacement(): void {
    bimCoreRef.current
      ?.cancelDesignPiecePlacement();
  }


  async function handleInsertAnotherInstance():
    Promise<void> {
    const bimCore =
      bimCoreRef.current;

    if (
      !bimCore
      || !activePiece
    ) {
      return;
    }

    try {
      setPlacingPiece(
        true,
      );

      const instance =
        await bimCore.startDesignPiecePlacement(
          activePiece.definitionId,
        );

      if (!instance) {
        return;
      }

      setActivePiece(
        (
          current,
        ) =>
          current
            ? {
                ...current,
                instanceCount:
                  current.instanceCount + 1,
              }
            : current,
      );

      refreshPieces();
    }
    catch (
      error
    ) {
      window.alert(
        `No se pudo insertar la pieza.\n\n${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
    finally {
      setPlacingPiece(
        false,
      );
    }
  }


  function handleVisibilityChange(
    id: string,
    visible: boolean,
  ): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    bimCore.setModelVisible(
      id,
      visible,
    );
    refreshModels();
  }


  function handleModelLayerChange(
    id: string,
    layerId: string,
  ): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    try {
      bimCore.setReferenceModelLayer(
        id,
        layerId,
      );
      refreshModels();
    }
    catch (
      error
    ) {
      window.alert(
        error instanceof Error
          ? error.message
          : String(error),
      );
    }
  }


  function handleRemoveModel(
    id: string,
  ): void {
    bimCoreRef.current
      ?.removeModel(
        id,
      );
    refreshModels();
  }


  function handleClearModels(): void {
    bimCoreRef.current
      ?.clearModels();
    refreshModels();
  }


  const loading =
    loadingReference
    || importingPiece
    || openingFrameLogicPiece;


  return (
    <div
      className="bim-page"
    >
      <div
        ref={containerRef}
        className="bim-viewport"
        onContextMenu={handleViewportContextMenu}
      />

      <ViewCube
        orientation={cameraOrientation}
        projectionMode={projectionMode}
        onViewChange={handleStandardView}
        onCardinalChange={handleCardinalDirection}
        onToggleProjection={
          () => {
            void handleToggleProjection();
          }
        }
      />

      <div
        className="bim-toolbar"
      >
        <button
          type="button"
          onClick={handleOpenReferenceIfc}
          disabled={loading}
          title="Carga un IFC como referencia externa del proyecto; no lo convierte en pieza FrameLogic"
        >
          {
            loadingReference
              ? "Cargando referencia..."
              : "Abrir IFC referencia"
          }
        </button>

        <button
          type="button"
          onClick={handleImportPiece}
          disabled={loading}
          title="Importa una pieza externa STEP/STP o IFC y crea una definición nueva en FrameLogic"
        >
          {
            importingPiece
              ? "Importando pieza..."
              : "Importar pieza"
          }
        </button>

        <button
          type="button"
          onClick={handleOpenFrameLogicPiece}
          disabled={loading}
          title="Abre únicamente una pieza FrameLogic READY con geometría y metadatos de ingeniería válidos"
        >
          {
            openingFrameLogicPiece
              ? "Abriendo pieza..."
              : "Abrir pieza FrameLogic"
          }
        </button>

        <button
          type="button"
          title="Selecciona una sola pieza y entra en modo de preparación"
          onClick={handleStartPiecePreparation}
        >
          Preparar pieza
        </button>

        {
          piecePreparation.active
          && (
            <>
              <span
                title={
                  piecePreparation.name
                  ?? undefined
                }
              >
                {
                  `Prep: ${piecePreparation.code ?? ""} · ${piecePreparation.snapCount} SNAP · ${piecePreparation.axisCount} ejes`
                }
              </span>

              <button
                type="button"
                title="Selecciona exactamente un CadPoint y úsalo como origen local de la pieza"
                onClick={handleSetPreparedPieceOrigin}
              >
                Origen ← punto
              </button>

              <button
                type="button"
                className={
                  pieceOriginEdit.active
                    ? "workplane-edit-button workplane-edit-button-active"
                    : "workplane-edit-button"
                }
                title="Selecciona cualquier SNAP válido directamente sobre la geometría para definir el origen local"
                onClick={handleStartPreparedPieceOriginSnap}
              >
                Origen ← SNAP
              </button>

              {
                pieceOriginEdit.active
                && (
                  <span
                    className="workplane-edit-status"
                  >
                    {pieceOriginEdit.message}
                  </span>
                )
              }

              <button
                type="button"
                title="Convierte los CadPoint seleccionados en SNAPs persistentes de la pieza"
                onClick={handleAddPreparedPieceSnaps}
              >
                Punto → SNAP
              </button>

              <button
                type="button"
                title="Convierte las CadLine seleccionadas en ejes de referencia persistentes"
                onClick={handleAddPreparedPieceAxes}
              >
                Línea → eje
              </button>

              <button
                type="button"
                onClick={handleStopPiecePreparation}
              >
                Salir prep
              </button>
            </>
          )
        }

        <button
          type="button"
          title="POINT · tecla P"
          onClick={handleStartPoint}
        >
          POINT
        </button>

        <button
          type="button"
          title="LINE · tecla L · ORTHO 0°/90° sobre WorkPlane"
          onClick={handleStartLine}
        >
          LINE
        </button>

        <button
          type="button"
          className={
            workPlaneMode === "OFF"
              ? "workplane-button workplane-button-off"
              : "workplane-button"
          }
          title="Cambiar WorkPlane: XY → XZ → YZ → OFF"
          onClick={handleCycleWorkPlane}
        >
          {
            `WorkPlane: ${workPlaneMode}`
          }
        </button>

        <button
          type="button"
          className={
            workPlaneEdit.mode === "ORIGIN"
              ? "workplane-edit-button workplane-edit-button-active"
              : "workplane-edit-button"
          }
          title="Mover el origen del WorkPlane a un SNAP"
          onClick={handleSetWorkPlaneOrigin}
        >
          WP origen
        </button>

        <button
          type="button"
          className={
            workPlaneEdit.mode === "THREE_POINTS"
              ? "workplane-edit-button workplane-edit-button-active"
              : "workplane-edit-button"
          }
          title="Definir WorkPlane libre usando 3 SNAPs"
          onClick={handleSetWorkPlaneThreePoints}
        >
          WP 3 SNAP
        </button>

        {
          workPlaneEdit.mode !== "NONE"
          && (
            <span
              className="workplane-edit-status"
            >
              {workPlaneEdit.message}
            </span>
          )
        }

        <button
          type="button"
          onClick={
            () => {
              void handleInsertAnotherInstance();
            }
          }
          disabled={
            loading
            || activePiece === null
            || placingPiece
          }
        >
          {
            placingPiece
              ? "Clic 1: ubicación · Clic 2: dirección..."
              : activePiece
                ? `Insertar otra ${activePiece.code}`
                : "Insertar otra instancia"
          }
        </button>

        {
          placingPiece
          && (
            <button
              type="button"
              onClick={handleCancelPlacement}
            >
              Cancelar inserción
            </button>
          )
        }

        {
          activePiece
          && (
            <span>
              {
                `${activePiece.code} · ${activePiece.instanceCount} instancia${
                  activePiece.instanceCount === 1
                    ? ""
                    : "s"
                }`
              }
            </span>
          )
        }
      </div>

      <LayerPanel
        layers={layers}
        activeLayerId={activeLayerId}
        onSetActive={handleSetActiveLayer}
        onVisibilityChange={handleLayerVisibilityChange}
        onLockChange={handleLayerLockChange}
        onSnapChange={handleLayerSnapChange}
        onCreate={handleCreateLayer}
        onRemove={handleRemoveLayer}
        onAssignSelection={handleAssignSelectionToLayer}
      />

      <ModelPanel
        models={models}
        pieces={pieces}
        layers={layers}
        onVisibilityChange={handleVisibilityChange}
        onPieceVisibilityChange={handlePieceVisibilityChange}
        onLayerChange={handleModelLayerChange}
        onRemove={handleRemoveModel}
        onClear={handleClearModels}
      />

      {
        pieceContextMenu
        && (
          <div
            className="model-context-menu"
            style={{
              left:
                pieceContextMenu.x,
              top:
                pieceContextMenu.y,
            }}
            onPointerDown={
              (
                event,
              ) => {
                event.stopPropagation();
              }
            }
          >
            <div
              className="model-context-title"
              title={pieceContextMenu.name}
            >
              {pieceContextMenu.name}
            </div>

            <button
              type="button"
              className="model-context-action"
              onClick={
                () => {
                  handlePieceVisibilityChange(
                    pieceContextMenu.id,
                    !pieceContextMenu.visible,
                  );
                }
              }
            >
              <span
                aria-hidden="true"
              >
                {
                  pieceContextMenu.visible
                    ? "◌"
                    : "👁"
                }
              </span>

              {
                pieceContextMenu.visible
                  ? "Ocultar pieza"
                  : "Mostrar pieza"
              }
            </button>
          </div>
        )
      }

      <input
        ref={referenceFileInputRef}
        type="file"
        accept=".ifc"
        hidden
        onChange={
          (
            event,
          ) => {
            void handleReferenceIfcSelected(
              event,
            );
          }
        }
      />

      <input
        ref={importPieceFileInputRef}
        type="file"
        accept=".step,.stp,.ifc"
        hidden
        onChange={
          (
            event,
          ) => {
            void handleImportPieceSelected(
              event,
            );
          }
        }
      />

      <input
        ref={openFrameLogicPieceInputRef}
        type="file"
        accept=".flpiece,.json"
        hidden
        onChange={
          (
            event,
          ) => {
            void handleFrameLogicPieceSelected(
              event,
            );
          }
        }
      />
    </div>
  );
}

