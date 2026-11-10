import type { DesignModel } from "@framelogic/domain";

/**
 * Resolve category members by stable model IDs, never by rows currently
 * mounted in the instance tree (which can be rebuilt during selection).
 */
export function getInstanceGroupIds(
  model: DesignModel,
  group: "assemblies" | "loose",
): string[] {
  const known = new Set(
    model.pieceInstances.getAll().map((piece) => piece.id),
  );
  const grouped = new Set(
    model.assemblies.getAll()
      .flatMap((assembly) => assembly.pieceInstanceIds)
      .filter((id) => known.has(id)),
  );

  if (group === "assemblies") return [...grouped];

  return model.pieceInstances.getAll()
    .filter((piece) => !grouped.has(piece.id))
    .map((piece) => piece.id);
}
