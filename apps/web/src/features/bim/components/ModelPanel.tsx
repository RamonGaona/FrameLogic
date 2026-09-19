import type {
    LoadedModelInfo,
  } from "@framelogic/bim-core";
  
  
  interface ModelPanelProps {
  
    models:
      LoadedModelInfo[];
  
    onVisibilityChange:
      (
        id: string,
        visible: boolean,
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
      onVisibilityChange,
      onRemove,
      onClear,
    }: ModelPanelProps,
  ) {
  
    return (
      <div
        className="model-panel"
      >
  
        {/* ===================================================
            HEADER
        =================================================== */}
  
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
  
  
        {/* ===================================================
            MODEL LIST
        =================================================== */}
  
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
  
                          {/* ===============================
                              VISIBILITY
                          =============================== */}
  
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
  
  
                          {/* ===============================
                              MODEL INFORMATION
                          =============================== */}
  
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
  
                          </div>
  
  
                          {/* ===============================
                              REMOVE MODEL
                          =============================== */}
  
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
  
  
        {/* ===================================================
            CLEAR ALL
        =================================================== */}
  
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