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
  models: LoadedModelInfo[];
  pieces: PiecePanelItem[];
  layers: DesignLayer[];
  onVisibilityChange: (id: string, visible: boolean) => void;
  onPieceVisibilityChange: (id: string, visible: boolean) => void;
  onLayerChange: (id: string, layerId: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

/**
 * The legacy model panel is intentionally hidden. PieceAppearanceController
 * now owns BOTH the individual piece and assembly eyes in INSTANCIAS.
 * Keeping another DOM decorator here caused duplicated owners and stale clicks.
 */
export function ModelPanel(_props: ModelPanelProps) {
  return null;
}
