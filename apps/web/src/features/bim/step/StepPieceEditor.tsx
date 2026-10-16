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
} from "@framelogic/bim-core";

import {
  convertStepToFrameLogicIfc,
} from "./stepToFrameLogicIfc";

import type {
  StepConversionResult,
} from "./stepToFrameLogicIfc";


export interface StepPieceEditorProps {
  initialFile: File;
  onExit: () => void;
}


function fileBaseName(
  fileName: string,
): string {

  return fileName
    .replace(
      /\.(?:step|stp)$/i,
      "",
    )
    .trim();

}


function defaultCodeForFile(
  fileName: string,
): string {

  return fileBaseName(
    fileName,
  )
    .replace(
      /\s+/g,
      "_",
    )
    .toUpperCase();

}


export function StepPieceEditor({
  initialFile,
  onExit,
}: StepPieceEditorProps) {

  const containerRef =
    useRef<HTMLDivElement>(
      null,
    );


  const replacementInputRef =
    useRef<HTMLInputElement>(
      null,
    );


  const coreRef =
    useRef<BimCoreInstance | null>(
      null,
    );


  const [
    sourceFile,
    setSourceFile,
  ] =
    useState<File>(
      initialFile,
    );


  const [
    code,
    setCode,
  ] =
    useState(
      defaultCodeForFile(
        initialFile.name,
      ),
    );


  const [
    name,
    setName,
  ] =
    useState(
      fileBaseName(
        initialFile.name,
      ),
    );


  const [
    classification,
    setClassification,
  ] =
    useState(
      "",
    );


  const [
    tagsText,
    setTagsText,
  ] =
    useState(
      "",
    );


  const [
    ready,
    setReady,
  ] =
    useState(false);


  const [
    loading,
    setLoading,
  ] =
    useState(false);


  const [
    prepared,
    setPrepared,
  ] =
    useState(false);


  const [
    conversion,
    setConversion,
  ] =
    useState<StepConversionResult | null>(
      null,
    );


  const [
    message,
    setMessage,
  ] =
    useState(
      "Completa los datos básicos y pulsa Cargar STEP y preparar.",
    );


  useEffect(
    () => {

      const container =
        containerRef.current;


      if (
        !container
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
            core,
          ) => {

            if (
              disposed
            ) {

              core.dispose();

              return;

            }


            coreRef.current =
              core;


            setReady(
              true,
            );

          },
        )
        .catch(
          (
            error: unknown,
          ) => {

            console.error(
              "Error initializing STEP piece editor:",
              error,
            );


            setMessage(
              error instanceof Error
                ? error.message
                : String(
                    error,
                  ),
            );

          },
        );


      return () => {

        disposed =
          true;


        coreRef.current
          ?.dispose();


        coreRef.current =
          null;

      };

    },
    [],
  );


  function resetIdentityForFile(
    file: File,
  ): void {

    setSourceFile(
      file,
    );


    setCode(
      defaultCodeForFile(
        file.name,
      ),
    );


    setName(
      fileBaseName(
        file.name,
      ),
    );


    setClassification(
      "",
    );


    setTagsText(
      "",
    );


    setConversion(
      null,
    );


    setPrepared(
      false,
    );


    setMessage(
      "Completa los datos básicos y pulsa Cargar STEP y preparar.",
    );

  }


  function handleReplacementFile(
    event:
      ChangeEvent<HTMLInputElement>,
  ): void {

    const file =
      event.target.files?.[0];


    event.target.value =
      "";


    if (
      !file
    ) {

      return;

    }


    resetIdentityForFile(
      file,
    );

  }


  async function handlePrepare():
    Promise<void> {

    const core =
      coreRef.current;


    if (
      !core
      || !ready
      || loading
      || prepared
    ) {

      return;

    }


    const normalizedCode =
      code.trim();


    const normalizedName =
      name.trim()
      || normalizedCode;


    if (
      normalizedCode.length === 0
    ) {

      window.alert(
        "El código de la pieza es obligatorio.",
      );

      return;

    }


    const tags =
      tagsText
        .split(
          ",",
        )
        .map(
          (
            tag,
          ) =>
            tag.trim(),
        )
        .filter(
          Boolean,
        );


    try {

      setLoading(
        true,
      );


      setMessage(
        "Leyendo STEP con OpenCascade y generando IFC base...",
      );


      const result =
        await convertStepToFrameLogicIfc(
          sourceFile,
          {
            code:
              normalizedCode,
            name:
              normalizedName,
            classification:
              classification.trim()
              || undefined,
            tags,
          },
        );


      setMessage(
        "Cargando IFC base en FrameLogic...",
      );


      const {
        definition,
      } =
        await core.importDesignPieceIfc(
          result.ifcFile,
          {
            code:
              normalizedCode,
            name:
              normalizedName,
            classification:
              classification.trim()
              || undefined,
            tags,
          },
        );


      const instance =
        core.createDesignPieceInstance({
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


      core.startPieceDefinitionPreparation(
        instance.id,
      );


      await core.setStandardView(
        "ISO",
      );


      setConversion(
        result,
      );


      setPrepared(
        true,
      );


      setMessage(
        `STEP cargado · ${result.sourceMeshCount} mesh · ${result.vertexCount.toLocaleString()} vértices · ${result.triangleCount.toLocaleString()} triángulos.`,
      );

    }
    catch (
      error
    ) {

      console.error(
        "STEP preparation failed:",
        error,
      );


      const errorMessage =
        error instanceof Error
          ? error.message
          : String(
              error,
            );


      setMessage(
        errorMessage,
      );


      window.alert(
        `No se pudo preparar el STEP.\n\n${errorMessage}`,
      );

    }
    finally {

      setLoading(
        false,
      );

    }

  }


  function handleDownloadBaseIfc(): void {

    if (
      !conversion
    ) {

      return;

    }


    const url =
      URL.createObjectURL(
        conversion.ifcFile,
      );


    const link =
      document.createElement(
        "a",
      );


    link.href =
      url;

    link.download =
      conversion.ifcFile.name;


    document.body.appendChild(
      link,
    );


    link.click();
    link.remove();


    window.setTimeout(
      () => {

        URL.revokeObjectURL(
          url,
        );

      },
      0,
    );

  }


  const controlStyle = {
    padding:
      "7px 10px",
    border:
      "1px solid #596875",
    borderRadius:
      "5px",
    background:
      "#111827",
    color:
      "white",
    fontSize:
      "12px",
  } as const;


  const buttonStyle = {
    padding:
      "8px 11px",
    border:
      "1px solid #596875",
    borderRadius:
      "5px",
    background:
      "#1f2933",
    color:
      "white",
    cursor:
      "pointer",
    fontSize:
      "12px",
  } as const;


  return (
    <div
      style={{
        position:
          "relative",
        width:
          "100vw",
        height:
          "100vh",
        overflow:
          "hidden",
        background:
          "#1f2933",
      }}
    >
      <div
        ref={containerRef}
        style={{
          position:
            "absolute",
          inset:
            0,
        }}
      />


      <div
        style={{
          position:
            "absolute",
          top:
            "16px",
          left:
            "16px",
          zIndex:
            80,
          width:
            "370px",
          maxHeight:
            "calc(100vh - 32px)",
          overflowY:
            "auto",
          padding:
            "14px",
          border:
            "1px solid #4b5563",
          borderRadius:
            "8px",
          background:
            "rgba(31, 41, 51, 0.97)",
          color:
            "white",
          fontFamily:
            "Arial, sans-serif",
          boxShadow:
            "0 8px 24px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            display:
              "flex",
            alignItems:
              "center",
            justifyContent:
              "space-between",
            gap:
              "8px",
            marginBottom:
              "12px",
          }}
        >
          <strong>
            Editor STEP → FrameLogic
          </strong>

          <button
            type="button"
            style={buttonStyle}
            onClick={onExit}
          >
            Salir
          </button>
        </div>


        <div
          style={{
            marginBottom:
              "12px",
            padding:
              "9px",
            borderRadius:
              "5px",
            background:
              "rgba(17,24,39,0.75)",
            fontSize:
              "12px",
            lineHeight:
              1.4,
          }}
        >
          <div>
            <strong>STEP:</strong> {sourceFile.name}
          </div>
          <div>
            Workspace independiente · una sola pieza · origen local (0,0,0).
          </div>
        </div>


        <label
          style={{
            display:
              "grid",
            gap:
              "4px",
            marginBottom:
              "9px",
            fontSize:
              "12px",
          }}
        >
          Código *
          <input
            value={code}
            disabled={prepared || loading}
            onChange={
              (
                event,
              ) => {

                setCode(
                  event.target.value,
                );

              }
            }
            style={controlStyle}
          />
        </label>


        <label
          style={{
            display:
              "grid",
            gap:
              "4px",
            marginBottom:
              "9px",
            fontSize:
              "12px",
          }}
        >
          Nombre *
          <input
            value={name}
            disabled={prepared || loading}
            onChange={
              (
                event,
              ) => {

                setName(
                  event.target.value,
                );

              }
            }
            style={controlStyle}
          />
        </label>


        <label
          style={{
            display:
              "grid",
            gap:
              "4px",
            marginBottom:
              "9px",
            fontSize:
              "12px",
          }}
        >
          Clasificación
          <input
            value={classification}
            disabled={prepared || loading}
            onChange={
              (
                event,
              ) => {

                setClassification(
                  event.target.value,
                );

              }
            }
            style={controlStyle}
          />
        </label>


        <label
          style={{
            display:
              "grid",
            gap:
              "4px",
            marginBottom:
              "12px",
            fontSize:
              "12px",
          }}
        >
          Tags separados por coma
          <input
            value={tagsText}
            disabled={prepared || loading}
            onChange={
              (
                event,
              ) => {

                setTagsText(
                  event.target.value,
                );

              }
            }
            style={controlStyle}
          />
        </label>


        {
          !prepared
          && (
            <div
              style={{
                display:
                  "flex",
                gap:
                  "8px",
                flexWrap:
                  "wrap",
              }}
            >
              <button
                type="button"
                style={buttonStyle}
                disabled={
                  !ready
                  || loading
                }
                onClick={
                  () => {

                    void handlePrepare();

                  }
                }
              >
                {
                  loading
                    ? "Procesando STEP..."
                    : "Cargar STEP y preparar"
                }
              </button>


              <button
                type="button"
                style={buttonStyle}
                disabled={loading}
                onClick={
                  () => {

                    replacementInputRef.current
                      ?.click();

                  }
                }
              >
                Elegir otro STEP
              </button>
            </div>
          )
        }


        {
          prepared
          && (
            <>
              <hr
                style={{
                  border:
                    0,
                  borderTop:
                    "1px solid #4b5563",
                  margin:
                    "13px 0",
                }}
              />

              <div
                style={{
                  marginBottom:
                    "8px",
                  fontWeight:
                    700,
                  fontSize:
                    "12px",
                }}
              >
                Preparación 3D
              </div>

              <div
                style={{
                  display:
                    "flex",
                  gap:
                    "6px",
                  flexWrap:
                    "wrap",
                }}
              >
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      coreRef.current
                        ?.startPreparedPieceOriginSnapEdit();

                    }
                  }
                >
                  Origen ← SNAP
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      coreRef.current
                        ?.startPointCommand();

                    }
                  }
                >
                  POINT
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      coreRef.current
                        ?.startLineCommand();

                    }
                  }
                >
                  LINE
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      try {

                        coreRef.current
                          ?.addPreparedPieceSnapsFromSelection();

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
                  }
                >
                  Punto → SNAP
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      try {

                        coreRef.current
                          ?.addPreparedPieceAxesFromSelection();

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
                  }
                >
                  Línea → eje
                </button>

                <button
                  type="button"
                  style={buttonStyle}
                  onClick={
                    () => {

                      void coreRef.current
                        ?.setStandardView(
                          "ISO",
                        );

                    }
                  }
                >
                  ISO / Fit
                </button>
              </div>


              <div
                style={{
                  marginTop:
                    "10px",
                  fontSize:
                    "11px",
                  color:
                    "#b8c0c8",
                  lineHeight:
                    1.4,
                }}
              >
                Selecciona la pieza y usa M si necesitas el gizmo. Los SNAPs y ejes persistentes se administran en el panel de preparación.
              </div>


              <button
                type="button"
                style={{
                  ...buttonStyle,
                  marginTop:
                    "12px",
                }}
                onClick={
                  handleDownloadBaseIfc
                }
              >
                Descargar IFC base
              </button>

              <div
                style={{
                  marginTop:
                    "6px",
                  fontSize:
                    "10px",
                  color:
                    "#9ca3af",
                }}
              >
                Este IFC ya contiene la geometría STEP y la identidad básica. La exportación final con SNAPs/ejes FrameLogic se conectará después al guardado de PieceDefinition.
              </div>
            </>
          )
        }


        <div
          style={{
            marginTop:
              "12px",
            paddingTop:
              "10px",
            borderTop:
              "1px solid #4b5563",
            fontSize:
              "11px",
            color:
              loading
                ? "#fcd34d"
                : "#d1d5db",
            lineHeight:
              1.4,
          }}
        >
          {message}
        </div>
      </div>


      <input
        ref={replacementInputRef}
        type="file"
        accept=".step,.stp"
        hidden
        onChange={
          handleReplacementFile
        }
      />
    </div>
  );

}
