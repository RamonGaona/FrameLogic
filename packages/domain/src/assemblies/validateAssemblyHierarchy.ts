import type { Assembly } from "./Assembly";

/**
 * Validate the persistent parent graph before any load or history restore.
 * Legacy assemblies without parentAssemblyId are independent root nodes.
 */
export function validateAssemblyHierarchy(assemblies: readonly Assembly[]): void {
  const byId = new Map<string, Assembly>();
  for (const assembly of assemblies) {
    if (byId.has(assembly.id)) {
      throw new Error(`Duplicate assembly identifier "${assembly.id}".`);
    }
    byId.set(assembly.id, assembly);
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      throw new Error(`Circular assembly relationship detected at "${id}".`);
    }
    if (visited.has(id)) return;
    const assembly = byId.get(id);
    if (!assembly) {
      throw new Error(`Assembly "${id}" is missing.`);
    }
    visiting.add(id);
    const parentId = assembly.parentAssemblyId;
    if (parentId) {
      if (!byId.has(parentId)) {
        throw new Error(
          `Assembly "${id}" refers to missing parent "${parentId}".`,
        );
      }
      visit(parentId);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const id of byId.keys()) visit(id);
}
