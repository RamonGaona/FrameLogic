/**
 * Model Space navigation controls must stay hidden until every controller-
 * created element required for the first stable layout is present.
 * A second, independent core-ready attribute is set by BimViewport.
 */
export interface ModelSpaceChromeLayoutParts {
  readonly modelToolbar: boolean;
  readonly projectToolbar: boolean;
  readonly instanceTree: boolean;
}

export function isModelSpaceChromeLayoutComplete(
  parts: ModelSpaceChromeLayoutParts,
): boolean {
  return parts.modelToolbar
    && parts.projectToolbar
    && parts.instanceTree;
}
