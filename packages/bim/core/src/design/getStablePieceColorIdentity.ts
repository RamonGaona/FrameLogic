import type { AssetDefinition } from "@framelogic/domain";

/**
 * El ID del Asset no sobrevive la importación de un proyecto guardado.
 * Usamos datos estables del archivo para que el color predeterminado
 * no cambie al reconstruir STEP/IFC. El color manual se guarda aparte.
 */
export function getStablePieceColorIdentity(
  asset: Pick<AssetDefinition, "name" | "format" | "contentHash"> | undefined,
  fallbackAssetId: string,
): string {
  if (!asset) return fallbackAssetId;
  const hash = asset.contentHash?.trim();
  if (hash) return `hash:${hash.toLowerCase()}`;
  const name = asset.name.trim().toLowerCase();
  return name ? `${asset.format}:${name}` : fallbackAssetId;
}
