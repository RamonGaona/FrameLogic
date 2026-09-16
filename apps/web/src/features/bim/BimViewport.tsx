import {
    useEffect,
    useRef,
  } from "react";
  
  import {
    createBimCore,
  } from "@framelogic/bim-core";
  
  
  export function BimViewport() {
  
    const containerRef =
      useRef<HTMLDivElement>(
        null,
      );
  
  
    useEffect(
      () => {
  
        const container =
          containerRef.current;
  
  
        if (container === null) {
          return;
        }
  
  
        const bimCore =
          createBimCore(
            container,
          );
  
  
        return () => {
  
          bimCore.dispose();
  
        };
  
      },
      [],
    );
  
  
    return (
      <div
        ref={containerRef}
        className="bim-viewport"
      />
    );
  }