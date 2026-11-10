import type { Assembly, DesignModel } from "@framelogic/domain";

export interface AssemblyCopyPlan {
  readonly roots: readonly string[];
  /** Parent-first order, to rebuild exact nested structure under new IDs. */
  readonly assemblies: readonly Assembly[];
}

/**
 * A selection made in the INSTANCIAS tree may contain whole assemblies,
 * nested children and unrelated loose pieces at once. Copy each selected
 * assembly once, including its full subtree; never silently flatten it.
 */
export function planAssemblyCopy(
  model: DesignModel,
  selectedPieceIds: readonly string[],
  explicitAssemblyIds: readonly string[],
): AssemblyCopyPlan {
  const selected = new Set(selectedPieceIds);
  const candidates = new Set(explicitAssemblyIds);
  const roots: string[] = [];
  for (const id of candidates) {
    if (!model.assemblies.get(id)) {
      throw new Error("El ensamble seleccionado ya no existe.");
    }
    if (model.isAssemblyLocked(id)) {
      throw new Error("No se puede copiar un ensamble bloqueado.");
    }
    let parent = model.assemblies.get(id)?.parentAssemblyId;
    const visited = new Set<string>([id]);
    let nested = false;
    while (parent) {
      if (visited.has(parent)) {
        throw new Error("No se puede copiar una jerarquía circular.");
      }
      visited.add(parent);
      if (candidates.has(parent)) nested = true;
      parent = model.assemblies.get(parent)?.parentAssemblyId;
    }
    if (!nested) roots.push(id);
  }

  const assemblies: Assembly[] = [];
  const traversed = new Set<string>();
  const visit = (id: string): void => {
    if (traversed.has(id)) return;
    traversed.add(id);
    const assembly = model.assemblies.get(id);
    if (!assembly) throw new Error("El subensamble ya no existe.");
    if (model.isAssemblyLocked(id)) {
      throw new Error("No se puede copiar un subensamble bloqueado.");
    }
    for (const pieceId of assembly.pieceInstanceIds) {
      if (!selected.has(pieceId)) {
        throw new Error(
          "La selección no contiene todas las piezas del ensamble. Vuelve a seleccionar su fila en INSTANCIAS.",
        );
      }
    }
    assemblies.push(assembly);
    for (const child of model.getAssemblyChildren(id)) visit(child.id);
  };

  for (const id of roots) visit(id);
  return { roots, assemblies };
}

/**
 * A copy is independent by default, unlike the separate linked-copy
 * command. The original assembly definitions and memberships are unchanged.
 */
export function createAssemblyCopies(
  model: DesignModel,
  plan: AssemblyCopyPlan,
  pieceIds: ReadonlyMap<string, string>,
): {
  readonly records: readonly Assembly[];
  readonly rootIds: readonly string[];
} {
  const mapped = new Map<string, string>();
  const records: Assembly[] = [];
  try {
    for (const source of plan.assemblies) {
      const parentAssemblyId = source.parentAssemblyId
        ? mapped.get(source.parentAssemblyId)
        : undefined;
      const created = model.registerAssembly({
        name: source.name + " copia",
        layerId: source.layerId,
        classification: source.classification,
        tags: [...source.tags],
        pieceInstanceIds: source.pieceInstanceIds.map((id) => {
          const copyId = pieceIds.get(id);
          if (!copyId) throw new Error("Falta una pieza de la copia del ensamble.");
          return copyId;
        }),
        parentAssemblyId,
        locked: source.locked,
      });
      mapped.set(source.id, created.id);
      records.push(created);
    }
  } catch (error) {
    for (const record of [...records].reverse()) {
      model.assemblies.remove(record.id);
    }
    throw error;
  }
  return {
    records,
    rootIds: plan.roots.map((id) => mapped.get(id)!),
  };
}

/** Copies must not inherit automatic linked-component synchronization IDs. */
export function independentCopyTags(tags: readonly string[]): string[] {
  return tags.filter((tag) =>
    !tag.startsWith("__FL_LINKED_ASSEMBLY_ID__:")
    && !tag.startsWith("__FL_LINKED_ASSEMBLY_COMPONENT__:")
  );
}
