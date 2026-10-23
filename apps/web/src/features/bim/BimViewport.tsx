import {
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
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

import {
  LayerPanel,
} from "./components/LayerPanel";

import {
  ViewCube,
} from "./components/ViewCube";

import {
  OcctStepGeometryAdapter,
} from "./step/OcctStepGeometryAdapter";


interface ActivePieceInfo {
  definitionId: string;
  code: string;
  name: string;
  instanceCount: number;
}


function defaultPieceCode(
  fileName: string,
): string {
  return fileName
    .replace(
      /\.(?:step|stp)$/i,
      "",
    )
    .trim()
    .replace(
      /\s+/g,
      "_",
    )
    .toUpperCase();
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

  const pieceFileInputRef =
    useRef<HTMLInputElement>(
      null,
    );

  const bimCoreRef =
    useRef<PrecisionBimCoreInstance | null>(
      null,
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
      "PERSPECTIVE",
    );

  const [loadingReference, setLoadingReference] =
    useState(false);

  const [loadingPiece, setLoadingPiece] =
    useState(false);

  const [models, setModels] =
    useState<LoadedModelInfo[]>(
      [],
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
      )
        ?.trim();

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
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    try {
      bimCore.removeDesignLayer(
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
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    try {
      bimCore.assignCadSelectionToLayer(
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
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    try {
      bimCore.startPreparedPieceOriginSnapEdit();
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
        | null =
          null;
      let unsubscribeLayers:
        (() => void)
        | null =
          null;
      let unsubscribeWorkPlane:
        (() => void)
        | null =
          null;
      let unsubscribeWorkPlaneEdit:
        (() => void)
        | null =
          null;
      let unsubscribePiecePreparation:
        (() => void)
        | null =
          null;
      let unsubscribePieceOriginEdit:
        (() => void)
        | null =
          null;

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

            setModels(
              instance.getLoadedModels(),
            );
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
                  if (disposed) {
                    return;
                  }

                  refreshLayers();
                  refreshModels();
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

        unsubscribeCamera?.();
        unsubscribeLayers?.();
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


  function handleImportPieceStep(): void {
    pieceFileInputRef.current
      ?.click();
  }


  async function handlePieceStepSelected(
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

    const defaultCode =
      defaultPieceCode(
        file.name,
      );

    const codeInput =
      window.prompt(
        "Código de la pieza:",
        defaultCode,
      );
    const code =
      codeInput?.trim();

    if (!code) {
      event.target.value =
        "";
      return;
    }

    const nameInput =
      window.prompt(
        "Nombre de la pieza:",
        code,
      );

    if (nameInput === null) {
      event.target.value =
        "";
      return;
    }

    const name =
      nameInput.trim()
      || code;

    const classificationInput =
      window.prompt(
        "Clasificación opcional:",
        "",
      );

    if (classificationInput === null) {
      event.target.value =
        "";
      return;
    }

    const classification =
      classificationInput.trim();

    try {
      setLoadingPiece(
        true,
      );

      const adapter =
        new OcctStepGeometryAdapter();
      const data =
        new Uint8Array(
          await file.arrayBuffer(),
        );
      const document =
        await adapter.load(
          data,
          {
            sourceFileName:
              file.name,
            targetUnit:
              "meter",
            includeExactFeatures:
              true,
          },
        );

      const {
        asset,
        definition,
      } =
        bimCore.importStepPiece(
          document,
          {
            code,
            name,
            classification:
              classification
              || undefined,
            tags: [],
          },
        );

      const instance =
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

      console.log(
        "STEP asset created:",
        asset,
      );
      console.log(
        "STEP PieceDefinition created:",
        definition,
      );
      console.log(
        "First STEP PieceInstance created:",
        instance,
      );

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

      await bimCore.setStandardView(
        "ISO",
      );
    }
    catch (
      error
    ) {
      console.error(
        "Error importing STEP piece:",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      window.alert(
        `No se pudo importar la pieza STEP.\n\n${message}`,
      );
    }
    finally {
      setLoadingPiece(
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
    }
    catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : String(error);

      window.alert(
        `No se pudo insertar la pieza.\n\n${message}`,
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
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    bimCore.removeModel(
      id,
    );
    refreshModels();
  }


  function handleClearModels(): void {
    const bimCore =
      bimCoreRef.current;

    if (!bimCore) {
      return;
    }

    bimCore.clearModels();
    refreshModels();
  }


  const loading =
    loadingReference
    || loadingPiece;


  return (
    <div
      className="bim-page"
    >
      <div
        ref={containerRef}
        className="bim-viewport"
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
        >
          {
            loadingReference
              ? "Cargando referencia..."
              : "Abrir IFC referencia"
          }
        </button>

        <button
          type="button"
          onClick={handleImportPieceStep}
          disabled={loading}
          title="Importa una pieza STEP directamente al espacio modelo principal"
        >
          {
            loadingPiece
              ? "Importando STEP..."
              : "Importar pieza STEP"
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
              ? "Haz clic en el visor..."
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
        layers={layers}
        onVisibilityChange={handleVisibilityChange}
        onLayerChange={handleModelLayerChange}
        onRemove={handleRemoveModel}
        onClear={handleClearModels}
      />

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
        ref={pieceFileInputRef}
        type="file"
        accept=".step,.stp"
        hidden
        onChange={
          (
            event,
          ) => {
            void handlePieceStepSelected(
              event,
            );
          }
        }
      />
    </div>
  );
}
