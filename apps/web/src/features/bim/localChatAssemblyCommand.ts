import type { AssemblyChangeRequest } from "@framelogic/bim-core";

export interface ChatAssembly {
  readonly id: string;
  readonly name: string;
  readonly parentAssemblyId: string | null;
  readonly pieceCount: number;
  readonly locked: boolean;
}
export type ChatAssemblyCommand =
  | { kind: "list" | "selection" }
  | { kind: "select"; id: string }
  | { kind: "prepare"; request: AssemblyChangeRequest }
  | { kind: "unknown"; message: string };

function mentioned(input: string, word: string): boolean {
  if (!word) return false;
  const at = input.toLocaleLowerCase().indexOf(word.toLocaleLowerCase());
  if (at < 0) return false;
  const before = input[at - 1] ?? " ";
  const after = input[at + word.length] ?? " ";
  return !/[\p{L}\p{N}_]/u.test(before) && !/[\p{L}\p{N}_]/u.test(after);
}

/**
 * Assembly selection is explicit in the INSTANCIAS tree. Never infer the
 * assembly from its selected pieces or silently flatten a subassembly.
 */
export function parseLocalAssemblyCommand(
  input: string,
  assemblies: readonly ChatAssembly[],
  selectedAssemblyIds: readonly string[],
): ChatAssemblyCommand | null {
  const raw = input.trim();
  if (!/\b(?:sub)?ensambl(?:es?|ajes?)\b/i.test(raw)) return null;
  if (raw.length > 500) return { kind: "unknown", message: "La instrucción supera 500 caracteres." };
  if (raw.includes(";")) return { kind: "unknown", message: "Los scripts mixtos con ensambles todavía no están disponibles; usa una instrucción por vez." };
  if (/\b(?:listar|lista|muestra|mostrar|ver)\b.*\b(?:sub)?ensambl(?:es?|ajes?)\b/i.test(raw))
    return { kind: "list" };
  if (/\b(?:cuales?|cu[aá]les?|seleccionad[oa]s?)\b.*\b(?:sub)?ensambl(?:es?|ajes?)\b/i.test(raw)
    && !/\b(?:mueve|mover|copiar|copia|duplica|duplicar)\b/i.test(raw))
    return { kind: "selection" };
  const matched = assemblies.filter(a => mentioned(raw, a.id) || mentioned(raw, a.name));
  const uniqueSelection = [...new Set(selectedAssemblyIds)].filter(id => assemblies.some(a => a.id === id));
  let id: string | undefined;
  if (matched.length === 1) id = matched[0]!.id;
  else if (matched.length > 1 && uniqueSelection.length === 1 && matched.some(a => a.id === uniqueSelection[0]))
    id = uniqueSelection[0];
  else if (matched.length === 0 && uniqueSelection.length === 1)
    id = uniqueSelection[0];
  if (!id) return { kind: "unknown", message: "Selecciona exactamente un ensamble en INSTANCIAS o escribe su nombre/ID único. No se infiere el ensamble a partir de piezas sueltas." };

  if (/\b(?:selecciona|seleccionar)\b/i.test(raw)
    && !/\b(?:mueve|mover|copiar|copia|duplica|duplicar)\b/i.test(raw))
    return { kind: "select", id };
  const action = /\b(?:mueve|mover|desplaza|desplazar)\b/i.test(raw) ? "move"
    : /\b(?:copia|copiar|duplica|duplicar)\b/i.test(raw) ? "copy" : null;
  if (!action) return { kind: "unknown", message: "Para este ensamble puedes escribir «mueve ... 200 mm en X» o «copia ... 3 veces cada 1500 mm en X»." };
  if (/\b(?:local|ejes? propios?)\b/i.test(raw))
    return { kind: "unknown", message: "Los ensambles aún no tienen ejes locales propios. Utiliza X, Y o Z global." };

  const axisMatch = raw.match(/\b(?:en|sobre|hacia|eje|direcci[oó]n)\s+(?:el\s+)?(?:eje\s+)?(?:global\s+)?([+-]?[xyz])\b/i);
  if (!axisMatch) return { kind: "unknown", message: "Indica un eje global explícito: X, Y, Z, -X, -Y o -Z." };
  const axis = axisMatch[1]!.replace(/^[+-]/, "").toLowerCase() as "x" | "y" | "z";
  const distanceMatch = raw.match(/\b(\d{1,7}(?:[.,]\d{1,2})?)\s*(?:mm|mil[ií]metros?)\b/i);
  const distance = distanceMatch ? Number(distanceMatch[1]!.replace(",", ".")) : NaN;
  if (!Number.isFinite(distance) || distance <= 0 || distance > 1_000_000)
    return { kind: "unknown", message: "Indica una distancia positiva en mm, por ejemplo «1500 mm»." };
  const displacement = { x: 0, y: 0, z: 0 };
  displacement[axis] = (axisMatch[1]!.startsWith("-") ? -1 : 1) * distance;
  if (action === "move") return { kind: "prepare", request: {
    operation: "move_assembly", id, space: "world", displacement,
  } };
  const countMatch = raw.match(/\b(\d{1,2})\s*(?:copias?|veces|repeticiones?)\b/i);
  const count = countMatch ? Number(countMatch[1]) : 1;
  if (!Number.isInteger(count) || count < 1 || count > 20)
    return { kind: "unknown", message: "Para ensambles se admiten entre 1 y 20 copias." };
  return { kind: "prepare", request: {
    operation: count === 1 ? "copy_assembly" : "copy_assembly_array",
    id, space: "world", displacement, count,
  } };
}
