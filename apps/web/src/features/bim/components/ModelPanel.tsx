import {
  useEffect,
} from "react";

import type {
  DesignLayer,
  LoadedModelInfo,
} from "@framelogic/bim-core";


export interface PiecePanelItem {
  id: string;
  name: string;
  code: string;
  layerId: string;
  visible: boolean;
}


interface ModelPanelProps {
  models:
    LoadedModelInfo[];

  pieces:
    PiecePanelItem[];

  layers:
    DesignLayer[];

  onVisibilityChange:
    (
      id: string,
      visible: boolean,
    ) => void;

  onPieceVisibilityChange:
    (
      id: string,
      visible: boolean,
    ) => void;

  onLayerChange:
    (
      id: string,
      layerId: string,
    ) => void;

  onRemove:
    (
      id: string,
    ) => void;

  onClear:
    () => void;
}


/**
 * La antigua UI "Modelo" ya no se renderiza.
 *
 * PieceAppearanceController es el único propietario del ojo individual de cada
 * PieceInstance dentro de INSTANCIAS. Este puente conserva únicamente el ojo
 * de cada ensamble y lo hace actuar sobre los ojos individuales canónicos.
 *
 * Mantener un solo propietario evita que React y bim-core creen dos botones
 * sobre la misma fila o compitan por su estado visual.
 */
export function ModelPanel(
  _props: ModelPanelProps,
) {
  useEffect(
    () => {
      let disposed = false;


      const decorateInstanceTree =
        (): void => {
          if (disposed) return;

          const body =
            document.querySelector<HTMLElement>(
              '[data-framelogic-instance-tree-body="true"]',
            );

          if (!body) return;

          removeLegacyPieceEyes(body);

          const candidateRows =
            Array.from(
              body.querySelectorAll<HTMLDivElement>(
                "div",
              ),
            );

          for (const row of candidateRows) {
            const directSpans =
              Array.from(row.children).filter(
                (
                  child,
                ): child is HTMLSpanElement =>
                  child instanceof HTMLSpanElement,
              );

            const nameSpan = directSpans[0];
            if (!nameSpan?.textContent?.startsWith("▦ ")) {
              continue;
            }

            const children = row.nextElementSibling;
            if (!(children instanceof HTMLDivElement)) {
              continue;
            }

            let eye =
              row.querySelector<HTMLButtonElement>(
                'button[data-framelogic-assembly-visibility-eye="true"]',
              );

            if (!eye) {
              eye = document.createElement("button");
              eye.type = "button";
              eye.dataset[
                "framelogicAssemblyVisibilityEye"
              ] = "true";

              applyEyeStyle(eye);

              eye.addEventListener(
                "pointerdown",
                stopPointerPropagation,
              );
              eye.addEventListener(
                "contextmenu",
                preventContextMenuPropagation,
              );
              eye.addEventListener(
                "click",
                (event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  toggleAssemblyVisibility(children);
                },
              );

              row.insertBefore(
                eye,
                row.firstElementChild,
              );
            }

            updateAssemblyEye(
              eye,
              children,
              nameSpan,
            );

            row.style.gridTemplateColumns =
              "auto minmax(0, 1fr) auto";
            row.style.gap = "6px";
          }
        };


      decorateInstanceTree();

      const timer =
        window.setInterval(
          decorateInstanceTree,
          300,
        );


      return () => {
        disposed = true;
        window.clearInterval(timer);
      };
    },
    [],
  );


  return null;
}


function removeLegacyPieceEyes(
  body: HTMLElement,
): void {
  const eyes =
    body.querySelectorAll<HTMLButtonElement>(
      "button[data-framelogic-piece-visibility-eye]",
    );

  for (const eye of eyes) {
    if (
      eye.dataset[
        "framelogicPieceVisibilityEye"
      ] !== "true"
    ) {
      eye.remove();
    }
  }
}


function getPieceEyes(
  children: HTMLDivElement,
): HTMLButtonElement[] {
  return Array.from(
    children.querySelectorAll<HTMLButtonElement>(
      'button[data-framelogic-piece-visibility-eye="true"]',
    ),
  );
}


function toggleAssemblyVisibility(
  children: HTMLDivElement,
): void {
  const pieceEyes = getPieceEyes(children);
  if (pieceEyes.length < 1) return;

  const allVisible =
    pieceEyes.every(
      (pieceEye) =>
        pieceEye.dataset[
          "framelogicPieceVisible"
        ] !== "false",
    );

  const targetVisible = !allVisible;

  for (const pieceEye of pieceEyes) {
    const visible =
      pieceEye.dataset[
        "framelogicPieceVisible"
      ] !== "false";

    if (visible !== targetVisible) {
      pieceEye.click();
    }
  }
}


function updateAssemblyEye(
  eye: HTMLButtonElement,
  children: HTMLDivElement,
  nameSpan: HTMLSpanElement,
): void {
  const pieceEyes = getPieceEyes(children);
  const visibleCount =
    pieceEyes.filter(
      (pieceEye) =>
        pieceEye.dataset[
          "framelogicPieceVisible"
        ] !== "false",
    ).length;

  const allVisible =
    pieceEyes.length > 0
    && visibleCount === pieceEyes.length;
  const allHidden =
    pieceEyes.length > 0
    && visibleCount === 0;

  eye.disabled = pieceEyes.length < 1;
  eye.textContent =
    pieceEyes.length < 1
      ? "◌"
      : allVisible
        ? "👁"
        : allHidden
          ? "◌"
          : "◐";

  const assemblyName =
    nameSpan.textContent
      ?.slice(2)
      .trim()
    || "ensamble";

  eye.title =
    pieceEyes.length < 1
      ? `${assemblyName} no contiene piezas visibles en el árbol`
      : allVisible
        ? `Ocultar todas las piezas de ${assemblyName}`
        : `Mostrar todas las piezas de ${assemblyName}`;

  eye.setAttribute(
    "aria-label",
    eye.title,
  );

  eye.dataset[
    "framelogicAssemblyAllVisible"
  ] = allVisible
    ? "true"
    : "false";

  eye.style.opacity =
    pieceEyes.length < 1
      ? "0.45"
      : allHidden
        ? "0.62"
        : "1";
}


function applyEyeStyle(
  eye: HTMLButtonElement,
): void {
  Object.assign(
    eye.style,
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
      userSelect: "none",
    },
  );
}


function stopPointerPropagation(
  event: PointerEvent,
): void {
  event.stopPropagation();
}


function preventContextMenuPropagation(
  event: MouseEvent,
): void {
  event.preventDefault();
  event.stopPropagation();
}
