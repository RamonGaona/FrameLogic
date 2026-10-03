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
  BimCoreInstance,
  CadWorkPlaneMode,
  CameraOrientation,
  CardinalDirection,
  DesignLayer,
  LoadedModelInfo,
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


// ============================================================
// TYPES
// ============================================================

interface ActivePieceInfo {

  definitionId: string;

  code: string;

  name: string;

  instanceCount: number;

}


// ============================================================
// BIM VIEWPORT
// ============================================================

export function BimViewport() {

  // ==========================================================
  // REFERENCES
  // ==========================================================

  const containerRef =
    useRef<HTMLDivElement>(
      null,
    );

    // ==========================================================
// CARDINAL VIEW
// ==========================================================

function handleCardinalDirection(
  direction:
    CardinalDirection,
): void {

  const bimCore =
    bimCoreRef.current;


  if (
    !bimCore
  ) {

    return;

  }


  void bimCore
    .setCardinalDirection(
      direction,
    );

}

    function handleStandardView(
      view:
        import("@framelogic/bim-core").StandardView,
    ): void {
    
      const bimCore =
        bimCoreRef.current;
    
    
      if (
        !bimCore
      ) {
    
        return;
    
      }
    
    
      void bimCore.setStandardView(
        view,
      );
    
    }

    const [
      cameraOrientation,
      setCameraOrientation,
    ] =
      useState<CameraOrientation>({
    
        azimuth:
          Math.PI / 4,
    
        polar:
          Math.PI / 3,
    
      });

      const [
        projectionMode,
        setProjectionMode,
      ] =
        useState<
          "PERSPECTIVE"
          | "ORTHOGRAPHIC"
        >(
          "PERSPECTIVE",
        );

  // ----------------------------------------------------------
  // REFERENCE IFC INPUT
  // ----------------------------------------------------------

  const referenceFileInputRef =
    useRef<HTMLInputElement>(
      null,
    );


  // ----------------------------------------------------------
  // DESIGN PIECE IFC INPUT
  // ----------------------------------------------------------

  const pieceFileInputRef =
    useRef<HTMLInputElement>(
      null,
    );


  // ----------------------------------------------------------
  // BIM CORE
  // ----------------------------------------------------------

  const bimCoreRef =
    useRef<BimCoreInstance | null>(
      null,
    );


  // ==========================================================
  // STATE
  // ==========================================================

  const [
    loadingReference,
    setLoadingReference,
  ] =
    useState(false);


  const [
    loadingPiece,
    setLoadingPiece,
  ] =
    useState(false);


  const [
    models,
    setModels,
  ] =
    useState<
      LoadedModelInfo[]
    >([]);


  const [
    layers,
    setLayers,
  ] =
    useState<
      DesignLayer[]
    >([]);


  const [
    activeLayerId,
    setActiveLayerId,
  ] =
    useState(
      "reference-cad",
    );


  const [
    workPlaneMode,
    setWorkPlaneMode,
  ] =
    useState<
      CadWorkPlaneMode
    >(
      "XY",
    );


  const [
    activePiece,
    setActivePiece,
  ] =
    useState<
      ActivePieceInfo
      | null
    >(null);

    const [
      placingPiece,
      setPlacingPiece,
    ] =
      useState(false);


      // ==========================================================
// CAMERA PROJECTION
// ==========================================================

async function handleToggleProjection():
Promise<void> {

const bimCore =
  bimCoreRef.current;


if (
  !bimCore
) {

  return;

}


try {

  const mode =
    await bimCore
      .toggleCameraProjection();


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

  // ==========================================================
  // REFRESH REFERENCE MODEL LIST
  // ==========================================================

  function refreshModels(): void {

    const bimCore =
      bimCoreRef.current;


    if (
      !bimCore
    ) {

      setModels(
        [],
      );

      return;

    }


    setModels(
      bimCore.getLoadedModels(),
    );

  }


  // ==========================================================
  // LAYER ACTIONS
  // ==========================================================

  function handleCreateLayer(): void {

    const bimCore =
      bimCoreRef.current;


    if (
      !bimCore
    ) {

      return;

    }


    const name =
      window.prompt(
        "Nombre del layer:",
        "",
      )
        ?.trim();


    if (
      !name
    ) {

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
          : String(
              error,
            ),
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


    if (
      !bimCore
    ) {

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
          : String(
              error,
            ),
      );

    }

  }


  function handleAssignSelectionToLayer(
    layerId: string,
  ): void {

    const bimCore =
      bimCoreRef.current;


    if (
      !bimCore
    ) {

      return;

    }


    try {

      bimCore
        .assignSelectedPieceInstancesToLayer(
          layerId,
        );

    }
    catch (
      error
    ) {

      window.alert(
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
      );

    }

  }


  // ==========================================================
  // CAD WORKPLANE
  // ==========================================================

  function handleCycleWorkPlane(): void {

    const bimCore =
      bimCoreRef.current;


    if (
      !bimCore
    ) {

      return;

    }


    setWorkPlaneMode(
      bimCore.cycleCadWorkPlane(),
    );

  }


  // ==========================================================
  // INITIALIZE BIM CORE
  // ==========================================================

  useEffect(
    () => {
  
      const container =
        containerRef.current;
  
  
      if (
        container === null
      ) {
  
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
  
  
      void createBimCore(
        container,
      )
        .then(
          (
            instance,
          ) => {
  
            if (
              disposed
            ) {
  
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


            unsubscribeLayers =
              instance.subscribeDesignLayers(
                () => {

                  if (
                    disposed
                  ) {

                    return;

                  }


                  setLayers(
                    instance.getDesignLayers(),
                  );


                  setActiveLayerId(
                    instance.getActiveDesignLayerId(),
                  );


                  setModels(
                    instance.getLoadedModels(),
                  );

                },
              );


            setWorkPlaneMode(
              instance
                .getCadWorkPlaneState()
                .mode,
            );


            unsubscribeWorkPlane =
              instance.subscribeCadWorkPlane(
                (
                  state,
                ) => {

                  if (
                    disposed
                  ) {

                    return;

                  }


                  setWorkPlaneMode(
                    state.mode,
                  );

                },
              );


            setProjectionMode(
              instance.getCameraProjectionMode(),
            );
  
  
            // ==================================================
            // CAMERA ORIENTATION SUBSCRIPTION
            // ==================================================
  
            unsubscribeCamera =
              instance.subscribeCameraOrientation(
                (
                  orientation,
                ) => {
  
                  if (
                    disposed
                  ) {
  
                    return;
  
                  }
  
  
                  setCameraOrientation(
                    orientation,
                  );
  
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
  
  
        unsubscribeCamera
          ?.();


        unsubscribeLayers
          ?.();


        unsubscribeWorkPlane
          ?.();
  
  
        bimCoreRef.current
          ?.dispose();
  
  
        bimCoreRef.current =
          null;
  
      };
  
    },
    [],
  );


  // ==========================================================
  // OPEN REFERENCE IFC
  // ==========================================================

  function handleOpenReferenceIfc(): void {

    referenceFileInputRef.current
      ?.click();

  }


  // ==========================================================
  // REFERENCE IFC SELECTED
  // ==========================================================

  async function handleReferenceIfcSelected(
    event:
      ChangeEvent<HTMLInputElement>,
  ): Promise<void> {

    const file =
      event.target
        .files?.[0];


    if (
      !file
    ) {

      return;

    }


    const bimCore =
      bimCoreRef.current;


    if (
      !bimCore
    ) {

      console.error(
        "BIM Core is not initialized yet.",
      );


      event.target.value =
        "";


      return;

    }


    try {

      setLoadingReference(
        true,
      );


      console.log(
        "Loading reference IFC:",
        file.name,
      );


      const model =
        await bimCore.loadIfcFile(
          file,
        );


      console.log(
        "Reference IFC loaded:",
        model,
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


  // ==========================================================
  // IMPORT DESIGN PIECE IFC
  // ==========================================================

  function handleImportPieceIfc(): void {

    pieceFileInputRef.current
      ?.click();

  }


  // ==========================================================
  // DESIGN PIECE IFC SELECTED
  // ==========================================================

  async function handlePieceIfcSelected(
    event:
      ChangeEvent<HTMLInputElement>,
  ): Promise<void> {

    const file =
      event.target
        .files?.[0];


    if (
      !file
    ) {

      return;

    }


    const bimCore =
      bimCoreRef.current;


    if (
      !bimCore
    ) {

      console.error(
        "BIM Core is not initialized yet.",
      );


      event.target.value =
        "";


      return;

    }


    // --------------------------------------------------------
    // DEFAULT PIECE CODE FROM FILE NAME
    // --------------------------------------------------------

    const defaultCode =
      file.name
        .replace(
          /\.ifc$/i,
          "",
        )
        .trim()
        .toUpperCase();


    // --------------------------------------------------------
    // CODE
    // --------------------------------------------------------

    const codeInput =
      window.prompt(
        "Código de la pieza:",
        defaultCode,
      );


    const code =
      codeInput
        ?.trim();


    if (
      !code
    ) {

      event.target.value =
        "";

      return;

    }


    // --------------------------------------------------------
    // NAME
    // --------------------------------------------------------

    const nameInput =
      window.prompt(
        "Nombre de la pieza:",
        code,
      );


    if (
      nameInput === null
    ) {

      event.target.value =
        "";

      return;

    }


    const name =
      nameInput.trim()
      || code;


    // --------------------------------------------------------
    // CLASSIFICATION
    //
    // Texto libre.
    // FrameLogic NO interpreta esta clasificación.
    // --------------------------------------------------------

    const classificationInput =
      window.prompt(
        "Clasificación opcional:",
        "",
      );


    if (
      classificationInput === null
    ) {

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


      console.log(
        "Importing FrameLogic piece IFC:",
        file.name,
      );


      // ------------------------------------------------------
      // IMPORT PIECE DEFINITION
      // ------------------------------------------------------

      const {
        asset,
        definition,
      } =
        await bimCore
          .importDesignPieceIfc(
            file,
            {

              code,

              name,

              classification:
                classification
                || undefined,

              tags:
                [],

            },
          );


      console.log(
        "FrameLogic asset created:",
        asset,
      );


      console.log(
        "FrameLogic piece definition created:",
        definition,
      );


      // ------------------------------------------------------
      // CREATE FIRST INSTANCE
      //
      // Primera inserción en origen.
      // ------------------------------------------------------

      const instance =
        bimCore
          .createDesignPieceInstance({

            definitionId:
              definition.id,

            transform: {

              position: {

                x:
                  0,

                y:
                  0,

                z:
                  0,

              },

              rotation: {

                x:
                  0,

                y:
                  0,

                z:
                  0,

              },

            },

            tags:
              [],

          });


      console.log(
        "First PieceInstance created:",
        instance,
      );


      // ------------------------------------------------------
      // ACTIVE PIECE
      //
      // Temporalmente trabajaremos con la última
      // PieceDefinition importada.
      // ------------------------------------------------------

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

    }
    catch (
      error
    ) {

      console.error(
        "Error importing FrameLogic piece:",
        error,
      );


      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );


      window.alert(
        `No se pudo importar la pieza.\n\n${message}`,
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


  // ==========================================================
  // INSERT ANOTHER INSTANCE
  // ==========================================================

  async function handleInsertAnotherInstance(): Promise<void> {

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
  
  
      console.log(
        "Placement mode started:",
        activePiece.code,
      );
  
  
      const instance =
        await bimCore
          .startDesignPiecePlacement(
            activePiece.definitionId,
          );
  
  
      // --------------------------------------------------------
      // CANCELLED WITH ESC OR BUTTON
      // --------------------------------------------------------
  
      if (
        !instance
      ) {
  
        console.log(
          "Placement cancelled.",
        );
  
  
        return;
  
      }
  
  
      console.log(
        "PieceInstance placed:",
        instance,
      );
  
  
      setActivePiece(
        (
          current,
        ) => {
  
          if (
            !current
          ) {
  
            return current;
  
          }
  
  
          return {
  
            ...current,
  
            instanceCount:
              current.instanceCount
              + 1,
  
          };
  
        },
      );
  
    }
    catch (
      error
    ) {
  
      console.error(
        "Error placing PieceInstance:",
        error,
      );
  
  
      const message =
        error instanceof Error
          ? error.message
          : String(
              error,
            );
  
  
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


  // ==========================================================
  // MODEL VISIBILITY
  // ==========================================================

  function handleVisibilityChange(
    id: string,
    visible: boolean,
  ): void {

    const bimCore =
      bimCoreRef.current;


    if (
      !bimCore
    ) {

      return;

    }


    bimCore.setModelVisible(
      id,
      visible,
    );


    refreshModels();

  }


  // ==========================================================
  // REFERENCE MODEL LAYER
  // ==========================================================

  function handleModelLayerChange(
    id: string,
    layerId: string,
  ): void {

    const bimCore =
      bimCoreRef.current;


    if (
      !bimCore
    ) {

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
          : String(
              error,
            ),
      );

    }

  }


  // ==========================================================
  // REMOVE REFERENCE MODEL
  // ==========================================================

  function handleRemoveModel(
    id: string,
  ): void {

    const bimCore =
      bimCoreRef.current;


    if (
      !bimCore
    ) {

      return;

    }


    bimCore.removeModel(
      id,
    );


    refreshModels();

  }


  // ==========================================================
  // CLEAR REFERENCE MODELS
  // ==========================================================

  function handleClearModels(): void {

    const bimCore =
      bimCoreRef.current;


    if (
      !bimCore
    ) {

      return;

    }


    bimCore.clearModels();


    refreshModels();

  }


  // ==========================================================
  // GLOBAL LOADING STATE
  // ==========================================================

  const loading =
    loadingReference
    || loadingPiece;


  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div
      className="bim-page"
    >
  
      {/* ====================================================
          3D VIEWPORT
          ==================================================== */}
  
      <div
        ref={containerRef}
        className="bim-viewport"
      />
  
  
      {/* ====================================================
          VIEW CUBE
          ==================================================== */}
  
  <ViewCube

  orientation={
    cameraOrientation
  }

  projectionMode={
    projectionMode
  }

  onViewChange={
    handleStandardView
  }

  onCardinalChange={
    handleCardinalDirection
  }

  onToggleProjection={
    () => {

      void handleToggleProjection();

    }
  }

/>
  
  
      {/* ====================================================
          TOOLBAR
          ==================================================== */}
  
      <div
        className="bim-toolbar"
      >

        {/* --------------------------------------------------
            REFERENCE IFC
            -------------------------------------------------- */}

        <button
          type="button"
          onClick={
            handleOpenReferenceIfc
          }
          disabled={
            loading
          }
        >

          {
            loadingReference
              ? "Cargando referencia..."
              : "Abrir IFC referencia"
          }

        </button>
       

        {/* --------------------------------------------------
            DESIGN PIECE IFC
            -------------------------------------------------- */}

        <button
          type="button"
          onClick={
            handleImportPieceIfc
          }
          disabled={
            loading
          }
        >

          {
            loadingPiece
              ? "Importando pieza..."
              : "Importar pieza IFC"
          }

        </button>


        {/* --------------------------------------------------
            WORKPLANE
            -------------------------------------------------- */}

        <button
          type="button"
          className={
            workPlaneMode === "OFF"
              ? "workplane-button workplane-button-off"
              : "workplane-button"
          }
          title="Cambiar WorkPlane: XY → XZ → YZ → OFF"
          onClick={
            handleCycleWorkPlane
          }
        >
          {
            `WorkPlane: ${workPlaneMode}`
          }
        </button>


        {/* --------------------------------------------------
            INSERT ANOTHER INSTANCE
            -------------------------------------------------- */}

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
      onClick={
        handleCancelPlacement
      }
    >

      Cancelar inserción

    </button>

  )
}


        {/* --------------------------------------------------
            ACTIVE PIECE INFORMATION
            -------------------------------------------------- */}

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


      {/* ====================================================
          LAYER PANEL
          ==================================================== */}

      <LayerPanel

        layers={
          layers
        }

        activeLayerId={
          activeLayerId
        }

        onSetActive={
          handleSetActiveLayer
        }

        onVisibilityChange={
          handleLayerVisibilityChange
        }

        onLockChange={
          handleLayerLockChange
        }

        onSnapChange={
          handleLayerSnapChange
        }

        onCreate={
          handleCreateLayer
        }

        onRemove={
          handleRemoveLayer
        }

        onAssignSelection={
          handleAssignSelectionToLayer
        }

      />


      {/* ====================================================
          REFERENCE MODEL PANEL
          ==================================================== */}

      <ModelPanel

        models={
          models
        }

        layers={
          layers
        }

        onVisibilityChange={
          handleVisibilityChange
        }

        onLayerChange={
          handleModelLayerChange
        }

        onRemove={
          handleRemoveModel
        }

        onClear={
          handleClearModels
        }

      />


      {/* ====================================================
          REFERENCE IFC FILE INPUT
          ==================================================== */}

      <input
        ref={
          referenceFileInputRef
        }

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


      {/* ====================================================
          DESIGN PIECE IFC FILE INPUT
          ==================================================== */}

      <input
        ref={
          pieceFileInputRef
        }

        type="file"

        accept=".ifc"

        hidden

        onChange={
          (
            event,
          ) => {

            void handlePieceIfcSelected(
              event,
            );

          }
        }
      />

    </div>
  );

}