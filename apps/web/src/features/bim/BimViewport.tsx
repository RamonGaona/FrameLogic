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
  LoadedModelInfo,
} from "@framelogic/bim-core";

import {
  ModelPanel,
} from "./components/ModelPanel";


export function BimViewport() {

  // ==========================================================
  // REFERENCES
  // ==========================================================

  const containerRef =
    useRef<HTMLDivElement>(
      null,
    );


  const fileInputRef =
    useRef<HTMLInputElement>(
      null,
    );


  const bimCoreRef =
    useRef<BimCoreInstance | null>(
      null,
    );


  // ==========================================================
  // STATE
  // ==========================================================

  const [
    loading,
    setLoading,
  ] =
    useState(false);


  const [
    models,
    setModels,
  ] =
    useState<
      LoadedModelInfo[]
    >([]);


  // ==========================================================
  // REFRESH MODEL LIST
  // ==========================================================

  function refreshModels(): void {

    const bimCore =
      bimCoreRef.current;


    if (!bimCore) {

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


        bimCoreRef.current
          ?.dispose();


        bimCoreRef.current =
          null;

      };

    },
    [],
  );


  // ==========================================================
  // OPEN IFC
  // ==========================================================

  function handleOpenIfc(): void {

    fileInputRef.current
      ?.click();

  }


  // ==========================================================
  // IFC SELECTED
  // ==========================================================

  async function handleIfcSelected(
    event:
      ChangeEvent<HTMLInputElement>,
  ): Promise<void> {

    const file =
      event.target
        .files?.[0];


    if (!file) {

      return;

    }


    const bimCore =
      bimCoreRef.current;


    if (!bimCore) {

      console.error(
        "BIM Core is not initialized yet.",
      );

      return;

    }


    try {

      setLoading(
        true,
      );


      console.log(
        "Loading IFC:",
        file.name,
      );


      const model =
        await bimCore
          .loadIfcFile(
            file,
          );


      console.log(
        "IFC loaded:",
        model,
      );


      refreshModels();

    }
    catch (
      error
    ) {

      console.error(
        "Error loading IFC:",
        error,
      );

    }
    finally {

      setLoading(
        false,
      );


      event.target.value =
        "";

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


    if (!bimCore) {

      return;

    }


    bimCore.setModelVisible(
      id,
      visible,
    );


    refreshModels();

  }


  // ==========================================================
  // REMOVE MODEL
  // ==========================================================

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


  // ==========================================================
  // CLEAR MODELS
  // ==========================================================

  function handleClearModels(): void {

    const bimCore =
      bimCoreRef.current;


    if (!bimCore) {

      return;

    }


    bimCore.clearModels();


    refreshModels();

  }


  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div
      className="bim-page"
    >

      <div
        ref={containerRef}
        className="bim-viewport"
      />


      <div
        className="bim-toolbar"
      >

        <button
          type="button"
          onClick={
            handleOpenIfc
          }
          disabled={
            loading
          }
        >

          {
            loading
              ? "Cargando IFC..."
              : "Abrir IFC"
          }

        </button>

      </div>


      <ModelPanel

        models={
          models
        }

        onVisibilityChange={
          handleVisibilityChange
        }

        onRemove={
          handleRemoveModel
        }

        onClear={
          handleClearModels
        }

      />


      <input
        ref={fileInputRef}
        type="file"
        accept=".ifc"
        hidden

        onChange={
          (
            event,
          ) => {

            void handleIfcSelected(
              event,
            );

          }
        }
      />

    </div>
  );
}