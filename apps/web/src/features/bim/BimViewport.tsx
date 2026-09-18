import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createBimCore,
} from "@framelogic/bim-core";

import type {
  BimCoreInstance,
} from "@framelogic/bim-core";


export function BimViewport() {

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


  const [
    loading,
    setLoading,
  ] =
    useState(false);


  // ====================================================
  // INITIALIZE BIM CORE
  // ====================================================

  useEffect(
    () => {

      const container =
        containerRef.current;


      if (container === null) {
        return;
      }


      let disposed =
        false;


      void createBimCore(
        container,
      )
        .then(
          (instance) => {

            if (disposed) {

              instance.dispose();

              return;
            }


            bimCoreRef.current =
              instance;

          },
        )
        .catch(
          (error: unknown) => {

            console.error(
              "Error initializing FrameLogic BIM Core:",
              error,
            );

          },
        );


      return () => {

        disposed =
          true;


        bimCoreRef.current?.dispose();


        bimCoreRef.current =
          null;

      };

    },
    [],
  );


  // ====================================================
  // OPEN FILE DIALOG
  // ====================================================

  function handleOpenIfc(): void {

    fileInputRef.current?.click();

  }


  // ====================================================
  // LOAD IFC
  // ====================================================

  async function handleIfcSelected(
    event:
      React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> {

    const file =
      event.target.files?.[0];


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
        await bimCore.loadIfcFile(
          file,
        );


      console.log(
        "IFC loaded:",
        model,
      );

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


      // Permite seleccionar otra vez
      // el mismo archivo.
      event.target.value =
        "";

    }
  }


  // ====================================================
  // UI
  // ====================================================

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
          onClick={handleOpenIfc}
          disabled={loading}
        >

          {
            loading
              ? "Cargando IFC..."
              : "Abrir IFC"
          }

        </button>

      </div>


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