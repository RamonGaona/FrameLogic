/**
 * General model reference display is a per-browser visual preference,
 * never a modification to the PieceDefinition or SNAP search index.
 */
export const GENERAL_REFERENCE_VISIBILITY_STORAGE_KEY =
  "framelogic:general-reference-visibility:v1";

export interface ReferenceVisibilityPreferences {
  readonly showSnaps: boolean;
  readonly showAxes: boolean;
}

const DEFAULT_PREFERENCES: ReferenceVisibilityPreferences = {
  showSnaps: false,
  showAxes: false,
};

export function parseReferenceVisibilityPreferences(
  stored: string | null,
): ReferenceVisibilityPreferences {
  if (stored === null) return { ...DEFAULT_PREFERENCES };
  try {
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ...DEFAULT_PREFERENCES };
    }
    const flags = value as Record<string, unknown>;
    return {
      showSnaps: flags.showSnaps === true,
      showAxes: flags.showAxes === true,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function serializeReferenceVisibilityPreferences(
  preferences: ReferenceVisibilityPreferences,
): string {
  return JSON.stringify({
    showSnaps: preferences.showSnaps,
    showAxes: preferences.showAxes,
  });
}
