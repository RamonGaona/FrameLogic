import type { ChatPiece } from "./localChatCommand";

/** The CAD engine distinguishes PieceInstance selections from independent CAD geometry. */
export interface ChatCadSelection {
  readonly pieceIds: readonly string[];
  readonly pointIds: readonly string[];
  readonly lineIds: readonly string[];
}

export interface ChatPieceTarget {
  readonly ids: readonly string[];
  readonly status: string;
  readonly issue: string | null;
}

/** Resolve a live PieceInstance ID; never infer a piece from a CAD point/line or duplicate name. */
export function resolveChatPieceTarget(
  pieces: readonly ChatPiece[],
  selection: ChatCadSelection,
  chosenId: string | null,
): ChatPieceTarget {
  const byId = new Map(pieces.map(piece => [piece.id, piece]));
  if (chosenId) {
    const choice = byId.get(chosenId);
    if (!choice) return {
      ids: [],
      status: "La instancia elegida ya no existe.",
      issue: "La pieza del selector ya no está en el modelo. Selecciona otra instancia.",
    };
    return {
      ids: [choice.id],
      status: "Selector del chat: " + choice.name + " · " + choice.id.slice(0, 8),
      issue: null,
    };
  }

  const unique = [...new Set(selection.pieceIds)];
  const valid = unique.filter(id => byId.has(id));
  if (valid.length !== unique.length) return {
    ids: [],
    status: "Selección de piezas desactualizada.",
    issue: "La selección contiene una instancia que ya no existe. Vuelve a seleccionarla en el visor.",
  };
  if (valid.length === 1) {
    const piece = byId.get(valid[0]!)!;
    return {
      ids: [piece.id],
      status: "Seleccionada en el visor: " + piece.name + " · " + piece.id.slice(0, 8),
      issue: null,
    };
  }
  if (valid.length > 1) return {
    ids: [],
    status: valid.length + " piezas seleccionadas en el visor.",
    issue: "Hay " + valid.length + " instancias seleccionadas. Selecciona solo una o elige una en el selector del chat.",
  };
  if (selection.pointIds.length || selection.lineIds.length) return {
    ids: [],
    status: "Selección CAD: " + selection.pointIds.length + " puntos, " + selection.lineIds.length + " líneas; ninguna pieza.",
    issue: "Has seleccionado geometría CAD, no una instancia de pieza. Selecciona la pieza en el visor o elige su instancia en el chat.",
  };
  return {
    ids: [],
    status: "Sin pieza seleccionada en el visor.",
    issue: "No hay ninguna instancia de pieza seleccionada. Haz clic en una pieza FrameLogic o elígela en el selector del chat.",
  };
}
