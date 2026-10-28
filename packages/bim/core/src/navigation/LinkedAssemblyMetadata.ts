export const LINKED_ASSEMBLY_ID_TAG_PREFIX =
  "__FL_LINKED_ASSEMBLY_ID__:";

export const LINKED_ASSEMBLY_COMPONENT_TAG_PREFIX =
  "__FL_LINKED_ASSEMBLY_COMPONENT__:";


export function getLinkedAssemblyId(
  tags: readonly string[],
): string | null {
  const tag = tags.find((value) =>
    value.startsWith(LINKED_ASSEMBLY_ID_TAG_PREFIX),
  );

  return tag
    ? tag.slice(LINKED_ASSEMBLY_ID_TAG_PREFIX.length)
    : null;
}


export function getLinkedAssemblyComponentId(
  tags: readonly string[],
): string | null {
  const tag = tags.find((value) =>
    value.startsWith(LINKED_ASSEMBLY_COMPONENT_TAG_PREFIX),
  );

  return tag
    ? tag.slice(LINKED_ASSEMBLY_COMPONENT_TAG_PREFIX.length)
    : null;
}


export function setLinkedAssemblyMetadata(
  tags: readonly string[],
  assemblyId: string,
  componentId: string,
): string[] {
  return [
    ...tags.filter((value) =>
      !value.startsWith(LINKED_ASSEMBLY_ID_TAG_PREFIX)
      && !value.startsWith(LINKED_ASSEMBLY_COMPONENT_TAG_PREFIX),
    ),
    `${LINKED_ASSEMBLY_ID_TAG_PREFIX}${assemblyId}`,
    `${LINKED_ASSEMBLY_COMPONENT_TAG_PREFIX}${componentId}`,
  ];
}
