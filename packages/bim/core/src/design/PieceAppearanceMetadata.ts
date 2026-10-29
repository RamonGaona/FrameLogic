export const PIECE_COLOR_TAG_PREFIX = "__FL_COLOR__:";


export function normalizePieceColor(
  value: string,
): string | null {
  const normalized = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(normalized)) {
    return null;
  }
  return normalized;
}


export function getPieceColorFromTags(
  tags: readonly string[],
): string | null {
  for (const tag of tags) {
    if (!tag.startsWith(PIECE_COLOR_TAG_PREFIX)) continue;
    const color = normalizePieceColor(
      tag.slice(PIECE_COLOR_TAG_PREFIX.length),
    );
    if (color) return color;
  }
  return null;
}


export function setPieceColorInTags(
  tags: readonly string[],
  color: string | null,
): string[] {
  const filtered = tags.filter(
    (tag) => !tag.startsWith(PIECE_COLOR_TAG_PREFIX),
  );
  const normalized = color ? normalizePieceColor(color) : null;
  if (normalized) {
    filtered.push(`${PIECE_COLOR_TAG_PREFIX}${normalized}`);
  }
  return filtered;
}


/**
 * Al guardar una .flpiece, el color de la instancia seleccionada pasa a la
 * definición del paquete. Así una pieza abierta posteriormente conserva su
 * apariencia aunque todavía no exista una PieceInstance con tags propios.
 */
export function mergeInstanceColorIntoDefinitionTags(
  definitionTags: readonly string[],
  instanceTags: readonly string[],
): string[] {
  const instanceColor = getPieceColorFromTags(instanceTags);
  if (!instanceColor) return [...definitionTags];
  return setPieceColorInTags(definitionTags, instanceColor);
}
