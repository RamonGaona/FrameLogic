import { useState } from "react";

import type { DesignLayer } from "@framelogic/bim-core";

import "./LayerPanel.css";

const DEFAULT_LAYER_COLOR = "#e5e7eb";
const LAYER_COLOR_EVENT = "framelogic:layer-color-change";

interface LayerPanelProps {
  layers: DesignLayer[];
  activeLayerId: string;
  onSetActive: (id: string) => void;
  onVisibilityChange: (id: string, visible: boolean) => void;
  onLockChange: (id: string, locked: boolean) => void;
  onSnapChange: (id: string, snapEnabled: boolean) => void;
  onCreate: () => void;
  onRemove: (id: string) => void;
  onAssignSelection: (id: string) => void;
}

type LayerGlyphName = "plus" | "eye" | "eye-off" | "lock" | "unlock";

function LayerGlyph({ name }: { name: LayerGlyphName }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
      {name === "eye" && (
        <>
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
      {name === "eye-off" && (
        <>
          <path d="M4 4l16 16M9.9 5.8a11 11 0 0 1 2.1-.3c6.4 0 10 6.5 10 6.5a14 14 0 0 1-3.3 4.1M6.6 6.7C3.5 8.5 2 12 2 12s3.6 6.5 10 6.5c1.2 0 2.4-.2 3.4-.7" />
          <path d="M10.5 10.5a2.1 2.1 0 0 0 3 3" />
        </>
      )}
      {name === "lock" && (
        <>
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </>
      )}
      {name === "unlock" && (
        <>
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0" />
        </>
      )}
    </svg>
  );
}

function setLayerColor(layerId: string, color: string): void {
  window.dispatchEvent(
    new CustomEvent(LAYER_COLOR_EVENT, {
      detail: { layerId, color },
    }),
  );
}

/**
 * UI only. All edits stay in the existing layer/CAD controllers.
 * Never confuse these project layers with imported DWG/DXF sublayers.
 */
export function LayerPanel({
  layers,
  activeLayerId,
  onSetActive,
  onVisibilityChange,
  onLockChange,
  onSnapChange,
  onCreate,
  onRemove,
  onAssignSelection,
}: LayerPanelProps) {
  const [expanded, setExpanded] = useState(false);

  const modelLayers = layers.filter(
    (layer) => !(layer.name.startsWith("CAD ") && layer.name.includes(" · ")),
  );

  return (
    <section className={expanded ? "layer-panel" : "layer-panel layer-panel-collapsed"} aria-label="Capas del proyecto">
      <div className="layer-panel-header">
        <button
          type="button"
          className="layer-toggle-button"
          aria-expanded={expanded}
          aria-controls="framelogic-layer-panel-content"
          title={expanded ? "Contraer capas" : "Desplegar capas"}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="layer-toggle-icon" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
          <strong>Capas</strong>
          <span className="layer-panel-count" title="Número de capas">
            {modelLayers.length}
          </span>
        </button>

        <button
          type="button"
          className="layer-add-button"
          aria-label="Crear capa"
          title="Crear capa"
          onClick={onCreate}
        >
          <LayerGlyph name="plus" />
        </button>
      </div>

      {expanded && (
        <div id="framelogic-layer-panel-content" className="layer-panel-content">
          <div className="layer-list" role="list" aria-label="Capas del proyecto">
            {modelLayers.map((layer) => {
              const active = layer.id === activeLayerId;
              return (
                <div
                  key={layer.id}
                  role="listitem"
                  aria-label={"Capa " + layer.name}
                  className={active ? "layer-row layer-row-active" : "layer-row"}
                >
                  <button
                    type="button"
                    className="layer-active-button"
                    aria-pressed={active}
                    aria-label={active ? "Capa activa: " + layer.name : "Activar capa " + layer.name}
                    title={active ? "Capa activa" : "Establecer capa activa"}
                    onClick={() => onSetActive(layer.id)}
                  >
                    <span className="layer-active-indicator" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    className="layer-name-button"
                    aria-current={active ? "true" : undefined}
                    title={"Activar capa " + layer.name}
                    onClick={() => onSetActive(layer.id)}
                  >
                    {layer.name}
                  </button>

                  <input
                    type="color"
                    className="layer-color-input"
                    value={layer.color ?? DEFAULT_LAYER_COLOR}
                    aria-label={"Color CAD de la capa " + layer.name}
                    title={"Color CAD de la capa " + layer.name}
                    onChange={(event) => setLayerColor(layer.id, event.target.value)}
                  />

                  <button
                    type="button"
                    className={layer.visible ? "layer-state-button layer-visible" : "layer-state-button layer-hidden"}
                    aria-pressed={layer.visible}
                    aria-label={(layer.visible ? "Ocultar capa " : "Mostrar capa ") + layer.name}
                    title={layer.visible ? "Ocultar capa" : "Mostrar capa"}
                    onClick={() => onVisibilityChange(layer.id, !layer.visible)}
                  >
                    <LayerGlyph name={layer.visible ? "eye" : "eye-off"} />
                  </button>

                  <button
                    type="button"
                    className={layer.locked ? "layer-state-button layer-locked" : "layer-state-button layer-unlocked"}
                    aria-pressed={layer.locked}
                    aria-label={(layer.locked ? "Desbloquear capa " : "Bloquear capa ") + layer.name}
                    title={layer.locked ? "Desbloquear capa" : "Bloquear capa"}
                    onClick={() => onLockChange(layer.id, !layer.locked)}
                  >
                    <LayerGlyph name={layer.locked ? "lock" : "unlock"} />
                  </button>

                  <button
                    type="button"
                    className={layer.snapEnabled ? "layer-snap-button layer-snap-enabled" : "layer-snap-button"}
                    aria-pressed={layer.snapEnabled}
                    aria-label={(layer.snapEnabled ? "Desactivar SNAP de " : "Activar SNAP de ") + layer.name}
                    title={layer.snapEnabled ? "Desactivar SNAP de esta capa" : "Activar SNAP de esta capa"}
                    onClick={() => onSnapChange(layer.id, !layer.snapEnabled)}
                  >
                    S
                  </button>

                  {!layer.system ? (
                    <button
                      type="button"
                      className="layer-remove-button"
                      aria-label={"Eliminar capa " + layer.name}
                      title={"Eliminar capa " + layer.name}
                      onClick={() => onRemove(layer.id)}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  ) : (
                    <span className="layer-remove-placeholder" aria-hidden="true" />
                  )}
                </div>
              );
            })}
            {modelLayers.length === 0 && (
              <p className="layer-empty">Todavía no hay capas en el proyecto.</p>
            )}
          </div>

          <button
            type="button"
            className="layer-assign-button"
            title="Mover la selección actual a la capa activa"
            onClick={() => onAssignSelection(activeLayerId)}
          >
            Asignar selección a la capa activa
          </button>
        </div>
      )}
    </section>
  );
}
