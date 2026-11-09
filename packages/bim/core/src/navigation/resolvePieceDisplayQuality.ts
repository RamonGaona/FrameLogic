import type { PieceVisualLevel } from "../design/PieceVisualGeometry";

export type PieceDisplayQuality = "DESIGN" | "SELECTED" | "DETAIL" | "LOW" | "AUTO";

export interface ResolvedPieceDisplayQuality {
  readonly level: PieceVisualLevel;
  readonly detailInstanceIds: readonly string[];
}

/**
 * La pieza que se prepara se muestra detallada solo cuando el usuario
 * lo pide (Detalle / Detalle seleccionado). Nunca impone DETAIL en
 * Básico o Diseño; estos modos se utilizan para mejorar el rendimiento.
 */
export function resolvePieceDisplayQuality(
  quality: PieceDisplayQuality,
  selectedInstanceIds: readonly string[],
  preparedInstanceId?: string,
): ResolvedPieceDisplayQuality {
  switch (quality) {
    case "DETAIL":
      return { level: "DETAIL", detailInstanceIds: [] };
    case "LOW":
      return { level: "LOW", detailInstanceIds: [] };
    case "AUTO":
    case "DESIGN":
      return { level: "WORK", detailInstanceIds: [] };
    case "SELECTED": {
      const detailInstanceIds = new Set(selectedInstanceIds);
      if (preparedInstanceId) detailInstanceIds.add(preparedInstanceId);
      return { level: "WORK", detailInstanceIds: [...detailInstanceIds] };
    }
  }
}
