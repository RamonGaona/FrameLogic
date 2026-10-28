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
 * La visibilidad de PieceInstance vive visualmente dentro del árbol INSTANCIAS.
 * El ojo individual y el ojo de cada ensamble reutilizan el mismo callback de
 * BimViewport, por lo que el estado continúa siendo único.
 *
 * No usamos MutationObserver. InstanceTreeController recrea filas en algunos
 * cambios, así que una comprobación liviana repone únicamente los ojos que
 * falten sin observar las propias mutaciones que hacemos aquí.
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

          const pieceByPrefix =
            new Map(
              pieces.map(
                (
                  piece,
                ) => [
                  piece.id.slice(
                    0,
                    8,
                  ),
                  piece,
                ] as const,
              ),
            );

          const spans =
            Array.from(
              body.querySelectorAll<HTMLSpanElement>(
                "span",
              ),
            );


          // --------------------------------------------------
          // OJO POR INSTANCIA
          // --------------------------------------------------

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

              applyEyeStyle(
                eye,
              );

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


          // --------------------------------------------------
          // OJO POR ENSAMBLE
          //
          // InstanceTreeController renderiza cada ensamble como una fila
          // seguida inmediatamente por un contenedor con sus piezas.
          // Leemos los prefijos de esas filas hijas para obtener los IDs
          // reales sin duplicar el modelo de ensambles en React.
          // --------------------------------------------------

          const candidateRows =
            Array.from(
              body.querySelectorAll<HTMLDivElement>(
                "div",
              ),
            );

          for (
            const row
            of candidateRows
          ) {
            const directSpans =
              Array.from(
                row.children,
              ).filter(
                (
                  child,
                ): child is HTMLSpanElement =>
                  child instanceof HTMLSpanElement,
              );

            const nameSpan =
              directSpans[0];

            if (
              !nameSpan?.textContent
                ?.startsWith(
                  "▦ ",
                )
            ) {
              continue;
            }

            const children =
              row.nextElementSibling;

            if (
              !(children instanceof HTMLDivElement)
            ) {
              continue;
            }

            const memberById =
              new Map<
                string,
                PiecePanelItem
              >();

            for (
              const childSpan
              of Array.from(
                children.querySelectorAll<HTMLSpanElement>(
                  "span",
                ),
              )
            ) {
              const prefix =
                childSpan.textContent
                ?? "";

              const piece =
                pieceByPrefix.get(
                  prefix,
                );

              if (piece) {
                memberById.set(
                  piece.id,
                  piece,
                );
              }
            }

            const members =
              Array.from(
                memberById.values(),
              );

            let eye =
              row.querySelector<HTMLButtonElement>(
                "button[data-framelogic-assembly-visibility-eye]",
              );

            if (!eye) {
              eye =
                document.createElement(
                  "button",
                );

              eye.type =
                "button";

              eye.dataset[
                "framelogicAssemblyVisibilityEye"
              ] = "true";

              applyEyeStyle(
                eye,
              );

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
                (
                  event,
                ) => {
                  event.preventDefault();
                  event.stopPropagation();

                  const memberIds =
                    parseMemberIds(
                      eye?.dataset[
                        "framelogicAssemblyMemberIds"
                      ],
                    );

                  if (
                    memberIds.length < 1
                  ) {
                    return;
                  }

                  const targetVisible =
                    eye?.dataset[
                      "framelogicAssemblyAllVisible"
                    ] !== "true";

                  const changeIds =
                    parseMemberIds(
                      eye?.dataset[
                        "framelogicAssemblyChangeIds"
                      ],
                    );

                  for (
                    const memberId
                    of changeIds.length > 0
                      ? changeIds
                      : memberIds
                  ) {
                    onPieceVisibilityChange(
                      memberId,
                      targetVisible,
                    );
                  }
                },
              );

              row.insertBefore(
                eye,
                row.firstElementChild,
              );
            }

            const visibleCount =
              members.filter(
                (
                  member,
                ) =>
                  member.visible,
              ).length;

            const allVisible =
              members.length > 0
              && visibleCount
                === members.length;

            const allHidden =
              members.length > 0
              && visibleCount === 0;

            const targetVisible =
              !allVisible;

            const changeIds =
              members
                .filter(
                  (
                    member,
                  ) =>
                    member.visible
                    !== targetVisible,
                )
                .map(
                  (
                    member,
                  ) =>
                    member.id,
                );

            eye.dataset[
              "framelogicAssemblyMemberIds"
            ] = JSON.stringify(
              members.map(
                (
                  member,
                ) =>
                  member.id,
              ),
            );

            eye.dataset[
              "framelogicAssemblyChangeIds"
            ] = JSON.stringify(
              changeIds,
            );

            eye.dataset[
              "framelogicAssemblyAllVisible"
            ] = allVisible
              ? "true"
              : "false";

            eye.disabled =
              members.length < 1;

            eye.textContent =
              members.length < 1
                ? "◌"
                : allVisible
                  ? "👁"
                  : allHidden
                    ? "◌"
                    : "◐";

            const assemblyName =
              nameSpan.textContent
                .slice(
                  2,
                )
                .trim()
              || "ensamble";

            eye.title =
              members.length < 1
                ? `${assemblyName} no contiene piezas`
                : allVisible
                  ? `Ocultar todas las piezas de ${assemblyName}`
                  : `Mostrar todas las piezas de ${assemblyName}`;

            eye.setAttribute(
              "aria-label",
              eye.title,
            );

            row.style.gridTemplateColumns =
              "auto minmax(0, 1fr) auto";

            row.style.gap =
              "6px";

            row.style.opacity =
              allHidden
                ? "0.62"
                : allVisible
                  ? "1"
                  : "0.82";
          }
        };


      decorateInstanceTree();

      frameId =
        window.requestAnimationFrame(
          decorateInstanceTree,
        );

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


function applyEyeStyle(
  eye: HTMLButtonElement,
): void {
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


function parseMemberIds(
  value: string | undefined,
): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown =
      JSON.parse(
        value,
      );

    return Array.isArray(
      parsed,
    )
      ? parsed.filter(
          (
            memberId,
          ): memberId is string =>
            typeof memberId
            === "string",
        )
      : [];
  }
  catch {
    return [];
  }
}
