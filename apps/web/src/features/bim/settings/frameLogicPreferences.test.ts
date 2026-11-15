import { describe, expect, it } from "vitest";
import {
  applyFrameLogicPreferences,
  DEFAULT_FRAMELOGIC_PREFERENCES,
  FRAMELOGIC_PREFERENCES_STORAGE_KEY,
  loadFrameLogicPreferences,
  normalizeFrameLogicPreferences,
  saveFrameLogicPreferences,
  SETTINGS_SECTIONS,
} from "./frameLogicPreferences";

describe("FrameLogic settings registry and local preferences", () => {
  it("provides unique extensible settings sections", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.id))
      .toEqual(["GENERAL", "INTERFACE", "MODEL", "PAPER", "DATABASE"]);
    expect(new Set(SETTINGS_SECTIONS.map((section) => section.id)).size)
      .toBe(SETTINGS_SECTIONS.length);
  });

  it("rejects malformed and unsupported saved payloads", () => {
    expect(normalizeFrameLogicPreferences(null)).toEqual(DEFAULT_FRAMELOGIC_PREFERENCES);
    expect(normalizeFrameLogicPreferences({ schemaVersion: 2, compactRibbon: true }))
      .toEqual(DEFAULT_FRAMELOGIC_PREFERENCES);
    expect(normalizeFrameLogicPreferences({
      schemaVersion: 1, compactRibbon: "yes", showViewCube: null,
      showCircularDetailGrips: false,
    })).toEqual({
      ...DEFAULT_FRAMELOGIC_PREFERENCES, showCircularDetailGrips: false,
    });
  });

  it("roundtrips user preferences without including project geometry", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const changed = {
      ...DEFAULT_FRAMELOGIC_PREFERENCES,
      compactRibbon: true, showViewCube: false,
    };
    expect(saveFrameLogicPreferences(storage, changed)).toBe(true);
    expect(loadFrameLogicPreferences(storage)).toEqual(changed);
    expect(Object.keys(JSON.parse(values.get(FRAMELOGIC_PREFERENCES_STORAGE_KEY)!)).sort())
      .toEqual([
        "compactRibbon", "reduceMotion", "schemaVersion",
        "showCircularDetailGrips", "showViewCube",
      ]);
  });

  it("falls back safely for private/blocked storage", () => {
    const blocked = {
      getItem: (_key: string): string | null => { throw new Error("blocked"); },
      setItem: (_key: string, _value: string): void => { throw new Error("blocked"); },
    };
    expect(loadFrameLogicPreferences(blocked)).toEqual(DEFAULT_FRAMELOGIC_PREFERENCES);
    expect(saveFrameLogicPreferences(blocked, DEFAULT_FRAMELOGIC_PREFERENCES)).toBe(false);
  });

  it("applies only UI flags and does not manipulate a model or PDF", () => {
    const root = { dataset: {} as Record<string, string> } as HTMLElement;
    applyFrameLogicPreferences(root, {
      ...DEFAULT_FRAMELOGIC_PREFERENCES,
      compactRibbon: true, reduceMotion: true,
      showViewCube: false, showCircularDetailGrips: false,
    });
    expect(root.dataset).toEqual({
      framelogicCompactRibbon: "true",
      framelogicReduceMotion: "true",
      framelogicShowViewCube: "false",
      framelogicShowDetailGrips: "false",
    });
  });
});
