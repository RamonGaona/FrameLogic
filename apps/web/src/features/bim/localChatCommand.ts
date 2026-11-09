/** Deterministic, offline command recognition. Never executes a model mutation. */
export interface ChatPiece {
  id: string;
  name: string;
  code: string;
}

type Axis = "x" | "y" | "z";
type Vec = { x: number; y: number; z: number };
export type ChatCommand =
  | { kind: "help" | "list" | "info" | "undo" | "redo" }
  | { kind: "axes" | "snaps" | "select" | "piece"; id: string }
  | { kind: "prepare"; request:
    | { operation: "copy_piece" | "copy_piece_array"; id: string; space: "local"; direction: Vec; distance: number; count: number }
    | { operation: "move_piece"; id: string; space: "local"; displacement: Vec } }
  | { kind: "unknown"; message: string };

function containsName(haystack: string, needle: string): boolean {
  const text = haystack.toLocaleLowerCase();
  const name = needle.toLocaleLowerCase();
  if (!name) return false;
  let index = text.indexOf(name);
  while (index >= 0) {
    const left = index === 0 ? "" : text[index - 1]!;
    const right = text[index + name.length] ?? "";
    if (!/[a-z0-9_]/i.test(left) && !/[a-z0-9_]/i.test(right)) return true;
    index = text.indexOf(name, index + 1);
  }
  return false;
}

function resolvePiece(input: string, pieces: ChatPiece[], selected: string[]): string | undefined {
  const matched = pieces.filter(piece => containsName(input, piece.id)
    || containsName(input, piece.name) || containsName(input, piece.code));
  if (matched.length === 1) return matched[0]!.id;
  if (matched.length > 1 && selected.length === 1 && matched.some(p => p.id === selected[0])) return selected[0];
  if (matched.length) return undefined;
  if (selected.length === 1 && pieces.some(p => p.id === selected[0])) return selected[0];
  return undefined;
}

export function parseLocalChatCommand(input: string, pieces: ChatPiece[], selected: string[]): ChatCommand {
  const raw = input.trim();
  if (!raw || /^(?:ayuda|help|comandos|que puedes hacer|qué puedes hacer)\??$/i.test(raw))
    return { kind: "help" };
  if (raw.length > 500) return { kind: "unknown", message: "La instrucción supera 500 caracteres." };
  const normalized = raw.toLocaleLowerCase();

  if (/\b(?:deshacer|undo)\b/i.test(normalized)) return { kind: "undo" };
  if (/\b(?:rehacer|redo)\b/i.test(normalized)) return { kind: "redo" };
  if (/\b(?:confirmar|aprobar|aplicar)\b/i.test(normalized))
    return { kind: "unknown", message: "Para aplicar cambios utiliza el botón de confirmación de la propuesta; nunca se ejecutan solo por escribir una orden." };
  if (/\b(?:lista|listar|muestra|mostrar|ver|consulta|consultar|cuantas|cuántas)\b.*\b(?:piezas|instancias)\b/i.test(normalized))
    return { kind: "list" };
  if (/^(?:resumen|estado|informaci[oó]n)\b.*\b(?:modelo|proyecto)\b/i.test(normalized)
    || /^(?:info|modelo)\??$/i.test(normalized)) return { kind: "info" };

  const action = /\b(?:copia|copiar|duplica|duplicar)\b/i.test(normalized) ? "copy"
    : /\b(?:mueve|mover|desplaza|desplazar)\b/i.test(normalized) ? "move" : undefined;
  const detail = /\b(?:ejes?|axes?)\b/i.test(normalized) ? "axes"
    : /\b(?:snaps?|puntos de referencia)\b/i.test(normalized) ? "snaps"
      : /\b(?:selecciona|seleccionar)\b/i.test(normalized) ? "select"
        : /\b(?:detalle|detalles|informaci[oó]n)\b.*\bpieza\b/i.test(normalized) ? "piece" : undefined;
  if (!action && !detail)
    return { kind: "unknown", message: "No reconozco esa orden. Escribe «ayuda» para ver ejemplos. La IA local opcional puede responder preguntas, pero no ejecuta acciones." };

  const id = resolvePiece(raw, pieces, selected);
  if (!id) return { kind: "unknown", message: "Selecciona exactamente una pieza en el modelo o indica un nombre/identificador único. Si hay nombres repetidos, selecciónala con el ratón." };
  if (!action && detail) return { kind: detail, id };

  const axisMatch = normalized.match(/\b(?:eje|en|sobre|hacia|direcci[oó]n)\s+(?:el\s+)?(?:eje\s+)?(?:local\s+)?([+-]?[xyz])\b/i);
  if (!axisMatch) return { kind: "unknown", message: "Indica un eje local explícito: X, Y, Z, -X, -Y o -Z. No se supone cuál es el longitudinal." };
  const signedAxis = axisMatch[1]!;
  const axis = signedAxis.replace(/^[+-]/, "") as Axis;
  const sign = signedAxis.startsWith("-") ? -1 : 1;
  const direction: Vec = { x: 0, y: 0, z: 0 };
  direction[axis] = sign;
  if (/-\s*\d+(?:[.,]\d+)?\s*(?:mm|mil[ií]metros?)\b/i.test(normalized))
    return { kind: "unknown", message: "Usa una distancia positiva y especifica -X, -Y o -Z para invertir la dirección." };
  const distanceMatch = normalized.match(/\b(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:mm|mil[ií]metros?)\b/i);
  const distance = distanceMatch ? Number(distanceMatch[1]!.replace(",", ".")) : NaN;
  if (!Number.isFinite(distance) || distance <= 0 || distance > 1_000_000)
    return { kind: "unknown", message: "Indica una distancia válida en mm, por ejemplo «1500 mm»." };

  if (action === "move") {
    const displacement: Vec = { x: direction.x * distance, y: direction.y * distance, z: direction.z * distance };
    return { kind: "prepare", request: { operation: "move_piece", id, space: "local", displacement } };
  }
  const countMatch = normalized.match(/\b(\d{1,3})\s*(?:copias?|veces|repeticiones?)\b/i);
  const count = countMatch ? Number(countMatch[1]) : 1;
  if (!Number.isInteger(count) || count < 1 || count > 100)
    return { kind: "unknown", message: "El número de copias debe estar entre 1 y 100." };
  return { kind: "prepare", request: {
    operation: count === 1 ? "copy_piece" : "copy_piece_array",
    id, space: "local", direction, distance, count,
  } };
}
