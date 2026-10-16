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

  const stepInputRef =
    useRef<HTMLInputElement>(
      null,
    );


  const [
    stepFile,
    setStepFile,
  ] =
    useState<File | null>(
      null,
    );


  function handleStepSelected(
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


    setStepFile(
      file,
    );

  }


  if (
    stepFile
  ) {

    return (
      <StepPieceEditor
        initialFile={stepFile}
        onExit={
          () => {

            setStepFile(
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
        title="Abrir una sola pieza STEP en un workspace independiente de preparación"
        onClick={
          () => {

            stepInputRef.current
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
        Abrir STEP
      </button>

      <input
        ref={stepInputRef}
        type="file"
        accept=".step,.stp"
        hidden
        onChange={
          handleStepSelected
        }
      />
    </>
  );
}


export default App;
