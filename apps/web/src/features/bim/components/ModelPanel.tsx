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
 * La visibilidad de PieceInstance vive ahora visualmente dentro del árbol
 * INSTANCIAS. Reutilizamos el mismo callback de visibilidad que ya usa
 * BimViewport, por lo que el ojo del árbol y el menú contextual del visor
 * comparten exactamente el mismo estado.
 *
 * Importante: deliberadamente NO usamos MutationObserver. El árbol reemplaza
 * sus filas cuando cambia selección/ensambles; un refresco liviano y acotado
 * vuelve a colocar únicamente los botones que falten. Esto evita el bucle de
 * mutaciones que podía saturar el hilo principal durante la importación STEP.
 */
export function ModelPanel(
  {
    pieces,
    onPieceVisibilityChange,
  }: ModelPanelProps,
) {
  useEffect(
    () => {
      let disposed =
        false;

      let frameId:
        number | null =
          null;


      const decorateInstanceTree =
        (): void => {
          if (disposed) {
            return;
          }

          const body =
            document.querySelector<HTMLElement>(
              '[data-framelogic-instance-tree-body="true"]',
            );

          if (!body) {
            return;
          }

          const spans =
            Array.from(
              body.querySelectorAll<HTMLSpanElement>(
                "span",
              ),
            );


          for (
            const piece
            of pieces
          ) {
            const instancePrefix =
              piece.id.slice(
                0,
                8,
              );

            const meta =
              spans.find(
                (
                  span,
                ) =>
                  span.textContent
                  === instancePrefix,
              );

            const row =
              meta?.parentElement;

            if (!row) {
              continue;
            }

            let eye =
              Array.from(
                row.querySelectorAll<HTMLButtonElement>(
                  "button[data-framelogic-piece-visibility-eye]",
                ),
              ).find(
                (
                  button,
                ) =>
                  button.dataset[
                    "framelogicPieceVisibilityEye"
                  ] === piece.id,
              );


            if (!eye) {
              eye =
                document.createElement(
                  "button",
                );

              eye.type =
                "button";

              eye.dataset[
                "framelogicPieceVisibilityEye"
              ] = piece.id;

              Object.assign(
                eye.style,
                {
                  width:
                    "24px",
                  height:
                    "22px",
                  padding:
                    "0",
                  border:
                    "0",
                  borderRadius:
                    "3px",
                  background:
                    "transparent",
                  color:
                    "#dce8ed",
                  cursor:
                    "pointer",
                  font:
                    "13px system-ui, sans-serif",
                  lineHeight:
                    "22px",
                  textAlign:
                    "center",
                  userSelect:
                    "none",
                },
              );

              eye.addEventListener(
                "pointerdown",
                (
                  event,
                ) => {
                  event.stopPropagation();
                },
              );

              eye.addEventListener(
                "contextmenu",
                (
                  event,
                ) => {
                  event.preventDefault();
                  event.stopPropagation();
                },
              );

              eye.addEventListener(
                "click",
                (
                  event,
                ) => {
                  event.preventDefault();
                  event.stopPropagation();

                  const currentlyVisible =
                    eye?.dataset[
                      "framelogicPieceVisible"
                    ] !== "false";

                  onPieceVisibilityChange(
                    piece.id,
                    !currentlyVisible,
                  );
                },
              );

              row.insertBefore(
                eye,
                row.firstElementChild,
              );
            }


            const visibilityText =
              piece.visible
                ? "👁"
                : "◌";

            if (
              eye.textContent
              !== visibilityText
            ) {
              eye.textContent =
                visibilityText;
            }

            eye.dataset[
              "framelogicPieceVisible"
            ] = piece.visible
              ? "true"
              : "false";

            eye.title =
              piece.visible
                ? `Ocultar ${piece.name}`
                : `Mostrar ${piece.name}`;

            eye.setAttribute(
              "aria-label",
              eye.title,
            );

            row.style.gridTemplateColumns =
              "auto minmax(0, 1fr) auto";

            row.style.gap =
              "6px";

            row.style.opacity =
              piece.visible
                ? "1"
                : "0.62";
          }
        };


      decorateInstanceTree();

      frameId =
        window.requestAnimationFrame(
          decorateInstanceTree,
        );

      /*
       * InstanceTreeController recrea sus filas internamente en algunos
       * cambios (F2, ensambles, selección). Esta comprobación es barata y no
       * observa mutaciones; solo repone un ojo si la fila fue reconstruida.
       */
      const timer =
        window.setInterval(
          decorateInstanceTree,
          1000,
        );


      return () => {
        disposed =
          true;

        if (
          frameId !== null
        ) {
          window.cancelAnimationFrame(
            frameId,
          );
        }

        window.clearInterval(
          timer,
        );
      };
    },
    [
      pieces,
      onPieceVisibilityChange,
    ],
  );


  return null;
}
