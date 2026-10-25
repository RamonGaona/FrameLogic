import {
  useState,
} from "react";

import type {
  DesignLayer,
} from "@framelogic/bim-core";

import "./LayerPanel.css";


interface LayerPanelProps {

  layers:
    DesignLayer[];

  activeLayerId:
    string;

  onSetActive:
    (
      id: string,
    ) => void;

  onVisibilityChange:
    (
      id: string,
      visible: boolean,
    ) => void;

  onLockChange:
    (
      id: string,
      locked: boolean,
    ) => void;

  onSnapChange:
    (
      id: string,
      snapEnabled: boolean,
    ) => void;

  onCreate:
    () => void;

  onRemove:
    (
      id: string,
    ) => void;

  onAssignSelection:
    (
      id: string,
    ) => void;

}


export function LayerPanel(
  {
    layers,
    activeLayerId,
    onSetActive,
    onVisibilityChange,
    onLockChange,
    onSnapChange,
    onCreate,
    onRemove,
    onAssignSelection,
  }: LayerPanelProps,
) {

  const [expanded, setExpanded] =
    useState(false);


  return (
    <div
      className={
        expanded
          ? "layer-panel"
          : "layer-panel layer-panel-collapsed"
      }
    >

      <div
        className="layer-panel-header"
      >

        <button
          type="button"
          className="layer-toggle-button"
          aria-expanded={expanded}
          title={
            expanded
              ? "Contraer Layers"
              : "Desplegar Layers"
          }
          onClick={
            () => {
              setExpanded(
                (current) =>
                  !current,
              );
            }
          }
        >
          <span
            className="layer-toggle-icon"
            aria-hidden="true"
          >
            {
              expanded
                ? "▾"
                : "▸"
            }
          </span>

          <strong>
            Layers
          </strong>
        </button>


        <button
          type="button"
          className="layer-add-button"
          title="Crear layer"
          onClick={onCreate}
        >
          +
        </button>

      </div>


      {
        expanded
        && (
          <>
            <div
              className="layer-list"
            >

              {
                layers.map(
                  (
                    layer,
                  ) => {

                    const active =
                      layer.id
                      === activeLayerId;


                    return (
                      <div
                        key={layer.id}
                        className={
                          active
                            ? "layer-row layer-row-active"
                            : "layer-row"
                        }
                      >

                        <button
                          type="button"
                          className="layer-active-button"
                          title={
                            active
                              ? "Layer activo"
                              : "Hacer layer activo"
                          }
                          onClick={
                            () => {
                              onSetActive(
                                layer.id,
                              );
                            }
                          }
                        >
                          {
                            active
                              ? "●"
                              : "○"
                          }
                        </button>


                        <button
                          type="button"
                          className="layer-state-button"
                          title={
                            layer.visible
                              ? "Ocultar layer"
                              : "Mostrar layer"
                          }
                          onClick={
                            () => {
                              onVisibilityChange(
                                layer.id,
                                !layer.visible,
                              );
                            }
                          }
                        >
                          {
                            layer.visible
                              ? "👁"
                              : "○"
                          }
                        </button>


                        <button
                          type="button"
                          className="layer-state-button"
                          title={
                            layer.locked
                              ? "Desbloquear layer"
                              : "Bloquear layer"
                          }
                          onClick={
                            () => {
                              onLockChange(
                                layer.id,
                                !layer.locked,
                              );
                            }
                          }
                        >
                          {
                            layer.locked
                              ? "🔒"
                              : "🔓"
                          }
                        </button>


                        <button
                          type="button"
                          className={
                            layer.snapEnabled
                              ? "layer-snap-button layer-snap-enabled"
                              : "layer-snap-button"
                          }
                          title={
                            layer.snapEnabled
                              ? "Desactivar SNAP del layer"
                              : "Activar SNAP del layer"
                          }
                          onClick={
                            () => {
                              onSnapChange(
                                layer.id,
                                !layer.snapEnabled,
                              );
                            }
                          }
                        >
                          S
                        </button>


                        <button
                          type="button"
                          className="layer-name-button"
                          title={
                            `Activar layer ${layer.name}`
                          }
                          onClick={
                            () => {
                              onSetActive(
                                layer.id,
                              );
                            }
                          }
                        >
                          {layer.name}
                        </button>


                        {
                          !layer.system
                          && (
                            <button
                              type="button"
                              className="layer-remove-button"
                              title="Eliminar layer"
                              onClick={
                                () => {
                                  onRemove(
                                    layer.id,
                                  );
                                }
                              }
                            >
                              ×
                            </button>
                          )
                        }

                      </div>
                    );

                  },
                )
              }

            </div>


            <button
              type="button"
              className="layer-assign-button"
              onClick={
                () => {
                  onAssignSelection(
                    activeLayerId,
                  );
                }
              }
            >
              Asignar selección al layer activo
            </button>
          </>
        )
      }

    </div>
  );

}
