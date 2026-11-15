/**
 * Central, versioned, browser-local user preferences. Only settings with real
 * UI effects are exposed until their corresponding CAD subsystem is wired.
 *
 * Add sections in SETTINGS_SECTIONS; add a key in FrameLogicPreferences,
 * validation in normalizeFrameLogicPreferences, and its application in
 * applyFrameLogicPreferences. Project-level settings will use a separate
 * persistence adapter so they never leak into other projects.
 */
export const FRAMELOGIC_OPEN_SETTINGS_EVENT = "framelogic:open-settings";
export const FRAMELOGIC_PREFERENCES_STORAGE_KEY = "framelogic.settings.user.v1";

export const SETTINGS_SECTIONS = [
  { id: "GENERAL", title: "General", description: "Preferencias y almacenamiento" },
  { id: "INTERFACE", title: "Interfaz", description: "Densidad visual y movimiento" },
  { id: "MODEL", title: "Model Space", description: "Controles del espacio de modelado" },
  { id: "PAPER", title: "Paper Space", description: "Herramientas de planos y detalles" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

export interface FrameLogicPreferences {
  readonly schemaVersion: 1;
  /** Condenses ribbon commands; does not change model or sheet geometry. */
  readonly compactRibbon: boolean;
  /** Suppresses optional UI transitions only. */
  readonly reduceMotion: boolean;
  /** Hides the navigation cube without changing the camera. */
  readonly showViewCube: boolean;
  /** Controls the four editing grips; never affects exported PDF graphics. */
  readonly showCircularDetailGrips: boolean;
}

export const DEFAULT_FRAMELOGIC_PREFERENCES: FrameLogicPreferences = Object.freeze({
  schemaVersion: 1,
  compactRibbon: false,
  reduceMotion: false,
  showViewCube: true,
  showCircularDetailGrips: true,
});

export function normalizeFrameLogicPreferences(value: unknown): FrameLogicPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_FRAMELOGIC_PREFERENCES };
  }
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1) return { ...DEFAULT_FRAMELOGIC_PREFERENCES };
  const bool = (key: keyof FrameLogicPreferences): boolean => {
    const candidate = input[key];
    return typeof candidate === "boolean"
      ? candidate : DEFAULT_FRAMELOGIC_PREFERENCES[key] as boolean;
  };
  return {
    schemaVersion: 1,
    compactRibbon: bool("compactRibbon"),
    reduceMotion: bool("reduceMotion"),
    showViewCube: bool("showViewCube"),
    showCircularDetailGrips: bool("showCircularDetailGrips"),
  };
}

export function loadFrameLogicPreferences(storage: Pick<Storage, "getItem">):
  FrameLogicPreferences {
  try {
    const raw = storage.getItem(FRAMELOGIC_PREFERENCES_STORAGE_KEY);
    return raw ? normalizeFrameLogicPreferences(JSON.parse(raw))
      : { ...DEFAULT_FRAMELOGIC_PREFERENCES };
  } catch {
    return { ...DEFAULT_FRAMELOGIC_PREFERENCES };
  }
}

export function saveFrameLogicPreferences(
  storage: Pick<Storage, "setItem">,
  preferences: FrameLogicPreferences,
): boolean {
  try {
    storage.setItem(FRAMELOGIC_PREFERENCES_STORAGE_KEY,
      JSON.stringify(normalizeFrameLogicPreferences(preferences)));
    return true;
  } catch {
    return false;
  }
}

/** DOM-only effects: no changes to STEP, DWG, model transforms or PDF content. */
export function applyFrameLogicPreferences(
  root: HTMLElement, preferences: FrameLogicPreferences,
): void {
  root.dataset["framelogicCompactRibbon"] = String(preferences.compactRibbon);
  root.dataset["framelogicReduceMotion"] = String(preferences.reduceMotion);
  root.dataset["framelogicShowViewCube"] = String(preferences.showViewCube);
  root.dataset["framelogicShowDetailGrips"] = String(preferences.showCircularDetailGrips);
}
