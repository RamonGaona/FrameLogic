import {
  useEffect,
  useState,
} from "react";

import type {
  MouseEvent as ReactMouseEvent,
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


type VisibilityContextTarget =
  | {
      kind: "PIECE";
      id: string;
      name: string;
      visible: boolean;
    }
  | {
      kind: "MODEL";
      id: string;
      name: string;
      visible: boolean;
    };


interface VisibilityContextMenu {

  x: number;

  y: number;

  target: VisibilityContextTarget;

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


export function ModelPanel(
  {
    models,
    pieces,
    layers,
    onVisibilityChange,
    onPieceVisibilityChange,
    onLayerChange,
    onRemove,
    onClear,
  }: ModelPanelProps,
) {

  const [contextMenu, setContextMenu] =
    useState<VisibilityContextMenu | null>(
      null,
    );


  useEffect(
    () => {

      if (
        !contextMenu
      ) {

        return;

      }


      const close =
        (): void => {
          setContextMenu(
            null,
          );
        };


      const handleKeyDown =
        (
          event:
            KeyboardEvent,
        ): void => {

          if (
            event.key === "Escape"
          ) {

            close();

          }

        };


      window.addEventListener(
        "pointerdown",
        close,
      );

      window.addEventListener(
        "resize",
        close,
      );

      window.addEventListener(
        "blur",
        close,
      );

      window.addEventListener(
        "keydown",
        handleKeyDown,
      );


      return () => {

        window.removeEventListener(
          "pointerdown",
          close,
        );

        window.removeEventListener(
          "resize",
          close,
        );

        window.removeEventListener(
          "blur",
          close,
        );

        window.removeEventListener(
          "keydown",
          handleKeyDown,
        );

      };

    },
    [contextMenu],
  );


  function openContextMenu(
    event:
      ReactMouseEvent,
    target:
      VisibilityContextTarget,
  ): void {

    event.preventDefault();
    event.stopPropagation();


    setContextMenu({
      x:
        event.clientX,
      y:
        event.clientY,
      target,
    });

  }


  function toggleContextVisibility():
    void {

    if (
      !contextMenu
    ) {

      return;

    }


    const {
      target,
    } =
      contextMenu;


    if (
      target.kind === "PIECE"
    ) {

      onPieceVisibilityChange(
        target.id,
        !target.visible,
      );

    }
    else {

      onVisibilityChange(
        target.id,
        !target.visible,
      );

    }


    setContextMenu(
      null,
    );

  }


  const totalItems =
    pieces.length
    + models.length;


  return (
    <>
      <div
        className="model-panel"
      >

        <div
          className="model-panel-header"
        >

          <strong>
            Modelo
          </strong>

          <span>
            {totalItems}
          </span>

        </div>


        {
          totalItems === 0
            ? (
                <div
                  className="model-panel-empty"
                >
                  No hay piezas ni modelos cargados.
                </div>
              )
            : (
                <div
                  className="model-list"
                >

                  {
                    pieces.length > 0
                    && (
                      <div
                        className="model-section"
                      >

                        <div
                          className="model-section-title"
                        >
                          Piezas · {pieces.length}
                        </div>


                        {
                          pieces.map(
                            (
                              piece,
                            ) => {

                              const layerName =
                                layers.find(
                                  (
                                    layer,
                                  ) =>
                                    layer.id
                                    === piece.layerId,
                                )?.name;


                              return (
                                <div
                                  key={piece.id}
                                  className={
                                    piece.visible
                                      ? "model-row"
                                      : "model-row model-row-hidden"
                                  }
                                  onContextMenu={
                                    (
                                      event,
                                    ) => {
                                      openContextMenu(
                                        event,
                                        {
                                          kind:
                                            "PIECE",
                                          id:
                                            piece.id,
                                          name:
                                            piece.name,
                                          visible:
                                            piece.visible,
                                        },
                                      );
                                    }
                                  }
                                >

                                  <button
                                    type="button"
                                    className="model-visibility-button"
                                    title={
                                      piece.visible
                                        ? "Ocultar pieza"
                                        : "Mostrar pieza"
                                    }
                                    aria-label={
                                      piece.visible
                                        ? `Ocultar ${piece.name}`
                                        : `Mostrar ${piece.name}`
                                    }
                                    onClick={
                                      () => {
                                        onPieceVisibilityChange(
                                          piece.id,
                                          !piece.visible,
                                        );
                                      }
                                    }
                                  >
                                    {
                                      piece.visible
                                        ? "👁"
                                        : "◌"
                                    }
                                  </button>


                                  <div
                                    className="model-info"
                                  >

                                    <div
                                      className="model-name"
                                      title={piece.name}
                                    >
                                      {piece.name}
                                    </div>


                                    <div
                                      className="model-source"
                                    >
                                      {piece.code}
                                      {layerName
                                        ? ` · ${layerName}`
                                        : " · Pieza"}
                                    </div>

                                  </div>

                                </div>
                              );

                            },
                          )
                        }

                      </div>
                    )
                  }


                  {
                    models.length > 0
                    && (
                      <div
                        className="model-section"
                      >

                        <div
                          className="model-section-title"
                        >
                          Referencias · {models.length}
                        </div>


                        {
                          models.map(
                            (
                              model,
                            ) => (

                              <div
                                key={model.id}
                                className={
                                  model.visible
                                    ? "model-row"
                                    : "model-row model-row-hidden"
                                }
                                onContextMenu={
                                  (
                                    event,
                                  ) => {
                                    openContextMenu(
                                      event,
                                      {
                                        kind:
                                          "MODEL",
                                        id:
                                          model.id,
                                        name:
                                          model.name,
                                        visible:
                                          model.visible,
                                      },
                                    );
                                  }
                                }
                              >

                                <button
                                  type="button"
                                  className="model-visibility-button"
                                  title={
                                    model.visible
                                      ? "Ocultar modelo"
                                      : "Mostrar modelo"
                                  }
                                  aria-label={
                                    model.visible
                                      ? `Ocultar ${model.name}`
                                      : `Mostrar ${model.name}`
                                  }
                                  onClick={
                                    () => {
                                      onVisibilityChange(
                                        model.id,
                                        !model.visible,
                                      );
                                    }
                                  }
                                >
                                  {
                                    model.visible
                                      ? "👁"
                                      : "◌"
                                  }
                                </button>


                                <div
                                  className="model-info"
                                >

                                  <div
                                    className="model-name"
                                    title={model.name}
                                  >
                                    {model.name}
                                  </div>


                                  <div
                                    className="model-source"
                                  >
                                    {model.source}
                                    {" · "}
                                    {model.role}
                                  </div>


                                  <select
                                    className="model-layer-select"
                                    value={model.layerId}
                                    onChange={
                                      (
                                        event,
                                      ) => {
                                        onLayerChange(
                                          model.id,
                                          event.target.value,
                                        );
                                      }
                                    }
                                  >
                                    {
                                      layers.map(
                                        (
                                          layer,
                                        ) => (
                                          <option
                                            key={layer.id}
                                            value={layer.id}
                                          >
                                            {layer.name}
                                          </option>
                                        ),
                                      )
                                    }
                                  </select>

                                </div>


                                <button
                                  type="button"
                                  className="model-remove-button"
                                  title="Eliminar modelo"
                                  onClick={
                                    () => {
                                      onRemove(
                                        model.id,
                                      );
                                    }
                                  }
                                >
                                  ×
                                </button>

                              </div>

                            ),
                          )
                        }

                      </div>
                    )
                  }

                </div>
              )
        }


        {
          models.length > 0
          && (
            <button
              type="button"
              className="model-clear-button"
              onClick={onClear}
            >
              Eliminar todos los modelos externos
            </button>
          )
        }

      </div>


      {
        contextMenu
        && (
          <div
            className="model-context-menu"
            style={{
              left:
                contextMenu.x,
              top:
                contextMenu.y,
            }}
            onPointerDown={
              (
                event,
              ) => {
                event.stopPropagation();
              }
            }
          >
            <div
              className="model-context-title"
              title={contextMenu.target.name}
            >
              {contextMenu.target.name}
            </div>

            <button
              type="button"
              className="model-context-action"
              onClick={toggleContextVisibility}
            >
              <span
                aria-hidden="true"
              >
                {
                  contextMenu.target.visible
                    ? "◌"
                    : "👁"
                }
              </span>

              {
                contextMenu.target.visible
                  ? contextMenu.target.kind === "PIECE"
                    ? "Ocultar pieza"
                    : "Ocultar modelo"
                  : contextMenu.target.kind === "PIECE"
                    ? "Mostrar pieza"
                    : "Mostrar modelo"
              }
            </button>
          </div>
        )
      }
    </>
  );

}
