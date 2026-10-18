import {
  useRef,
  useState,
} from "react";

import type {
  ChangeEvent,
} from "react";

import {
  BimViewport,
} from "./features/bim/BimViewport";

import {
  StepPieceEditor,
} from "./features/bim/step/StepPieceEditor";


function App() {

  const pieceInputRef =
    useRef<HTMLInputElement>(
      null,
    );


  const [
    pieceFile,
    setPieceFile,
  ] =
    useState<File | null>(
      null,
    );


  function handlePieceSelected(
    event:
      ChangeEvent<HTMLInputElement>,
  ): void {

    const file =
      event.target.files?.[0]
      ?? null;


    event.target.value =
      "";


    if (
      !file
    ) {

      return;

    }


    setPieceFile(
      file,
    );

  }


  if (
    pieceFile
  ) {

    return (
      <StepPieceEditor
        initialFile={pieceFile}
        onExit={
          () => {

            setPieceFile(
              null,
            );

          }
        }
      />
    );

  }


  return (
    <>
      <BimViewport />

      <button
        type="button"
        title="Abrir una pieza STEP o un IFC FrameLogic en el workspace independiente de preparación"
        onClick={
          () => {

            pieceInputRef.current
              ?.click();

          }
        }
        style={{
          position:
            "fixed",
          right:
            "16px",
          bottom:
            "16px",
          zIndex:
            90,
          padding:
            "10px 16px",
          border:
            "1px solid #596875",
          borderRadius:
            "6px",
          background:
            "#1f2933",
          color:
            "white",
          cursor:
            "pointer",
          fontSize:
            "14px",
          fontWeight:
            700,
          boxShadow:
            "0 6px 18px rgba(0,0,0,0.24)",
        }}
      >
        Abrir pieza
      </button>

      <input
        ref={pieceInputRef}
        type="file"
        accept=".step,.stp,.ifc"
        hidden
        onChange={
          handlePieceSelected
        }
      />
    </>
  );
}


export default App;
