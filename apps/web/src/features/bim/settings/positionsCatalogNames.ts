import type { CatalogValue, FrameLogicCatalog } from "./frameLogicCatalog";

/**
 * Resolve display names from DBFrameLogic.json by codigo.
 * Never save the derived name to POSITIONS.json.
 */
export const normalizedCatalogCode = (code: string): string => code.trim().toLocaleUpperCase();

function findNombre(value: CatalogValue, depth = 0): string | null {
  if (!value || typeof value !== "object" || depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findNombre(item, depth + 1);
      if (match !== null) return match;
    }
    return null;
  }
  for (const [key, candidate] of Object.entries(value)) {
    if (key.trim().toLocaleLowerCase() === "nombre"
      && typeof candidate === "string"
      && candidate.trim()) return candidate.trim();
  }
  for (const candidate of Object.values(value)) {
    if (candidate !== null && typeof candidate === "object") {
      const match = findNombre(candidate, depth + 1);
      if (match !== null) return match;
    }
  }
  return null;
}

/** Null means the code exists but its name is missing or empty. */
export function indexCatalogNames(catalog: FrameLogicCatalog): Map<string, string | null> {
  const names = new Map<string, string | null>();
  for (const record of catalog.registros) {
    names.set(normalizedCatalogCode(record.codigo), findNombre(record));
  }
  return names;
}

export function resolveCatalogName(
  index: ReadonlyMap<string, string | null> | null,
  code: string,
): { label: string; state: "db-not-loaded" | "code-not-found" | "name-missing" | "resolved" } {
  if (index === null) return { label: "Cargar DBFrameLogic.json", state: "db-not-loaded" };
  const key = normalizedCatalogCode(code);
  if (!index.has(key)) return { label: "Código no encontrado", state: "code-not-found" };
  const name = index.get(key);
  return name ? { label: name, state: "resolved" }
    : { label: "Nombre no disponible", state: "name-missing" };
}
