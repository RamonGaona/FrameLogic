import type {
  DesignLayer,
  LoadedModelInfo,
} from "@framelogic/bim-core";


interface ModelPanelProps {

  models:
    LoadedModelInfo[];

  layers:
    DesignLayer[];

  onVisibilityChange:
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
    layers,
    onVisibilityChange,
    onLayerChange,
    onRemove,
    onClear,
  }: ModelPanelProps,
) {

  return (
    <div
      className="model-panel"
    >

      <div
        className="model-panel-header"
      >

        <strong>
          Modelos
        </strong>

        <span>
          {models.length}
        </span>

      </div>


      {
        models.length === 0
          ? (
              <div
                className="model-panel-empty"
              >
                No hay modelos cargados.
              </div>
            )
          : (
              <div
                className="model-list"
              >

                {
                  models.map(
                    (
                      model,
                    ) => (

                      <div
                        key={model.id}
                        className="model-row"
                      >

                        <button
                          type="button"
                          className="model-visibility-button"
                          title={
                            model.visible
                              ? "Ocultar modelo"
                              : "Mostrar modelo"
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
                              : "○"
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


      {
        models.length > 0
        && (
          <button
            type="button"
            className="model-clear-button"
            onClick={onClear}
          >
            Eliminar todos
          </button>
        )
      }

    </div>
  );

}
